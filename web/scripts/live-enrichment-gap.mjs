// Which live listings resolve to NO enrichment row at all, AND — for the
// ones that DO match — how complete that matched row actually is. Run from
// web/:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/live-enrichment-gap.mjs [--json] [--max-gap-share PCT] \
//     [--max-groups N] [--top N] [--completeness-top N]
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
//   partial — a row DOES exist for this make+model+year, but this listing
//             doesn't satisfy its trim key: match.ts's trimMatches() rejects
//             every candidate, either because the listing's trim string is a
//             spelling the row doesn't anticipate, or because the listing
//             carries no trim at all and every row for the car is trim-keyed.
//             (trimMatches is the only filter that can empty the set on this
//             script's input — the drive and kWh-hint filters only narrow a
//             non-empty set, and the VIN filters never fire because the
//             packed shard carries no VIN, see the CAVEAT below.) Either a
//             matching bug or a narrower research gap (this specific trim was
//             never added) — worth a human's five-second look, not a blind
//             re-run of the same research.
// The split is measured directly: run the matcher once with this listing's
// real trim/drive, and once through match.ts's own matchIgnoringTrim (which
// asks "does ANY row cover this make+model+year, with row trims ignored").
// Total = the coarse call already came back empty. Partial = the coarse call
// found rows but the real one didn't.
//
// The coarse call MUST be matchIgnoringTrim, not plain matchEnrichment with
// the trim stripped. That was this script's original bug and it made the
// split meaningless: match.ts's trimMatches() refuses a trim-keyed row when
// the decode carries no trim (deliberately — a no-trim listing picking up
// "any row for its make/model/year" is how a mild-hybrid CLA got an electric
// CLA's battery facts), so stripping the trim asks "is there a TRIM-LESS row
// for this car", not "is there a row at all". Every cohort covered only by
// trim-keyed rows — Mercedes' EQE grades in lib/enrichment/data3.ts are the
// canonical case, every row keyed to "350+"/"500 4MATIC"/etc. — came back
// empty from the coarse call and was reported as a total miss, so partial was
// structurally always 0. matchIgnoringTrim passes `ignoreRowTrims` down to
// matchEnrichmentRaw, which keeps trim-keyed rows in the candidate set, which
// is exactly the existence question this probe wants.
//
// One row kind matchIgnoringTrim still drops: `feedLabelRow` (a row keyed to
// a feed label like "64 Series" that names no grade). That is right for
// spanning a cohort's versions and it can only over-report "total", never
// under-report it. Checked 2026-08-25: both such rows in the corpus (the 2026
// RAV4 PHEV and the 2023–25 Lexus RZ 450e) sit alongside real grade rows for
// the same make/model/year, so no cohort is covered by a label row alone and
// the exclusion changes no verdict today.
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
// A THIRD kind this script used to miss entirely: a listing can match a row
// and that row can still be full of holes. 2023 F-150 Lightning Pro
// (voltcheck.net/listing/1ft6w1ev4pwg56454) matched a real row and still
// showed four blank fields — this script would have called that listing
// "covered" right alongside a fully-researched one, because it only ever
// asked "did the matcher return something," never "is what it returned any
// good." COMPLETENESS below asks the second question.
//
// COMPLETENESS, measured only on listings with a single EXACT match — a
// listing that only matched ambiguous candidates (enrichment.candidates, no
// enrichment.exact) has no one settled row to score, so it's left out of
// this measurement rather than guessing which candidate the shopper is
// looking at:
//
//   For each exact-matched row, check the fields below and count which are
//   absent. "Which fields" is the judgment call this report has to state
//   plainly rather than bury in code: it reuses exactly the core+expected
//   tiers enrichment-coverage.mjs (this directory) already defined for the
//   static corpus — "published for essentially every modern EV" (core) and
//   "knowable and high-value but with real exceptions" (expected). Fields
//   that script tiers "optional" (gross pack kWh, independently tested
//   range, extended-coverage terms) are deliberately excluded here too: Tesla
//   never publishes a gross kWh split at all, most models never got an
//   independent range test, and counting those as "missing" would manufacture
//   a research to-do list of facts that don't exist industry-wide, rather
//   than surfacing real, closable gaps. See EXPECTED_FIELDS below for the
//   exact list and each field's own per-field caveat.
//
// It reports; it does not edit. Filling a row or fixing a trim string is a
// research/code act with a primary source, never something this script
// guesses.
//
// TWO RATCHETS, one primary and one secondary, because the group-count
// ratchet alone has a blind spot: a "new group" only appears when a
// make+model that had ZERO listings gains its first one, or an existing row
// stops matching entirely. Filling a 1,653-listing cohort and a 38-listing
// cohort each move the group count by exactly 1 — the count can't see that
// one of those fixes was 43x more shoppers than the other, so a big,
// well-covered feed and a feed that's 90% covered but has one huge
// uncovered segment can report the identical group count. gapSharePct (the
// share of live listings with no enrichment row at all) doesn't have that
// blind spot: it's weighted by exactly what a shopper feels, listings, not
// distinct models.
//
//   PRIMARY  — gapSharePct vs --max-gap-share (one decimal place). Exit 10
//              if the live share of no-enrichment-row listings exceeds the
//              committed ceiling. This is the number that actually reflects
//              shopper-facing coverage; ratchet it DOWN as rows land, never
//              raise it to launder a regression.
//   SECONDARY — distinct make+model gap groups vs --max-groups, unchanged
//              from the original ratchet. Still asserted and still fails
//              the build on its own (a wholly new model going live with
//              zero coverage is worth catching even if the feed is tiny
//              relative to a big cohort elsewhere) — it just no longer
//              carries the audit by itself. NB a group is keyed by kind as
//              well as make+model, so one nameplate splits into two groups
//              when some of its years are a total miss and others a partial
//              one: the live Mercedes EQE is exactly that (2023–26 partial,
//              2027 total). That is a reporting split, not new gap — the
//              listing counts and gapSharePct above are unmoved by it.
//
// Both baselines were calibrated together 2026-08-25 against a live,
// healthy CDN read (see the nightly.yml step comment for the exact figures
// and the run that produced them). Completeness is reporting only — no
// baseline has been calibrated for it, so it never affects the exit code.

