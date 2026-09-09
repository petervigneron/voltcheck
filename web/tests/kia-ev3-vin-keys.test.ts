// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/kia-ev3-vin-keys.test.ts
//
// The 2027 Kia EV3 rows (lib/enrichment/data12.ts) are keyed on VIN
// positions 4-6, read off 1,253 live VINs on 2026-09-09. A VIN must resolve
// to exactly one row, the dealer's trim string must not be able to override
// what the VIN says, and a VIN outside the seven patterns must match no EV3
// row rather than a wrong one.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

// Real prefixes from the feed; the tail is filler that keeps the VIN 17 long.
const vin = (p4to8: string) => `3KM${p4to8}5SC000001`;
const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, make: "KIA", model: "EV3", modelYear: 2027, ...over });

test("each of the seven live VIN patterns resolves to its own row, with the pack and range Kia publishes for it", () => {
  const cases: [string, string, number, number][] = [
    ["DA3DB", "ev3-2027-light", 58.3, 221],
    ["DB4DA", "ev3-2027-fwd-long-range", 81.4, 321],
    ["DC4DA", "ev3-2027-fwd-long-range", 81.4, 321],
    ["DBDDC", "ev3-2027-awd", 81.4, 280],
    ["DCDDC", "ev3-2027-awd", 81.4, 280],
    ["DEDDC", "ev3-2027-awd", 81.4, 280],
    ["DADDC", "ev3-2027-awd", 81.4, 280],
  ];
  for (const [p, id, kwh, mi] of cases) {
    const r = matchEnrichment(decode({ vin: vin(p) }), null);
    assert.equal(r.exact?.id, id, `${p} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, kwh);
    // Kia's own figure, not an EPA rating: it lives in mfrRangeMi until
    // fueleconomy.gov carries the car.
    assert.equal(r.exact?.range?.mfrRangeMi?.value, mi);
    assert.equal(r.exact?.range?.epaRangeMi, undefined);
  }
});

test("the VIN wins over a dealer's trim string", () => {
  // A Wind FWD VIN advertised as "New 2027 Kia EV3" (a real feed value) or as "GT" still reads as the FWD long-range car.
  for (const trim of ["New 2027 Kia EV3", "GT", "InTransit"]) {
    const r = matchEnrichment(decode({ vin: vin("DB4DA"), trim }), null);
    assert.equal(r.exact?.id, "ev3-2027-fwd-long-range", `trim "${trim}"`);
  }
});

test("a VIN outside the seven patterns matches no EV3 row", () => {
  const r = matchEnrichment(decode({ vin: vin("DZ9DA") }), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
});

test("without a VIN, drivetrain narrows and nothing guesses: AWD is one row, FWD is two candidates, never a wrong number", () => {
  // The rows carry no trim list (data12.ts: the matcher applies trims before
  // VIN keys, and a junk dealer trim must not veto a VIN). So a VIN-less FWD
  // car cannot be told Light from Wind/Land and gets both as candidates —
  // the card shows a spread rather than one pack's figure.
  assert.equal(matchEnrichment(decode({ trim: "Wind", driveType: "AWD" }), null).exact?.id, "ev3-2027-awd");
  const fwd = matchEnrichment(decode({ trim: "Wind", driveType: "FWD" }), null);
  assert.equal(fwd.exact, undefined);
  assert.deepEqual((fwd.candidates ?? []).map((c) => c.id).sort(), ["ev3-2027-fwd-long-range", "ev3-2027-light"]);
});
