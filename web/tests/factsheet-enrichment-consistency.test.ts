// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/factsheet-enrichment-consistency.test.ts
//
// Cross-lane tripwire. The fact-sheet lane (content/facts/*.md) and the
// listings enrichment lane (lib/enrichment/data*.ts) research the same cars
// independently, and on 2026-08-30 they were caught contradicting each
// other: the Lightning heat-pump sheet said no 2024 truck has one while
// every 2024 enrichment row said "standard" — and the enrichment lane was
// right (Ford's own support page: the Vapor Injection Heat Pump is
// "standard on all trims of the 2024 and newer F-150 Lightning"). The
// contradiction sat machine-readable on both sides for five days with
// nothing reading across; the sheet's own audit even quoted the refuting
// Ford sentence and filed it as corroboration for a different claim. This
// test is the missing reader.
//
// It is deliberately conservative: it fails only on a hard contradiction —
// a sheet table row for a single model year claiming a uniform heat-pump
// status ("None" / "Standard" / "Optional") that not one enrichment row
// for that make+model+year agrees with. Trim-conditional cells, build-date
// rows, and years the enrichment lane hasn't researched are skipped.
//
// Two topics read across now, one test each: heat pump first, then battery
// warranty (added 2026-09-01, after the same class of contradiction went
// unread on the Wrangler 4xe — see that half's own header). Both share the
// MODEL_MAP below and hold to the same bar: skip anything not cleanly
// comparable, fail only on a claim the other lane flatly contradicts.
import test from "node:test";
import assert from "node:assert/strict";
import { FACT_SHEETS } from "@/lib/facts/registry";
import { loadFactSheet } from "@/lib/facts/content";
import { ENRICHMENT_ROWS } from "@/lib/enrichment/data";
import { RESEARCH_ROWS } from "@/lib/enrichment/data2";
import { RESEARCH_ROWS_3 } from "@/lib/enrichment/data3";
import { RESEARCH_ROWS_4 } from "@/lib/enrichment/data4";
import { RESEARCH_ROWS_5 } from "@/lib/enrichment/data5";
import { RESEARCH_ROWS_6 } from "@/lib/enrichment/data6";
import { RESEARCH_ROWS_9 } from "@/lib/enrichment/data9";
import { RESEARCH_ROWS_10 } from "@/lib/enrichment/data10";
import { RESEARCH_ROWS_11 } from "@/lib/enrichment/data11";
import { RESEARCH_ROWS_12 } from "@/lib/enrichment/data12";

const ALL_ROWS = [
  ...ENRICHMENT_ROWS,
  ...RESEARCH_ROWS,
  ...RESEARCH_ROWS_3,
  ...RESEARCH_ROWS_4,
  ...RESEARCH_ROWS_5,
  ...RESEARCH_ROWS_6,
  ...RESEARCH_ROWS_9,
  ...RESEARCH_ROWS_10,
  ...RESEARCH_ROWS_11,
  ...RESEARCH_ROWS_12,
];

