// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/mini-se-and-2027-extensions.test.ts
//
// The MINI rows in lib/enrichment/data20.ts answer to model strings a PETROL
// MINI also wears ("Hardtop 2 Door", "Hardtop", "Cooper", "Countryman"), so
// every one of them is keyed on the vehicle descriptor and none carries a
// trim list. What that has to buy is pinned here: a real live VIN reaches its
// own row, a dealer trim cannot move it, a petrol MINI's VIN reaches nothing,
// and the MY2018-23 plug-in Countryman rows in data6 are not disturbed.
//
// The 2027 C-HR rows are the other shape — one base row plus a row per grade,
// because Toyota rates the SE and the XSE differently and nothing in the VIN
// separates them. A trimless 2027 C-HR must land on the base row and be shown
// no range at all.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const d = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });

test("every live MINI Cooper SE hardtop VIN pattern reaches the row for its pack, rating and port", () => {
  // Real VINs from the live feed (2026-09-10).
  const cases: [string, number, string, number, number][] = [
    ["WMWXP3C09M2P24459", 2021, "mini-cooper-se-2021", 110, 32.6],
    ["WMW13DJ00N2S09734", 2022, "mini-cooper-se-2022-24", 114, 32.64],
    ["WMW13DJ08P2T36718", 2023, "mini-cooper-se-2022-24", 114, 32.64],
    ["WMW13DJ00R2U78967", 2024, "mini-cooper-se-2022-24", 114, 32.64],
  ];
  for (const [vin, year, id, mi, kwh] of cases) {
    const r = matchEnrichment(d({ vin, make: "MINI", model: "Hardtop 2 Door", modelYear: year }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, kwh);
    assert.equal(r.exact?.charging?.portStandard?.value, "CCS1");
  }
});

test("all ten model strings the feed files a Cooper SE under reach the same row", () => {
  const strings = [
    "Hardtop 2 Door",
    "HARDTOP 2 DOOR",
    "Electric Hardtop 2 Door",
    "Cooper SE Electric",
    "Cooper SE",
    "Cooper SE Hardtop 2 Door",
    "Cooper SE Hardtop 2 Door Signature",
    "Hardtop",
    "Cooper",
    "Electric hatch",
  ];
  for (const model of strings) {
    const r = matchEnrichment(d({ vin: "WMW13DJ00R2U78967", make: "MINI", model, modelYear: 2024 }), null);
    assert.equal(r.exact?.id, "mini-cooper-se-2022-24", `model "${model}"`);
  }
});

test("a petrol MINI never reaches an electric row, whatever the feed calls it", () => {
  // Descriptors read off the vPIC decode cache: WMWZB3C5 decodes Series
  // "Cooper", Gasoline; WMWSV3C5 Series "Cooper S", Gasoline; WMZ53BR0 is the
  // petrol Countryman S. None of them starts with an electric row's key.
  for (const [vin, model, year] of [
    ["WMWZB3C54CWM04220", "Cooper", 2024],
    ["WMWSV3C59DT477353", "Hardtop 2 Door", 2024],
    ["WMZ53BR0XR3R65861", "Countryman", 2025],
  ] as [string, string, number][]) {
    const r = matchEnrichment(d({ vin, make: "MINI", model, modelYear: year }), null);
    assert.equal(r.exact, undefined, `${vin} → ${r.exact?.id ?? "nothing"}`);
    assert.equal(r.candidates?.length ?? 0, 0);
  }
});

test("the dealer's trim string cannot move a MINI off the row its VIN names", () => {
  // Real trim values from the feed, including the junk ones.
  for (const trim of ["Cooper", "Cooper SE", "Signature", "Iconic", ".", "SE Electric", ""]) {
    const r = matchEnrichment(d({ vin: "WMW13DJ00R2U78967", make: "MINI", model: "Cooper", modelYear: 2024, trim }), null);
    assert.equal(r.exact?.id, "mini-cooper-se-2022-24", `trim "${trim}"`);
  }
});

test("the one live MINI whose VIN vPIC cannot decode matches nothing rather than borrowing a row", () => {
  // WMW12DJ0802R21839, filed as a 2021 "Electric hatch"; vPIC answers an
  // empty record and the descriptor matches neither hardtop key.
  const r = matchEnrichment(d({ vin: "WMW12DJ0802R21839", make: "MINI", model: "Electric hatch", modelYear: 2021 }), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
});

test("the electric Countryman splits at MY2027, where both the descriptor and the rating change", () => {
  const cases: [string, number, string, number][] = [
    ["WMZ53GA00S7R80490", 2025, "mini-countryman-se-2025-26", 212],
    ["WMZ53GA09T7U69670", 2026, "mini-countryman-se-2025-26", 212],
    ["WMZ13HP01V7W60448", 2027, "mini-countryman-se-2027", 216],
  ];
  for (const [vin, year, id, mi] of cases) {
    for (const model of ["Countryman", "Cooper Countryman", "Cooper SE Countryman", "SE Countryman", "Cooper Countryman SE"]) {
      const r = matchEnrichment(d({ vin, make: "MINI", model, modelYear: year }), null);
      assert.equal(r.exact?.id, id, `${vin} as "${model}" → ${r.exact?.id ?? "no exact"}`);
      assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
      assert.equal(r.exact?.battery?.packUsableKwh?.value, 64.7);
    }
  }
});

test("the MY2018-23 plug-in Countryman is left alone", () => {
  // A real PHEV VIN (WMZ23BS0 descriptor, vPIC: PHEV) under the plug-in's own
  // model string still reaches data6's row, and no data20 row claims it.
  const r = matchEnrichment(
    d({ vin: "WMZ23BS05P3R89494", make: "MINI", model: "Cooper SE Countryman ALL4", modelYear: 2023, trim: "Cooper SE" }),
    null
  );
  assert.equal(r.exact?.id, "mini-countryman-phev-2020-23");
});

test("a 2027 C-HR gets its own grade's range, and a trimless one gets none", () => {
  const chr = (over: Partial<VinDecode>) =>
    matchEnrichment(d({ make: "TOYOTA", model: "C-HR", modelYear: 2027, driveType: "AWD", ...over }), null);

  const se = chr({ vin: "JTMAAAAD0VJ028567", trim: "SE" });
  assert.equal(se.exact?.id, "chr-bev-2027-se");
  assert.equal(se.exact?.range?.epaRangeMi?.value, 287);

  const xse = chr({ vin: "JTMAAAAD2V136BB44", trim: "XSE" });
  assert.equal(xse.exact?.id, "chr-bev-2027-xse");
  assert.equal(xse.exact?.range?.epaRangeMi?.value, 273);

  const bare = chr({ vin: "JTMAAAAD4VJ028295" });
  assert.equal(bare.exact?.id, "chr-bev-2027");
  assert.equal(bare.exact?.range?.epaRangeMi, undefined);
  assert.match(bare.exact?.abstains?.epaRangeMi ?? "", /XSE/);
  // Everything the grades share is still on the base row.
  assert.equal(bare.exact?.battery?.packGrossKwh?.value, 74.7);
  assert.equal(bare.exact?.charging?.portStandard?.value, "NACS");
  assert.equal(bare.exact?.warranty?.batteryMiles?.value, 100_000);
});

test("the 2027 rows do not reach into the 2026 C-HR data4 owns", () => {
  const r = matchEnrichment(d({ vin: "JTMAAAAD0TJ023964", make: "TOYOTA", model: "C-HR", modelYear: 2026, trim: "SE", driveType: "AWD" }), null);
  assert.equal(r.exact?.id, "chr-bev-2026");
});