import { unpackIndex, SHARDS } from "../lib/listings/pack.ts";
import { matchEnrichment, matchIgnoringTrim } from "../lib/enrichment/match.ts";
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
// PRIMARY ratchet — see the header comment for why this, not the group
// count below, is the one that actually reflects shopper-facing coverage.
// 100 is the disabling sentinel (gapSharePct can never exceed 100) for
// anyone running this ad hoc without passing the flag; nightly.yml pins the
// real ceiling. Lower it as gaps get filled; never raise it to launder a
// regression.
const MAX_GAP_SHARE = Number(val("--max-gap-share", "100"));
// SECONDARY ratchet, unchanged in mechanism from the original. 999999
// effectively disables it (never fails) for anyone running this ad hoc
// without passing the flag; nightly.yml pins the calibrated group count.
// Lower it as gaps get filled from there; never raise it to launder a new
// one — a group appearing above baseline means a model shipped live with no
// enrichment, or a previously-matching row broke.
const BASELINE = Number(val("--max-groups", "999999"));
const FEED_BASE = val("--feed-base", "https://voltcheck.net");
const COMPLETENESS_TOP = Number(val("--completeness-top", "20"));

// The fields an exact-matched row is expected to carry — see the
// COMPLETENESS section of the header comment for why this list is exactly
// enrichment-coverage.mjs's core+expected tiers and nothing more. `present`
// reads the same row shape EnrichmentReport.tsx does; a field counts as
// missing only when the fact itself is absent, never on its value.
const EXPECTED_FIELDS = [
  // Usable OR gross satisfies this, matching enrichment-coverage.mjs's own
  // "pack kWh" getter exactly (packUsableKwh ?? packGrossKwh) — Hyundai and
  // Polestar both publish a single unlabeled figure (see their rows' own
  // notes: "Hyundai publishes one figure and does not say gross or usable"),
  // so requiring packUsableKwh specifically would count their published fact
  // as a gap it isn't.
  { key: "packKwh", tier: "core", label: "pack kWh (usable or gross)", present: (r) => !!(r.battery?.packUsableKwh || r.battery?.packGrossKwh) },
  { key: "epaRangeMi", tier: "core", label: "EPA range", present: (r) => !!r.range?.epaRangeMi },
  { key: "heatPump", tier: "core", label: "heat pump", present: (r) => !!r.thermal?.heatPump },
  { key: "batteryYears", tier: "core", label: "battery warranty term", present: (r) => !!r.warranty?.batteryYears },
  { key: "portStandard", tier: "core", label: "charge port", present: (r) => !!r.charging?.portStandard },
  // Tier "expected", not "core", for the same reason enrichment-coverage.mjs
  // gives it that tier: a maker not splitting these out, or not having
  // tested/published them, is a real (if less common) case, not a bug.
  { key: "dcFastCharging", tier: "expected", label: "DC fast charging capability", present: (r) => !!r.charging?.dcFastCharging },
  { key: "chemistry", tier: "expected", label: "chemistry", present: (r) => !!r.battery?.chemistry },
  { key: "dcPeakKw", tier: "expected", label: "peak DC rate", present: (r) => !!r.charging?.dcPeakKw },
  { key: "superchargerAccess", tier: "expected", label: "Supercharger access", present: (r) => !!r.charging?.superchargerAccess },
  { key: "batteryTransfers", tier: "expected", label: "battery warranty transfers", present: (r) => !!r.warranty?.batteryTransfers },
];

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

