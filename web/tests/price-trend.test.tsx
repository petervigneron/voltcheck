// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/price-trend.test.tsx
//
// The trend chart must say what the line is (an estimated value, est-marked,
// and the odometer it is drawn at), must NOT print how many cars were
// listed (owner, 2026-09-07 — the count survives only in the end-points'
// hover), must not draw a "trend" from a single point, must draw the line at
// the shopper's odometer when one is given, and must draw the two
// comparisons the owner asked for: the car on the page as a rule at its
// price, and the site-wide index as a second line in the cohort's dollars.
//
// 2026-09-09: the line is the /worth headline's own arithmetic — every point
// is the day's mileage-adjusted ask median converted by ASK_TO_SOLD_DISCOUNT
// (×0.987), and on /worth the last point is the live headline itself, so the
// chart can never end on a different number from the one above it.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceTrendCharts, pctChange, siteInCohortDollars } from "@/components/PriceTrend";
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
  assert.match(html, /Estimated value · at 40,000 mi/);
  assert.match(html, /est\./);
  assert.doesNotMatch(html, /asking/i);
  assert.doesNotMatch(html, /listings a day|listings a week/);
  // 28,163 × 0.987 and 27,586 × 0.987: the headline's conversion, per point.
  assert.match(html, /\$27,797/);
  assert.match(html, /\$27,227/);
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
  // -$0.20/mi × 20,000 = −$4,000 off every point, then × 0.987.
  assert.match(html, /\$23,688/);
  assert.match(html, /\$23,195/);
  // A mileage outside the fitted window leaves the series at its own odometer.
  const raw = renderToStaticMarkup(<PriceTrendCharts trend={trend} miles={500} />);
  assert.match(raw, /· at 40,000 mi/);
  assert.match(raw, /\$27,636/);
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
  // Each line's change over the span is printed beside its name: the cohort
  // fell 28,000 → 27,500 (−1.8%), the index 1 → 0.95 (−5.0%). A move too
  // small to see on the plot is still a figure here.
  assert.match(html, /2021 Chevrolet Bolt EV<span[^>]*>−1\.8%<\/span>/);
  assert.match(html, /All cars on the site<span[^>]*>−5\.0%<\/span>/);
});

test("the legend figure has a sign, one decimal, and a real minus", () => {
  assert.equal(pctChange(28000, 27500), "−1.8%");
  assert.equal(pctChange(28000, 28112), "+0.4%");
  assert.equal(pctChange(28000, 28010), "0.0%");
  assert.equal(pctChange(0, 100), "0.0%");
});

test("the site line moves with the shopper's mileage the way the cohort line does", () => {
  // Levelled to 60,000 mi the cohort starts at $24,000, and the site line is
  // anchored to THAT, not to the 40,000-mi figure.
  const trend: PriceTrend = {
    asks: series([["2026-08-15", 28000, 170], ["2026-09-04", 27500, 278]]),
    site: site([["2026-08-15", 1], ["2026-09-04", 0.5]]),
  };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={trend} miles={60000} />);
  assert.match(html, /\$23,688/);
  assert.doesNotMatch(html, /\$28,000|\$27,636/);
});

test("on /worth the line ends on the headline: today's point is the live value, printed as the right-hand figure", () => {
  const trend: PriceTrend = { asks: series([["2026-08-15", 28000, 170], ["2026-09-08", 27500, 278]]), site: null };
  const html = renderToStaticMarkup(<PriceTrendCharts trend={trend} miles={60000} today={{ period: "2026-09-09", usd: 25200 }} />);
  assert.match(html, /\$25,200/);
  assert.match(html, /Sep 9/);
  // The archived last day is no longer an end-point figure.
  assert.doesNotMatch(html, /\$23,195/);
  // A "today" not newer than the archive's last day is not appended twice.
  const same = renderToStaticMarkup(<PriceTrendCharts trend={trend} miles={60000} today={{ period: "2026-09-08", usd: 25200 }} />);
  assert.doesNotMatch(same, /\$25,200/);
  assert.match(same, /\$23,195/);
});

test("no series renders nothing", () => {
  assert.equal(renderToStaticMarkup(<PriceTrendCharts trend={{ asks: null, site: null }} />), "");
  // A site index alone is not a trend for THIS car.
  assert.equal(
    renderToStaticMarkup(<PriceTrendCharts trend={{ asks: null, site: site([["2026-08-15", 1], ["2026-09-04", 0.95]]) }} />),
    ""
  );
});