// Sheet URL identity → the enrichment lane's exact make/model strings.
// "IONIQ 5 N" is a distinct enrichment model and stays unmapped on purpose:
// every Ioniq 5 sheet scopes the N out.
//
// Shared by both halves of this file, so an entry is worth adding for a model
// with a sheet on either topic. A model listed here whose sheet has no table
// this test can read simply never gets compared — the cost of a spare entry is
// nothing, and the cost of a missing one is a sheet that silently sits outside
// the tripwire, which is how both contradictions this file exists for reached
// the site.
const MODEL_MAP: Record<string, { make: string; models: string[] }> = {
  "ford/f-150-lightning": { make: "FORD", models: ["F-150 Lightning"] },
  "ford/mustang-mach-e": { make: "FORD", models: ["Mustang Mach-E"] },
  "tesla/model-3": { make: "TESLA", models: ["Model 3"] },
  "tesla/model-y": { make: "TESLA", models: ["Model Y"] },
  "hyundai/ioniq-5": { make: "HYUNDAI", models: ["Ioniq 5"] },
  "hyundai/ioniq-6": { make: "HYUNDAI", models: ["Ioniq 6"] },
  "kia/ev6": { make: "KIA", models: ["EV6"] },
  // The EV9 sheet's table carries a trim column, so it is per-config and the
  // uniform-claim comparison skips it — mapped anyway so the tripwire reaches
  // it if the sheet ever gains a two-column year table.
  "kia/ev9": { make: "KIA", models: ["EV9"] },
  "volkswagen/id-4": { make: "VOLKSWAGEN", models: ["ID.4"] },
  "volkswagen/id-buzz": { make: "VOLKSWAGEN", models: ["ID. Buzz"] },
  "chevrolet/bolt-ev-euv": { make: "CHEVROLET", models: ["Bolt EV", "Bolt EUV"] },
  "nissan/leaf": { make: "NISSAN", models: ["Leaf"] },
  "nissan/ariya": { make: "NISSAN", models: ["Ariya"] },
  // The four Wrangler 4xe listing buckets, all carrying the same warranty
  // constants: the two full names and the two trim-guarded bare-name alt rows
  // (data4.ts explains why the bare names need `trim: ["4xe"]`). All four are
  // "the sheet's own model", which also keeps them out of the neighbouring-
  // model guard below.
  "jeep/wrangler-4xe": {
    make: "JEEP",
    models: ["Wrangler 4xe", "Wrangler Unlimited 4xe", "Wrangler", "Wrangler Unlimited"],
  },
  "cadillac/lyriq": { make: "CADILLAC", models: ["Lyriq"] },
  "cadillac/optiq": { make: "CADILLAC", models: ["Optiq"] },
  "chevrolet/equinox-ev": { make: "CHEVROLET", models: ["Equinox EV"] },
  "chevrolet/blazer-ev": { make: "CHEVROLET", models: ["Blazer EV"] },
  "honda/prologue": { make: "HONDA", models: ["Prologue"] },
};

type HeatPumpStatus = "none" | "standard" | "optional";

function classifyCell(raw: string): HeatPumpStatus | null {
  const text = raw
    .replace(/\[\^\d+\]/g, "")
    .replace(/^Est\.\s*/i, "")
    .trim();
  if (/^none\b/i.test(text)) return "none";
  if (/^standard\b/i.test(text)) return "standard";
  if (/^optional\b/i.test(text)) return "optional";
  return null; // trim-conditional or otherwise non-uniform — not comparable
}

function enrichmentValuesFor(make: string, models: string[], year: number) {
  const values = new Set<string>();
  const ids: string[] = [];
  for (const row of ALL_ROWS) {
    if (row.make !== make || !models.includes(row.model)) continue;
    const [from, to] = row.modelYears;
    if (year < from || year > to) continue;
    const hp = row.thermal?.heatPump?.value;
    if (hp === undefined) continue;
    values.add(hp);
    ids.push(row.id);
  }
  return { values, ids };
}

test("no heat-pump sheet contradicts the enrichment lane", () => {
  let compared = 0;
  const conflicts: string[] = [];

  for (const entry of FACT_SHEETS.filter((s) => s.topic === "heat-pump")) {
    const mapped = MODEL_MAP[`${entry.make}/${entry.model}`];
    if (!mapped) continue;
    const parsed = loadFactSheet(entry.contentFile);

    for (const section of parsed.sections) {
      for (const block of section.blocks) {
        if (block.type !== "table") continue;
        if (!/model year/i.test(block.header[0] ?? "")) continue;
        // Only the two-column shape (year → uniform status) is a uniform
        // claim; a table with a trim/drivetrain column is per-config and
        // out of this test's reach.
        if (block.header.length !== 2) continue;
        for (const row of block.rows) {
          const yearMatch = /^(\d{4})$/.exec(row[0]?.trim() ?? "");
          if (!yearMatch) continue;
          const claim = classifyCell(row[1] ?? "");
          if (!claim) continue;
          const year = Number(yearMatch[1]);
          const { values, ids } = enrichmentValuesFor(mapped.make, mapped.models, year);
          if (values.size === 0) continue; // enrichment hasn't researched this year
          compared++;
          if (!values.has(claim)) {
            conflicts.push(
              `/facts/${entry.make}/${entry.model}/${entry.topic} says ${year} = "${claim}" but enrichment rows [${ids.join(", ")}] say ${[...values].map((v) => `"${v}"`).join(", ")}`
            );
          }
        }
      }
    }
  }

  assert.deepEqual(conflicts, [], conflicts.join("\n"));
  // The tripwire must actually trip on something to be alive. If a format
  // change stops the tables parsing into comparable rows, this fails loudly
  // instead of the test silently going dead.
  assert.ok(compared >= 3, `only ${compared} sheet-year cells were comparable — the tripwire has gone dead`);
});

