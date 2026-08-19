// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/price-floor.test.ts
//
// The year-aware junk-price floor. Dealer feeds intermittently publish a
// finance payment as the price of a used car — $1,493 on a 2023 Model Y,
// $1,150 on a 2023 EQE, $1,280 on a 2024 Wrangler 4xe, all live in
// production on 2026-08-19 — and the flat $1,000 used floor let every one
// of them render as the car's price and seed the comps pool. No 2020+ EV
// really asks under $5,000; old Leafs at real four-figure prices keep the
// low floor. Mirrored in scraper/lib/price-floor.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { hasRealPrice, priceCut } from "../lib/listings/price";
import type { Listing } from "../lib/listings/types";

test("a payment figure on a recent used EV is not a real price", () => {
  assert.equal(hasRealPrice({ priceUsd: 1493, condition: "used", year: 2023 }), false);
  assert.equal(hasRealPrice({ priceUsd: 1150, condition: "certified", year: 2023 }), false);
  assert.equal(hasRealPrice({ priceUsd: 1280, condition: "used", year: 2024 }), false);
});

test("an old used EV at a real four-figure price still renders", () => {
  assert.equal(hasRealPrice({ priceUsd: 4200, condition: "used", year: 2013 }), true);
});

test("a real recent used ask is untouched", () => {
  assert.equal(hasRealPrice({ priceUsd: 29943, condition: "used", year: 2023 }), true);
});

test("an unknown year keeps the conservative low floor", () => {
  // Year absence can't establish "recent"; the flat floor still applies.
  assert.equal(hasRealPrice({ priceUsd: 4200, condition: "used" }), true);
  assert.equal(hasRealPrice({ priceUsd: 900, condition: "used" }), false);
});

test("the abstain sentinel (0) never renders", () => {
  assert.equal(hasRealPrice({ priceUsd: 0, condition: "used", year: 2013 }), false);
});

const cutBase: Listing = {
  id: "x", vin: "X", year: 2023, make: "Tesla", model: "Model Y",
  priceUsd: 30000, sellerType: "dealer", condition: "used",
};

test("a recovery from an artifact dip is not a price cut", () => {
  // History said $1,996 (a payment misread) then the real $59,300 came back.
  // prev = artifact -> no cut may render off it.
  const l = { ...cutBase, priceUsd: 30000, prevPriceUsd: 1996, priceChangedAt: new Date().toISOString() };
  assert.equal(priceCut(l), null);
});

test("a real cut still renders", () => {
  const l = { ...cutBase, priceUsd: 29000, prevPriceUsd: 30000, priceChangedAt: new Date().toISOString() };
  assert.equal(priceCut(l)?.amountUsd, 1000);
});
