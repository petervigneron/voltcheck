// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/price-floor.test.ts
//
// The year-aware junk-price floor. Dealer feeds intermittently publish a
// finance payment as the price of a used car — $1,493 on a 2023 Model Y,
// $1,150 on a 2023 EQE, $1,280 on a 2024 Wrangler 4xe, all live in
// production on 2026-08-19 — and the flat $1,000 used floor let every one
// of them render as the car's price and seed the comps pool. The used floor
// is tiered by model year (2020+ / 2018–2019 / older), cut where live data
// separates real asks from payments; old Leafs at real four-figure prices
// keep the low floor. Mirrored in scraper/lib/price-floor.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { hasRealPrice, priceCut } from "../lib/listings/price";
import type { Listing } from "../lib/listings/types";

test("a payment figure on a recent used EV is not a real price", () => {
  assert.equal(hasRealPrice({ priceUsd: 1493, condition: "used", year: 2023 }), false);
  assert.equal(hasRealPrice({ priceUsd: 1150, condition: "certified", year: 2023 }), false);
  assert.equal(hasRealPrice({ priceUsd: 1280, condition: "used", year: 2024 }), false);
});

test("the three 2026-08-20 false bargains abstain", () => {
  // A 2026 Mach-E with no condition set (dodged the new floor) at a $5,500
  // payment; a 2024 Rolls-Royce Spectre CPO at a $5,399 payment; a 2019
  // Model X at its $1,990/mo subscription price.
  assert.equal(hasRealPrice({ priceUsd: 5500, year: 2026 }), false);
  assert.equal(hasRealPrice({ priceUsd: 5399, condition: "certified", year: 2024 }), false);
  assert.equal(hasRealPrice({ priceUsd: 1990, condition: "used", year: 2019 }), false);
});

test("real cheap cars just above each tier still render", () => {
  // 2020+ floor $7,000: a high-mileage 2022 Mirai at $8,795.
  assert.equal(hasRealPrice({ priceUsd: 8795, condition: "used", year: 2022 }), true);
  // 2018–2019 floor $4,000: a 2018 Mirai at $5,995, a 2019 Leaf at $6,999.
  assert.equal(hasRealPrice({ priceUsd: 5995, condition: "used", year: 2018 }), true);
  assert.equal(hasRealPrice({ priceUsd: 6999, condition: "used", year: 2019 }), true);
});

test("an old used EV at a real four-figure price still renders", () => {
  assert.equal(hasRealPrice({ priceUsd: 4200, condition: "used", year: 2013 }), true);
  // A certified 2012 Leaf at $5,999 is old, not recent — keeps the low floor.
  assert.equal(hasRealPrice({ priceUsd: 5999, condition: "certified", year: 2012 }), true);
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
