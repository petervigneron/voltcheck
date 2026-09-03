// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/deal.test.ts
//
// The Pro deals filter selects by the ask-vs-market figure each card already
// prints. A filter that calls a car a deal is the house rule's most expensive
// error when wrong, so the predicate has to be exactly the tile's number and
// nothing more: no figure means unjudged, never "in".

import test from "node:test";
import assert from "node:assert/strict";
import { DEAL_MIN_PCT, isDeal, pctUnderSimilar } from "@/lib/listings/deal";
import type { CardRow } from "@/lib/listings/card";

const row = (priceUsd: number, deltaUsd?: number, realPrice = true): CardRow =>
  ({
    id: "x",
    priceUsd,
    realPrice,
    askVsMarket: deltaUsd === undefined ? undefined : { deltaUsd, peerN: 6, trimMatched: true },
    tiles: [],
  }) as unknown as CardRow;

test("percent under is measured against the peer median, not the ask", () => {
  // $27,000 ask, $3,000 under → peers at $30,000 → 10% under.
  assert.equal(pctUnderSimilar(row(27_000, -3_000)), 10);
  // $9,000 under a $30,000 median at a $21,000 ask is 30%, not 43%.
  assert.equal(pctUnderSimilar(row(21_000, -9_000)), 30);
});

test("no figure, over, or no real price means unjudged", () => {
  assert.equal(pctUnderSimilar(row(20_000)), undefined);
  assert.equal(pctUnderSimilar(row(31_000, 1_000)), undefined);
  assert.equal(pctUnderSimilar(row(0, -3_000, false)), undefined);
  for (const r of [row(20_000), row(31_000, 1_000), row(0, -3_000, false)]) assert.equal(isDeal(r), false);
});

test("the threshold is inclusive and lives in one constant", () => {
  const median = 30_000;
  const at = median * (1 - DEAL_MIN_PCT / 100);
  assert.equal(isDeal(row(at, at - median)), true);
  assert.equal(isDeal(row(at + 100, at + 100 - median)), false);
  assert.equal(isDeal(row(at + 100, at + 100 - median), DEAL_MIN_PCT - 1), true);
});
