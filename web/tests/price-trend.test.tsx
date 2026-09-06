// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/price-trend.test.tsx
//
// The trend chart must print what stands behind the line — the count per day
// and the odometer it is drawn at — must not draw a "trend" from a single
// point, and must draw the line at the shopper's odometer when one is given.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceTrendCharts } from "@/components/PriceTrend";
import type { PriceTrend, TrendSeries } from "@/lib/trend";

const series = (points: [string, number, number][], stdOdometer = 40000): TrendSeries => ({
  level: "model",
  stdOdometer,
  usdPerMile: -0.2,
  slopeFromSales: true,
  points: points.map(([period, price, n]) => ({ period, n, price, p25: price - 2000, p75: price + 2000, odometer: 12000 })),
});

test("one chart, with the count per day and the odometer beside it, ends printed", () => {
  const trend: PriceTrend = { asks: series([["2026-08-15", 28163, 170], ["2026-08-25", 27900, 240], ["2026-09-04", 27586, 278]]) };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={trend} />);
  assert.equal((html.match(/<svg/g) ?? []).length, 1);
  assert.match(html, /170–278 listings a day · at 40,000 mi/);
  assert.match(html, /\$28,163/);
  assert.match(html, /\$27,586/);
  assert.match(html, /Aug 15/);
  assert.match(html, /Sep 4/);
  // The ends carry their n in a title; the middle days do not get a dot.
  assert.match(html, /278 listings, median 12,000 mi/);
  assert.equal((html.match(/<circle/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Washington|sales/);
});

test("given the shopper's mileage, the line moves to it along its slope and says so", () => {
  const trend: PriceTrend = { asks: series([["2026-08-15", 28000, 170], ["2026-09-04", 27500, 278]]) };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={trend} miles={60000} />);
  assert.match(html, /· at 60,000 mi/);
  assert.doesNotMatch(html, /40,000 mi/);
  // -$0.20/mi × 20,000 = −$4,000 off every point.
  assert.match(html, /\$24,000/);
  assert.match(html, /\$23,500/);
  // A mileage outside the fitted window leaves the series at its own odometer.
  const raw = renderToStaticMarkup(<PriceTrendCharts trend={trend} miles={500} />);
  assert.match(raw, /· at 40,000 mi/);
  assert.match(raw, /\$28,000/);
});

test("no series renders nothing", () => {
  assert.equal(renderToStaticMarkup(<PriceTrendCharts trend={{ asks: null }} />), "");
});
