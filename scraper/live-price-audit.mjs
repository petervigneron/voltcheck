#!/usr/bin/env node
// Price plausibility of the LIVE feed — every car a shopper can actually see.
//
//   node live-price-audit.mjs [--json <file>] [--min-cohort N] [--base URL]
//
// WHY THIS EXISTS, and why price-audit.mjs was not already it.
//
// price-audit.mjs audits `web/data/scraped-listings.json`. That file used to
// be a whole-fleet view, and auditing it meant auditing everything. It is not
// one any more: nightly now ingests only the OEM locator lanes, so the file
// ingest.mjs leaves behind holds ~38,000 cars, not the ~100,000 that are live
// (the same change nightly.yml's commit step already refuses to commit over
// the weekly full snapshot, for the same reason). The audit kept passing on
// what it could see. Everything crawled from a dealer rooftop — which is most
// of the feed, and every false bargain found so far — was simply never in the
// set it read.
//
// Measured 2026-08-23: that night's run reported "9 flagged" out of the OEM
// slice while the live feed carried 66 implausible prices, among them four
// Porsche Macans at $700, three Mustang Mach-Es at $750–$1,000, a $8,299
// Lamborghini Revuelto, and a 2025 F-150 Lightning at $15,021 whose real ask
// was $57,944. The $700 Macans had been live and wrong for six days. Nothing
// was broken and nothing alarmed; the check was looking somewhere else.
//
// So this reads the feed the CDN actually serves — /api/index/0..5, the same
// six shards a shopper's browser fetches. Off Vercel's cache it is free and it
// costs the database nothing, which is why it can run every few hours next to
// the other live-feed audits instead of once a night behind the pipeline
// (CLAUDE.md: don't point full-feed scripts at Supabase when the CDN already
// serves the same rows).
//
// WHAT IT TESTS
//
//   1. The absolute floors (lib/price-floor.mjs). A number below the floor for
//      the car's condition and year is a payment, deposit or fee in the price
//      slot, not an ask.
//   2. The car's own cohort. Median asking price for its year/make/model/
//      condition, from the feed itself. A discount amount published as a price
//      is a plausible-looking dollar figure — $15,021 cleared the $15,000 new
//      floor by $21 — and the only thing that exposes it is what every other
//      copy of the same car is asking.
//
// Cohort medians come from the feed rather than WA sale comps (price-audit's
// basis) on purpose: WA can only answer for models with enough WA sales, and
// the models this keeps catching — Macan EV, Revuelto, this year's Mach-E —
// are exactly the ones it cannot. The feed can answer for every model it
// carries, and it is also the thing being claimed.
//
// What this CANNOT catch, stated plainly: a cohort that is wrong the same way
// all at once moves its own median, and a small cohort can be dragged by one
// bad row. MIN_COHORT and the median (not the mean) are the guards, and they
// are partial ones. Systematically-wrong extraction is the extractor's problem
// and the floors' — this is the net under both, not a replacement for either.
//
// IT REPORTS AND EXITS; IT WRITES NOTHING. Same rule as audit-listings.mjs:
// changing a production row is a deliberate act, and suppressing a genuinely
// cheap car would be its own false claim. Exit 10 with the list is the output.
import { writeFile } from "node:fs/promises";
import { priceFloor } from "./lib/price-floor.mjs";
import { recordRun } from "./lib/audit-status.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "https://voltcheck.net");
const JSON_OUT = arg("--json", null);
const MIN_COHORT = Number(arg("--min-cohort", 8));
// Keep in step with web/lib/listings/pack.ts SHARDS (this lane can't import
// TS). 6 → 24 on 2026-08-24; pack.ts's comment has the incident.
const SHARDS = 24;

// Wide enough that an ordinary market spread never trips it — a loud check
// nobody trusts gets muted, which is worse than no check. Every incident this
// was built from sits an order of magnitude outside these, not just outside.
const LOW_RATIO = 0.35;
const HIGH_RATIO = 3;

async function finish(code, result, detail) {
  await recordRun("live-price-audit", { result, detail, expectedEveryHours: 8 });
  process.exit(code);
}

