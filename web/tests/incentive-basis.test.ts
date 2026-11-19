// lib/listings/incentiveBasis.ts: the incentive flag answers only for the price
// it was judged on, and only on a new car.
import { test } from "node:test";
import assert from "node:assert/strict";
import { incentiveBasis, stickerOf } from "../lib/listings/incentiveBasis";

const base = { priceUsd: 50412, condition: "new" as const, msrpUsd: 55840 };

test("a flag judged on this price answers", () => {
  assert.equal(incentiveBasis({ ...base, priceBeforeIncentives: false, priceBeforeIncentivesUsd: 50412 }), false);
  assert.equal(incentiveBasis({ ...base, priceUsd: 54912, priceBeforeIncentives: true, priceBeforeIncentivesUsd: 54912 }), true);
});

test("a flag judged on another price says nothing (recheck or 0103 moved priceUsd)", () => {
  assert.equal(incentiveBasis({ ...base, priceUsd: 54912, priceBeforeIncentives: false, priceBeforeIncentivesUsd: 50412 }), undefined);
  assert.equal(incentiveBasis({ ...base, priceBeforeIncentives: true }), undefined);
});

test("no flag, no price, or not new: no answer", () => {
  assert.equal(incentiveBasis(base), undefined);
  assert.equal(incentiveBasis({ ...base, priceUsd: 0, priceBeforeIncentives: true, priceBeforeIncentivesUsd: 0 }), undefined);
  assert.equal(incentiveBasis({ ...base, condition: "used", priceBeforeIncentives: true, priceBeforeIncentivesUsd: 50412 }), undefined);
});

test("the sticker is read only on a new car", () => {
  assert.equal(stickerOf(base), 55840);
  assert.equal(stickerOf({ ...base, condition: "used" }), undefined);
  assert.equal(stickerOf({ ...base, msrpUsd: undefined }), undefined);
});
