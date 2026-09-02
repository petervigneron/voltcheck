// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/deal-sort.test.ts
//
// The deal-ranked screener orders the grid by the ask-vs-market delta each
// card already prints. Ranking is where a false bargain does the most damage
// — the top of the page is where a shopper looks first — so the order has to
// be exactly what the tiles say and nothing more: a car with no measured
// delta must never be ranked as if it had one, in either direction.

import test from "node:test";
import assert from "node:assert/strict";
import { compareDeal, DEAL_SORT } from "@/lib/listings/dealSort";
import type { CardRow } from "@/lib/listings/card";

const row = (id: string, priceUsd: number, deltaUsd?: number, realPrice = true): CardRow =>
  ({
    id,
    priceUsd,
    realPrice,
    askVsMarket: deltaUsd === undefined ? undefined : { deltaUsd, peerN: 6, trimMatched: true },
    tiles: [],
  }) as unknown as CardRow;

const order = (rows: CardRow[]) => [...rows].sort(compareDeal).map((r) => r.id);

test("most under similar listings first, then over, then no measured delta", () => {
  const rows = [
    row("over", 30_000, 1_800),
    row("none", 20_000),
    row("under-small", 31_000, -900),
    row("under-big", 29_000, -3_100),
    row("lease", 0, undefined, false),
  ];
  assert.deepEqual(order(rows), ["under-big", "under-small", "over", "none", "lease"]);
});

test("a car with no delta never outranks one with any delta, even an 'over' one", () => {
  // The thing that would make a cheap unmeasured car look like a deal.
  assert.deepEqual(order([row("cheap-unmeasured", 9_000), row("over", 40_000, 2_500)]), ["over", "cheap-unmeasured"]);
});

test("ties break cheapest first, and equal cars are a stable 0", () => {
  assert.deepEqual(order([row("b", 32_000, -1_000), row("a", 31_000, -1_000)]), ["a", "b"]);
  assert.equal(compareDeal(row("x", 20_000), row("y", 20_000)), 0);
  assert.equal(compareDeal(row("x", 0, undefined, false), row("y", 0, undefined, false)), 0);
});

test("the sort key the grid and the rail share", () => {
  assert.equal(DEAL_SORT, "deal");
});
