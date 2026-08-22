// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/low-miles-tile.test.ts
//
// "Low miles" is a claim that this car's odometer is a reason to buy it, and
// it only means anything on a used car — on a new one the reading is delivery
// and demo trips. The guard used to be `condition !== "new"`, which was
// exactly right while an unresolved condition was impossible: the platform
// extractors asserted "used" whenever their source field was absent or
// unrecognised, so every row had one. Now that they abstain instead
// (scraper/lib/condition.mjs), "not new" silently includes "we don't know",
// and a new car with 8 delivery miles would have collected the tile.
import test from "node:test";
import assert from "node:assert/strict";
import { listingTiles } from "../lib/listings/tiles";
import type { EnrichedListing } from "../lib/listings/enrich";

// The narrowest EnrichedListing that reaches the mileage branch: no
// enrichment facts, so nothing else can emit a tile.
function subject(condition: string | undefined, mileage: number): EnrichedListing {
  return {
    listing: { id: "x", vin: "1FT6W1EV1PWG00000", year: 2026, make: "Ford", model: "F-150 Lightning", priceUsd: 60000, condition, mileage },
    enrichment: {},
    fastCharge: { status: "unknown" },
  } as unknown as EnrichedListing;
}

const texts = (c: string | undefined, m: number) => listingTiles(subject(c, m)).map((t) => t.text);

test("a used car with few miles keeps the tile", () => {
  assert.ok(texts("used", 8000).includes("Low miles"));
  assert.ok(texts("certified", 8000).includes("Low miles"));
});

test("a new car never had it, and still doesn't", () => {
  assert.equal(texts("new", 8).includes("Low miles"), false);
});

test("a car whose condition nobody stated does not get it either", () => {
  // The regression this file exists for: 8 miles on a 2026 truck is not a
  // bargain to advertise, it is a car that has not been driven.
  assert.equal(texts(undefined, 8).includes("Low miles"), false);
  assert.equal(texts(undefined, 8000).includes("Low miles"), false);
});

test("high miles stays unconditional — it is a fact whatever the feed calls the car", () => {
  assert.ok(texts(undefined, 140000).includes("High miles"));
  assert.ok(texts("new", 140000).includes("High miles"));
  assert.ok(texts("used", 140000).includes("High miles"));
});
