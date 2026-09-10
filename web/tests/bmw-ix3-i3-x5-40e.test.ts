// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/bmw-ix3-i3-x5-40e.test.ts
//
// The rows in lib/enrichment/data18.ts are keyed on the VIN descriptor, not
// on what a dealer typed. Three things have to hold, and each one is a real
// failure this corpus has seen elsewhere:
//
//   - a range-extender i3 must never reach a battery-electric i3's row (153
//     miles printed on a car EPA rates at 126), and the feed's own model and
//     trim strings cannot be trusted to prevent it — WBY7Z4C5X... is filed as
//     "i3 with Range Extender" and WBY7Z4C58... as plain "i3" with trim
//     "94 Ah", same pattern, same car;
//   - the bare model string "X5" must reach the plug-in row for a 5UXKT0C VIN
//     and nothing else, since a petrol X5 shares the nameplate;
//   - the 2027 iX3 row must not answer for an iX3 outside its descriptor,
//     because BMW has announced a second iX3 (the "40") that will not share
//     the 50 xDrive's 383 miles.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, make: "BMW", model: "i3", modelYear: 2018, ...over });

// Real live VIN prefixes; the tail is filler that keeps the VIN 17 long.
const i3vin = (p4to6: string, year: string) => `WBY${p4to6}C58${year}V000001`;

