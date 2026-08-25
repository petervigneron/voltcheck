// Verifies supabase/migrations/*.sql against a real embedded Postgres
// (PGlite). Simulates nightly ingest runs over real rows from
// web/data/scraped-listings.json and asserts the history semantics —
// including the rule that only a COMPLETELY crawled domain may delist.
//   cd supabase && npm install && node verify.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
// The snapshot is a compressed envelope since 2026-08-22 (scraper/lib/snapshot.mjs
// carries the reasoning). Reaching across to the scraper lane for the codec
// rather than re-implementing it: this file is a verifier, and a verifier that
// carries its own private copy of the format can pass while the real readers fail.
import { readSnapshot } from "../scraper/lib/snapshot.mjs";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);
const LISTINGS = new URL("../web/data/scraped-listings.json", import.meta.url);

const db = new PGlite();
let failures = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log(`  ok: ${name}`);
  else { failures++; console.error(`  FAIL: ${name} ${detail}`); }
}

// Supabase's roles pre-exist on the platform; create them so the exact
// migration files (RLS policies, revokes) run unmodified. Supabase also
// auto-grants select on new tables to anon/authenticated (RLS is the row
// gate on top) — mirror that with default privileges so 0007's revokes
// are tested against the same baseline they run against in production.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant select on tables to anon, authenticated;
`);
// Two files legitimately share the number 0041 (applied 2026-08-19 and
// 2026-08-22 by different sessions; renumbering a pushed file is worse than
// the wart). Alphabetical order runs feed_joins first, but it reads the
// provenance column price_provenance adds — prod applied them
// chronologically. Replay in prod's order; every other pair sorts correctly.
// 0049/0050 configure a scheduler, not a schema: they create pg_cron and
// register the hourly VACUUM / daily ANALYZE that keep the live-row count an
// index-only scan (without which it blows anon's 3s timeout and the feed
// falls back). PGlite has no pg_cron to create, and there is nothing in
// either file for a replay to assert — no table, view, function or grant. So
// they are skipped by name rather than half-applied. If a later migration
// ever puts real schema in the same file as a cron.schedule call, split the
// file rather than adding it here.
const SKIP_NEEDS_PG_CRON = new Set([
  "0049_keep_the_live_count_countable.sql",
  "0050_split_the_hourly_vacuum_from_the_daily_analyze.sql",
]);
const APPLY_BEFORE = { "0041_feed_joins_per_vin.sql": "0041_price_provenance_column.sql" };
const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort((a, b) => {
  if (APPLY_BEFORE[a] === b) return 1;
  if (APPLY_BEFORE[b] === a) return -1;
  return a < b ? -1 : 1;
});
for (const f of files) {
  if (SKIP_NEEDS_PG_CRON.has(f)) {
    console.log(`migration skipped (needs pg_cron, not schema): ${f}`);
    continue;
  }
  const sql = await readFile(new URL(f, MIGRATIONS_DIR), "utf-8");
  // CONCURRENTLY (0046) refuses to run inside a transaction block, and this
  // replay is transactional. Its only meaning is lock behavior on a live
  // site — nothing an embedded single-client replay can exercise.
  await db.exec(sql.replace(/create index concurrently/gi, "create index"));
  console.log(`migration applied: ${f}`);
}

const all = await readSnapshot(LISTINGS);
// Real rows spanning 3 domains: up to 4 cars from each of the first 3 domains.
const domains = [...new Set(all.map((l) => l.dealerDomain))].slice(0, 3);
const sample = domains.flatMap((d) => all.filter((l) => l.dealerDomain === d).slice(0, 4));

async function ingest(rows, source, completeDomains = null, observedAt = null) {
  const res = await db.query(`select ingest_listings($1::jsonb, $2, $3::jsonb, $4::timestamptz) as r`, [
    JSON.stringify(rows),
    source,
    completeDomains === null ? null : JSON.stringify(completeDomains),
    observedAt,
  ]);
  return res.rows[0].r;
}

// ---- Run 1: everything is new
console.log(`\nrun 1: first sight of ${sample.length} listings across ${domains.length} domains`);
const r1 = await ingest(sample, "test", domains);
assert(`seen=${sample.length}`, r1.seen === sample.length, JSON.stringify(r1));
assert(`new=${sample.length}`, r1.new === sample.length, JSON.stringify(r1));
assert("no price changes", r1.price_changed === 0);
assert("no delists", r1.delisted === 0);
const h1 = await db.query(`select count(*)::int as n from listing_price_history`);
// Zero-priced rows are price abstains: seen and listed, never history-logged (0039).
const priced = sample.filter((l) => Math.round(l.priceUsd ?? 0) !== 0).length;
assert("first sighting logged for every priced row", h1.rows[0].n === priced);

// ---- Setup for the delisting tests
const byDomain = new Map();
for (const l of sample) byDomain.set(l.dealerDomain, (byDomain.get(l.dealerDomain) ?? 0) + 1);
const soldIdx = sample.findIndex((l) => byDomain.get(l.dealerDomain) > 1);
const soldDomain = sample[soldIdx].dealerDomain;
const failedDomain = [...byDomain.keys()].find((d) => d !== soldDomain);
const failedCount = byDomain.get(failedDomain);
const run2 = sample
  .filter((l, i) => i !== soldIdx && l.dealerDomain !== failedDomain)
  .map((l, i) => (i === 0 ? { ...l, priceUsd: l.priceUsd - 1000 } : l));

// ---- Run 2a: THE NEW RULE — same data, but the crawl was TRUNCATED, so no
// domain is certified complete. A car missing from a partial crawl is not
// evidence of a sale.
console.log("\nrun 2a: truncated crawl (no domain certified) — must NOT delist");
const r2a = await ingest(run2, "test", []);
assert("price_changed=1 (history still recorded)", r2a.price_changed === 1, JSON.stringify(r2a));
assert("delisted=0 despite missing car", r2a.delisted === 0, JSON.stringify(r2a));
const stillLive = await db.query(`select delisted_at from listings where vin=$1`, [sample[soldIdx].vin]);
assert("missing car still live", stillLive.rows[0].delisted_at === null);

// ---- Run 2b: same data, but the crawler certifies it saw soldDomain fully.
console.log("\nrun 2b: complete crawl of the sold car's domain — must delist exactly it");
const r2b = await ingest(run2, "test", [soldDomain]);
assert("delisted=1 (only the sold car)", r2b.delisted === 1, JSON.stringify(r2b));
const sold = await db.query(`select delisted_at from listings where vin=$1`, [sample[soldIdx].vin]);
assert("sold car has delisted_at", sold.rows[0].delisted_at !== null);
const failedRows = await db.query(
  `select count(*)::int as n from listings where dealer_domain=$1 and delisted_at is null`,
  [failedDomain]
);
assert("failed-domain cars untouched", failedRows.rows[0].n === failedCount);

// ---- Run 2c: a domain certified complete but producing ZERO rows (every
// fetch failed) must not delist its inventory either.
console.log("\nrun 2c: certified-complete domain with zero rows — must NOT delist");
const before = await db.query(
  `select count(*)::int as n from listings where dealer_domain=$1 and delisted_at is null`,
  [failedDomain]
);
const r2c = await ingest(run2, "test", [soldDomain, failedDomain]);
const after = await db.query(
  `select count(*)::int as n from listings where dealer_domain=$1 and delisted_at is null`,
  [failedDomain]
);
assert("zero-row domain kept its cars", after.rows[0].n === before.rows[0].n, JSON.stringify(r2c));

// ---- Run 3: the sold car comes back (relist)
console.log("\nrun 3: sold car relists");
const r3 = await ingest([sample[soldIdx]], "test", [soldDomain]);
assert("relisted=1", r3.relisted === 1, JSON.stringify(r3));
const back = await db.query(`select delisted_at from listings where vin=$1`, [sample[soldIdx].vin]);
assert("delisted_at cleared on relist", back.rows[0].delisted_at === null);

// ---- Run 4: omitting _complete_domains entirely delists nothing
console.log("\nrun 4: legacy call without _complete_domains — delists nothing");
const r4 = await ingest([sample[soldIdx]], "test", null);
assert("delisted=0 when uncertified", r4.delisted === 0, JSON.stringify(r4));

// ---- Junk input: rows missing vin/price skipped, dup VINs deduped
console.log("\nrun 5: junk input");
const r5 = await ingest([{ vin: "", priceUsd: 5 }, { year: 2020 }, sample[2], { ...sample[2] }], "test", []);
assert("junk skipped, dup deduped: seen=1", r5.seen === 1, JSON.stringify(r5));

// ---- Run 6: lifecycle events (migration 0006) — the sold car's full story
// so far reads listed → delisted (2b) → relisted (3). 2c must not have
// produced a second delist (the car was already delisted), and re-ingesting
// a known live car (runs 4/5) must produce no events at all.
console.log("\nrun 6: lifecycle events");
const soldVin = sample[soldIdx].vin.toUpperCase();
const ev = await db.query(
  `select event from listing_events where vin=$1 order by observed_at, id`,
  [soldVin]
);
assert(
  "sold car events are exactly listed→delisted→relisted",
  JSON.stringify(ev.rows.map((r) => r.event)) === JSON.stringify(["listed", "delisted", "relisted"]),
  JSON.stringify(ev.rows)
);
const listedTotal = await db.query(`select count(*)::int as n from listing_events where event='listed'`);
assert("one listed event per VIN ever seen", listedTotal.rows[0].n === sample.length);

// ---- Run 7: mileage history on the ingest path — a changed odometer is
// logged, an absent one is not an observation.
console.log("\nrun 7: mileage history via ingest");
await ingest([{ ...sample[soldIdx], mileage: 99999 }], "test", []);
const m1 = await db.query(
  `select count(*)::int as n from listing_mileage_history where vin=$1 and mileage=99999`,
  [soldVin]
);
assert("odometer change logged", m1.rows[0].n === 1);
const mBefore = await db.query(`select count(*)::int as n from listing_mileage_history`);
await ingest([{ ...sample[soldIdx], mileage: null }], "test", []);
const mAfter = await db.query(`select count(*)::int as n from listing_mileage_history`);
assert("null mileage is not an observation", mAfter.rows[0].n === mBefore.rows[0].n);

// ---- Run 8: the recheck path also feeds both logs
console.log("\nrun 8: recheck feeds price, mileage, and events");
async function recheck(alive, hardGone, softGone) {
  const res = await db.query(
    `select recheck_listings($1::jsonb, $2::jsonb, $3::jsonb) as r`,
    [JSON.stringify(alive), JSON.stringify(hardGone), JSON.stringify(softGone)]
  );
  return res.rows[0].r;
}
const rc = sample.find((l) => l.dealerDomain === failedDomain);
const rcVin = rc.vin.toUpperCase();
const r8a = await recheck([{ vin: rc.vin, priceUsd: rc.priceUsd - 500, mileage: 54321 }], [], []);
assert("recheck confirms and logs price change", r8a.confirmed === 1 && r8a.price_changed === 1, JSON.stringify(r8a));
const m8 = await db.query(
  `select count(*)::int as n from listing_mileage_history where vin=$1 and mileage=54321`,
  [rcVin]
);
assert("recheck logs mileage change", m8.rows[0].n === 1);

const r8b = await recheck([], [rc.vin], []);
assert("hard gone delists", r8b.delisted === 1, JSON.stringify(r8b));
const r8c = await recheck([{ vin: rc.vin, priceUsd: rc.priceUsd - 500, mileage: 54321 }], [], []);
assert("recheck confirms the returned car", r8c.confirmed === 1, JSON.stringify(r8c));
const rcEv = await db.query(
  `select event from listing_events where vin=$1 order by observed_at, id`,
  [rcVin]
);
assert(
  "recheck cycle events are listed→delisted→relisted",
  JSON.stringify(rcEv.rows.map((r) => r.event)) === JSON.stringify(["listed", "delisted", "relisted"]),
  JSON.stringify(rcEv.rows)
);

// Soft-gone strikes: first strike is not a delist event, the second is.
const sg = sample.filter((l) => l.dealerDomain === failedDomain)[1];
const sgVin = sg.vin.toUpperCase();
const r8d = await recheck([], [], [sg.vin]);
assert("first strike does not delist", r8d.struck === 1 && r8d.delisted === 0, JSON.stringify(r8d));
const sgEv1 = await db.query(
  `select count(*)::int as n from listing_events where vin=$1 and event='delisted'`,
  [sgVin]
);
assert("no delist event on first strike", sgEv1.rows[0].n === 0);
await recheck([], [], [sg.vin]);
const sgRow = await db.query(`select delisted_at from listings where vin=$1`, [sgVin]);
const sgEv2 = await db.query(
  `select count(*)::int as n from listing_events where vin=$1 and event='delisted'`,
  [sgVin]
);
assert("second strike delists with exactly one event", sgRow.rows[0].delisted_at !== null && sgEv2.rows[0].n === 1);

// ---- Run 9: the observed_at guard (migration 0013). A db-sync replaying a
// snapshot written BEFORE a recheck delisting must not resurrect the kill —
// the 2026-08-14 incident — and a stale snapshot must not delist cars seen
// alive since it was written.
console.log("\nrun 9: stale evidence overwrites nothing");
const hourAgo = new Date(Date.now() - 3600_000).toISOString();

// (a) no stale relist: delist rc again, then replay it with an old observedAt.
await recheck([], [rc.vin], []);
const evBefore9 = await db.query(
  `select count(*)::int as n from listing_events where vin=$1`, [rcVin]);
const ph9 = await db.query(
  `select count(*)::int as n from listing_price_history where vin=$1`, [rcVin]);
const r9a = await ingest([{ ...rc, priceUsd: rc.priceUsd - 777 }], "test", [], hourAgo);
assert("stale replay relists nothing", r9a.relisted === 0, JSON.stringify(r9a));
assert("stale replay logs no price change", r9a.price_changed === 0, JSON.stringify(r9a));
const rc9 = await db.query(`select delisted_at from listings where vin=$1`, [rcVin]);
assert("recheck's kill survives the replay", rc9.rows[0].delisted_at !== null);
const evAfter9 = await db.query(
  `select count(*)::int as n from listing_events where vin=$1`, [rcVin]);
assert("no spurious relisted event", evAfter9.rows[0].n === evBefore9.rows[0].n);
const ph9b = await db.query(
  `select count(*)::int as n from listing_price_history where vin=$1`, [rcVin]);
assert("no stale price logged", ph9b.rows[0].n === ph9.rows[0].n);

// Fresh evidence (no observedAt → observed now) still relists — run 3 semantics.
const r9b = await ingest([rc], "test", []);
assert("fresh sync relists", r9b.relisted === 1, JSON.stringify(r9b));

// (b) no stale delist: a complete-domain batch missing a car seen alive
// AFTER the batch was observed proves nothing about that car.
const soldRows = sample.filter((l) => l.dealerDomain === soldDomain);
const victim = soldRows.find((l, i) => i !== 0);
// Run 3 certified soldDomain while ingesting only the sold car, so the
// domain's other rows are delisted right now. Reset: bring them all back.
await ingest(soldRows, "test", [soldDomain]);
const batch9 = soldRows.filter((l) => l.vin !== victim.vin);
const r9c = await ingest(batch9, "test", [soldDomain], hourAgo);
assert("stale absence delists nothing", r9c.delisted === 0, JSON.stringify(r9c));
const v9 = await db.query(`select delisted_at from listings where vin=$1`, [victim.vin.toUpperCase()]);
assert("victim still live after stale batch", v9.rows[0].delisted_at === null);
const r9d = await ingest(batch9, "test", [soldDomain]);
assert("fresh absence still delists", r9d.delisted === 1, JSON.stringify(r9d));

// ---- Run 10: the same-dealer guard (migration 0048). A co-listed VIN's
// price alternating between two dealer sites must never read as a price
// step; a genuine cut observed twice by one site must still claim.
console.log("\nrun 10: price steps need one dealer");
const feedPrev = async (vin) =>
  (await db.query(`select prev_price_usd from live_listings_feed where vin=$1`, [vin])).rows[0]?.prev_price_usd ?? null;
const sparkRows = async (vin) =>
  (await db.query(`select count(*)::int as n from listing_price_display where vin=$1`, [vin])).rows[0].n;
const mk = (vin, domain, price) => ({
  ...sample[0], vin, id: vin.toLowerCase(), dealerDomain: domain,
  priceUsd: price, provenance: "jsonld",
});

// (a) domain-tagged ping-pong: d1 @30000 -> d2 @32000 -> d1 @30000.
const V1 = "TESTPINGPONG00001";
await ingest([mk(V1, "d1.test", 30000)], "test");
await ingest([mk(V1, "d2.test", 32000)], "test");
await ingest([mk(V1, "d1.test", 30000)], "test");
assert("cross-domain pair claims no step", (await feedPrev(V1)) === null);
assert("sparkline goes quiet on the alternation", (await sparkRows(V1)) === 1);

// (b) then a genuine same-domain cut on the same VIN claims normally.
await ingest([mk(V1, "d1.test", 29000)], "test");
assert("same-domain cut claims prev=30000", (await feedPrev(V1)) === 30000);
assert("sparkline draws the genuine step", (await sparkRows(V1)) === 2);

// (c) legacy null-domain rows: the A->B->A fingerprint suppresses...
const V2 = "TESTPINGPONG00002";
await ingest([mk(V2, "d1.test", 40000)], "test");
await db.query(`insert into listing_price_history (vin, price_usd, observed_at) values ($1, 42000, now() + interval '1 ms')`, [V2]);
await db.query(`insert into listing_price_history (vin, price_usd, observed_at) values ($1, 40000, now() + interval '2 ms')`, [V2]);
assert("null-domain alternation claims no step", (await feedPrev(V2)) === null);

// ...but a null-domain pair that does NOT return to the 2-back price claims
// under the 0040/0041 fallbacks exactly as before this migration.
const V3 = "TESTPINGPONG00003";
await ingest([mk(V3, "d1.test", 40000)], "test");
await db.query(`insert into listing_price_history (vin, price_usd, observed_at) values ($1, 42000, now() + interval '1 ms')`, [V3]);
await db.query(`insert into listing_price_history (vin, price_usd, observed_at) values ($1, 41000, now() + interval '2 ms')`, [V3]);
assert("null-domain non-alternating pair still claims", (await feedPrev(V3)) === 42000);

// (d) a two-row history (no 2-back price to compare) claims as before.
const V4 = "TESTPINGPONG00004";
await ingest([mk(V4, "d1.test", 25000)], "test");
await ingest([mk(V4, "d1.test", 24400)], "test");
assert("two-row history claims prev=25000", (await feedPrev(V4)) === 25000);

// (e) recheck carries the fetched page's domain into history.
await recheck([{ vin: V4, priceUsd: 24000, provenance: "jsonld", dealerDomain: "d1.test" }], [], []);
const rcDom = await db.query(
  `select dealer_domain from listing_price_history where vin=$1 order by observed_at desc limit 1`, [V4]);
assert("recheck row carries dealer_domain", rcDom.rows[0].dealer_domain === "d1.test");
assert("recheck same-domain cut claims prev=24400", (await feedPrev(V4)) === 24400);

// ---- Run 11: recheck writes its night in chunks (scraper/recheck.mjs,
// 2026-08-25). One POST carrying 58,192 alive rows made recheck_listings join
// its temp table to the whole of `listings` — EXPLAIN on prod showed the plan
// flip from per-row `Index Scan using listings_pkey` to a Merge Join over all
// 154,905 rows somewhere between 30,000 and 58,192 driving rows — and the RPC
// blew service_role's 60s statement_timeout, forfeiting the night's entire
// sold-signal (run 32719571812). recheck.mjs now sends the alive set in
// chunks. Nothing about the RPC changed, so what has to hold is that chunking
// is SEMANTICALLY invisible: same end state, and replay-safe per chunk.
console.log("\nrun 11: a chunked recheck write lands exactly what one write would");
const chunkVins = ["TESTCHUNK00000001", "TESTCHUNK00000002", "TESTCHUNK00000003", "TESTCHUNK00000004"];
await ingest(chunkVins.map((v) => mk(v, "d1.test", 50000)), "test");
const aliveRows = chunkVins.map((v) => ({ vin: v, priceUsd: 49000, provenance: "jsonld", dealerDomain: "d1.test" }));
const histFor = async (vin) =>
  (await db.query(`select count(*)::int as n from listing_price_history where vin=$1`, [vin])).rows[0].n;
const before11 = Object.fromEntries(await Promise.all(chunkVins.map(async (v) => [v, await histFor(v)])));

// Two chunks of two, the way recheck.mjs slices --alive-chunk.
let confirmed11 = 0, changed11 = 0;
for (let i = 0; i < aliveRows.length; i += 2) {
  const r = await recheck(aliveRows.slice(i, i + 2), [], []);
  confirmed11 += r.confirmed;
  changed11 += r.price_changed;
}
assert("chunks confirm every row exactly once", confirmed11 === chunkVins.length, String(confirmed11));
assert("chunks log every price change exactly once", changed11 === chunkVins.length, String(changed11));
for (const v of chunkVins) {
  const row = await db.query(`select price_usd, payload->>'priceUsd' as pp from listings where vin=$1`, [v]);
  assert(`${v} carries the chunked price on column and payload`,
    row.rows[0].price_usd === 49000 && Number(row.rows[0].pp) === 49000, JSON.stringify(row.rows[0]));
  assert(`${v} gained exactly one history row`, (await histFor(v)) === before11[v] + 1);
}

// A retried chunk must be a no-op, because fetchWithRetry will replay one on
// any 5xx. It is: the price-history insert only fires where the incoming price
// is distinct from the stored one, and the update in the same call has already
// made that false.
const replay = await recheck(aliveRows.slice(0, 2), [], []);
assert("a replayed chunk still confirms", replay.confirmed === 2, JSON.stringify(replay));
assert("a replayed chunk writes no second price step", replay.price_changed === 0, JSON.stringify(replay));
for (const v of chunkVins.slice(0, 2)) {
  assert(`${v} still has exactly one history row after replay`, (await histFor(v)) === before11[v] + 1);
}
const replayEv = await db.query(
  `select count(*)::int as n from listing_events where vin=$1 and event='relisted'`, [chunkVins[0]]);
assert("a replayed chunk invents no relisted event", replayEv.rows[0].n === 0, JSON.stringify(replayEv.rows[0]));

// And the invariant that forces the gone verdicts into ONE request: the
// soft-gone strike counts per CALL (0004), so the same VIN arriving in two
// requests is two strikes and an early delisting. This is why recheck.mjs
// chunks only the alive set and sends hardGone/softGone once.
const SPLIT = "TESTCHUNK00000005";
await ingest([mk(SPLIT, "d1.test", 50000)], "test");
await recheck([], [], [SPLIT]);
const split1 = await db.query(`select delisted_at, recheck_misses from listings where vin=$1`, [SPLIT]);
assert("one soft-gone request is one strike, no delist",
  split1.rows[0].delisted_at === null && split1.rows[0].recheck_misses === 1, JSON.stringify(split1.rows[0]));
await recheck([], [], [SPLIT]);
const split2 = await db.query(`select delisted_at from listings where vin=$1`, [SPLIT]);
assert("the same VIN in a second request delists it — so gone verdicts must never be split",
  split2.rows[0].delisted_at !== null, JSON.stringify(split2.rows[0]));

// ---- Security posture (migration 0007): the anon role reads exactly what
// the public site publishes — live listings and their price history — and
// gets a hard permission error on every archive table.
console.log("\nposture: anon sees the showroom, not the archive");
const pol = await db.query(`select tablename, cmd from pg_policies where schemaname='public' order by tablename`);
// The full deliberate posture, one line per decision: live listings + their
// price history (0007), reference catalogs the site quotes (vin_variant_vpic
// 0016, epa_vehicle_variants 0037), the guard table the price views consult
// (price_methodology_transitions 0040), and write-only analytics events
// (0027, INSERT — the one non-SELECT). Anything appearing here uninvited is
// a posture change to justify, not a count to bump.
const expectedPolicies = [
  ["epa_vehicle_variants", "SELECT"],
  ["events", "INSERT"],
  ["listing_price_history", "SELECT"],
  ["listings", "SELECT"],
  ["price_methodology_transitions", "SELECT"],
  ["vin_variant_vpic", "SELECT"],
];
assert(
  `policies are exactly the deliberate posture (${pol.rows.length})`,
  JSON.stringify(pol.rows.map((p) => [p.tablename, p.cmd]).sort()) ===
    JSON.stringify(expectedPolicies),
  JSON.stringify(pol.rows)
);

const totals = await db.query(`
  select (select count(*)::int from listings) as all_cars,
         (select count(*)::int from listings where delisted_at is null) as live_cars,
         (select count(*)::int from listing_price_history) as all_prices,
         (select count(*)::int from listing_price_history h
            join listings l using (vin) where l.delisted_at is null) as live_prices
