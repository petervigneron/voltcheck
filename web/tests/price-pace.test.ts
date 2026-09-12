// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/price-pace.test.ts
//
// The Pro block that says how long a car has sat and what the seller did
// about it (lib/listings/pace.ts, migration 0084). Everything here is about
// what does NOT count as a price cut, because that is where the false claim
// lives: counted naively, our own nightly-vs-recheck disagreement read as
// three Toyota stores marking down 100% of their inventory (0084's header has
// the VIN and the measurement).
import test from "node:test";
import assert from "node:assert/strict";
import { daysListed, listingCuts, pricePaceTiles } from "../lib/listings/pace";

const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`;
const series = (...prices: number[]) => prices.map((priceUsd, i) => ({ priceUsd, observedAt: at(i + 1) }));

test("no series, or one point, is no claim", () => {
  assert.equal(listingCuts(undefined), undefined);
  assert.equal(listingCuts([]), undefined);
  assert.equal(listingCuts(series(42_000)), undefined);
});

test("a plain markdown counts once, for what came off", () => {
  assert.deepEqual(listingCuts(series(42_000, 40_000)), { count: 1, totalUsd: 2_000 });
});

test("two markdowns count twice and sum", () => {
  assert.deepEqual(listingCuts(series(50_000, 48_000, 46_000)), { count: 2, totalUsd: 4_000 });
});

test("a move under $500 is not a cut", () => {
  // PRICE_CUT_MIN_USD. Below it, a "cut" chip teaches the shopper nothing and
  // is indistinguishable from two of our lanes rounding differently.
  assert.equal(listingCuts(series(42_000, 41_600)), undefined);
  assert.deepEqual(listingCuts(series(42_000, 41_500)), { count: 1, totalUsd: 500 });
});

test("the nightly-vs-recheck flap is not a markdown", () => {
  // JTDACACU1V3085369, keyestoyota.com: $44,853 and $44,768 alternating, same
  // domain and same provenance on every row, so listing_price_display's own
  // guards pass all of them. Counted raw this is seven cuts.
  const flap = series(44_768, 44_853, 44_768, 44_853, 44_768, 44_853, 44_768);
  assert.equal(listingCuts(flap), undefined);
});

test("a return to a price already seen is not a second cut", () => {
  // Big enough to clear $500 both ways, so only the new-low rule can catch
  // it: the price has been at 45,000 before, so coming back is not a cut.
  assert.deepEqual(listingCuts(series(50_000, 45_000, 50_000, 45_000)), { count: 1, totalUsd: 5_000 });
});

test("a cut that does not clear the earlier low is not counted", () => {
  // 50,000 -> 47,000 (a cut) -> 49,000 (a raise) -> 47,500. The last step is
  // down and over $500, but the car has asked less than that already. The
  // first cut still stands, which is the one the median's clock uses.
  assert.deepEqual(listingCuts(series(50_000, 47_000, 49_000, 47_500)), { count: 1, totalUsd: 3_000 });
});

test("a rising price is never a cut", () => {
  assert.equal(listingCuts(series(40_000, 43_000, 46_000)), undefined);
});

test("days listed counts whole days and never goes negative", () => {
  const now = Date.parse("2026-09-12T18:00:00Z");
  assert.equal(daysListed("2026-09-12", now), 0);
  assert.equal(daysListed("2026-09-11", now), 1);
  assert.equal(daysListed("2026-08-20", now), 23);
  assert.equal(daysListed("2026-09-30", now), 0);
});

const texts = (input: Parameters<typeof pricePaceTiles>[0]) => pricePaceTiles(input).map((t) => t.text);

test("nothing to say prints nothing", () => {
  assert.deepEqual(pricePaceTiles({}), []);
  // A listing whose price never moved, at a seller too small to read.
  assert.deepEqual(pricePaceTiles({ history: series(42_000, 42_000) }), []);
});

test("a car with no defensible listing date loses only that tile", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  assert.deepEqual(texts({ history: series(42_000, 40_000), now }), ["−$2,000"]);
  assert.deepEqual(texts({ listedOn: "2026-09-05", history: series(42_000, 40_000), now }), [
    "7 days listed",
    "−$2,000",
  ]);
});

test("one cut says the amount; several say how many", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  assert.deepEqual(texts({ history: series(50_000, 48_000, 46_000), now }), ["−$4,000 in 2 cuts"]);
});

test("the seller's habit is marked est, and its median waits for five cars", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  const dealer = { listingsN: 258, cutN: 67, cutShare: 0.2597, datedN: 19, medianDaysToCut: 5.4 };
  assert.deepEqual(texts({ dealer, now }), ["26% of this seller's EVs cut est", "First cut at 5 days est"]);
  // dated_n under the floor: the view ships median_days_to_cut null, and the
  // share still prints. A median of three cars is one car's story.
  assert.deepEqual(texts({ dealer: { ...dealer, datedN: 1, medianDaysToCut: null }, now }), [
    "26% of this seller's EVs cut est",
  ]);
});

test("a seller that cuts nothing says so; a seller too small says nothing", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  assert.deepEqual(texts({ dealer: { listingsN: 97, cutN: 0, cutShare: 0, datedN: 0, medianDaysToCut: null }, now }), [
    "0% of this seller's EVs cut est",
  ]);
  // Under MIN_DEALER_LISTINGS the view holds no row at all; this is the belt
  // for a hand-built one.
  assert.deepEqual(texts({ dealer: { listingsN: 7, cutN: 4, cutShare: 0.5714, datedN: 0, medianDaysToCut: null }, now }), []);
  assert.deepEqual(texts({ dealer: null, now }), []);
});

test("a median under a day rounds up rather than claiming a same-day cut", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  const dealer = { listingsN: 40, cutN: 20, cutShare: 0.5, datedN: 9, medianDaysToCut: 0.2 };
  assert.deepEqual(texts({ dealer, now }), ["50% of this seller's EVs cut est", "First cut at 1 day est"]);
});

test("the tiles wear the colours their meaning earns", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  const tiles = pricePaceTiles({
    listedOn: "2026-09-05",
    history: series(50_000, 48_000),
    dealer: { listingsN: 258, cutN: 67, cutShare: 0.2597, datedN: 19, medianDaysToCut: 5.4 },
    now,
  });
  // Violet (kind "cut") is money off THIS car and nothing else; the seller's
  // habit is not this car's money.
  assert.deepEqual(
    tiles.map((t) => t.kind),
    ["spec", "cut", "spec", "spec"]
  );
});