// ── Battery warranty ──────────────────────────────────────────────────────
//
// The same failure, found the same way — by a human, not by a check. On
// 2026-09-01 wrangler-4xe-battery-warranty.md stated 10 years for a 2021
// truck (the 2021 Mopar booklet carries no 8-year term at all) while all
// three Wrangler 4xe enrichment rows carried one flat 8 years/100,000 miles
// across [2021,2025]. lib/listings/warranty.ts reads batteryYears and
// batteryMiles straight off the row, so every 2021 card understated its own
// coverage by two years. The rows were split at the 2021/2022 boundary in
// e84c266; this half is the reader that would have caught it.
//
// Two traps that audit recorded, and the reason this parser is shaped the way
// it is:
//
// 1. A sheet routinely states TWO terms for one year — a longer term for
//    California ZEV/TZEV states and a base term for everywhere else. The
//    enrichment lane deliberately carries the BASE figure, because a
//    150,000-mile ceiling would tell a 120,000-mile truck outside a ZEV state
//    that it is still covered. So "the sheet says 150,000, the row says
//    100,000" is what a correctly-filled row looks like: the comparison has to
//    find the non-ZEV clause and compare only that. A cell whose base clause
//    can't be identified unambiguously is skipped, not guessed at.
// 2. A sheet's table can name a NEIGHBOURING model. Jeep's 2023 booklet prints
//    the Grand Cherokee 4xe's 10/150k beside the Wrangler 4xe's flat 8/100k,
//    and reading the adjacent cell is the obvious way to get that year wrong.
//    Any cell mentioning another model from the same make's enrichment
//    vocabulary is skipped.
//
// Scope: two-column "Model year | Term" tables inside a section whose heading
// names the battery. The other ten warranty sheets state one term for the
// whole sheet in a "Coverage at a glance" Item/Answer row instead, with the
// years it covers living in the prose scope note — pinning that to model years
// would be inference rather than parsing, so those sheets are out of reach
// here on purpose.

type WarrantyTerm = { years: number; miles: number };

const TERM_RE = /(\d+)\s*years?\s+or\s+([\d,]+)\s*miles/gi;
// The clause that carries the longer state-conditional term...
const STATE_LONGER = /california|\bzev\b|\btzev\b/i;
// ...and the one that carries the term a truck holds wherever it is
// registered. Checked first, because "non-TZEV states" trips both.
const STATE_BASE = /non-?zev|non-?tzev|\bdo not\b|\bdoes not\b|\bhave not\b|\bhas not\b|\belsewhere\b|\ball other\b|\bother states\b/i;

/**
 * The base (non-ZEV/non-TZEV) term a sheet cell states, or null if the cell
 * does not state exactly one identifiable base term.
 */
function baseTermFrom(raw: string): WarrantyTerm | null {
  const text = raw.replace(/\[\^\d+\]/g, "").trim();
  const candidates: { clause: string; term: WarrantyTerm }[] = [];

  for (const clause of text.split(";")) {
    const matches = [...clause.matchAll(TERM_RE)];
    if (matches.length === 0) continue; // prose tail, not a term clause
    if (matches.length > 1) return null; // one clause, two terms — not clean
    candidates.push({
      clause,
      term: {
        years: Number(matches[0][1]),
        miles: Number(matches[0][2].replace(/,/g, "")),
      },
    });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const { clause, term } = candidates[0];
    if (STATE_BASE.test(clause)) return term;
    // A lone clause scoped to California/ZEV states states no base term.
    if (STATE_LONGER.test(clause)) return null;
    return term;
  }
  const base = candidates.filter((c) => STATE_BASE.test(c.clause));
  return base.length === 1 ? base[0].term : null;
}

