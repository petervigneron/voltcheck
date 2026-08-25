// Do the plug-in hybrids now arriving in the feed reach an enrichment row?
// Run from web/:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/phev-enrichment-gap.mjs [--json] [--top N] [--max-groups N] \
//     [--feed-base URL] [--shard-dir DIR] [--out PATH]
//
// WHY THIS EXISTS, and why it is separate from live-enrichment-gap.mjs (this
// directory), which asks the same question of the whole feed: on 2026-08-23
// the scraper learned to recognise plug-in hybrids by nameplate
// (scraper/lib/ev.mjs's PHEV_MODEL_RE, and vPIC confirmation in
// vpic-enrich.mjs). Before that, dealer.com and DealerOn — ~94% of the crawl —
// declared a Jeep Wrangler 4xe with fuelType "Hybrid", the same string a CR-V
// Hybrid gets, and classifyEv read that as not-an-EV. Autotrader lists ~46,700
// PHEVs nationally against the ~4,500 this feed carried. So the PHEV half of
// the inventory is about to multiply, and it arrives under model and trim
// strings nothing in web/ was ever shaped for: "X5 PHEV", "XC90 Plug-In
// Hybrid", model "Wrangler" with the plug-in badge hiding in the trim ("Sport
// S 4xe"), "NX 450h+", and casing variants of all of them.
//
// A PHEV that matches no enrichment row is not visibly broken. Its card and
// its detail page render exactly like a car whose facts are genuinely
// unknowable — the same failure enrichment-coverage.mjs was written for, one
// level up: not "is this row half-filled" but "is there a row at all". The
// only detector was a human opening a listing, which is luck, not a monitor.
// live-enrichment-gap.mjs would eventually see these, but it measures 100,000
// listings at once, its ratchet is deliberately disabled pending calibration,
// and a few thousand plug-ins moving inside that total is exactly the kind of
// change a whole-feed number absorbs without a sound.
//
// SOURCE: the CDN-cached browse shards (voltcheck.net/api/index/0..5) — never
// Supabase. Those six files ARE the live feed (lib/listings/pack.ts), fetched
// once each and sequentially: six at once is enough to set six cold ISR
// renders walking the database in parallel, which is the load this project's
// own CLAUDE.md warns about (measured the hard way on 2026-08-23 building
// this script — the burst turned into connection refusals and slow cold
// renders). --shard-dir reads shards already on disk instead, for iterating
// on the report without re-fetching.
//
// ── Which listings count as plug-ins ──────────────────────────────────────
// The packed shard carries no evKind: the feed's own BEV/PHEV field stops at
// the database and never reaches web/ (checked across web/lib, web/app and
// web/components). So this script re-derives it, and it re-derives it by
// IMPORTING scraper/lib/ev.mjs rather than copying its regexes over here.
// That is a deliberate exception to this repo's usual habit of mirroring
// scraper logic into web/ with a comment (lib/listings/price.ts and
// lib/listings/snapshot.ts both do that). A mirrored copy of PHEV_MODEL_RE
// would drift the first time a nameplate is added on the scraper side, and
// the failure would be silent in the worst way: the check would go on
// reporting a healthy percentage of a population that is no longer the
// population the feed contains. Nothing bundles this file — it is a script,
// not app code — so the cross-lane import costs nothing at runtime.
//
// This UNDERCOUNTS, and the direction matters. A car reaches the feed as a
// plug-in either because its name says so or because the dealer's fuel field
// said "Plug-In Hybrid"; only the first is visible from here. Measured on
// 2026-08-23: eight live Chrysler Pacificas arrive as bare model "Pacifica"
// with trims like "Select" and "Pinnacle", nothing anywhere in their strings
// saying plug-in, and they are plug-ins — a gas Pacifica never clears
// classifyEv. They are missing from every number below. The undercounted
// listings are, by construction, ones whose strings are the LEAST like
// anything an enrichment row is keyed on, so the true coverage figure is
// somewhat worse than the one printed here, never better.
//
// ── What it reports ───────────────────────────────────────────────────────
//   coverage    — what share of PHEV-shaped live listings resolve to a row.
//   total       — no row covers this make+model+year at all, trim aside. A
//                 research gap: nobody has looked this nameplate up yet.
//   partial     — rows DO cover the make+model+year, but none survives this
//                 listing's own trim or drivetrain. A matching gap far more
//                 often than a research one, and much cheaper to close. The
//                 probe is matchIgnoringTrim(), not "drop the listing's trim":
//                 dropping it still leaves trimMatches() refusing every
//                 trim-keyed row, which would score a trim-keyed nameplate as
//                 a research gap and send someone off to research a car that
//                 is already in the corpus. (That is not hypothetical — it is
//                 how the 23 trim-less 2026 "X5 PHEV" listings first read.)
//   groups      — the unmatched model-string shapes, by frequency, each with
//                 the spellings and trims actually seen, so the fix is
//                 legible without opening the feed. Where the corpus already
//                 holds plug-in rows for that make, they are printed beside
//                 the group: that is the line between "add an alias" and
//                 "research a nameplate", and it is the one thing a human
//                 reading a ranked gap list otherwise has to look up by hand.
//
// ── The cross-kind guard ──────────────────────────────────────────────────
// Coverage is the friendly half of this. The expensive failure is not a
// plug-in with no row, it is a plug-in wearing a battery-electric car's row:
// a Wrangler 4xe printing an EV's 200-plus miles instead of its own 22 is a
// false claim in the direction that costs a shopper money, and it would look
// completely normal on the page. So this also counts PHEV listings that
// matched a row carrying neither packVariant "PHEV" nor an epaRangeTotalMi
// (the gas-assisted total only a plug-in row has). That count is NOT
// ratcheted and NOT a backlog — any occurrence fails.
//
// And because "we found none" is a negative, the script control-tests it in
// the same run rather than asking to be believed: it runs the identical
// detector over the non-plug-in listings, where it must fire on essentially
// everything (78,583 of 78,591 on 2026-08-23). If the control does NOT fire,
// the clean result is evidence the predicate is broken, not that the corpus
// is healthy, and the script says so and fails.
//
// ── What it does not do ───────────────────────────────────────────────────
// It reports; it does not edit, and it never invents a fact. A nameplate with
// no row stays quiet on the site — that is the correct behaviour, not the bug
// — and this script's job is to say which nameplates those are and how many
// shoppers are looking at them, so the research gets aimed at the biggest
// silences first.
//
// CAVEAT this script cannot avoid, inherited from its sibling: the packed
// shard carries no VIN, so the matcher's VIN-position discriminators (wmi,
// vds, vin8, Tesla plant) never fire here, and its `trim` has already been
// through specTrim(). Both make this script find FEWER matching problems than
// the live per-VIN path does, never more.
//
// Exit 0 = no more gap groups than the committed baseline and the cross-kind
// count is zero; 10 = a new gap group appeared, the cross-kind guard tripped,
// or its control test did not.

