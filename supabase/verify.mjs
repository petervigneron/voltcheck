// Verifies supabase/migrations/*.sql against a real embedded Postgres
// (PGlite). Simulates nightly ingest runs over real rows from
// web/data/scraped-listings.json and asserts the history semantics —
// including the rule that only a COMPLETELY crawled domain may delist.
//   cd supabase && npm install && node verify.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);
const LISTINGS = new URL("../web/data/scraped-listings.json", import.meta.url);

const db = new PGlite();
let failures = 0;
function assert(name, cond, detail = "") {
  if (cond) console.log(`  ok: ${name}`);
  else { failures++; console.error(`  FAIL: ${name} ${detail}`); }
}

// Supabase's roles pre-exist on the platform; create them so the exact
// migration files (RLS policies, revokes) run unmodified.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
`);
for (const f of (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await readFile(new URL(f, MIGRATIONS_DIR), "utf-8"));
  console.log(`migration applied: ${f}`);
}

const all = JSON.parse(await readFile(LISTINGS, "utf-8"));
// Real rows spanning 3 domains: up to 4 cars from each of the first 3 domains.
const domains = [...new Set(all.map((l) => l.dealerDomain))].slice(0, 3);
const sample = domains.flatMap((d) => all.filter((l) => l.dealerDomain === d).slice(0, 4));

async function ingest(rows, source, completeDomains = null) {
  const res = await db.query(`select ingest_listings($1::jsonb, $2, $3::jsonb) as r`, [
    JSON.stringify(rows),
    source,
    completeDomains === null ? null : JSON.stringify(completeDomains),
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
assert("first sighting logged for every row", h1.rows[0].n === sample.length);

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

// ---- Security posture
const pol = await db.query(`select tablename, cmd from pg_policies where schemaname='public' order by tablename`);
assert(
  `every public policy is read-only (${pol.rows.length} tables)`,
  pol.rows.length >= 3 && pol.rows.every((p) => p.cmd === "SELECT"),
  JSON.stringify(pol.rows)
);
const canExec = await db.query(
  `select has_function_privilege('anon', 'ingest_listings(jsonb, text, jsonb)', 'execute') as ok`
);
assert("anon cannot execute ingest_listings", canExec.rows[0].ok === false);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
