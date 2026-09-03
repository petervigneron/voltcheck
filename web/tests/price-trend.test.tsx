// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/price-trend.test.tsx
//
// The two trend charts must print what stands behind every line — the count
// per period and the standard odometer — and must not draw a "trend" from a
// single point.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceTrendCharts } from "@/components/PriceTrend";
import type { PriceTrend, TrendSeries } from "@/lib/trend";

const series = (points: [string, number, number][], level: "vin8" | "model" = "model"): TrendSeries => ({
  level,
  stdOdometer: 16639,
  slopeFromSales: true,
  points: points.map(([period, price, n]) => ({ period, n, price, p25: price - 2000, p75: price + 2000, odometer: 12000 })),
});

test("both charts render, apart, with counts and the standard odometer beside each", () => {
  const trend: PriceTrend = {
    sales: series([["2024-01-01", 38664, 12], ["2025-01-01", 33668, 41], ["2026-01-01", 26900, 60]]),
    asks: series([["2026-08-10", 28163, 170], ["2026-08-31", 27586, 278]]),
  };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={trend} />);
  assert.equal((html.match(/<svg/g) ?? []).length, 2);
  assert.match(html, /12–60 sales a quarter · at 16,639 mi/);
  assert.match(html, /170–278 listings a week · at 16,639 mi/);
  // End figures printed, not hovered.
  assert.match(html, /\$38,664/);
  assert.match(html, /\$26,900/);
  assert.match(html, /Q1 2024/);
  assert.match(html, /Aug 10/);
  // Every point carries its n in a title.
  assert.match(html, /41 sales, median 12,000 mi/);
});

test("one series alone renders alone; none renders nothing", () => {
  const onlyAsks: PriceTrend = { sales: null, asks: series([["2026-08-10", 1, 4], ["2026-08-17", 2, 5]]) };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={onlyAsks} />);
  assert.equal((html.match(/<svg/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Washington/);
  assert.equal(renderToStaticMarkup(<PriceTrendCharts trend={{ sales: null, asks: null }} />), "");
});