import { unpackIndex, SHARDS } from "../lib/listings/pack.ts";
import { matchEnrichment, matchIgnoringTrim } from "../lib/enrichment/match.ts";
import { phevNameplate, PHEV_NAME_CLAIM_RE } from "../../scraper/lib/ev.mjs";
import { ENRICHMENT_ROWS } from "../lib/enrichment/data.ts";
import { RESEARCH_ROWS } from "../lib/enrichment/data2.ts";
import { RESEARCH_ROWS_3 } from "../lib/enrichment/data3.ts";
import { RESEARCH_ROWS_4 } from "../lib/enrichment/data4.ts";
import { RESEARCH_ROWS_5 } from "../lib/enrichment/data5.ts";
import { RESEARCH_ROWS_6 } from "../lib/enrichment/data6.ts";
import { RESEARCH_ROWS_9 } from "../lib/enrichment/data9.ts";
import { RESEARCH_ROWS_12 } from "../lib/enrichment/data12.ts";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const ALL_ROWS = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4, ...RESEARCH_ROWS_5, ...RESEARCH_ROWS_6, ...RESEARCH_ROWS_9, ...RESEARCH_ROWS_12];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : d;
};
const AS_JSON = has("--json");
const TOP = Number(val("--top", "40"));
const REPORT_PATH = val("--out", "/tmp/phev-enrichment-gap.json");
const FEED_BASE = val("--feed-base", "https://voltcheck.net");
const SHARD_DIR = val("--shard-dir", null);
// The ratchet, calibrated 2026-08-23 against a settled feed of 100,883 live
// listings (4,541 of them plug-in-shaped) AFTER that day's alias work landed:
// the Jeep 4xe rows gained a trim-guarded bare-model row, the "X5 PHEV" rows
// dropped a trim key that narrowed nothing, and the count went 116 -> 111.
// Every one of the 111 is a nameplate with no researched row at all, so this
// number comes down by RESEARCH, not by code. Lower it as rows land; never
// raise it to quiet a new group, because a new group means either a nameplate
// went live with nothing behind it or a row that used to match stopped.
const BASELINE = Number(val("--max-groups", "111"));