/** Model names this make sells that are NOT the sheet's own, for the neighbouring-model guard. */
function neighbourModelNames(make: string, own: string[]): string[] {
  const ownLower = own.map((m) => m.toLowerCase());
  const names = new Set<string>();
  for (const row of ALL_ROWS) {
    if (row.make !== make) continue;
    for (const name of [row.model, ...(row.modelAliases ?? [])]) {
      const low = name.toLowerCase();
      // A name that contains, or is contained by, one of the sheet's own
      // models can't distinguish the two ("Wrangler" inside "Wrangler 4xe"),
      // so it is no use as a neighbour signal.
      if (ownLower.some((o) => o === low || o.includes(low) || low.includes(o))) continue;
      names.add(name);
    }
  }
  return [...names];
}

function enrichmentTermsFor(make: string, models: string[], year: number) {
  const terms = new Set<string>();
  const ids: string[] = [];
  for (const row of ALL_ROWS) {
    if (row.make !== make || !models.includes(row.model)) continue;
    const [from, to] = row.modelYears;
    if (year < from || year > to) continue;
    const years = row.warranty?.batteryYears?.value;
    const miles = row.warranty?.batteryMiles?.value;
    if (years === undefined || miles === undefined) continue; // not researched as a pair
    terms.add(`${years}/${miles}`);
    ids.push(row.id);
  }
  return { terms, ids };
}

test("no battery-warranty sheet contradicts the enrichment lane", () => {
  let compared = 0;
  const conflicts: string[] = [];

  for (const entry of FACT_SHEETS.filter((s) => s.topic === "battery-warranty")) {
    const mapped = MODEL_MAP[`${entry.make}/${entry.model}`];
    if (!mapped) continue;
    const parsed = loadFactSheet(entry.contentFile);
    const neighbours = neighbourModelNames(mapped.make, mapped.models);

    for (const section of parsed.sections) {
      // The battery term is not the only per-model-year term a warranty sheet
      // prints. The Wrangler sheet also carries a "Model year | FCA US LLC
      // Limited Emission Warranty" table whose 2021 cell reads 10 years or
      // 100,000 miles — a different coverage entirely, and one this test would
      // silently start comparing against batteryYears if it read every
      // model-year table it could parse.
      if (!/batter/i.test(section.heading)) continue;
      for (const block of section.blocks) {
        if (block.type !== "table") continue;
        if (!/model year/i.test(block.header[0] ?? "")) continue;
        if (block.header.length !== 2) continue; // a third column means per-trim or per-state
        if (/emission/i.test(block.header[1] ?? "")) continue;
        for (const row of block.rows) {
          const yearMatch = /^(\d{4})$/.exec(row[0]?.trim() ?? "");
          if (!yearMatch) continue;
          const cell = row[1] ?? "";
          if (neighbours.some((n) => cell.toLowerCase().includes(n.toLowerCase()))) continue;
          const claim = baseTermFrom(cell);
          if (!claim) continue;
          const year = Number(yearMatch[1]);
          const { terms, ids } = enrichmentTermsFor(mapped.make, mapped.models, year);
          if (terms.size === 0) continue; // enrichment hasn't researched this year
          compared++;
          const claimKey = `${claim.years}/${claim.miles}`;
          if (!terms.has(claimKey)) {
            conflicts.push(
              `/facts/${entry.make}/${entry.model}/${entry.topic} says ${year} = ${claim.years} years/${claim.miles.toLocaleString("en-US")} miles but enrichment rows [${ids.join(", ")}] say ${[...terms]
                .map((t) => {
                  const [y, m] = t.split("/");
                  return `${y} years/${Number(m).toLocaleString("en-US")} miles`;
                })
                .join(", ")}`
            );
          }
        }
      }
    }
  }

  assert.deepEqual(conflicts, [], conflicts.join("\n"));
  assert.ok(compared >= 3, `only ${compared} sheet-year warranty cells were comparable — the tripwire has gone dead`);
});
