// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/tesla-early-s-x.test.ts
//
// The pre-2021 Tesla Model S/X rows (lib/enrichment/data14.ts) are keyed on
// VIN position 8 — Tesla's own motor/battery code — and on nothing else. The
// VINs below are real prefixes off the live feed on 2026-09-10. What must
// hold: position 8 picks the row, a dealer's trim string cannot move it, a
// position-8 code Tesla never used in that year matches nothing rather than a
// neighbouring row, a listing with no trim still lands on the right row, and
// the rows that abstain publish no pack and no range at all.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import { RESEARCH_ROWS_14 } from "@/lib/enrichment/data14";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode> & { vin: string; model: string; modelYear: number }): VinDecode => ({
  usMarket: true,
  make: "TESLA",
  ...over,
});

const ids = new Set(RESEARCH_ROWS_14.map((r) => r.id));

test("every live VIN pattern resolves to exactly one row", () => {
  // [real live VIN, feed model, model year, row id]
  const cases: [string, string, number, string][] = [
    ["5YJSA1DP5CFS00770", "Model S", 2012, "ms-2012-85"],
    ["5YJSA1DN3CFP02613", "Model S", 2012, "ms-2012-85"],
    ["5YJSA1CP0DFP13556", "Model S", 2013, "ms-2013-85"],
    ["5YJSA1CN2DFP04341", "Model S", 2013, "ms-2013-85"],
    ["5YJSA1CG0DFP27151", "Model S", 2013, "ms-2013-60"],
    ["5YJSA1AC3DFP10974", "Model S", 2013, "ms-2013-40"],
    ["5YJSA1H12EFP31904", "Model S", 2014, "ms-2014-rwd"],
    ["5YJSA1S19EFP52497", "Model S", 2014, "ms-2014-rwd"],
    ["5YJSA1H22EFP67441", "Model S", 2014, "ms-2014-awd"],
    ["5YJSA1E1XFF120119", "Model S", 2015, "ms-2015-rwd"],
    ["5YJSA1E29FF109539", "Model S", 2015, "ms-2015-dual"],
    ["5YJSA1H29FF094262", "Model S", 2015, "ms-2015-dual"],
    ["5YJSA1E46FF106406", "Model S", 2015, "ms-2015-dual-perf"],
    ["5YJSA1E13GF145381", "Model S", 2016, "ms-2016"],
    ["5YJSA1E21GF142553", "Model S", 2016, "ms-2016"],
    ["5YJSA1E45GF125840", "Model S", 2016, "ms-2016"],
    ["5YJSA1E12HF210772", "Model S", 2017, "ms-2017"],
    ["5YJSA1E4XHF170175", "Model S", 2017, "ms-2017"],
    ["5YJSA1E23JF269702", "Model S", 2018, "ms-2018-dual"],
    ["5YJSA1E42JF259504", "Model S", 2018, "ms-2018-perf"],
    ["5YJSA1E26LF411981", "Model S", 2020, "ms-2020-dual"],
    ["5YJSA1E48LF415788", "Model S", 2020, "ms-2020-perf"],
    ["5YJXCAE26GF024966", "Model X", 2016, "mx-2016"],
    ["5YJXCAE41GFS00937", "Model X", 2016, "mx-2016"],
    ["5YJXCBE25KF198168", "Model X", 2019, "mx-2019"],
    ["5YJXCAE42KF183090", "Model X", 2019, "mx-2019"],
    ["5YJXCAE22LF233020", "Model X", 2020, "mx-2020-dual"],
    ["5YJXCAE48LF233671", "Model X", 2020, "mx-2020-perf"],
  ];
  for (const [vin, model, modelYear, id] of cases) {
    const r = matchEnrichment(decode({ vin, model, modelYear }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? `no exact (${r.candidates?.length ?? 0} candidates)`}`);
  }
});

test("the figures a resolved row publishes are the ones EPA certified for that configuration", () => {
  // [VIN, model, year, gross kWh (undefined = abstained), EPA miles (undefined = abstained)]
  const cases: [string, string, number, number | undefined, number | undefined][] = [
    ["5YJSA1DP5CFS00770", "Model S", 2012, 85, 265],
    ["5YJSA1CP0DFP13556", "Model S", 2013, 85, 265],
    ["5YJSA1CG0DFP27151", "Model S", 2013, 60, 208],
    ["5YJSA1AC3DFP10974", "Model S", 2013, 40, 139],
    ["5YJSA1H22EFP67441", "Model S", 2014, 85, 242],
    ["5YJSA1E46FF106406", "Model S", 2015, undefined, 253],
    ["5YJSA1E42JF259504", "Model S", 2018, 100, 315],
    ["5YJSA1E26LF411981", "Model S", 2020, 100, undefined],
    ["5YJSA1E48LF415788", "Model S", 2020, 100, 348],
    ["5YJXCAE48LF233671", "Model X", 2020, undefined, 305],
  ];
  for (const [vin, model, modelYear, kwh, mi] of cases) {
    const row = matchEnrichment(decode({ vin, model, modelYear }), null).exact;
    assert.ok(row, `${vin} matched no row`);
    assert.equal(row.battery?.packGrossKwh?.value ?? row.battery?.packUsableKwh?.value, kwh, `${vin} pack`);
    assert.equal(row.range?.epaRangeMi?.value, mi, `${vin} range`);
  }
});

test("an abstaining row prints nothing rather than one version's figure, and says why", () => {
  // The 2018 dual-motor code covers the 75D (259 mi) and the 100D (335). The
  // row must publish neither, and must declare the silence rather than merely
  // be silent — scripts/enrichment-coverage.mjs reads `abstains`.
  const row = matchEnrichment(decode({ vin: "5YJSA1E23JF269702", model: "Model S", modelYear: 2018 }), null).exact;
  assert.equal(row?.id, "ms-2018-dual");
  assert.equal(row?.range?.epaRangeMi, undefined);
  assert.equal(row?.battery?.packGrossKwh, undefined);
  assert.equal(row?.battery?.packUsableKwh, undefined);
  assert.ok(row?.abstains?.epaRangeMi);
  assert.ok(row?.abstains?.packUsableKwh);
});

test("the VIN wins over the dealer's trim string", () => {
  // Real trim strings off these listings. A 2018 dual-motor VIN advertised as
  // "P100D" is still the dual-motor row: the P100D is VIN position 8 = 4 and
  // this car is a 2. None of these rows carries a trim key, so there is
  // nothing for a wrong trim to catch.
  for (const trim of ["P100D", "75D", "100D", "Used Model S 75D", "Long Range Plus", ""]) {
    const r = matchEnrichment(decode({ vin: "5YJSA1E23JF269702", model: "Model S", modelYear: 2018, trim }), null);
    assert.equal(r.exact?.id, "ms-2018-dual", `trim "${trim}"`);
  }
  // And the other way: a Performance VIN sold as a plain "75D" stays on the
  // Performance row, where the 100 kWh pack and 315 miles are true of it.
  const perf = matchEnrichment(
    decode({ vin: "5YJSA1E42JF259504", model: "Model S", modelYear: 2018, trim: "75D" }),
    null
  );
  assert.equal(perf.exact?.id, "ms-2018-perf");
  assert.equal(perf.exact?.range?.epaRangeMi?.value, 315);
});

test("a position-8 code Tesla did not use in that year matches none of these rows", () => {
  // 2013 knows P, N, G and C; 2014 and 2018 know 1, 2 and 4. A VIN carrying
  // anything else must fall through to nothing rather than to a neighbour.
  const misses: [string, string, number][] = [
    ["5YJSA1CK0DFP13556", "Model S", 2013], // position 8 = K, never filed
    ["5YJSA1CG0CFP27151", "Model S", 2012], // 60 kWh code, but Tesla shipped no MY2012 60
    ["5YJSA1E44JF259504", "Model S", 2018], // position 8 = 4 is Performance…
  ];
  assert.equal(matchEnrichment(decode({ vin: misses[0][0], model: "Model S", modelYear: 2013 }), null).exact, undefined);
  assert.equal(
    (matchEnrichment(decode({ vin: misses[0][0], model: "Model S", modelYear: 2013 }), null).candidates ?? []).length,
    0
  );
  assert.equal(matchEnrichment(decode({ vin: misses[1][0], model: "Model S", modelYear: 2012 }), null).exact, undefined);
  // …the third really is a Performance VIN (only its check digit differs), so
  // it must still resolve — this is the control that the two misses above
  // fail on their position-8 code and not on some unrelated filter.
  assert.equal(matchEnrichment(decode({ vin: misses[2][0], model: "Model S", modelYear: 2018 }), null).exact?.id, "ms-2018-perf");
});

test("a trimless listing lands on its own row, or on candidates, never on a wrong exact", () => {
  // Blank trims are 31 of the 102 live 2018 Model S listings and 23 of the 63
  // live 2016s. The VIN still resolves them.
  assert.equal(
    matchEnrichment(decode({ vin: "5YJSA1E23JF269702", model: "Model S", modelYear: 2018, trim: undefined }), null).exact?.id,
    "ms-2018-dual"
  );
  assert.equal(
    matchEnrichment(decode({ vin: "5YJSA1E28GF143120", model: "Model S", modelYear: 2016, trim: undefined }), null).exact?.id,
    "ms-2016"
  );
  // With no usable VIN at all — the feed carries placeholder ids — the 2018
  // rows cannot be told apart by anything, so the answer is candidates over
  // the year's rows and never one of their figures.
  const noVin = matchEnrichment(decode({ vin: "MODELS-2018-AWD", model: "Model S", modelYear: 2018, driveType: "AWD" }), null);
  assert.equal(noVin.exact, undefined);
  assert.deepEqual(new Set((noVin.candidates ?? []).map((c) => c.id)), new Set(["ms-2018-dual", "ms-2018-perf"]));
});

test("this file does not reach into the years data3 and data4 own", () => {
  // 2019 Model S and 2017-18 Model X belong to data3; 2021+ to data4.
  const others: [string, string, number, string][] = [
    ["5YJSA1E20KF999999", "Model S", 2019, "tesla-model-s-2019"],
    ["5YJXCAE20HF999999", "Model X", 2017, "tesla-model-x-2017"],
    ["5YJXCAE20JF999999", "Model X", 2018, "tesla-model-x-2018"],
  ];
  for (const [vin, model, modelYear, id] of others) {
    const r = matchEnrichment(decode({ vin, model, modelYear }), null);
    assert.equal(r.exact?.id, id, `${modelYear} ${model} → ${r.exact?.id ?? "no exact"}`);
    assert.ok(!ids.has(r.exact!.id));
  }
  for (const row of RESEARCH_ROWS_14) {
    assert.ok(row.modelYears[0] >= 2012 && row.modelYears[1] <= 2020, `${row.id} spans ${row.modelYears.join("-")}`);
    assert.ok(row.modelYears[1] !== 2019 || row.model === "Model X", `${row.id} must not cover the 2019 Model S`);
    assert.ok(
      !(row.model === "Model X" && (row.modelYears[0] === 2017 || row.modelYears[0] === 2018)),
      `${row.id} must not cover the 2017-18 Model X`
    );
  }
});

test("every row states Tesla's connector and a battery warranty, and none of them claims a capacity floor", () => {
  for (const row of RESEARCH_ROWS_14) {
    assert.equal(row.charging?.portStandard?.value, "NACS", row.id);
    assert.equal(row.warranty?.batteryYears?.value, 8, row.id);
    assert.equal(row.thermal?.heatPump?.value, "none", row.id);
    // Pre-2020 Model S/X have no capacity-retention guarantee at all: Tesla's
    // own document says loss of battery energy over time is not covered.
    assert.equal(row.warranty?.sohFloorPct, undefined, row.id);
    // And the drive-unit line must be the row's own, not backfill.ts's
    // "8 yr / 150,000 mi", which is the post-January-2020 term.
    assert.ok(row.warranty?.powertrainTerms?.value, row.id);
    assert.ok(!/150,000/.test(row.warranty!.powertrainTerms!.value), `${row.id} carries the post-2020 mileage cap`);
  }
});

test("the drive-unit term survives the match-time backfill", () => {
  // backfill.ts fills powertrainTerms for any row that lacks it, and its
  // Tesla branch writes 150,000 miles for every Model S/X. These rows set the
  // field themselves precisely so that does not happen.
  const row = matchEnrichment(decode({ vin: "5YJSA1CP0DFP13556", model: "Model S", modelYear: 2013 }), null).exact;
  assert.equal(row?.warranty?.powertrainTerms?.value, "Electric drive: 8 yr, no mileage cap");
});