`);
const t = totals.rows[0];
assert("test data includes delisted rows (posture test has bite)", t.all_cars > t.live_cars && t.all_prices > t.live_prices);

await db.exec(`set role anon`);
const anonCars = await db.query(`select count(*)::int as n from listings`);
assert("anon sees only live listings", anonCars.rows[0].n === t.live_cars, `${anonCars.rows[0].n} vs ${t.live_cars}`);
const anonPrices = await db.query(`select count(*)::int as n from listing_price_history`);
assert("anon sees only live cars' price history", anonPrices.rows[0].n === t.live_prices, `${anonPrices.rows[0].n} vs ${t.live_prices}`);
for (const closed of ["listing_mileage_history", "listing_events", "ingest_runs", "wa_ev_sales"]) {
  let denied = false;
  try {
    await db.query(`select count(*) from ${closed}`);
  } catch {
    denied = true;
  }
  assert(`anon is denied outright on ${closed}`, denied);
}
await db.exec(`reset role`);

const canComp = await db.query(
  `select has_function_privilege('anon', 'wa_price_comps(text, text, int, int, int)', 'execute') as ok`
);
assert("anon can still execute wa_price_comps (statistics, not the database)", canComp.rows[0].ok === true);
const canExec = await db.query(
  `select has_function_privilege('anon', 'ingest_listings(jsonb, text, jsonb, timestamptz)', 'execute') as ok`
);
assert("anon cannot execute ingest_listings", canExec.rows[0].ok === false);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
