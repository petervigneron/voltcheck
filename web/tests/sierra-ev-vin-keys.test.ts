// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/sierra-ev-vin-keys.test.ts
//
// The GMC Sierra EV, which on 2026-08-28 was the single largest matching
// failure in the live feed: 773 of 969 listings showed no range, not because
// nobody had researched the truck but because the two rows that existed
// carried no key at all. Every listing matched both, came back ambiguous, and
// rendered a 283-410 spread — while its own trim string said "Elevation
// Standard Range".
//
// Three things are pinned here, each one a mistake that was actually made:
//
//   1. The pack and trim come from VIN positions 4-8, not from the trim
//      string, which arrives in at least a dozen spellings.
//   2. vPIC's `Trim` field is a function of POSITION 6 ALONE and embeds a
//      module count that position 8 can contradict. Cohorting on it, or on
//      position 8 by itself, is cohorting on half the evidence.
//   3. A `trim` key on a vds-keyed row is a VETO, not a second opinion:
//      trimMatches() refuses a listing whose own trim field is blank and runs
//      before the vds filter, so the row goes unreachable for exactly the
//      listings the VIN was added to rescue.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });
const sierra = (vin: string, modelYear: number, trim?: string) =>
  matchEnrichment(decode({ make: "GMC", model: "Sierra EV", modelYear, vin, trim }), null);
const rangeOf = (vin: string, year: number, trim?: string) => {
  const r = sierra(vin, year, trim).exact;
  return r?.range?.epaRangeMi?.value ?? r?.range?.mfrRangeMi?.value;
};

test("the VIN descriptor, not the trim string, resolves a Sierra EV's pack and range", () => {
  // One real live VIN per descriptor present in the feed. The range figures
  // are GMC's own per-trim FAQ table, cross-checked against EPA's records for
  // the four configurations EPA actually rated.
  const cases: Array<[string, number, number, string]> = [
    ["1GT1ESEH0TU407216", 2026, 283, "Elevation Standard, 14-module, EPA"],
    ["1GT1ETED1TU403937", 2026, 410, "Elevation Extended, 20-module, EPA"],
    ["1GT1EWEH2TU410416", 2026, 283, "Denali Standard, 14-module, EPA"],
    ["1GT4EXED0TU417509", 2026, 410, "Denali Extended, 20-module, EPA"],
    ["1GT4EUED8TU417384", 2026, 390, "AT4 Extended — 20 fewer miles than the Elevation on the SAME pack"],
    ["1GT4EVEL0TU417635", 2026, 478, "AT4 Max, 24-module, GM-estimated"],
    ["1GT4EYEL4TU403190", 2026, 478, "Denali Max, 24-module, GM-estimated"],
    ["1GT10MED2SU412715", 2025, 390, "MY2025 Extended, EPA"],
    ["1GT40LEL3SU408686", 2025, 460, "MY2025 Max"],
    ["1GT401EL1RU401931", 2024, 440, "MY2024 Denali Edition 1"],
  ];
  for (const [vin, year, miles, label] of cases) {
    assert.equal(rangeOf(vin, year), miles, label);
  }
});

test("the AT4 does not inherit the Elevation's rating from the pack they share", () => {
  // Both are the 20-module Extended Range truck. One row per PACK would have
  // printed 410 on all 29 live AT4s, overclaiming by 20 miles.
  const at4 = sierra("1GT4EUED8TU417384", 2026).exact;
  const elevation = sierra("1GT1ETED1TU403937", 2026).exact;
  assert.equal(at4?.packVariant, "Extended Range");
  assert.equal(elevation?.packVariant, "Extended Range");
  assert.equal(at4?.range?.mfrRangeMi?.value, 390);
  assert.equal(elevation?.range?.epaRangeMi?.value, 410);
  // And the AT4's figure is GM's estimate, not a rating it does not have.
  assert.equal(at4?.range?.epaRangeMi, undefined, "EPA never rated the AT4");
  assert.ok(elevation?.range?.epaRangeMi?.sourceUrl?.includes("fueleconomy.gov"));
});

test("a Sierra EV with no trim string at all still resolves, because the VIN carries it", () => {
  // The regression this exists for. Nineteen live trucks — blank trim, or a
  // trim reading only "Denali" — matched NOTHING while these rows carried a
  // `trim` key alongside their `vds`, because trimMatches() refuses an absent
  // listing trim and runs first. Adding a trim key to a VIN-keyed row is the
  // mistake; this test fails the moment one comes back.
  for (const [vin, year, miles] of [
    ["1GT1ESEH5TU414517", 2026, 283],
    ["1GT4EYEL2TU406346", 2026, 478],
    ["1GT10MED1SU407795", 2025, 390],
    ["1GT40LEL2SU402846", 2025, 460],
  ] as Array<[string, number, number]>) {
    assert.equal(rangeOf(vin, year), miles, `${vin} with no trim string`);
    // And the same truck with the unhelpful trim its dealer actually typed.
    assert.equal(rangeOf(vin, year, "Denali"), miles, `${vin} with trim "Denali"`);
  }
});

test("a trim string that contradicts the VIN cannot override it", () => {
  // The dealer feed writes "Elevation Standard Range" onto Extended Range
  // trucks and vice versa; positions 4-8 are what the factory stamped.
  assert.equal(rangeOf("1GT1ETED1TU403937", 2026, "Elevation Standard Range"), 410);
  assert.equal(rangeOf("1GT1ESEH0TU407216", 2026, "Elevation Extended Range"), 283);
});

test("vPIC's own Trim string is not a pack fact, and no row is keyed on it", () => {
  // vPIC decodes position 6 independently of position 8 and reports a Trim
  // that embeds a module count from position 6 only — it answers
  // "Elevation 14" for a position-8 = L (24-module) VIN. Real trucks are
  // self-consistent, so a five-character descriptor is safe where either
  // field alone is not. A VIN whose positions disagree is not a truck, and
  // must match nothing rather than pick whichever half it likes.
  const impossible = sierra("1GT1ESEL0TU407216", 2026); // pos6 = S (Elevation 14), pos8 = L (24-MOD)
  assert.equal(impossible.exact, undefined, "a position-6/8 mismatch is not a real configuration");
  assert.equal(impossible.candidates, undefined);
});