// A dealer feed can carry the SAME vehicle under two different `make`
// strings — confirmed live 2026-08-21 (coordinator report from the Ram
// ProMaster research pass): BrightDrop's Zevo van appears as both make
// "BrightDrop"/"Brightdrop" and make "Chevrolet" (its GM commercial parent),
// for the same physical vehicle. This is NOT just a reporting nuisance:
// match.ts filters on an exact `norm(r.make) === norm(decode.make)` with no
// cross-brand alias table at all (verified by reading match.ts), so a
// "Chevrolet"-labeled Zevo will never match a BrightDrop-keyed row in
// production either, however good the model-level research is — a second,
// distinct matching-architecture gap alongside the total/partial split this
// script already measures. Folding it here so the ranked list doesn't
// understate the model's live footprint by splitting it across two make
// buckets; the fold is display/grouping ONLY — every match verdict above
// this point was already decided using the listing's own `make`, exactly
// as production does, so the fold can't hide or manufacture a match.
const REPORT_MODEL_MAKE_FOLD = [{ modelRe: /^zevo\b/i, canonicalMake: "BRIGHTDROP" }];
const foldMake = (make, model) => {
  const fold = REPORT_MODEL_MAKE_FOLD.find((f) => f.modelRe.test(model));
  return fold ? fold.canonicalMake : make;
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

// COMPLETENESS aggregation — exact matches only (see header comment for why
// candidates-only matches are left out).
let exactMatched = 0; // denominator: exact-matched listings actually scored
let incompleteMatched = 0; // of those, how many are missing at least one expected field
const fieldMissCounts = new Map(); // fieldKey -> count of exact-matched listings missing it
const completenessGroups = new Map(); // "MAKE|||MODELKEY" -> group

function recordCompleteness(row, make, model, year) {
  exactMatched++;
  const missing = EXPECTED_FIELDS.filter((f) => !f.present(row));
  if (missing.length === 0) return;
  incompleteMatched++;
  for (const f of missing) fieldMissCounts.set(f.key, (fieldMissCounts.get(f.key) ?? 0) + 1);

  const displayMake = foldMake(make, model);
  const key = `${displayMake}|||${modelKey(displayMake, model)}`;
  let g = completenessGroups.get(key);
  if (!g) {
    g = { make: displayMake, model, count: 0, minYear: year, maxYear: year, modelSpellings: new Map(), missingFieldCounts: new Map() };
    completenessGroups.set(key, g);
  }
  g.count++;
  g.minYear = Math.min(g.minYear, year);
  g.maxYear = Math.max(g.maxYear, year);
  g.modelSpellings.set(model, (g.modelSpellings.get(model) ?? 0) + 1);
  for (const f of missing) g.missingFieldCounts.set(f.key, (g.missingFieldCounts.get(f.key) ?? 0) + 1);
}

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
  if (matched(full)) {
    if (full.exact) recordCompleteness(full.exact, make, model, l.year);
    continue;
  }

  // matchIgnoringTrim drops the decode's own trim itself; driveType goes with
  // it so the probe is unambiguously about make+model+year (the drive filter
  // in match.ts is soft — it only narrows a non-empty set — so this cannot
  // change the verdict either way, but it keeps the question honest). See the
  // header comment for why this is matchIgnoringTrim and not matchEnrichment
  // with the trim stripped.
  const decodeCoarse = { ...decodeFull, driveType: undefined };
  const coarse = matchIgnoringTrim(decodeCoarse, null);
  const kind = matched(coarse) ? "partial" : "total";
  if (kind === "total") totalMiss++;
  else partialMiss++;

  const displayMake = foldMake(make, model);
  const key = `${displayMake}|||${modelKey(displayMake, model)}|||${kind}`;
  let g = groups.get(key);
  if (!g) {
    g = { make: displayMake, model, kind, count: 0, minYear: l.year, maxYear: l.year, modelSpellings: new Map(), trims: new Map(), rawMakes: new Map() };
    groups.set(key, g);
  }
  g.count++;
  g.minYear = Math.min(g.minYear, l.year);
  g.maxYear = Math.max(g.maxYear, l.year);
  g.modelSpellings.set(model, (g.modelSpellings.get(model) ?? 0) + 1);
  g.rawMakes.set(make, (g.rawMakes.get(make) ?? 0) + 1);
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
    // Only worth printing when the group actually mixes make strings for
    // what the fold table says is one vehicle (REPORT_MODEL_MAKE_FOLD) —
    // absent for every ordinary group, which has exactly one raw make.
    rawMakes: g.rawMakes.size > 1 ? [...g.rawMakes.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} (${n})`) : undefined,
    exampleTrims: g.kind === "partial" ? [...g.trims.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${t} (${n})`) : undefined,
  }))
  .sort((a, b) => b.count - a.count);

