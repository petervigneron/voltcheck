// Verifies supabase/migrations/0001_init.sql against a real embedded
// Postgres (PGlite). Simulates three nightly ingest runs over real rows
// from web/data/scraped-listings.json and asserts the history semantics.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const MIGRATION = new URL("./migrations/0001_init.sql", import.meta.url);
const LISTINGS = new URL("../web/data/scraped-listings.json", import.meta.url);

const db = new PGlite();
let failures = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log(`  ok: ${name}`);
  else { failures++; console.error(`  FAIL: ${name} ${detail}`); }
}

// Supabase's roles pre-exist on the platform; create them so the exact
// migration file (RLS policies, revokes) runs unmodified.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
`);
await db.exec(await readFile(MIGRATION, "utf-8"));
console.log("migration applied cleanly");

const all = JSON.parse(await readFile(LISTINGS, "utf-8"));
// Real rows spanning 3 domains: up to 4 cars from each of the first 3 domains.
const domains = [...new Set(all.map((l) => l.dealerDomain))].slice(0, 3);
const sample = domains.flatMap((d) => all.filter((l) => l.dealerDomain === d).slice(0, 4));

async function ingest(rows, source) {
  const res = await db.query(`select ingest_listings($1::jsonb, $2) as r`, [
    JSON.stringify(rows),
    source,
  ]);
  return res.rows[0].r;
}

// ---- Run 1: everything is new
console.log("\nrun 1: first sight of 12 listings");
const r1 = await ingest(sample, "test");
assert("seen=12", r1.seen === 12, JSON.stringify(r1));
assert("new=12", r1.new === 12, JSON.stringify(r1));
assert("no price changes", r1.price_changed === 0);
assert("no delists", r1.delisted === 0);
const h1 = await db.query(`select count(*)::int as n from listing_price_history`);
assert("12 price-history rows (first sighting logged)", h1.rows[0].n === 12);

// ---- Run 2: one price drop, one car gone from a domain that still reports,
// and one whole domain absent (crawl failure — must NOT delist).
console.log("\nrun 2: price drop + one sold car + one failed domain");
const droppedCar = sample[0]; // will be omitted; its domain still present via others?
const byDomain = new Map();
for (const l of sample) byDomain.set(l.dealerDomain, (byDomain.get(l.dealerDomain) ?? 0) + 1);
// pick a car whose domain has >1 listing (so the domain still reports)
const soldIdx = sample.findIndex((l) => byDomain.get(l.dealerDomain) > 1);
// pick a whole domain to simulate a failed crawl (all its cars absent)
const failedDomain = [...byDomain.entries()].find(
  ([d, n]) => n >= 1 && d !== sample[soldIdx].dealerDomain
)[0];
const failedCount = byDomain.get(failedDomain);

const run2 = sample
  .filter((l, i) => i !== soldIdx && l.dealerDomain !== failedDomain)
  .map((l, i) => (i === 0 ? { ...l, priceUsd: l.priceUsd - 1000 } : l));
console.log(
  `  sold car: ${sample[soldIdx].vin} (${sample[soldIdx].dealerDomain}); failed domain: ${failedDomain} (${failedCount} cars)`
);
const r2 = await ingest(run2, "test");
assert(`seen=${run2.length}`, r2.seen === run2.length, JSON.stringify(r2));
assert("new=0", r2.new === 0);
assert("price_changed=1", r2.price_changed === 1, JSON.stringify(r2));
assert("delisted=1 (sold car only, failed domain untouched)", r2.delisted === 1, JSON.stringify(r2));

const sold = await db.query(`select delisted_at from listings where vin=$1`, [sample[soldIdx].vin]);
assert("sold car has delisted_at", sold.rows[0].delisted_at !== null);
const failedRows = await db.query(
  `select count(*)::int as n from listings where dealer_domain=$1 and delisted_at is null`,
  [failedDomain]
);
assert("failed-domain cars still live", failedRows.rows[0].n === failedCount);
const hist = await db.query(
  `select price_usd from listing_price_history where vin=$1 order by observed_at, id`,
  [run2[0].vin]
);
assert(
  "price history has both prices",
  hist.rows.length === 2 && hist.rows[1].price_usd === run2[0].priceUsd,
  JSON.stringify(hist.rows)
);
const fs = await db.query(`select first_seen_at, last_seen_at from listings where vin=$1`, [run2[1].vin]);
assert(
  "first_seen preserved, last_seen bumped",
  fs.rows[0].first_seen_at < fs.rows[0].last_seen_at
);

// ---- Run 3: the sold car comes back (relist) at the same price
console.log("\nrun 3: sold car relists");
const r3 = await ingest([sample[soldIdx]], "test");
assert("relisted=1", r3.relisted === 1, JSON.stringify(r3));
assert("new=0", r3.new === 0);
const back = await db.query(`select delisted_at from listings where vin=$1`, [sample[soldIdx].vin]);
assert("delisted_at cleared on relist", back.rows[0].delisted_at === null);

// ---- Junk input: rows missing vin/price are skipped, dup VINs deduped
console.log("\nrun 4: junk input");
const r4 = await ingest(
  [{ vin: "", priceUsd: 5 }, { year: 2020 }, sample[2], { ...sample[2] }],
  "test"
);
assert("junk skipped, dup deduped: seen=1", r4.seen === 1, JSON.stringify(r4));

// ---- ingest_runs bookkeeping
const runs = await db.query(
  `select count(*)::int as n, count(finished_at)::int as f from ingest_runs`
);
assert("4 runs recorded, all finished", runs.rows[0].n === 4 && runs.rows[0].f === 4);

// ---- RLS: policies exist and only selects are allowed to anon
const pol = await db.query(
  `select tablename, cmd from pg_policies where schemaname='public' order by tablename`
);
assert(
  "read-only policies on all 3 tables",
  pol.rows.length === 3 && pol.rows.every((p) => p.cmd === "SELECT"),
  JSON.stringify(pol.rows)
);
const canExec = await db.query(
  `select has_function_privilege('anon', 'ingest_listings(jsonb, text)', 'execute') as ok`
);
assert("anon cannot execute ingest_listings", canExec.rows[0].ok === false);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