const norm = (s) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// The matcher's own equivalence class for a model string (norm() plus the
// make-prefix strip in matchEnrichmentRaw), so "Mazda CX-90 PHEV" and
// "CX-90 PHEV" land in one bucket exactly because the matcher would treat
// them as one. Grouping and labelling only — every verdict below comes from
// calling the real matchEnrichment().
const modelKey = (make, model) => {
  const mk = norm(make);
  const n = norm(model);
  return n.startsWith(mk) && n.length > mk.length ? n.slice(mk.length) : n;
};

// Is this listing a plug-in hybrid, as far as anything reaching web/ can tell?
// scraper/lib/ev.mjs's own predicates, against the strings the shard carries.
// PHEV_NAME_CLAIM_RE joins phevNameplate() here because both are what
// classifyEv consults; on the scraper side the bare "PHEV"/"Plug-in" token
// only ever yields a name_match that vPIC must confirm, but by the time a row
// is in the live feed that confirmation has already happened.
const isPhevListing = (l) => {
  const name = [l.make, l.model, l.trim].filter(Boolean).join(" ");
  return phevNameplate(name, l.year) || PHEV_NAME_CLAIM_RE.test(name);
};

// A row that describes a plug-in: either tagged as one, or carrying the
// gas-assisted total range no battery-electric row has (lib/types.ts —
// epaRangeTotalMi is "PHEV only" by definition). Two tests rather than one
// because packVariant is a display string, free-form and easy to spell
// differently in a new tranche, while epaRangeTotalMi is structural.
const isPhevRow = (r) => r.packVariant === "PHEV" || !!r.range?.epaRangeTotalMi;

const matched = (r) => !!(r.exact || (r.candidates && r.candidates.length));
const rowsOf = (r) => (r.exact ? [r.exact] : (r.candidates ?? []));
const decodeOf = (l) => ({
  vin: "", // the shard carries none — see the CAVEAT in the header
  usMarket: true,
  make: (l.make ?? "").toUpperCase(),
  model: l.model ?? "",
  modelYear: l.year,
  trim: l.trim,
  driveType: l.drive,
});

async function loadShards() {
  const rows = [];
  for (let n = 0; n < SHARDS; n++) {
    if (SHARD_DIR) {
      rows.push(...unpackIndex(JSON.parse(await readFile(join(SHARD_DIR, `${n}.json`), "utf8"))));
      continue;
    }
    // Sequential on purpose — see the SOURCE note in the header.
    const res = await fetch(`${FEED_BASE}/api/index/${n}`, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`shard ${n}: HTTP ${res.status}`);
    rows.push(...unpackIndex(await res.json()));
  }
  return rows;
}

// Shards 0..SHARDS-1 partition every live listing exactly once (shardOf in
// pack.ts); "first" is a top-of-page subset of the same rows, so fetching it
// too would double-count the front page.
const listings = await loadShards();
const phev = listings.filter(isPhevListing);
if (phev.length === 0) {
  console.error(
    "No plug-in-shaped listings found in the feed at all. That is not a coverage result — " +
      "either the shards came back empty or scraper/lib/ev.mjs's predicates changed shape. Refusing to report a percentage."
  );
  process.exit(10);
}

