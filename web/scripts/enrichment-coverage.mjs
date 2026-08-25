// Which enrichment fields each cohort is actually missing — the report the
// site never had. Run from web/:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/enrichment-coverage.mjs [--all] [--make FORD] [--json]
//
// WHY THIS EXISTS: the enrichment data (lib/enrichment/data*.ts) is filled in
// by hand, one research tranche at a time, and coverage across cohorts is
// wildly uneven — some rows carry the full charging + chemistry + warranty
// picture, others got a pack size and a range and nothing else. A half-filled
// row is INVISIBLE on the site: every section header still renders, the empty
// fields just read "Unknown" (components/EnrichmentReport.tsx), which is the
// same thing the page prints for a fact that is genuinely unknowable. So a
// 2024 F-150 Lightning with no charging data at all looked, to everyone who
// wasn't counting, exactly like a car whose specs we'd honestly researched.
// Nothing measured the difference. The only detector was a human opening a
// listing and noticing the Unknowns — which is not a monitor, it's luck.
//
// This walks every row against the field set the detail page renders and
// reports what's missing: per field (how many cohorts lack it), and per row
// (worst-covered first), so "the Lightning has no charging section" and "42
// rows have no chemistry" become lines in a report instead of a shopper's
// disappointment. Pure and offline — it reads only the static data, no DB, no
// network — so it can run in CI on every change to the enrichment files.
//
// It reports; it does not edit. Filling a field is a research act with a
// primary source (the house rule: a fact needs its provenance), never a
// script guessing a plausible number. Exit 0 = every cohort clears the core
// bar, 10 = at least one core field is missing somewhere (so the nightly can
// shout). --all lists every gap; the default lists only core-bar failures.

import { ENRICHMENT_ROWS } from "../lib/enrichment/data.ts";
import { RESEARCH_ROWS } from "../lib/enrichment/data2.ts";
import { RESEARCH_ROWS_3 } from "../lib/enrichment/data3.ts";
import { RESEARCH_ROWS_4 } from "../lib/enrichment/data4.ts";
import { RESEARCH_ROWS_5 } from "../lib/enrichment/data5.ts";
import { RESEARCH_ROWS_6 } from "../lib/enrichment/data6.ts";
import { RESEARCH_ROWS_9 } from "../lib/enrichment/data9.ts";

const ALL_ROWS = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4, ...RESEARCH_ROWS_5, ...RESEARCH_ROWS_6, ...RESEARCH_ROWS_9];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const SHOW_ALL = has("--all");
const AS_JSON = has("--json");
const MAKE = val("--make")?.toUpperCase();
// The ratchet. 434 cohorts were filled in by hand over months before anything
// measured them, so 251 fail the core bar the day this check is born; a check
// that's red on arrival is a check everyone learns to ignore. So the gate is
// not "zero gaps" but "no MORE gaps than the committed baseline" — a new
// half-stocked cohort turns it red, the backlog doesn't. Lower this number as
// backfill lands (that's the point); it must never be raised to launder a
// regression. Absent (local runs) means strict: any core gap fails.
const BASELINE = val("--max-core-fails") != null ? Number(val("--max-core-fails")) : 0;

