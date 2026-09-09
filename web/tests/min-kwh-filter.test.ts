// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/min-kwh-filter.test.ts
//
// ?minKwh=N is a floor on usable pack size (2026-09-09, for the Pro standing
// order). Like minRange, a car whose pack is unknown FAILS the floor rather
// than being assumed to clear it — the alert must never mail a car on a
// pack it cannot vouch for.
import test from "node:test";
import assert from "node:assert/strict";
import { buildTests, rowMatches, QUICK_KNOWS } from "@/lib/listings/match";
import type { CardRow } from "@/lib/listings/card";
import { describeFilter } from "@/lib/filters";

const row = (over: Partial<CardRow>): CardRow => ({
  id: "x", hay: "", year: 2023, make: "Hyundai", model: "IONIQ 5", title: "", priceUsd: 30000, realPrice: true, tiles: [], ...over,
});

test("minKwh keeps the big pack, drops the small one and the unknown one", () => {
  const tests = buildTests((k) => (k === "minKwh" ? "77" : ""));
  assert.ok(rowMatches(tests, row({ kwh: 77 })));
  assert.ok(rowMatches(tests, row({ kwh: 84 })));
  assert.equal(rowMatches(tests, row({ kwh: 58 })), false);
  assert.equal(rowMatches(tests, row({})), false);
  assert.equal(QUICK_KNOWS.minKwh!(row({})), false);
  assert.equal(QUICK_KNOWS.minKwh!(row({ kwh: 58 })), true);
  assert.equal(describeFilter("minKwh", "77"), "77+ kWh");
});

test("minRange behaves the same way, so the two floors read alike", () => {
  const tests = buildTests((k) => (k === "minRange" ? "250" : ""));
  assert.ok(rowMatches(tests, row({ rangeMi: 303 })));
  assert.equal(rowMatches(tests, row({ rangeMi: 220 })), false);
  assert.equal(rowMatches(tests, row({})), false);
});
