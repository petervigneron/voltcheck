// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/audi-2027-etron-gt-egolf.test.ts
//
// data19.ts keys three groups on the VIN's vehicle descriptor: the MY2027
// Audi A6/S6 Sportback e-tron on position 5 (C = RWD, D = quattro, E = S6),
// the facelifted e-tron GT on positions 4-8 (G/H+9BFW = S, J+8BFW = RS
// performance), and the VW e-Golf on positions 4-5 (trim, then which pack).
// What each test below pins is a way the corpus has been wrong before: a
// dealer trim overriding the VIN, one generation's row reaching the other
// generation's car, and a year typo walking a listing across a pack boundary.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const dec = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, make: "AUDI", model: "", modelYear: 2027, ...over });

// ── Audi A6 / S6 Sportback e-tron, MY2027 ────────────────────────────────
test("every live MY2027 A6/S6 descriptor resolves to the row for its drivetrain, with Audi's own range", () => {
  const cases: [string, string, string, number][] = [
    // Real VINs from the feed, 2026-09-10.
    ["WAU1CAGH6VA000192", "A6 Sportback e-tron", "a6-sportback-etron-2027-rwd", 348],
    ["WAU2DAGH4VA005327", "A6 Sportback e-tron", "a6-sportback-etron-2027-quattro", 327],
    ["WAU3DAGH9VA000595", "A6 Sportback e-tron", "a6-sportback-etron-2027-quattro", 327],
    ["WAU5DAGH3VA006157", "A6 Sportback e-tron", "a6-sportback-etron-2027-quattro", 327],
    ["WAU6DAGH6VA005668", "A6 Sportback e-tron", "a6-sportback-etron-2027-quattro", 327],
    ["WAU2EAGH5VA000120", "S6 Sportback e-tron", "s6-sportback-etron-2027", 326],
    ["WAU3EAGH0VA003253", "S6 Sportback e-tron", "s6-sportback-etron-2027", 326],
  ];
  for (const [vin, model, id, mi] of cases) {
    const r = matchEnrichment(dec({ vin, model }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, 100);
    assert.equal(r.exact?.battery?.packUsableKwh?.value, 94.4);
    // Audi's MY2027 sheet: "AC/DC Combo Port — J1772 / CCS". Not NACS.
    assert.equal(r.exact?.charging?.portStandard?.value, "CCS1");
    assert.equal(r.exact?.charging?.architectureV?.value, 800);
    // No Audi USA document states heat-pump hardware for the PPE cars.
    assert.equal(r.exact?.thermal?.heatPump, undefined);
    assert.ok(r.exact?.abstains?.heatPump);
  }
});

test("a MY2027 trim Audi has not shipped yet still lands on the right row: position 4 is enumerated over the digits", () => {
  // 4CAGH and 9EAGH are not live today. Position 5 is what decides.
  assert.equal(matchEnrichment(dec({ vin: "WAU4CAGH6VA000001", model: "A6 Sportback e-tron" }), null).exact?.id, "a6-sportback-etron-2027-rwd");
  assert.equal(matchEnrichment(dec({ vin: "WAU9EAGH6VA000001", model: "S6 Sportback e-tron" }), null).exact?.id, "s6-sportback-etron-2027");
});

test("the dealer's trim string cannot move a MY2027 A6 off its VIN's row", () => {
  // Two thirds of the live MY2027 A6s arrive with the trim field set to
  // "Sportback", which names no grade at all; others say "Prestige ®".
  for (const trim of ["Sportback", "Prestige ®", "Premium Plus ®", "Technik", ""]) {
    const r = matchEnrichment(dec({ vin: "WAU1CAGH6VA000192", model: "A6 Sportback e-tron", trim: trim || undefined }), null);
    assert.equal(r.exact?.id, "a6-sportback-etron-2027-rwd", `trim "${trim}"`);
  }
});

test("a 2025 A6 e-tron does not reach the MY2027 rows", () => {
  // Same descriptor, position 10 = S. data4 owns this car; data19 must not.
  const r = matchEnrichment(dec({ vin: "WAU2CAGH1SA012623", model: "A6 Sportback e-tron", modelYear: 2025 }), null);
  assert.notEqual(r.exact?.id, "a6-sportback-etron-2027-rwd");
  for (const c of r.candidates ?? []) assert.ok(!c.id.startsWith("a6-sportback-etron-2027"));
});

// ── Audi e-tron GT facelift, MY2025–26 ───────────────────────────────────
test("the facelift descriptors resolve to the 105 kWh rows", () => {
  const cases: [string, number, string, string, number][] = [
    ["WAUG9BFW0S7001703", 2025, "S e-tron GT", "s-etron-gt-2025-26", 300],
    ["WAUG9BFW8T7000543", 2026, "S e-tron GT", "s-etron-gt-2025-26", 300],
    ["WAUH9BFW3T7000471", 2026, "S e-tron GT", "s-etron-gt-2025-26", 300],
    ["WAUJ8BFW7S7901135", 2025, "RS e-tron GT performance", "rs-etron-gt-performance-2025-26", 278],
    ["WAUJ8BFW1T7900239", 2026, "RS e-tron GT performance", "rs-etron-gt-performance-2025-26", 278],
    // One live 2026 car is filed under the pre-facelift model string.
    ["WAUJ8BFW0T7900314", 2026, "RS e-tron GT", "rs-etron-gt-performance-2025-26", 278],
  ];
  for (const [vin, modelYear, model, id, mi] of cases) {
    const r = matchEnrichment(dec({ vin, model, modelYear }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, 105);
    assert.equal(r.exact?.battery?.packUsableKwh?.value, 97);
    assert.equal(r.exact?.charging?.dcPeakKw?.value, 320);
    assert.equal(r.exact?.charging?.superchargerAccess?.value, "adapter");
  }
});

test("a pre-facelift e-tron GT VIN never reaches a facelift row, whatever year the feed claims", () => {
  // 93.4 kWh cars: C/D/E/F+JBFW and A/B+HBFW. Even mislabeled as a 2026,
  // they must not pick up 105 kWh and 320 kW.
  for (const vin of ["WAUCJBFW0P7008244", "WAUFJBFW1R7001531", "WAUBHBFW0R7901671", "WAUAHBFW3N7900942"]) {
    for (const [model, modelYear] of [["e-tron GT", 2026], ["RS e-tron GT", 2026]] as [string, number][]) {
      const r = matchEnrichment(dec({ vin, model, modelYear }), null);
      const ids = [r.exact?.id, ...(r.candidates ?? []).map((c) => c.id)].filter(Boolean) as string[];
      for (const id of ids) assert.ok(!id.includes("2025-26"), `${vin} as ${modelYear} ${model} → ${id}`);
    }
  }
});

// ── Volkswagen e-Golf, MY2015–19 ─────────────────────────────────────────
const vw = (vin: string, modelYear: number, model = "e-Golf", trim?: string): VinDecode =>
  dec({ vin, make: "VOLKSWAGEN", model, modelYear, trim });

test("each live e-Golf descriptor resolves to its trim's row, with that year's pack, port and heat-pump answer", () => {
  const cases: [string, number, string, number, number, string | undefined][] = [
    // vin, year, row id, kWh, EPA mi, heat pump ("" = abstains)
    ["WVWKP7AU6FW905671", 2015, "egolf-2015-limited-edition", 24.2, 83, "none"],
    ["WVWPP7AU0FW908264", 2015, "egolf-2015-16-sel-premium", 24.2, 83, "standard"],
    ["WVWPP7AU4GW915462", 2016, "egolf-2015-16-sel-premium", 24.2, 83, "standard"],
    ["WVWKP7AU1GW903912", 2016, "egolf-2016-se", 24.2, 83, "none"],
    ["WVWKR7AU1HW953608", 2017, "egolf-2017-18-se", 35.8, 125, "none"],
    ["WVWPR7AU7HW950329", 2017, "egolf-2017-18-sel-premium", 35.8, 125, "standard"],
    ["WVWKR7AU0JW907497", 2018, "egolf-2017-18-se", 35.8, 125, "none"],
    ["WVWPR7AU0JW906999", 2018, "egolf-2017-18-sel-premium", 35.8, 125, "standard"],
    ["WVWMR7AU2JW908952", 2018, "egolf-2018-sel", 35.8, 125, undefined],
    ["WVWKR7AU2KW908796", 2019, "egolf-2019-se", 35.8, 125, "none"],
    ["WVWPR7AU3KW906447", 2019, "egolf-2019-sel-premium", 35.8, 125, "standard"],
  ];
  for (const [vin, year, id, kwh, mi, hp] of cases) {
    const r = matchEnrichment(vw(vin, year), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, kwh);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
    assert.equal(r.exact?.thermal?.heatPump?.value, hp);
    if (hp === undefined) assert.ok(r.exact?.abstains?.heatPump, `${vin} must declare its heat-pump silence`);
    assert.equal(r.exact?.warranty?.batteryYears?.value, 8);
    assert.equal(r.exact?.warranty?.batteryMiles?.value, 100_000);
  }
});

test("DC fast charging is standard or optional exactly where Volkswagen says it is", () => {
  const cases: [string, number, "standard" | "optional" | undefined][] = [
    ["WVWKP7AU6FW905671", 2015, "standard"], // CCS standard on both 2015 trims
    ["WVWPP7AU0FW908264", 2015, "standard"],
    ["WVWKP7AU1GW903912", 2016, "optional"], // the new SE: $1,675 package
    ["WVWPP7AU4GW915462", 2016, "standard"],
    ["WVWKR7AU1HW953608", 2017, "optional"], // "optional on SE, standard on SEL Premium"
    ["WVWPR7AU7HW950329", 2017, "standard"],
    ["WVWKR7AU0JW907497", 2018, "optional"],
    ["WVWMR7AU2JW908952", 2018, undefined], // the undocumented SEL abstains
    ["WVWKR7AU2KW908796", 2019, "standard"], // "New for the SE trim is a standard DC Fast Charger"
    ["WVWPR7AU3KW906447", 2019, "standard"],
  ];
  for (const [vin, year, want] of cases) {
    const r = matchEnrichment(vw(vin, year), null);
    assert.equal(r.exact?.charging?.dcFastCharging?.value, want, `${vin} (${year})`);
    if (want === undefined) assert.ok(r.exact?.abstains?.portStandard);
  }
});

test("a year typo cannot walk an e-Golf across the pack boundary", () => {
  // Position 5 is keyed as well as position 4 for exactly this: a 35.8 kWh
  // car filed as a 2016 must match nothing rather than be told it has
  // 24.2 kWh and 83 miles.
  const r = matchEnrichment(vw("WVWKR7AU2KW908796", 2016), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
  // And the other way: a 24.2 kWh car filed as a 2019.
  const back = matchEnrichment(vw("WVWKP7AU1GW903912", 2019), null);
  assert.equal(back.exact, undefined);
  assert.equal(back.candidates?.length ?? 0, 0);
});

test("the dealer's trim string cannot override an e-Golf VIN, and the feed's model spellings all match", () => {
  // Real feed values, including a wrong one: an SEL Premium VIN advertised
  // as "SE" must still read as the SEL Premium.
  for (const trim of ["SE", "HB SEL Premium", "SEL", undefined]) {
    const r = matchEnrichment(vw("WVWPR7AU3KW906447", 2019, "e-Golf", trim), null);
    assert.equal(r.exact?.id, "egolf-2019-sel-premium", `trim ${JSON.stringify(trim)}`);
  }
  for (const model of ["e-Golf", "eGolf", "E-GOLF"]) {
    assert.equal(matchEnrichment(vw("WVWKR7AU2KW908796", 2019, model), null).exact?.id, "egolf-2019-se");
  }
});

test("an e-Golf descriptor Volkswagen never filed matches none of these rows", () => {
  const r = matchEnrichment(vw("WVWZZ7AU2KW908796", 2019), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
});
