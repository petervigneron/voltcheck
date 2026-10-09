// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/savedDrop.test.ts
//
// The saved-car alert's one question (lib/listings/savedDrop.ts): is this
// car now at least $250 under the lowest real price any reader reported in
// the 14 days up to the last digest? Each case below is a shape the price
// log has actually produced.

import test from "node:test";
import assert from "node:assert/strict";
import { savedDrop, SAVED_DROP_MIN_USD } from "@/lib/listings/savedDrop";

const DAY = 86_400_000;
const now = Date.parse("2026-10-09T12:00:00Z");
const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
const car = (priceUsd: number) => ({ priceUsd, condition: "used", year: 2022 });

test("a $400-a-day slide mails every day, by the day's $400", () => {
  // Day 1: $44,900 → $44,500 after yesterday's digest.
  const since1 = now - 1 * DAY;
  const h1 = [{ priceUsd: 44_900, observedAt: at(2) }, { priceUsd: 44_500, observedAt: at(0.5) }];
  assert.deepEqual(savedDrop(car(44_500), h1, since1, now), { amountUsd: 400, fromUsd: 44_900 });
  // Day 2: that digest went out; $44,500 → $44,100 since.
  const since2 = now - 0.25 * DAY;
  const h2 = [...h1, { priceUsd: 44_100, observedAt: at(0.1) }];
  assert.deepEqual(savedDrop(car(44_100), h2, since2, now), { amountUsd: 400, fromUsd: 44_500 });
});

test("a reader change at a lower price is a drop — the 2022 Lariat, 2026-10-08", () => {
  // Hudson Nissan's own site read $43,800 (10-06); Ford Blue Advantage read
  // $42,431 (10-08). live_listings_feed withholds the cut across readers; the
  // saved-car alert does not.
  const since = Date.parse("2026-10-03T14:07:39Z");
  const history = [
    { priceUsd: 43_800, observedAt: "2026-10-01T23:29:14Z" },
    { priceUsd: 43_900, observedAt: "2026-10-02T23:28:43Z" },
    { priceUsd: 42_431, observedAt: "2026-10-08T18:15:57Z" },
  ];
  assert.deepEqual(savedDrop(car(42_431), history, since, now), { amountUsd: 1_369, fromUsd: 43_800 });
});

test("two readers alternating mail once, not on every other crawl", () => {
  // After the $42,431 digest, A reads $43,800 again, then B reads $42,431
  // again: $42,431 is already in the baseline, so nothing is new.
  const since = now - 1 * DAY;
  const history = [
    { priceUsd: 43_800, observedAt: at(4) },
    { priceUsd: 42_431, observedAt: at(3) },
    { priceUsd: 43_800, observedAt: at(0.6) },
    { priceUsd: 42_431, observedAt: at(0.2) },
  ];
  assert.equal(savedDrop(car(42_431), history, since, now), null);
});

test("the baseline is the lowest price before the digest, so a cut is never overstated", () => {
  // $45,000 → $43,000 → $44,000 before the digest; now $42,600. The honest
  // drop is from $43,000, not $44,000 or $45,000.
  const since = now - 1 * DAY;
  const history = [
    { priceUsd: 45_000, observedAt: at(6) },
    { priceUsd: 43_000, observedAt: at(4) },
    { priceUsd: 44_000, observedAt: at(2) },
    { priceUsd: 42_600, observedAt: at(0.5) },
  ];
  assert.deepEqual(savedDrop(car(42_600), history, since, now), { amountUsd: 400, fromUsd: 43_000 });
});

test("a drop that happened before the shopper subscribed is not news", () => {
  const since = now - 1 * DAY; // created_at
  const history = [{ priceUsd: 45_000, observedAt: at(5) }, { priceUsd: 43_000, observedAt: at(3) }];
  assert.equal(savedDrop(car(43_000), history, since, now), null);
});

test("below the bar is silence; at the bar is a mail", () => {
  const since = now - 1 * DAY;
  const history = [{ priceUsd: 40_000, observedAt: at(2) }];
  assert.equal(savedDrop(car(40_000 - SAVED_DROP_MIN_USD + 1), history, since, now), null);
  assert.deepEqual(savedDrop(car(40_000 - SAVED_DROP_MIN_USD), history, since, now), {
    amountUsd: SAVED_DROP_MIN_USD,
    fromUsd: 40_000,
  });
});

test("a car that sat at one price for a month is judged from that price", () => {
  // listing_price_history is written on change only: the one row is a
  // month old and it is the price in force until today's $1,000 cut.
  const since = now - 1 * DAY;
  const history = [{ priceUsd: 45_000, observedAt: at(30) }, { priceUsd: 44_000, observedAt: at(0.3) }];
  assert.deepEqual(savedDrop(car(44_000), history, since, now), { amountUsd: 1_000, fromUsd: 45_000 });
});

test("the in-force price never raises a baseline the window already set lower", () => {
  // A $43,800, B $42,431, A $43,800 again — all before the digest — then B
  // $42,431 after it. The latest reading before the digest is $43,800; the
  // window's low of $42,431 wins, and nothing is mailed twice.
  const since = now - 0.5 * DAY;
  const history = [
    { priceUsd: 43_800, observedAt: at(4) },
    { priceUsd: 42_431, observedAt: at(3) },
    { priceUsd: 43_800, observedAt: at(0.6) },
    { priceUsd: 42_431, observedAt: at(0.2) },
  ];
  assert.equal(savedDrop(car(42_431), history, since, now), null);
});

test("junk prices and a car with no real price make no claim", () => {
  const since = now - 1 * DAY;
  // A $5,500 "price" on a 2022 used car is the junk-price class, not a baseline.
  assert.equal(savedDrop(car(5_000), [{ priceUsd: 5_500, observedAt: at(2) }], since, now), null);
  // And a baseline cannot be set by a junk reading either.
  assert.equal(savedDrop(car(30_000), [{ priceUsd: 5_500, observedAt: at(2) }], since, now), null);
  // No price now: nothing to compare.
  assert.equal(
    savedDrop({ condition: "used", year: 2022 }, [{ priceUsd: 40_000, observedAt: at(2) }], since, now),
    null
  );
});