// pack.ts's wire format, read directly rather than via the web bundle: i=id
// (the lowercased VIN), y=year, k=make, o=model, p=priceUsd, cd=condition
// index into ["new","used","certified"], and f===0 meaning the row carries no
// real price. Only these six fields are touched; if pack.ts's shape changes,
// its `v` version guard below is what should notice.
const CONDITIONS = ["new", "used", "certified"];

async function loadShard(s) {
  const res = await fetch(`${BASE}/api/index/${s}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`shard ${s} HTTP ${res.status}`);
  const body = await res.json();
  if (body?.v !== 1) throw new Error(`shard ${s} unexpected pack version ${body?.v}`);
  return body.r ?? [];
}

let packed;
try {
  packed = (await Promise.all(Array.from({ length: SHARDS }, (_, s) => loadShard(s)))).flat();
} catch (e) {
  console.error(`live-price-audit: could not read the feed — ${e.message}`);
  await finish(1, "fail", `feed read failed: ${e.message}`);
}

// A row with no real price is the site already staying quiet about it — that
// is the abstain working, not a finding.
const rows = packed
  .filter((p) => p.f !== 0 && typeof p.p === "number" && p.p > 0)
  .map((p) => ({
    vin: String(p.i ?? "").toUpperCase(),
    year: p.y,
    make: p.k,
    model: p.o,
    priceUsd: p.p,
    condition: typeof p.cd === "number" ? CONDITIONS[p.cd] : typeof p.cd === "string" ? p.cd : undefined,
  }));

if (!rows.length) await finish(1, "fail", `feed carried ${packed.length} rows, none with a price`);

// ---- cohort medians, from the feed itself --------------------------------
const key = (r) => `${r.year}|${r.make}|${r.model}|${r.condition ?? "?"}`;
const groups = new Map();
for (const r of rows) {
  const k = key(r);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r.priceUsd);
}
const medians = new Map();
for (const [k, prices] of groups) {
  if (prices.length < MIN_COHORT) continue;
  const sorted = prices.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  medians.set(k, sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

const findings = [];
for (const r of rows) {
  // An unknown condition takes the used floor, the lower of the two — the same
  // conservatism priceFloor already applies to an unknown year.
  const floor = priceFloor({ isNew: r.condition === "new", year: r.year });
  if (r.priceUsd < floor) {
    findings.push({ ...r, why: `below the $${floor.toLocaleString()} floor for a ${r.condition ?? "used"} ${r.year}`, kind: "floor", ratio: null });
    continue;
  }
  const med = medians.get(key(r));
  if (med == null) continue;
  const ratio = r.priceUsd / med;
  if (ratio < LOW_RATIO || ratio > HIGH_RATIO) {
    findings.push({
      ...r,
      why: `${ratio.toFixed(2)}x the $${Math.round(med).toLocaleString()} median of ${groups.get(key(r)).length} like it`,
      kind: ratio < LOW_RATIO ? "under" : "over",
      ratio: Math.round(ratio * 100) / 100,
    });
  }
}

// Cheapest-first: a false bargain costs a shopper money, an overstate costs
// them a click. The house rule's asymmetry, applied to the report's own order.
findings.sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0));

console.log(`live-price-audit: ${rows.length} priced listings, ${medians.size} cohorts >= ${MIN_COHORT}, ${findings.length} implausible\n`);
for (const f of findings) {
  console.log(`  ${f.kind.toUpperCase().padEnd(5)} ${f.vin}  ${f.year} ${f.make} ${f.model} $${f.priceUsd.toLocaleString()} — ${f.why}`);
  console.log(`        ${BASE}/listing/${f.vin.toLowerCase()}`);
}

if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(findings, null, 2) + "\n");

const under = findings.filter((f) => f.kind !== "over").length;
const detail = `${rows.length} priced, ${findings.length} implausible (${under} at or below the floor/cohort, ${findings.length - under} above)`;
if (!findings.length) await finish(0, "ok", detail);
console.log(`\n::error::live-price-audit: ${findings.length} live listings carry a price the feed itself contradicts`);
await finish(10, "warn", detail);
