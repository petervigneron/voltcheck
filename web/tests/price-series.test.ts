// From web/:
//   npx tsx --test tests/price-series.test.ts
//
// The chart under a listing's price must end at that price. On 2026-09-03 a
// Lightning's page said $47,500 over a chart ending at $41,581 — the previous
// seller's last number — and 42,036 live cars had the same shape. The series
// is dropped whole when it cannot end at the headline; see priceSeries.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { seriesEndingAt } from "@/lib/listings/priceSeries";

const AUG26 = "2026-08-26T15:51:32Z";
const AUG28 = "2026-08-28T00:57:09Z";
const AUG31 = "2026-08-31T20:38:38Z";

const hobson = [
  { priceUsd: 47_230, observedAt: AUG26 },
  { priceUsd: 43_924, observedAt: AUG28 },
  { priceUsd: 41_581, observedAt: AUG31 },
];

test("a chain that ends at the headline price is drawn as is", () => {
  assert.deepEqual(seriesEndingAt(hobson, 41_581), hobson);
});

test("a chain that ends at a price the page does not show is dropped whole, not drawn short", () => {
  // 1FT6W3L78RWG27106: Hobson's chain under Recharged's $47,500 headline.
  assert.deepEqual(seriesEndingAt(hobson, 47_500), []);
});

test("no headline price means no series: nothing to end at", () => {
  assert.deepEqual(seriesEndingAt(hobson, undefined), []);
});

test("an empty history stays empty", () => {
  assert.deepEqual(seriesEndingAt([], 47_500), []);
});
