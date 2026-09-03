// How many cars on the site meet at least one incentive program's car-side
// conditions, by state — the progress number for the incentive feature. Run
// from web/:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/incentive-counts.mjs [--host https://voltcheck.net]
//
// Reads the published browse index off the CDN (voltcheck.net/api/index/0..N),
// never the database: CLAUDE.md's rule for full-feed scripts. Each packed row
// is unpacked into the minimal Listing the matcher needs (VIN, year, make,
// model, trim, price, mileage, condition, state) and run through
// enrichListing + matchIncentives under BOTH policies, so the owner can see
// what each unsettled-condition decision is worth in cars. The packed row's
// trim is the normalized classifier, not the dealer's raw string, so a
// handful of trim-keyed enrichment matches can differ from the live page;
// the count is a measurement of the feed, not a substitute for the page.
//
// Pure read; writes nothing but stdout.

import { unpackIndex } from "../lib/listings/pack.ts";
import { enrichListing } from "../lib/listings/enrich.ts";
import { matchIncentives, STRICT_POLICY } from "../lib/incentives/match.ts";
import { INCENTIVE_PROGRAMS } from "../lib/incentives/registry.ts";

const args = process.argv.slice(2);
const host = args.includes("--host") ? args[args.indexOf("--host") + 1] : "https://voltcheck.net";
const RELAXED = { askingPriceStandsForMsrp: true, unsettledCarConditionsAreStated: true };

async function fetchJson(path) {
  const res = await fetch(`${host}${path}`, { headers: { "Accept-Encoding": "gzip" } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

const first = await fetchJson("/api/index/first");
const total = first.total;
const rows = [];
for (let i = 0; ; i++) {
  let shard;
  try {
    shard = await fetchJson(`/api/index/${i}`);
  } catch (e) {
    if (rows.length >= total) break;
    throw e;
  }
  const cards = unpackIndex(shard);
  rows.push(...cards);
  if (rows.length >= total) break;
}
if (rows.length !== total) throw new Error(`shards held ${rows.length} rows, first.json says ${total}`);

const live = INCENTIVE_PROGRAMS.filter((p) => p.status === "live").map((p) => p.id);
const tally = (policy) => {
  const byState = new Map();
  const byProgram = new Map();
  let matched = 0;
  for (const c of rows) {
    const listing = {
      id: c.id,
      vin: c.id.toUpperCase(),
      year: c.year,
      make: c.make,
      model: c.model,
      trim: c.trim,
      priceUsd: c.realPrice ? c.priceUsd : 0,
      mileage: c.mileage,
      condition: c.condition,
      state: c.state,
      sellerType: "dealer",
    };
    const ms = matchIncentives(enrichListing(listing), policy);
    if (!ms.length) continue;
    matched++;
    const st = ms[0].program.jurisdiction.state;
    const s = byState.get(st) ?? { cars: 0, new: 0, used: 0 };
    s.cars++;
    if (c.condition === "new") s.new++;
    else s.used++;
    byState.set(st, s);
    for (const m of ms) byProgram.set(m.program.id, (byProgram.get(m.program.id) ?? 0) + 1);
  }
  return { matched, byState, byProgram };
};

const strict = tally(STRICT_POLICY);
const relaxed = tally(RELAXED);

console.log(`feed: ${total} cars; live programs in registry: ${live.length}`);
console.log(`\nSTRICT policy (default on the site): ${strict.matched} cars meet at least one program's car-side conditions`);
for (const [st, s] of [...strict.byState].sort((a, b) => b[1].cars - a[1].cars)) console.log(`  ${st}  ${s.cars} (new ${s.new}, used ${s.used})`);
console.log("  by program:");
for (const [id, n] of [...strict.byProgram].sort((a, b) => b[1] - a[1])) console.log(`    ${id}  ${n}`);

console.log(`\nRELAXED policy (asking price stands for MSRP; unsettled car conditions stated): ${relaxed.matched} cars`);
for (const [st, s] of [...relaxed.byState].sort((a, b) => b[1].cars - a[1].cars)) console.log(`  ${st}  ${s.cars} (new ${s.new}, used ${s.used})`);
console.log("  by program:");
for (const [id, n] of [...relaxed.byProgram].sort((a, b) => b[1] - a[1])) console.log(`    ${id}  ${n}`);

// What the feed holds in the states that have any live program at all, so the
// match rate has a denominator.
const states = new Set(INCENTIVE_PROGRAMS.filter((p) => p.status === "live").map((p) => p.jurisdiction.state));
const denom = new Map();
for (const c of rows) {
  if (!c.state || !states.has(c.state)) continue;
  const d = denom.get(c.state) ?? { cars: 0, new: 0, used: 0, noCondition: 0 };
  d.cars++;
  if (c.condition === "new") d.new++;
  else if (c.condition) d.used++;
  else d.noCondition++;
  denom.set(c.state, d);
}
console.log("\nfeed rows in states with a live program:");
for (const [st, d] of [...denom].sort((a, b) => b[1].cars - a[1].cars)) console.log(`  ${st}  ${d.cars} (new ${d.new}, used ${d.used}, no condition ${d.noCondition})`);
console.log(`\nrows with no state at all: ${rows.filter((c) => !c.state).length}`);
