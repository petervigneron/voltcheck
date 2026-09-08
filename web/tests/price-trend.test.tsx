// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/price-trend.test.tsx
//
// The trend chart must say what the line is (a mileage-adjusted asking
// price, and the odometer it is drawn at), must NOT print how many cars were
// listed (owner, 2026-09-07 — the count survives only in the end-points'
// hover), must not draw a "trend" from a single point, must draw the line at
// the shopper's odometer when one is given, and must draw the two
// comparisons the owner asked for: the car on the page as a rule at its
// price, and the site-wide index as a second line in the cohort's dollars.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceTrendCharts, siteInCohortDollars } from "@/components/PriceTrend";
import type { PriceTrend, SiteTrend, TrendSeries } from "@/lib/trend";

const series = (points: [string, number, number][], stdOdometer = 40000): TrendSeries => ({
  level: "model",
  stdOdometer,
  usdPerMile: -0.2,
  slopeFromSales: true,
  points: points.map(([period, price, n]) => ({ period, n, price, p25: price - 2000, p75: price + 2000, odometer: 12000 })),
});

const site = (points: [string, number][]): SiteTrend => ({
  points: points.map(([period, idx]) => ({ period, idx, cohorts: 700, cars: 50000 })),
});

test("one chart: the caption says mileage-adjusted and the odometer, the ends are printed, and no count of listings is", () => {
  const trend: PriceTrend = {
    asks: series([["2026-08-15", 28163, 170], ["2026-08-25", 27900, 240], ["2026-09-04", 27586, 278]]),
    site: null,
  };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={trend} />);
  assert.equal((html.match(/<svg/g) ?? []).length, 1);
  assert.match(html, /Mileage-adjusted asking prices · at 40,000 mi/);
  assert.doesNotMatch(html, /listings a day|listings a week/);
  assert.match(html, /\$28,163/);
  assert.match(html, /\$27,586/);
  assert.match(html, /Aug 15/);
  assert.match(html, /Sep 4/);
  // The ends carry their n in a title (hover only); the middle days do not get a dot.
  assert.match(html, /278 listings, median 12,000 mi/);
  assert.equal((html.match(/<circle/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Washington|sales/);
  // No site series, no site line and no legend for one.
  assert.doesNotMatch(html, /All cars on the site/);
});

test("given the shopper's mileage, the line moves to it along its slope and says so", () => {
  const trend: PriceTrend = { asks: series([["2026-08-15", 28000, 170], ["2026-09-04", 27500, 278]]), site: null };
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

test("the car on the page is a dashed rule at its asking price, with the figure printed", () => {
  const trend: PriceTrend = { asks: series([["2026-08-15", 28000, 170], ["2026-09-04", 27500, 278]]), site: null };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={trend} price={31990} subject="2023 Tesla Model Y" />);
  assert.match(html, /stroke-dasharray="4 3"/);
  assert.match(html, /\$31,990/);
  assert.match(html, /2023 Tesla Model Y/);
  // No price, no rule — /worth has no asking price to draw.
  const bare = renderToStaticMarkup(<PriceTrendCharts trend={trend} />);
  assert.doesNotMatch(bare, /stroke-dasharray="4 3"/);
});

test("the site index is drawn in the cohort's dollars, anchored to the cohort's first day", () => {
  const s = series([["2026-08-15", 28000, 170], ["2026-08-25", 27800, 200], ["2026-09-04", 27500, 278]]);
  // Index runs 1.00 → 0.99 → 0.95 over the cohort's span; scaled to $28,000.
  const line = siteInCohortDollars(s, site([["2026-08-15", 1], ["2026-08-25", 0.99], ["2026-09-04", 0.95]]));
  assert.deepEqual(
    line.map((p) => [p.period, Math.round(p.price)]),
    [["2026-08-15", 28000], ["2026-08-25", 27720], ["2026-09-04", 26600]]
  );
  // An index that starts before the cohort anchors on the cohort's first
  // shared day, so the two lines meet there rather than at the archive's 1.0.
  const late = siteInCohortDollars(s, site([["2026-08-01", 1], ["2026-08-15", 0.9], ["2026-09-04", 0.81]]));
  assert.deepEqual(
    late.map((p) => [p.period, Math.round(p.price)]),
    [["2026-08-15", 28000], ["2026-09-04", 25200]]
  );
  // Fewer than two shared days is no line.
  assert.deepEqual(siteInCohortDollars(s, site([["2026-09-04", 0.95]])), []);
  assert.deepEqual(siteInCohortDollars(s, null), []);

  const html = renderToStaticMarkup(
    <PriceTrendCharts trend={{ asks: s, site: site([["2026-08-15", 1], ["2026-09-04", 0.95]]) }} subject="2021 Chevrolet Bolt EV" />
  );
  assert.match(html, /All cars on the site/);
  assert.match(html, /2021 Chevrolet Bolt EV/);
  // Two lines: the cohort's and the site's (the band and the axis rule are not stroked paths).
  assert.equal((html.match(/<path[^>]*stroke="#/g) ?? []).length, 2);
});

test("the site line moves with the shopper's mileage the way the cohort line does", () => {
  // Levelled to 60,000 mi the cohort starts at $24,000, and the site line is
  // anchored to THAT, not to the 40,000-mi figure.
  const trend: PriceTrend = {
    asks: series([["2026-08-15", 28000, 170], ["2026-09-04", 27500, 278]]),
    site: site([["2026-08-15", 1], ["2026-09-04", 0.5]]),
  };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={trend} miles={60000} />);
  assert.match(html, /\$24,000/);
  assert.doesNotMatch(html, /\$28,000/);
});

test("no series renders nothing", () => {
  assert.equal(renderToStaticMarkup(<PriceTrendCharts trend={{ asks: null, site: null }} />), "");
  // A site index alone is not a trend for THIS car.
  assert.equal(
    renderToStaticMarkup(<PriceTrendCharts trend={{ asks: null, site: site([["2026-08-15", 1], ["2026-09-04", 0.95]]) }} />),
    ""
  );
});
