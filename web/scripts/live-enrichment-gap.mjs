// Which live listings resolve to NO enrichment row at all — the check that
// should have existed from the start. Run from web/:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/live-enrichment-gap.mjs [--json] [--max-groups N] [--top N]
//
// WHY THIS EXISTS: the enrichment corpus (lib/enrichment/data*.ts, ~440 rows)
// is filled in by hand, one model as someone thought of it, at a time.
// enrichment-coverage.mjs (this same directory) audits how COMPLETE each of
// those rows is once it exists — but nothing ever asked the prior question:
// is there a row at all for what's actually live? A Ram ProMaster EV reached
// the site with a totally empty enrichment card, and the owner found it by
// eye. A crude substring check against one feed shard then found 60 distinct
// make+model combinations with no apparent match — 12.2% of that shard's
// listings, including Lucid Gravity (242 on that shard alone), Subaru
// Trailseeker, Audi Q6 e-tron, Mercedes-Benz CLA, Jeep Recon, Dodge Charger
// Daytona, Genesis GV60, Lexus RZ 450e, Fiat 500e. A substring check is a
// guess, though — it doesn't know the matcher's trim/drive/VIN discriminators,
// so it both over- and under-counts. This runs the PRODUCTION matcher
// (lib/enrichment/match.ts, including whatever lib/enrichment/backfill.ts
// contributes at match time) against every live listing and reports exactly
// what it resolves to.
//
// SOURCE: the CDN-cached browse shards (voltcheck.net/api/index/0..5) — never
// Supabase directly. Those six files ARE the live feed (lib/listings/pack.ts),
// fetched once each, so this is gentle load on a database that a nightly
// db-sync may be mid-write against.
//
// TWO KINDS OF GAP, because they cost different things to fix:
//   total   — no enrichment row exists for this make+model+year at all. A
//             research gap: nobody has looked this car up yet.
//   partial — a row DOES exist for this make+model+year, but this listing's
//             own trim/drivetrain string doesn't satisfy it (trimMatches or
//             the drive filter in match.ts rejects every candidate). Either a
//             matching bug (a spelling the row doesn't anticipate) or a
//             narrower research gap (this specific trim was never added) —
//             worth a human's five-second look, not a blind re-run of the
//             same research.
// The split is measured directly: run the matcher once with this listing's
// real trim/drive, and once with both stripped (which only asks "does ANY
// row cover this make+model+year, ignoring trim/drive"). Total = the coarse
// call already came back empty. Partial = the coarse call found rows but the
// real one didn't.
//
// CAVEAT this script cannot avoid: the packed browse shard is not the raw
// listing. Its `trim` field is already lib/listings/enrich.ts's specTrim()
// (further cleaned than the matcher's own cleanTrim(), and blanked entirely
// when the listing's own description contradicts the feed trim — see
// buildIndex.ts's trimClaim gate) and it carries no VIN, so the matcher's
// VIN-position discriminators (WMI body-style, vin8 pack code, Tesla plant)
// never fire here. That can only make this script find FEWER matching bugs
// than the live site's own per-VIN enrichment does, never more — a listing
// this script calls "partial" is worth checking by hand before assuming the
// production path also misses it, but a "total" verdict (no row at ANY trim)
// is unaffected by any of that, because it never depends on trim or VIN.
//
// It reports; it does not edit. Filling a row or fixing a trim string is a
// research/code act with a primary source, never something this script
// guesses. Exit 0 = no more distinct gap groups than the baseline measured
// the day this check was born; 10 = a NEW group appeared (a new model went
// live with no enrichment, or an existing row stopped matching) — same
// ratchet shape as enrichment-coverage.mjs and completeness-audit.mjs, so the
// nightly can shout without failing the build.
//
// BASELINE NOT YET CALIBRATED. This was first run 2026-08-21 while a db-sync
// was mid-write against the same database: successive fetches of the same
// shards returned 58,741, then 63,945 listings — the feed was in a partial,
// half-written state, not measuring the site, against a true figure the
// database was reporting nearer 87,000+. That run's numbers are NOT used as
// the ratchet below on purpose; shipping a baseline measured against a
// corrupted read would make the ratchet either blind to real gaps or noisy
// with fake ones. --max-groups defaults to a value high enough to never fail
// until someone runs this for real against a healthy, settled feed and
// commits the true count here (same one-time calibration step
// enrichment-coverage.mjs and completeness-audit.mjs both went through) —
// until then this check reports faithfully but never trips the ratchet.

import { unpackIndex, SHARDS } from "../lib/listings/pack.ts";
import { matchEnrichment } from "../lib/enrichment/match.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : d;
};
const AS_JSON = has("--json");
const TOP = Number(val("--top", "40"));
const REPORT_PATH = val("--out", "/tmp/live-enrichment-gap.json");
// The ratchet. NOT YET CALIBRATED — see the header comment: the one run this
// script has had so far was against a mid-db-sync, half-written feed, so its
// numbers are not trustworthy as a baseline. 999999 effectively disables the
// ratchet (never fails) until someone runs this against a healthy feed and
// replaces this default with that run's real group count. Lower it as gaps
// get filled from there; never raise it to launder a new one — a group
// appearing above baseline means a model shipped live with no enrichment, or
// a previously-matching row broke.
const BASELINE = Number(val("--max-groups", "999999"));
const FEED_BASE = val("--feed-base", "https://voltcheck.net");