// Plug-in rows the corpus already holds, per make. Printed beside a gap group
// so the reader can tell "this make is researched, the string just misses" from
// "nobody has looked this maker's plug-ins up".
const phevRowsByMake = new Map();
for (const r of ALL_ROWS) {
  if (!isPhevRow(r)) continue;
  const k = norm(r.make);
  if (!phevRowsByMake.has(k)) phevRowsByMake.set(k, []);
  const yrs = r.modelYears[0] === r.modelYears[1] ? `${r.modelYears[0]}` : `${r.modelYears[0]}-${r.modelYears[1]}`;
  const trims = Array.isArray(r.trim) ? r.trim.join("/") : r.trim;
  phevRowsByMake.get(k).push(`${r.model} ${yrs}${trims ? ` [trim ${trims}]` : ""}`);
}

const groups = new Map();
let hit = 0;
let totalMiss = 0;
let partialMiss = 0;
const crossKind = new Map(); // listing shape -> { count, rowIds }

for (const l of phev) {
  const d = decodeOf(l);
  const result = matchEnrichment(d, null);

  if (matched(result)) {
    hit++;
    // The expensive failure: a plug-in wearing a battery-electric row.
    const wrong = rowsOf(result).filter((r) => !isPhevRow(r));
    if (wrong.length) {
      const key = `${d.make} ${l.model} ${l.year} / ${l.trim ?? "(no trim)"}`;
      const c = crossKind.get(key) ?? { count: 0, rowIds: new Set() };
      c.count++;
      for (const r of wrong) c.rowIds.add(r.id);
      crossKind.set(key, c);
    }
    continue;
  }

  // Does ANY row cover this make+model+year with trim out of the room
  // entirely? See the `partial` note in the header for why this is
  // matchIgnoringTrim and not a trim-stripped decode.
  const kind = matched(matchIgnoringTrim(d, null)) ? "partial" : "total";
  if (kind === "total") totalMiss++;
  else partialMiss++;

  const key = `${d.make}|||${modelKey(d.make, d.model)}|||${kind}`;
  let g = groups.get(key);
  if (!g) {
    g = { make: d.make, kind, count: 0, minYear: l.year, maxYear: l.year, modelSpellings: new Map(), trims: new Map() };
    groups.set(key, g);
  }
  g.count++;
  g.minYear = Math.min(g.minYear, l.year);
  g.maxYear = Math.max(g.maxYear, l.year);
  g.modelSpellings.set(l.model, (g.modelSpellings.get(l.model) ?? 0) + 1);
  const t = l.trim ?? "(no trim on this listing)";
  g.trims.set(t, (g.trims.get(t) ?? 0) + 1);
}

// The control for the cross-kind negative, run over the listings this script
// does NOT call plug-ins. Almost every one of them is battery-electric and so
// must trip the same detector; if they don't, the detector is broken and the
// clean PHEV result means nothing. See the header.
let controlScored = 0;
let controlFlagged = 0;
for (const l of listings) {
  if (isPhevListing(l)) continue;
  const result = matchEnrichment(decodeOf(l), null);
  const rows = rowsOf(result);
  if (!rows.length) continue;
  controlScored++;
  if (rows.some((r) => !isPhevRow(r))) controlFlagged++;
}
// A deliberately loose bar: this only has to prove the detector fires at all,
// not measure anything. Some non-plug-in listings legitimately match plug-in
// rows (the bare "Pacifica" case in the header), so it is not 100%.
const controlOk = controlScored > 0 && controlFlagged / controlScored > 0.5;

