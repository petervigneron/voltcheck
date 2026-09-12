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
import { dealControl } from "@/lib/filters";
import { buildTests } from "@/lib/listings/match";
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

// ── The rail's Deals control (2026-09-12) ───────────────────────────────────
//
// The filter itself is Pro and stays Pro — a browser with no pass has no
// ask-vs-market figures to judge by, because the public shards do not carry
// them (lib/listings/proSignals.ts publicRows). What changed is what the rail
// says when the URL asks for a filter that will not be applied: nothing, until
// today. ?deal=1 signed in with an expired pass showed the whole feed —
// 172,003 cars — with no chip and no message, which reads as the answer to
// "show me the deals" rather than as the filter being off.

test("a pass-holder gets the toggle, pressed or not", () => {
  assert.equal(dealControl(true, true), "toggle");
  assert.equal(dealControl(true, false), "toggle");
  // A pass-holder's control is the toggle whatever a stale expired flag says.
  assert.equal(dealControl(true, true, true), "toggle");
});

test("?deal=1 without a pass is never silent, and says which kind of nothing", () => {
  assert.equal(dealControl(false, true), "needs-pro");
  assert.equal(dealControl(false, true, true), "ended");
});

test("no pass and nothing asked for offers nothing; an unknown answer waits", () => {
  // The rail a stranger has always had: the deals control is not advertised
  // there, it is learned on /pro.
  assert.equal(dealControl(false, false), "none");
  assert.equal(dealControl(false, false, true), "none");
  // Null is "the answer is on its way". Rendering "needs Pro" and then
  // swapping it for a toggle is worse than rendering it a moment late.
  assert.equal(dealControl(null, true), "none");
  assert.equal(dealControl(undefined, true), "none");
});

test("the filter stays off for a browser without a pass — the count is the whole feed", () => {
  // The control test behind the chip's honesty: whatever the rail prints, the
  // grid is unfiltered, so the count beside it is the unfiltered count.
  const url = (k: string) => (k === "deal" ? "1" : "");
  assert.equal("deal" in buildTests(url, { pro: false }), false);
  assert.equal("deal" in buildTests(url, {}), false);
  assert.equal("deal" in buildTests(url, { pro: true }), true);
});
