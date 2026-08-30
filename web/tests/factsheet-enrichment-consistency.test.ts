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
import { RESEARCH_ROWS_13 } from "@/lib/enrichment/data13";

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
  ...RESEARCH_ROWS_13,
];

// Sheet URL identity → the enrichment lane's exact make/model strings.
// "IONIQ 5 N" is a distinct enrichment model and stays unmapped on purpose:
// every Ioniq 5 sheet scopes the N out.
const MODEL_MAP: Record<string, { make: string; models: string[] }> = {
  "ford/f-150-lightning": { make: "FORD", models: ["F-150 Lightning"] },
  "ford/mustang-mach-e": { make: "FORD", models: ["Mustang Mach-E"] },
  "tesla/model-3": { make: "TESLA", models: ["Model 3"] },
  "tesla/model-y": { make: "TESLA", models: ["Model Y"] },
  "hyundai/ioniq-5": { make: "HYUNDAI", models: ["Ioniq 5"] },
  "hyundai/ioniq-6": { make: "HYUNDAI", models: ["Ioniq 6"] },
  "kia/ev6": { make: "KIA", models: ["EV6"] },
  "volkswagen/id-4": { make: "VOLKSWAGEN", models: ["ID.4"] },
  "volkswagen/id-buzz": { make: "VOLKSWAGEN", models: ["ID. Buzz"] },
  "chevrolet/bolt-ev-euv": { make: "CHEVROLET", models: ["Bolt EV", "Bolt EUV"] },
  "nissan/leaf": { make: "NISSAN", models: ["Leaf"] },
  "nissan/ariya": { make: "NISSAN", models: ["Ariya"] },
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