const totalListings = listings.length;
const totalGapListings = totalMiss + partialMiss;
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

const rankedCompleteness = [...completenessGroups.values()]
  .map((g) => ({
    make: g.make,
    model: mostCommon(g.modelSpellings),
    count: g.count,
    years: g.minYear === g.maxYear ? `${g.minYear}` : `${g.minYear}-${g.maxYear}`,
    missingFields: [...g.missingFieldCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${EXPECTED_FIELDS.find((f) => f.key === k).label} (${n})`),
  }))
  .sort((a, b) => b.count - a.count);

const perFieldMiss = EXPECTED_FIELDS.map((f) => ({
  key: f.key,
  tier: f.tier,
  label: f.label,
  missing: fieldMissCounts.get(f.key) ?? 0,
  of: exactMatched,
}));

const report = {
  generatedAt: new Date().toISOString(),
  totalListings,
  totalGapListings,
  gapSharePct: pct(totalGapListings, totalListings),
  totalMissListings: totalMiss,
  partialMissListings: partialMiss,
  groupCount: ranked.length,
  baseline: BASELINE,
  maxGapSharePct: MAX_GAP_SHARE,
  groups: ranked,
  completeness: {
    methodology:
      "Measured only on listings that resolved to a single EXACT enrichment row (ambiguous candidates-only matches have no one settled row to score). " +
      "\"Expected\" fields are exactly enrichment-coverage.mjs's core+expected tiers — fields that script already treats as \"published for essentially " +
      "every modern EV\" or \"knowable with real exceptions\". Its \"optional\" tier (gross pack kWh, independently tested range, extended-coverage terms) " +
      "is excluded on purpose: those are genuinely thin industry-wide (Tesla never publishes a gross kWh split), so counting them would manufacture gaps " +
      "that can't be closed rather than surface ones that can.",
    exactMatchedListings: exactMatched,
    incompleteListings: incompleteMatched,
    incompleteSharePct: pct(incompleteMatched, exactMatched),
    perField: perFieldMiss,
    groupCount: rankedCompleteness.length,
    groups: rankedCompleteness,
  },
};

await mkdir(dirname(REPORT_PATH), { recursive: true }).catch(() => {});
await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

// PRIMARY: gapSharePct vs --max-gap-share. SECONDARY: distinct gap groups vs
// --max-groups, unchanged in mechanism from the original ratchet. Either one
// tripping fails the build — see the header comment for why the group count
// alone has a blind spot the share doesn't.
const shareFailed = report.gapSharePct > MAX_GAP_SHARE;
const groupFailed = ranked.length > BASELINE;
const failed = shareFailed || groupFailed;

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed ? 10 : 0);
}

console.log(`Live enrichment gap — ${totalListings} live listings across ${SHARDS} shards\n`);
console.log(`  no enrichment row matched: ${totalGapListings} (${report.gapSharePct}%, ceiling ${MAX_GAP_SHARE}%)`);
console.log(`    total miss (no row for this make+model+year at all): ${totalMiss}`);
console.log(`    partial miss (a row exists but doesn't match this trim/drive): ${partialMiss}`);
console.log(`  distinct make+model gap groups: ${ranked.length} (baseline ${BASELINE})\n`);

console.log(`Ranked gap list (top ${TOP} of ${ranked.length}):`);
for (const g of ranked.slice(0, TOP)) {
  const label = `${g.make} ${g.model} (${g.years})`;
  console.log(`  ${label.padEnd(46)} ${String(g.count).padStart(5)} listings  [${g.kind}]`);
  if (g.rawMakes) console.log(`      make split in the feed: ${g.rawMakes.join(", ")} — same vehicle, listed under different make strings`);
  if (g.exampleTrims) console.log(`      trims seen: ${g.exampleTrims.join(", ")}`);
}
if (ranked.length > TOP) console.log(`  … and ${ranked.length - TOP} more groups (full list in ${REPORT_PATH})`);

console.log(`\nCompleteness — ${report.completeness.exactMatchedListings} exact-matched live listings scored`);
console.log(`  (${report.completeness.methodology})`);
console.log(
  `  missing at least one expected field: ${report.completeness.incompleteListings} (${report.completeness.incompleteSharePct}%)`
);
console.log(`  per-field misses, across all exact-matched listings:`);
for (const f of perFieldMiss) {
  const p = pct(f.missing, f.of);
  console.log(`    [${f.tier.padEnd(8)}] ${f.label.padEnd(28)} missing on ${String(f.missing).padStart(5)}/${f.of} listings (${p}%)`);
}
console.log(`\nField-completeness gap list, ranked by listing count (top ${COMPLETENESS_TOP} of ${rankedCompleteness.length}):`);
for (const g of rankedCompleteness.slice(0, COMPLETENESS_TOP)) {
  const label = `${g.make} ${g.model} (${g.years})`;
  console.log(`  ${label.padEnd(46)} ${String(g.count).padStart(5)} listings`);
  console.log(`      missing: ${g.missingFields.join(", ")}`);
}
if (rankedCompleteness.length > COMPLETENESS_TOP) {
  console.log(`  … and ${rankedCompleteness.length - COMPLETENESS_TOP} more groups (full list in ${REPORT_PATH})`);
}

console.log(`\nFull report written to ${REPORT_PATH}`);

// The primary assert (gapSharePct) failing means the ratchet's headline
// number moved backward — print the groups actually driving that, ranked by
// how many shoppers they cost, regardless of whether they were already
// visible in the --top list above.
if (shareFailed) {
  console.log(`\nTop 10 gap groups by listing count (driving the ${report.gapSharePct}% gap share):`);
  for (const g of ranked.slice(0, 10)) {
    const label = `${g.make} ${g.model} (${g.years})`;
    console.log(`  ${label.padEnd(46)} ${String(g.count).padStart(5)} listings  [${g.kind}]`);
  }
}

console.log(
  `\n${failed ? "FAIL" : "OK"} — ${report.gapSharePct}% of live listings have no enrichment row (ceiling ${MAX_GAP_SHARE}%); ` +
    `${ranked.length} distinct gap groups (baseline ${BASELINE})`
);
if (shareFailed) {
  console.log(`  gap share ${report.gapSharePct}% exceeds the committed ${MAX_GAP_SHARE}% ceiling — live coverage regressed since the baseline was pinned.`);
}
if (groupFailed) {
  console.log(`  ${ranked.length - BASELINE} more gap groups than the committed baseline — a model went live with no enrichment, or a row stopped matching.`);
}
process.exit(failed ? 10 : 0);