// Mirrors match.ts's own make/model normalization (norm() + the make-prefix
// strip in modelKey()) so this report's buckets are the matcher's own
// equivalence classes — "ID.4" and "ID 4" land in one group exactly because
// the matcher itself would treat them as one. Used only to LABEL and GROUP
// rows for the report; every hit/miss verdict below comes from calling the
// real matchEnrichment(), never from this.
const norm = (s) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const modelKey = (make, model) => {
  const mk = norm(make);
  const n = norm(model);
  return n.startsWith(mk) && n.length > mk.length ? n.slice(mk.length) : n;
};

async function fetchShard(n) {
  const url = n === "first" ? `${FEED_BASE}/api/index/first` : `${FEED_BASE}/api/index/${n}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`shard ${n}: HTTP ${res.status}`);
  return res.json();
}

// Shards 0..SHARDS-1 partition every live listing exactly once (shardOf in
// pack.ts); "first" is a top-of-page subset of shard content, not additional
// listings, so it is deliberately not fetched here — fetching it too would
// double-count whatever's on the front page.
const shardRows = [];
for (let n = 0; n < SHARDS; n++) {
  const packed = await fetchShard(n);
  shardRows.push(...unpackIndex(packed));
}
const listings = shardRows;

const matched = (r) => !!(r.exact || (r.candidates && r.candidates.length));

// One evaluation per listing, against the two decodes described above.
const groups = new Map(); // groupKey -> { make, model, total: Map<listingId,...>? just counts, ... }

let totalMiss = 0;
let partialMiss = 0;

for (const l of listings) {
  const make = (l.make ?? "").toUpperCase();
  const model = l.model ?? "";
  const decodeFull = {
    vin: "",
    usMarket: true,
    make,
    model,
    modelYear: l.year,
    trim: l.trim,
    driveType: l.drive,
  };
  const full = matchEnrichment(decodeFull, null);
  if (matched(full)) continue;

  const decodeCoarse = { ...decodeFull, trim: undefined, driveType: undefined };
  const coarse = matchEnrichment(decodeCoarse, null);
  const kind = matched(coarse) ? "partial" : "total";
  if (kind === "total") totalMiss++;
  else partialMiss++;

  const key = `${make}|||${modelKey(make, model)}|||${kind}`;
  let g = groups.get(key);
  if (!g) {
    g = { make, model, kind, count: 0, minYear: l.year, maxYear: l.year, modelSpellings: new Map(), trims: new Map() };
    groups.set(key, g);
  }
  g.count++;
  g.minYear = Math.min(g.minYear, l.year);
  g.maxYear = Math.max(g.maxYear, l.year);
  g.modelSpellings.set(model, (g.modelSpellings.get(model) ?? 0) + 1);
  if (kind === "partial") {
    const t = l.trim ?? "(no trim on this listing)";
    g.trims.set(t, (g.trims.get(t) ?? 0) + 1);
  }
}

const mostCommon = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

const ranked = [...groups.values()]
  .map((g) => ({
    make: g.make,
    model: mostCommon(g.modelSpellings),
    kind: g.kind,
    count: g.count,
    years: g.minYear === g.maxYear ? `${g.minYear}` : `${g.minYear}-${g.maxYear}`,
    exampleTrims: g.kind === "partial" ? [...g.trims.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${t} (${n})`) : undefined,
  }))
  .sort((a, b) => b.count - a.count);

const totalListings = listings.length;
const totalGapListings = totalMiss + partialMiss;
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

const report = {
  generatedAt: new Date().toISOString(),
  totalListings,
  totalGapListings,
  gapSharePct: pct(totalGapListings, totalListings),
  totalMissListings: totalMiss,
  partialMissListings: partialMiss,
  groupCount: ranked.length,
  baseline: BASELINE,
  groups: ranked,
};

await mkdir(dirname(REPORT_PATH), { recursive: true }).catch(() => {});
await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(ranked.length > BASELINE ? 10 : 0);
}

console.log(`Live enrichment gap — ${totalListings} live listings across ${SHARDS} shards\n`);
console.log(`  no enrichment row matched: ${totalGapListings} (${report.gapSharePct}%)`);
console.log(`    total miss (no row for this make+model+year at all): ${totalMiss}`);
console.log(`    partial miss (a row exists but doesn't match this trim/drive): ${partialMiss}`);
console.log(`  distinct make+model gap groups: ${ranked.length} (baseline ${BASELINE})\n`);

console.log(`Ranked gap list (top ${TOP} of ${ranked.length}):`);
for (const g of ranked.slice(0, TOP)) {
  const label = `${g.make} ${g.model} (${g.years})`;
  console.log(`  ${label.padEnd(46)} ${String(g.count).padStart(5)} listings  [${g.kind}]`);
  if (g.exampleTrims) console.log(`      trims seen: ${g.exampleTrims.join(", ")}`);
}
if (ranked.length > TOP) console.log(`  … and ${ranked.length - TOP} more groups (full list in ${REPORT_PATH})`);

console.log(`\nFull report written to ${REPORT_PATH}`);

const failed = ranked.length > BASELINE;
console.log(
  `\n${failed ? "FAIL" : "OK"} — ${ranked.length} gap groups (baseline ${BASELINE}); ` +
    `${totalGapListings} of ${totalListings} live listings (${report.gapSharePct}%) have no enrichment row`
);
if (failed) console.log(`  ${ranked.length - BASELINE} more gap groups than the committed baseline — a model went live with no enrichment, or a row stopped matching.`);
process.exit(failed ? 10 : 0);