test("every live i3 VIN pattern lands on the row for its pack, its year and its range extender", () => {
  const cases: [string, string, number, string, number][] = [
    // pattern, year code, model year, expected row id, expected electric range
    ["1Z2", "E", 2014, "i3-60ah-bev-2014-16", 81],
    ["1Z4", "F", 2015, "i3-60ah-rex-2014-16", 72],
    ["1Z4", "G", 2016, "i3-60ah-rex-2014-16", 72],
    ["1Z6", "H", 2017, "i3-94ah-bev-2017", 114],
    ["1Z8", "H", 2017, "i3-94ah-rex-2017", 97],
    ["7Z2", "J", 2018, "i3-94ah-bev-2018", 114],
    ["7Z6", "J", 2018, "i3s-94ah-bev-2018", 107],
    ["7Z4", "J", 2018, "i3-94ah-rex-2018", 97],
    ["7Z8", "J", 2018, "i3-94ah-rex-2018", 97],
    ["8P2", "K", 2019, "i3-120ah-bev-2019", 153],
    ["8P6", "K", 2019, "i3-120ah-bev-2019", 153],
    ["8P8", "K", 2019, "i3-120ah-rex-2019", 126],
    ["8P2", "L", 2020, "i3-120ah-bev-2020-21", 153],
    ["8P4", "L", 2020, "i3-120ah-rex-2020-21", 126],
    ["8P8", "M", 2021, "i3-120ah-rex-2020-21", 126],
  ];
  for (const [p, yc, year, id, mi] of cases) {
    const r = matchEnrichment(decode({ vin: i3vin(p, yc), modelYear: year }), null);
    assert.equal(r.exact?.id, id, `${p}/${year} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi, `${p}/${year} range`);
  }
});

test("a range-extender VIN never picks up a battery-electric row, whatever the dealer filed it as", () => {
  // Both of these are real feed records for the same VIN pattern: one dealer
  // named the range extender, the other did not.
  for (const [model, trim] of [
    ["i3 with Range Extender", "94Ah"],
    ["i3", "94 Ah"],
    ["i3", undefined],
    ["i3s", "S"],
  ] as [string, string | undefined][]) {
    const r = matchEnrichment(decode({ vin: i3vin("7Z4", "J"), model, trim }), null);
    assert.equal(r.exact?.id, "i3-94ah-rex-2018", `model "${model}" trim "${trim}"`);
    assert.equal(r.exact?.plugIn, true);
    assert.equal(r.exact?.range?.epaRangeTotalMi?.value, 180);
  }
});

test("the VIN outranks the dealer's trim, including trims that name another version", () => {
  // Live feed values on 2026-09-10: "HB", "3-Series", "Used 2016 BMW i3",
  // "120Ah 120 Ah". None of them may move the answer.
  for (const trim of ["HB", "3-Series", "Used 2016 BMW i3", "120Ah 120 Ah", "S", "Range Extender"]) {
    const r = matchEnrichment(decode({ vin: i3vin("1Z2", "E"), modelYear: 2014, trim }), null);
    assert.equal(r.exact?.id, "i3-60ah-bev-2014-16", `trim "${trim}"`);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, 22);
  }
});

test("the i3's battery warranty follows the model year BMW's booklet gives, not the pack", () => {
  // Same 120 Ah car, same 153 miles; BMW cut the defect term at MY2020.
  const y2019 = matchEnrichment(decode({ vin: i3vin("8P2", "K"), modelYear: 2019 }), null).exact;
  const y2020 = matchEnrichment(decode({ vin: i3vin("8P2", "L"), modelYear: 2020 }), null).exact;
  assert.equal(y2019?.warranty?.batteryMiles?.value, 100_000);
  assert.equal(y2020?.warranty?.batteryMiles?.value, 80_000);
  assert.equal(y2019?.range?.epaRangeMi?.value, y2020?.range?.epaRangeMi?.value);
});

test("an i3 VIN outside the researched descriptors matches none of these rows", () => {
  const r = matchEnrichment(decode({ vin: i3vin("5X1", "J"), modelYear: 2018 }), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
});

test("with no usable VIN an i3 gets the versions it could be, never one version's numbers", () => {
  // A placeholder id (not 17 characters, or carrying I/O/Q) disables every
  // VIN-position filter in the matcher, so the three 2018 rows stand as
  // candidates and the card shows a spread instead of picking one.
  for (const id of [undefined, "I3-2018-REX"]) {
    const r = matchEnrichment(decode({ vin: id, modelYear: 2018 }), null);
    assert.equal(r.exact, undefined, `vin ${id}`);
    assert.deepEqual(
      (r.candidates ?? []).map((c) => c.id).sort(),
      ["i3-94ah-bev-2018", "i3-94ah-rex-2018", "i3s-94ah-bev-2018"]
    );
  }
});

test("a 5UXKT0C VIN reaches the xDrive40e row under every model string the feed uses, trim or no trim", () => {
  for (const [model, trim] of [
    ["X5", "xDrive40e"],
    ["X5", "xDrive40e iPerformance"],
    ["X5", "eDrive"],
    ["X5", undefined], // 5UXKT0C37H0V97616 — a real live listing with no trim
    ["X5 xDrive40e", undefined],
    ["X5 eDrive", "xDrive40e"],
    ["X5 xDrive40e iPerformance", "xDrive40e iPerformance"],
  ] as [string, string | undefined][]) {
    const r = matchEnrichment(decode({ vin: "5UXKT0C58G0S00001", make: "BMW", model, modelYear: 2016, trim, driveType: "AWD" }), null);
    assert.equal(r.exact?.id, "x5-40e-2016-18", `model "${model}" trim "${trim}"`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, 14);
    assert.equal(r.exact?.warranty?.batteryMiles?.value, 80_000);
  }
});

test("a petrol X5's VIN cannot reach the plug-in row even when the year and model line up", () => {
  // 5UXKR0C is the xDrive35i of the same generation.
  const r = matchEnrichment(decode({ vin: "5UXKR0C58G0L00001", make: "BMW", model: "X5", modelYear: 2016, driveType: "AWD" }), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
});

test("the 2027 iX3 row carries the standard-wheel EPA figure and only answers for the 50 xDrive's descriptor", () => {
  const r = matchEnrichment(decode({ vin: "WBX33HR00VDA60890", make: "BMW", model: "iX3", modelYear: 2027, trim: "50 xDrive", driveType: "AWD" }), null);
  assert.equal(r.exact?.id, "ix3-2027-50-xdrive");
  // BMW's headline is 434 (20-inch summer tires, a no-cost option). The row
  // publishes the standard 20-inch all-season figure.
  assert.equal(r.exact?.range?.epaRangeMi?.value, 383);
  assert.equal(r.exact?.charging?.portStandard?.value, "NACS");
  assert.equal(r.exact?.battery?.packUsableKwh?.value, 112.2);

  // A dealer writing nothing in the trim field changes nothing.
  assert.equal(matchEnrichment(decode({ vin: "WBX33HR0XVDA44258", model: "iX3", modelYear: 2027 }), null).exact?.id, "ix3-2027-50-xdrive");

  // A different iX3 descriptor — the announced "40" will be one — matches nothing.
  assert.equal(matchEnrichment(decode({ vin: "WBX31HR00VDA00001", model: "iX3", modelYear: 2027 }), null).exact, undefined);
});

test("no i3 row answers for the Neue Klasse i3, which is a different car", () => {
  const r = matchEnrichment(decode({ vin: "WBY8P2C04V7G00001", model: "i3", modelYear: 2027 }), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
});
