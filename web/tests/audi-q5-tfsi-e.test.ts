// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/audi-q5-tfsi-e.test.ts
//
// The Audi Q5 55 TFSI e rows (lib/enrichment/data13.ts) are the case the
// `vds` filter exists for: the feed files 40 of the 315 live cars under the
// petrol-shared names "Q5" and "Q5 S-Line", so the rows must carry those
// aliases to see the cars at all — and the VIN descriptor is the only thing
// standing between those aliases and a petrol Q5.
//
// So this pins four things:
//   1. a real live VIN of each model year lands on that year's row, with that
//      year's pack and that year's EPA electric range;
//   2. a petrol Q5's VIN, which differs from a plug-in's only at position 8,
//      matches nothing;
//   3. a dealer trim string cannot move a VIN off its row;
//   4. a car with no trim — 267 of the 315 live listings — still resolves.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import { RESEARCH_ROWS_13 } from "@/lib/enrichment/data13";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({
  vin: "",
  usMarket: true,
  make: "AUDI",
  model: "Q5 TFSI e",
  driveType: "AWD",
  ...over,
});

// Real VINs from the live shard cache, 2026-09-10, one per model year.
const LIVE: [number, string, string, string, number, number | undefined][] = [
  // year, VIN, the feed's own model string for that car, row id, pack kWh, EPA electric miles
  [2020, "WA1E2AFY8L2053616", "Q5 e", "audi-q5-tfsi-e-2020", 14.1, 20],
  [2021, "WA1G2AFY5M2047086", "Q5", "audi-q5-tfsi-e-2021", 14.1, 19],
  [2022, "WA1F2AFY1N2086173", "Q5 TFSI e", "audi-q5-tfsi-e-2022", 17.9, 23],
  [2023, "WA1G2AFY9P2106872", "Q5", "audi-q5-tfsi-e-2023", 17.9, 28],
  [2024, "WA1E2AFY0R2024409", "Q5 TFSI e", "audi-q5-tfsi-e-2024", 17.9, undefined],
  [2025, "WA1G2AFY1S2002210", "Q5 e", "audi-q5-tfsi-e-2025", 17.9, 28],
];

test("a live VIN of each model year resolves to that year's row, with that year's pack and rating", () => {
  for (const [year, vin, model, id, kwh, mi] of LIVE) {
    const r = matchEnrichment(decode({ vin, model, modelYear: year }), null);
    assert.equal(r.exact?.id, id, `${year} ${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, kwh, `${year} pack`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi, `${year} EPA electric range`);
    assert.equal(r.exact?.plugIn, true);
    assert.equal(r.exact?.charging?.portStandard?.value, "J1772");
  }
});

test("2024 prints no range at all rather than a neighbouring year's — EPA never rated it", () => {
  const r = matchEnrichment(decode({ vin: "WA1E2AFY0R2024409", modelYear: 2024 }), null);
  assert.equal(r.exact?.id, "audi-q5-tfsi-e-2024");
  assert.equal(r.exact?.range?.epaRangeMi, undefined);
  assert.equal(r.exact?.range?.mfrRangeMi, undefined);
  assert.ok((r.exact?.abstains?.epaRangeMi ?? "").length > 40);
});

test("the pack boundary is 2021/2022, where Audi put it — not 2022/2023", () => {
  const kwh = (year: number, vin: string) =>
    matchEnrichment(decode({ vin, modelYear: year }), null).exact?.battery?.packGrossKwh?.value;
  assert.equal(kwh(2021, "WA1E2AFY8M2095057"), 14.1);
  assert.equal(kwh(2022, "WA1E2AFY3N2064655"), 17.9);
});

test("the four model strings the feed uses all reach the same row for the same VIN", () => {
  const vin = "WA1E2AFYXP2146952"; // live 2023 Premium Plus
  for (const model of ["Q5 TFSI e", "Q5 e", "Q5", "Q5 S-Line"]) {
    const r = matchEnrichment(decode({ vin, model, modelYear: 2023 }), null);
    assert.equal(r.exact?.id, "audi-q5-tfsi-e-2023", `model "${model}"`);
  }
});

test("a petrol Q5 filed under the same model string matches nothing — position 8 is the whole guard", () => {
  // vPIC, 2026-09-10: WA1E2AFY decodes "Q5 e", PHEV, 55 TFSI; WA1E2AF3 at the
  // same positions 4-7 decodes 45 TFSI with no electrification level. The
  // alias "Q5" gets both into the model filter; only the plug-in survives vds.
  for (const model of ["Q5", "Q5 S-Line"]) {
    const r = matchEnrichment(decode({ vin: "WA1E2AF30R2024409", model, modelYear: 2024 }), null);
    assert.equal(r.exact, undefined, `petrol ${model} got ${r.exact?.id}`);
    assert.equal(r.candidates?.length ?? 0, 0);
  }
  // A Q4 e-tron VIN (position 8 = Z) filed by a lazy feed as "Q5" likewise.
  const q4 = matchEnrichment(decode({ vin: "WA1E2AFZ0R2024409", model: "Q5", modelYear: 2024 }), null);
  assert.equal(q4.exact, undefined);
});

test("a dealer's trim string cannot move a VIN off its row", () => {
  for (const trim of ["55 S line Premium", "Prestige", "Premium Plug-in Hybrid", "S line", "Used 2023 Audi Q5 e"]) {
    const r = matchEnrichment(decode({ vin: "WA1F2AFY5P2071405", modelYear: 2023, trim }), null);
    assert.equal(r.exact?.id, "audi-q5-tfsi-e-2023", `trim "${trim}"`);
  }
});

test("a trimless car still resolves — 267 of the 315 live listings have an empty trim field", () => {
  for (const [year, vin, model, id] of LIVE) {
    const r = matchEnrichment(decode({ vin, model, modelYear: year, trim: undefined }), null);
    assert.equal(r.exact?.id, id, `${year} trimless`);
  }
});

test("the Sportback descriptors resolve to the same year's row — B in position 6 is not a different car", () => {
  // vPIC decodes WA1E2BFY and WA1F2BFY as Series "SUV", 4 doors, identical
  // trim strings to their A-position twins; the US Q5 Sportback was never
  // sold as a plug-in, so these are not a separate cohort.
  assert.equal(matchEnrichment(decode({ vin: "WA1E2BFY4P2042852", model: "Q5", modelYear: 2023 }), null).exact?.id, "audi-q5-tfsi-e-2023");
  assert.equal(matchEnrichment(decode({ vin: "WA1F2BFY8M2052090", modelYear: 2021 }), null).exact?.id, "audi-q5-tfsi-e-2021");
});

test("every row declares its kind and its silences, and none carries a heat pump it did not source", () => {
  assert.equal(RESEARCH_ROWS_13.length, 6);
  for (const r of RESEARCH_ROWS_13) {
    assert.equal(r.plugIn, true, r.id);
    assert.equal(r.packVariant, "PHEV", r.id);
    assert.ok(r.abstains?.batteryWarranty, `${r.id} must declare the warranty silence`);
    assert.equal(r.trim, undefined, `${r.id} must carry no trim key`);
    // A row either states the heat pump with Audi's words or abstains — never neither, never both.
    const stated = r.thermal?.heatPump != null;
    const abstained = r.abstains?.heatPump != null;
    assert.ok(stated !== abstained, `${r.id} heat pump: stated=${stated} abstained=${abstained}`);
  }
  // Audi states it for 2020 and 2021 only.
  assert.deepEqual(
    RESEARCH_ROWS_13.filter((r) => r.thermal?.heatPump).map((r) => r.modelYears[0]),
    [2020, 2021]
  );
});
