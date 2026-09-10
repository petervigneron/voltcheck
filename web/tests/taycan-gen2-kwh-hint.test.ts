// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/taycan-gen2-kwh-hint.test.ts
//
// Porsche's Part 565 battery-kWh figure is filed per VIN PATTERN, so it names
// a grade's standard pack and not the pack a given car was ordered with.
// Decoded 2026-09-10 across every live MY2025-26 Taycan VIN: MY2025 files
// 79.2 for the AA (base/4) and AB (4S) patterns and 97.00 for every other
// pattern; MY2026 files a flat 89.00 for all of them.
//
// The MY2025 79.2 did the damage. The gen-2 Plus pack is 97, 22.5% away and
// past match.ts's 20% tolerance, so the hint dropped every Plus row for a
// MY2025 AA or AB car. A 2025 Taycan 4S advertised as "4S" resolved to the
// Performance Battery row and printed 252 mi, where a Plus car rates 295.
// Nothing in the VIN says which pack the car has, so the honest answer is
// both rows, with the trim deciding when it can.
//
// Pinned here: the defect (the 4S), and three controls that must NOT move:
// the "4", whose exact trim was never at risk; the MY2026 4S, whose 89 hint
// vetoed nothing; and the gen-1 4S, where 93.4 sits 17.9% from 79.2 and so
// was never dropped.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import { ALL_ROWS } from "@/lib/enrichment/rows";
import type { VinDecode } from "@/lib/types";

// Real VINs off the crawl, with the kWh vPIC files for each.
const taycan = (vin: string, modelYear: number, trim: string, batteryKwhHint: number): VinDecode => ({
  vin,
  usMarket: true,
  make: "PORSCHE",
  model: "Taycan",
  modelYear,
  trim,
  driveType: "AWD",
  batteryKwhHint,
});

const ids = (d: VinDecode) => {
  const r = matchEnrichment(d, null);
  return { exact: r.exact?.id, candidates: r.candidates?.map((c) => c.id).sort() };
};

test("a 2025 Taycan 4S no longer loses its Plus row to the 79.2 kWh Porsche files for the whole AB pattern", () => {
  assert.deepEqual(ids(taycan("WP0AB2Y12SSA40453", 2025, "4S", 79.2)), {
    exact: undefined,
    candidates: ["taycan-2025-26-4s-pb", "taycan-2025-26-4s-pbp"],
  });
});

test("control: a 2025 Taycan 4 still resolves on its exact trim", () => {
  assert.deepEqual(ids(taycan("WP0AA2Y1XSSA12712", 2025, "4", 79.2)), {
    exact: "taycan-2025-26-4-pbp",
    candidates: undefined,
  });
});

test("control: a 2026 Taycan 4S was already two rows, because 89 sits inside the tolerance of both packs", () => {
  assert.deepEqual(ids(taycan("WP0AB2Y12TSA28076", 2026, "4S", 89)), {
    exact: undefined,
    candidates: ["taycan-2025-26-4s-pb", "taycan-2025-26-4s-pbp"],
  });
});

test("control: a gen-1 Taycan 4S keeps both packs without the flag", () => {
  assert.deepEqual(ids(taycan("WP0AB2Y12PSA36524", 2023, "4S", 79.2)), {
    exact: undefined,
    candidates: ["taycan-2023-24-4s-pb", "taycan-2023-24-4s-pbp"],
  });
});

test("every gen-2 Taycan row that states a pack ignores the kWh hint", () => {
  const gen2 = ALL_ROWS.filter(
    (r) =>
      r.make === "PORSCHE" &&
      (r.model === "Taycan" || r.model === "Taycan Cross Turismo") &&
      r.modelYears[0] >= 2025 &&
      (r.battery?.packGrossKwh || r.battery?.packUsableKwh)
  );
  assert.ok(gen2.length >= 16, `expected the 16 gen-2 rows, found ${gen2.length}`);
  assert.deepEqual(gen2.filter((r) => !r.ignoreKwhHint).map((r) => r.id), []);
});
