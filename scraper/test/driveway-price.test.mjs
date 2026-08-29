// node --test scraper/test/driveway-price.test.mjs
//
// Driveway's locator lane takes the served `price` straight through. It also
// asks for `msrp` in the same GraphQL selection and used to ignore it, so
// nothing anchored the number: a 2026 BMW M5 Touring with 971 miles was live
// at $18,998 on 2026-08-29, roughly a seventh of that car's price, and the
// global floor could not object because $18,998 is a plausible price for SOME
// car. Half of MSRP is the same test the dealer.com and DealerOn resolvers use.
import test from "node:test";
import assert from "node:assert/strict";
import { toRecord } from "../lib/oem/driveway.mjs";

const node = (over = {}) =>
  toRecord({
    vehicleId: "86348778",
    vin: "WBS83GV00TCW91022",
    fuel: "PHEV",
    condition: "used",
    mileage: 971,
    ymmt: { year: 2026, make: "BMW", model: "M5", trim: "Touring" },
    dealership: { state: "NJ" },
    ...over,
  });

test("a price under half of MSRP abstains rather than printing a false bargain", () => {
  const got = node({ price: 18998, msrp: 125000 });
  // The record must still EXIST — this is an abstain, not a dropped car. An
  // earlier version of this test asserted only notEqual and passed against a
  // null record, which would have hidden the guard failing open.
  assert.ok(got, "record should still be produced");
  assert.equal(got.priceUsd, undefined);
});

test("a real Driveway ask under MSRP is untouched", () => {
  const got = node({ price: 108500, msrp: 125000 });
  assert.equal(got?.priceUsd, 108500);
});

test("with no MSRP served, the advertised price still stands", () => {
  // Most used inventory has no sticker to anchor on; the guard must not cost
  // coverage where it cannot judge.
  const got = node({ price: 18998, msrp: null });
  assert.equal(got?.priceUsd, 18998);
});
