// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/warranty.test.ts
//
// The asymmetry is the whole test suite. Calling a live warranty dead costs a
// shopper a car; calling a dead one live costs them a battery pack. So every
// case here that sits between the two in-service bounds must come back
// "unknown", and none of them may come back "active".
import test from "node:test";
import assert from "node:assert/strict";
import { batteryWarranty } from "@/lib/listings/warranty";
import type { EnrichmentRow } from "@/lib/types";

const f = <T,>(value: T) => ({ value, source: "mfr" as const, asOf: "2026-01-01", confidence: "high" as const });

const row = (years: number, miles: number): EnrichmentRow =>
  ({ id: "x", make: "X", model: "Y", modelYears: [2017, 2019], warranty: { batteryYears: f(years), batteryMiles: f(miles) } }) as EnrichmentRow;

const NOW = new Date("2026-08-17T00:00:00Z");

test("past the mileage limit is expired, whatever the clock says", () => {
  const w = batteryWarranty(row(8, 100_000), { year: 2017, mileage: 137_703 }, NOW);
  assert.equal(w.state, "expired");
  assert.match(w.state === "expired" ? w.why : "", /137,703 mi is past the 100,000 mi limit/);
});

test("expired on time once even the latest in-service date has run out", () => {
  // MY2014 + 1 (leftover new stock) + 8 = 2023, and it is 2026.
  const w = batteryWarranty(row(8, 100_000), { year: 2014, mileage: 60_000 }, NOW);
  assert.equal(w.state, "expired");
});

test("in force only when the earliest in-service date is still covered", () => {
  // MY2024 - 1 + 10 = 2033.
  const w = batteryWarranty(row(10, 100_000), { year: 2024, mileage: 20_000 }, NOW);
  assert.equal(w.state, "active");
  assert.match(w.state === "active" ? w.why : "", /80,000 mi left/);
});

test("the ambiguous years between the two bounds stay unknown", () => {
  // MY2017 + 8: in service in 2016 it died in 2024, in service in 2018 it
  // lives to 2026. Under the mileage limit, so miles cannot settle it either.
  const w = batteryWarranty(row(8, 100_000), { year: 2017, mileage: 50_000 }, NOW);
  assert.equal(w.state, "unknown");
});

test("no odometer cannot produce an in-force claim", () => {
  const w = batteryWarranty(row(10, 100_000), { year: 2024, mileage: undefined }, NOW);
  assert.equal(w.state, "unknown");
});

test("no odometer can still produce an expiry, on time alone", () => {
  const w = batteryWarranty(row(8, 100_000), { year: 2012, mileage: undefined }, NOW);
  assert.equal(w.state, "expired");
});

test("a cohort with no warranty terms says nothing", () => {
  const bare = { id: "x", make: "X", model: "Y", modelYears: [2020, 2020] } as EnrichmentRow;
  assert.equal(batteryWarranty(bare, { year: 2020, mileage: 10 }, NOW).state, "unknown");
  assert.equal(batteryWarranty(undefined, { year: 2020, mileage: 10 }, NOW).state, "unknown");
});