// The fields the detail page renders (components/EnrichmentReport.tsx), each
// tagged with how much of a hole its absence is. `core` = a field that is
// published for essentially every modern EV and that a shopper reads as a
// basic spec; a cohort missing one is a bug, and its absence sets the failing
// exit. `expected` = knowable and high-value but with real exceptions.
// `optional` = genuinely not always available (a real-world test nobody ran,
// a gross figure the maker never split out), reported but never a failure.
const FIELDS = [
  { key: "packUsableKwh", tier: "core", get: (r) => r.battery?.packUsableKwh ?? r.battery?.packGrossKwh, label: "pack kWh" },
  { key: "epaRangeMi", tier: "core", get: (r) => r.range?.epaRangeMi, label: "EPA range" },
  { key: "heatPump", tier: "core", get: (r) => r.thermal?.heatPump, label: "heat pump" },
  { key: "batteryWarranty", tier: "core", get: (r) => r.warranty?.batteryYears, label: "battery warranty" },
  { key: "portStandard", tier: "core", get: (r) => r.charging?.portStandard, label: "port" },
  // Absence is a deliberate "standard" default for the card tile (enrich.ts),
  // but the detail table still prints it as "Unknown" — a display gap, not a
  // research hole, so it is not a core failure. Reported so the split shows.
  { key: "dcFastCharging", tier: "expected", get: (r) => r.charging?.dcFastCharging, label: "DC fast charging (table shows Unknown; card assumes standard)" },
  { key: "chemistry", tier: "expected", get: (r) => r.battery?.chemistry, label: "chemistry" },
  { key: "dcPeakKw", tier: "expected", get: (r) => r.charging?.dcPeakKw, label: "peak DC kW" },
  { key: "superchargerAccess", tier: "expected", get: (r) => r.charging?.superchargerAccess, label: "Supercharger access" },
  { key: "batteryTransfers", tier: "expected", get: (r) => r.warranty?.batteryTransfers, label: "battery warranty transfers" },
  { key: "packGrossKwh", tier: "optional", get: (r) => r.battery?.packGrossKwh, label: "gross kWh" },
  { key: "testedRangeMi", tier: "optional", get: (r) => r.range?.testedRangeMi, label: "real-world tested range" },
  { key: "powertrainTransfers", tier: "optional", get: (r) => r.warranty?.powertrainTransfers, label: "powertrain warranty transfers" },
  { key: "extendedCoverage", tier: "optional", get: (r) => r.warranty?.extendedCoverage, label: "extended coverage" },
];

const CORE = FIELDS.filter((f) => f.tier === "core");
const rowLabel = (r) => {
  const yrs = r.modelYears ? (r.modelYears[0] === r.modelYears[1] ? `${r.modelYears[0]}` : `${r.modelYears[0]}-${r.modelYears[1]}`) : "?";
  const variant = [r.packVariant, Array.isArray(r.trim) ? r.trim.join("/") : r.trim].filter(Boolean).join(" ");
  return `${yrs} ${r.make} ${r.model}${variant ? ` ${variant}` : ""}`;
};

const rows = ALL_ROWS.filter((r) => !MAKE || r.make?.toUpperCase() === MAKE);

// A row may declare, in `abstains` (lib/types.ts), that it is deliberately
// silent on a core field — the base row of a nameplate whose grades carry the
// figure that varies, or a cohort nothing can separate. That is a decision,
// not a hole, so it doesn't count against the bar. The abstention itself is
// then checked, because an unchecked escape hatch is just a slower way to
// launder a gap:
//
//   - the reason is required, and must read as a sentence rather than a
//     shrug, so `abstains: { epaRangeMi: "n/a" }` is an error;
//   - abstaining on a field the row actually carries is an error — the two
//     statements contradict each other and one of them is stale;
//   - only core fields can be abstained from (`expected`/`optional` fail
//     nothing already, so an abstention there is noise);
//   - and every abstention is printed below with its reason. The count is
//     part of the report on purpose: this is the number to watch if the bar
//     ever starts looking suspiciously easy.
//
// These are hard errors, independent of --max-core-fails. The baseline
// forgives a backlog it can see; it does not forgive a broken annotation.
const CORE_KEYS = new Set(CORE.map((f) => f.key));
const abstentionErrors = [];
for (const r of rows) {
  for (const [key, reason] of Object.entries(r.abstains ?? {})) {
    const field = FIELDS.find((f) => f.key === key);
    if (!field) abstentionErrors.push(`${rowLabel(r)}: abstains on "${key}", which is not a field this report knows`);
    else if (!CORE_KEYS.has(key)) abstentionErrors.push(`${rowLabel(r)}: abstains on "${key}", which is not a core field — nothing to excuse`);
    else if (field.get(r) != null) abstentionErrors.push(`${rowLabel(r)}: abstains on "${key}" but carries a value for it — one of the two is stale`);
    if (typeof reason !== "string" || reason.trim().split(/\s+/).length < 5)
      abstentionErrors.push(`${rowLabel(r)}: abstains on "${key}" without a reason — say why the silence is the honest answer, in a sentence`);
  }
}

// Per-row evaluation. `missingCore` is what fails; an abstained field moves
// to `abstained` instead, so the report can still show it.
const evaluated = rows.map((r) => {
  const abstains = r.abstains ?? {};
  const missing = FIELDS.filter((f) => f.get(r) == null);
  const abstained = missing.filter((f) => f.key in abstains);
  const missingCore = missing.filter((f) => f.tier === "core" && !(f.key in abstains));
  return { r, missing, missingCore, abstained };
});