const mostCommon = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
const byCount = (m, n) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} (${v})`);

const ranked = [...groups.values()]
  .map((g) => ({
    make: g.make,
    model: mostCommon(g.modelSpellings),
    kind: g.kind,
    count: g.count,
    years: g.minYear === g.maxYear ? `${g.minYear}` : `${g.minYear}-${g.maxYear}`,
    modelSpellings: byCount(g.modelSpellings, 4),
    trims: byCount(g.trims, 5),
    phevRowsForMake: phevRowsByMake.get(norm(g.make)),
  }))
  .sort((a, b) => b.count - a.count);

const crossKindList = [...crossKind.entries()]
  .map(([shape, c]) => ({ shape, count: c.count, rowIds: [...c.rowIds] }))
  .sort((a, b) => b.count - a.count);
const crossKindTotal = crossKindList.reduce((a, b) => a + b.count, 0);

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const gapListings = totalMiss + partialMiss;

const report = {
  generatedAt: new Date().toISOString(),
  totalListings: listings.length,
  phevListings: phev.length,
  matchedListings: hit,
  coveragePct: pct(hit, phev.length),
  gapListings,
  totalMissListings: totalMiss,
  partialMissListings: partialMiss,
  groupCount: ranked.length,
  baseline: BASELINE,
  groups: ranked,
  crossKind: {
    note:
      "PHEV-shaped live listings that matched an enrichment row describing a battery-electric car. Never a backlog: any occurrence fails. " +
      "A plug-in printing a BEV's range is a false claim in the direction that costs a shopper money.",
    listings: crossKindTotal,
    shapes: crossKindList,
    control: { scored: controlScored, flagged: controlFlagged, passed: controlOk },
  },
};

await mkdir(dirname(REPORT_PATH), { recursive: true }).catch(() => {});
await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

const failed = ranked.length > BASELINE || crossKindTotal > 0 || !controlOk;

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed ? 10 : 0);
}

console.log(`PHEV enrichment gap — ${phev.length} plug-in-shaped listings of ${listings.length} live, across ${SHARDS} shards`);
console.log(`  (undercounts: a plug-in whose make/model/trim never says so is invisible here — see the header)\n`);
console.log(`  matched an enrichment row: ${hit} (${report.coveragePct}%)`);
console.log(`  no row matched:            ${gapListings} (${pct(gapListings, phev.length)}%)`);
console.log(`    total   (no row for this make+model+year at all):   ${totalMiss}`);
console.log(`    partial (rows exist; none survives trim/drivetrain): ${partialMiss}`);
console.log(`  distinct gap groups: ${ranked.length} (baseline ${BASELINE})\n`);

console.log(`Ranked gap list (top ${Math.min(TOP, ranked.length)} of ${ranked.length}):`);
for (const g of ranked.slice(0, TOP)) {
  const label = `${g.make} ${g.model} (${g.years})`;
  console.log(`  ${label.padEnd(46)} ${String(g.count).padStart(5)} listings  [${g.kind}]`);
  if (g.modelSpellings.length > 1) console.log(`      model spellings: ${g.modelSpellings.join(", ")}`);
  console.log(`      trims: ${g.trims.join(", ")}`);
  if (g.phevRowsForMake)
    console.log(`      plug-in rows this corpus already holds for ${g.make}: ${g.phevRowsForMake.join(" | ")}`);
}
if (ranked.length > TOP) console.log(`  … and ${ranked.length - TOP} more groups (full list in ${REPORT_PATH})`);

console.log(`\nCross-kind guard — plug-ins matched to a battery-electric row: ${crossKindTotal}`);
for (const c of crossKindList.slice(0, 20)) console.log(`  ${String(c.count).padStart(5)}  ${c.shape} -> ${c.rowIds.join(", ")}`);
console.log(
  `  control: the same detector fired on ${controlFlagged}/${controlScored} non-plug-in listings — ${controlOk ? "it works, so the count above is real" : "IT DID NOT FIRE, so the count above proves nothing"}`
);

console.log(`\nFull report written to ${REPORT_PATH}`);
console.log(
  `\n${failed ? "FAIL" : "OK"} — ${ranked.length} gap groups (baseline ${BASELINE}); ` +
    `${gapListings} of ${phev.length} plug-in listings (${pct(gapListings, phev.length)}%) have no enrichment row`
);
if (ranked.length > BASELINE)
  console.log(`  ${ranked.length - BASELINE} more gap groups than the committed baseline — a nameplate went live with no enrichment, or a row stopped matching.`);
if (crossKindTotal > 0) console.log(`  ${crossKindTotal} plug-in listing(s) are showing a battery-electric car's facts. Fix the row keys; this is a false claim on the site.`);
if (!controlOk) console.log(`  The cross-kind control test did not fire. Treat the zero above as unproven and fix the predicate.`);
process.exit(failed ? 10 : 0);
