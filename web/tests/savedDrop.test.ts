// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/savedDrop.test.ts
//
// The saved-car alert's one question (lib/listings/savedDrop.ts): on the
// chain the listing page draws, is this car now at least $250 under the
// lower of the price in force at the last digest and the window's low?
// Each case below is a shape the price log has actually produced.

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

test("the 2022 Lariat, 2026-10-08: a one-point chain claims nothing", () => {
  // Hudson Nissan's own site read $43,800 (10-06); Ford Blue Advantage read
  // $42,431 (10-08); the dealer asked $43,200 that evening. The page's chain
  // (listing_price_display) holds only the Blue Advantage point, so there is
  // no price in force before the digest and no cut — the first version of
  // this rule read both readers and mailed "cut $1,369".
  const since = Date.parse("2026-10-03T14:07:39Z");
  const chain = [{ priceUsd: 42_431, observedAt: "2026-10-08T18:15:57Z" }];
  assert.equal(savedDrop(car(42_431), chain, since, now), null);
});

test("the 2024 Flash, 2026-10-09: the chain's own steps, from the price in force at the digest", () => {
  const since = Date.parse("2026-10-03T14:07:39Z");
  const chain = [
    { priceUsd: 45_985, observedAt: "2026-08-16T14:00:33Z" },
    { priceUsd: 42_481, observedAt: "2026-09-28T21:46:29Z" },
    { priceUsd: 42_081, observedAt: "2026-10-04T18:57:22Z" },
    { priceUsd: 41_581, observedAt: "2026-10-09T01:12:37Z" },
  ];
  assert.deepEqual(savedDrop(car(41_581), chain, since, now), { amountUsd: 900, fromUsd: 42_481 });
});

test("a chain that does not end at the headline is dropped whole, as the page drops it", () => {
  const since = now - 1 * DAY;
  const chain = [{ priceUsd: 44_900, observedAt: at(2) }, { priceUsd: 44_500, observedAt: at(0.5) }];
  assert.equal(savedDrop(car(44_000), chain, since, now), null);
});

test("down, up, down again mails once, not on every other crawl", () => {
  // After the $42,431 digest, $43,800 again, then $42,431 again: $42,431 is
  // already in the baseline, so nothing is new.
  const since = now - 1 * DAY;
  const chain = [
    { priceUsd: 43_800, observedAt: at(4) },
    { priceUsd: 42_431, observedAt: at(3) },
    { priceUsd: 43_800, observedAt: at(0.6) },
    { priceUsd: 42_431, observedAt: at(0.2) },
  ];
  assert.equal(savedDrop(car(42_431), chain, since, now), null);
});

test("the in-force price never raises a baseline the window already set lower", () => {
  // $43,800, $42,431, $43,800 — all before the digest — then $42,431 after
  // it. The latest point before the digest is $43,800; the window's low of
  // $42,431 wins, and nothing is mailed twice.
  const since = now - 0.5 * DAY;
  const chain = [
    { priceUsd: 43_800, observedAt: at(4) },
    { priceUsd: 42_431, observedAt: at(3) },
    { priceUsd: 43_800, observedAt: at(0.6) },
    { priceUsd: 42_431, observedAt: at(0.2) },
  ];
  assert.equal(savedDrop(car(42_431), chain, since, now), null);
});

test("the baseline is the lowest price before the digest, so a cut is never overstated", () => {
  // $45,000 → $43,000 → $44,000 before the digest; now $42,600. The honest
  // drop is from $43,000, not $44,000 or $45,000.
  const since = now - 1 * DAY;
  const chain = [
    { priceUsd: 45_000, observedAt: at(6) },
    { priceUsd: 43_000, observedAt: at(4) },
    { priceUsd: 44_000, observedAt: at(2) },
    { priceUsd: 42_600, observedAt: at(0.5) },
  ];
  assert.deepEqual(savedDrop(car(42_600), chain, since, now), { amountUsd: 400, fromUsd: 43_000 });
});

test("a car that sat at one price for a month is judged from that price", () => {
  // History is written on change only: the one point is a month old and it
  // is the price in force until today's $1,000 cut.
  const since = now - 1 * DAY;
  const chain = [{ priceUsd: 45_000, observedAt: at(30) }, { priceUsd: 44_000, observedAt: at(0.3) }];
  assert.deepEqual(savedDrop(car(44_000), chain, since, now), { amountUsd: 1_000, fromUsd: 45_000 });
});

test("a drop that happened before the shopper subscribed is not news", () => {
  const since = now - 1 * DAY; // created_at
  const chain = [{ priceUsd: 45_000, observedAt: at(5) }, { priceUsd: 43_000, observedAt: at(3) }];
  assert.equal(savedDrop(car(43_000), chain, since, now), null);
});

test("below the bar is silence; at the bar is a mail", () => {
  const since = now - 1 * DAY;
  const chain = (nowUsd: number) => [{ priceUsd: 40_000, observedAt: at(2) }, { priceUsd: nowUsd, observedAt: at(0.5) }];
  const under = 40_000 - SAVED_DROP_MIN_USD + 1;
  assert.equal(savedDrop(car(under), chain(under), since, now), null);
  assert.deepEqual(savedDrop(car(40_000 - SAVED_DROP_MIN_USD), chain(40_000 - SAVED_DROP_MIN_USD), since, now), {
    amountUsd: SAVED_DROP_MIN_USD,
    fromUsd: 40_000,
  });
});

test("junk prices and a car with no real price make no claim", () => {
  const since = now - 1 * DAY;
  // A $5,500 "price" on a 2022 used car is the junk-price class, not a baseline.
  assert.equal(
    savedDrop(car(30_000), [{ priceUsd: 5_500, observedAt: at(2) }, { priceUsd: 30_000, observedAt: at(0.5) }], since, now),
    null
  );
  // No price now: nothing to compare.
  assert.equal(
    savedDrop({ condition: "used", year: 2022 }, [{ priceUsd: 40_000, observedAt: at(2) }], since, now),
    null
  );
});