// Per-field aggregate: how many cohorts lack each field, and how many of
// those are deliberate. `missing` stays the raw count — the size of the hole
// doesn't change because we decided some of it was on purpose.
const perField = FIELDS.map((f) => ({
  ...f,
  missing: rows.filter((r) => f.get(r) == null).length,
  abstained: rows.filter((r) => f.get(r) == null && f.key in (r.abstains ?? {})).length,
  total: rows.length,
}));

if (AS_JSON) {
  console.log(JSON.stringify({
    rows: rows.length,
    perField: perField.map(({ key, tier, missing, abstained, total }) => ({ key, tier, missing, abstained, total })),
    coreFailures: evaluated.filter((e) => e.missingCore.length).map((e) => ({ id: e.r.id, label: rowLabel(e.r), missingCore: e.missingCore.map((f) => f.key) })),
    abstentions: evaluated.filter((e) => e.abstained.length).map((e) => ({ id: e.r.id, label: rowLabel(e.r), fields: Object.fromEntries(e.abstained.map((f) => [f.key, e.r.abstains[f.key]])) })),
    abstentionErrors,
  }, null, 2));
  process.exit(abstentionErrors.length || evaluated.some((e) => e.missingCore.length) ? 10 : 0);
}

console.log(`Enrichment coverage — ${rows.length} cohorts${MAKE ? ` (${MAKE})` : ""}\n`);

console.log("Field coverage (cohorts missing this field):");
for (const tier of ["core", "expected", "optional"]) {
  for (const f of perField.filter((x) => x.tier === tier)) {
    const pct = Math.round((100 * (f.total - f.missing)) / f.total);
    const bar = f.missing === 0 ? "" : `  ← ${f.missing} missing${f.abstained ? ` (${f.abstained} deliberate)` : ""}`;
    console.log(`  [${tier.padEnd(8)}] ${f.label.padEnd(30)} ${String(f.total - f.missing).padStart(4)}/${f.total} (${pct}%)${bar}`);
  }
}

const coreFail = evaluated.filter((e) => e.missingCore.length).sort((a, b) => b.missingCore.length - a.missingCore.length);
console.log(`\nCohorts missing a CORE field: ${coreFail.length}`);
for (const e of coreFail) {
  console.log(`  ${rowLabel(e.r).padEnd(48)} missing: ${e.missingCore.map((f) => f.label).join(", ")}`);
}

if (SHOW_ALL) {
  const anyGap = evaluated.filter((e) => e.missing.length).sort((a, b) => b.missing.length - a.missing.length);
  console.log(`\nAll cohorts with any gap: ${anyGap.length}`);
  for (const e of anyGap) {
    console.log(`  ${rowLabel(e.r).padEnd(48)} (${e.missing.length}) ${e.missing.map((f) => f.label).join(", ")}`);
  }
}

// Printed every run, not behind --all: the whole point of writing an
// abstention down is that someone reads it back.
const abstaining = evaluated.filter((e) => e.abstained.length);
if (abstaining.length) {
  console.log(`\nCohorts deliberately silent on a core field: ${abstaining.length}`);
  for (const e of abstaining) {
    for (const f of e.abstained) {
      console.log(`  ${rowLabel(e.r).padEnd(48)} ${f.label}: ${e.r.abstains[f.key]}`);
    }
  }
}

if (abstentionErrors.length) {
  console.log(`\nBROKEN ABSTENTIONS: ${abstentionErrors.length}`);
  for (const m of abstentionErrors) console.log(`  ${m}`);
}

const failed = coreFail.length > BASELINE || abstentionErrors.length > 0;
console.log(
  `\n${failed ? "FAIL" : "OK"} — ${coreFail.length} cohorts miss a core field (baseline ${BASELINE}); ` +
    `${CORE.length} core fields checked across ${rows.length} cohorts` +
    (abstaining.length ? `; ${abstaining.length} deliberately silent` : "")
);
if (coreFail.length > BASELINE) console.log(`  ${coreFail.length - BASELINE} more than the committed baseline — a cohort regressed or was added half-stocked.`);
if (abstentionErrors.length) console.log(`  ${abstentionErrors.length} abstention(s) above are malformed — fix the annotation, not the baseline.`);
process.exit(failed ? 10 : 0);
