// The market-trend read for one car: the asking-price series from
// price_trend() (0064), the security-definer RPC that is the ONLY reader of
// the trend tables.
//
//   asks — what a standard car of this cohort is being ASKED, by day, from
//          our own listings since 2026-08-15 (n ≥ 4 a day, used cars, closed
//          days only).
//
// The RPC also returns a Washington SALES series by quarter (0061). It is not
// read here any more: the owner (2026-09-05) wants one line — what a car
// like yours is asking, day by day — and the sale-vs-ask figure already
// lives on cards and the listing page with its own guardrails (comps.ts).
// Two charts at two grains from two sources was the block nobody could
// read; the sales views keep refreshing for the valuation, not for this.
//
// "Standard car": every price was first moved to one odometer along the
// cohort's fitted mileage slope, so the line moves when the market moves and
// not when the mix of cars does. The series says which odometer that was
// (stdOdometer) and the slope it used (usdPerMile), and levelTo() moves the
// whole series to a different one — the shopper's own mileage — before it
// is drawn.
//
// The RPC picks the finest level that clears the floor and says which in
// `level`: the TRIM cohort (VIN 1-8 + the trim the site stands behind + pack
// identity, 0077 — the same three facts comps.ts needs before it quotes a
// peer figure) when the page gave all three, else the VIN cohort, else the
// model pool. Before 0077 a 2023 Lightning Platinum ER was drawn against
// every ER Lightning, Pro and XLT included (owner, 2026-09-09: "does not
// have a mileage adjusted price of $30,000"). Each point carries its n and
// the day's median odometer, because the chart must print those beside the
// line (0057/0061 rule).
//
// Anon key, like every other web read; cached an hour. The table moves once
// a night, so an hour is freshness enough and one RPC per car per hour is
// nothing the database notices.

import { askToValue } from "./listings/askToSold";

export interface TrendPoint {
  /** ISO date: the day. */
  period: string;
  n: number;
  price: number;
  p25: number;
  p75: number;
  /** Median odometer of the cars in this period, before adjustment. */
  odometer: number | null;
}

export type TrendLevel = "trim" | "vin8" | "model";

export interface TrendSeries {
  level: TrendLevel;
  /** The odometer every price in this series was moved to. */
  stdOdometer: number | null;
  /** The slope that moved them, dollars per mile (negative). */
  usdPerMile: number | null;
  slopeFromSales: boolean;
  points: TrendPoint[];
}

/**
 * One day of the site-wide line (0072): every used cohort's daily level
 * chained day to day, so the index moves when prices move and not when the
 * set of cohorts does. 1.0 on the first day of the archive.
 */
export interface SiteTrendPoint {
  period: string;
  idx: number;
  /** How many cohorts and cars the day's step was read from. */
  cohorts: number;
  cars: number;
}

export interface SiteTrend {
  points: SiteTrendPoint[];
}

export interface PriceTrend {
  asks: TrendSeries | null;
  /** The whole site's used-car level, for drawing beside `asks` (owner,
   *  2026-09-07: show "the trend for all cars on the site"). Dimensionless;
   *  the chart scales it to the cohort's own first price. */
  site: SiteTrend | null;
}

/** value.ts's driven-car window: outside it a mileage is a typo or a car the
 *  slope was never fitted on, and the series stays at its own odometer. */
export const LEVEL_MIN_MILES = 2_000;
export const LEVEL_MAX_MILES = 200_000;

/**
 * The same series read at `miles` instead of its own standard odometer.
 *
 * Exact where the adjustment is linear with one slope per car (the vin8
 * level); at the model level it is the pool's average slope, which is the
 * same approximation the pool's median already makes. Returns the series
 * untouched when it cannot be moved: no slope, no odometer, or a mileage
 * outside the fitted window.
 */
export function levelTo(s: TrendSeries, miles: number | null | undefined): TrendSeries {
  if (miles == null || !Number.isFinite(miles) || miles < LEVEL_MIN_MILES || miles > LEVEL_MAX_MILES) return s;
  if (s.stdOdometer == null || s.usdPerMile == null || !Number.isFinite(s.usdPerMile)) return s;
  const shift = s.usdPerMile * (miles - s.stdOdometer);
  if (!Number.isFinite(shift) || shift === 0) return s;
  return {
    ...s,
    stdOdometer: miles,
    points: s.points.map((p) => ({ ...p, price: p.price + shift, p25: p.p25 + shift, p75: p.p75 + shift })),
  };
}

/**
 * The series as the VALUE a car like this one has been worth, day by day —
 * the /worth headline's own arithmetic applied to each archived day
 * (owner, 2026-09-09: "we can't simply have two numbers for the same car").
 *
 * Three steps, each one the headline takes: level to the shopper's odometer
 * on the cohort's rate (levelTo), convert asking to transaction (askToValue,
 * the same constant value.ts uses), and end on TODAY — `today` is the live
 * headline itself, appended as the last point, so the chart's right-hand
 * figure and the number above it are one number by construction. The
 * archive closes a day behind and prices at its own close; today's point
 * is priced from the listings on the site right now, which is what the
 * headline is. Its band borrows the last archived day's spread, since a
 * live point has no quartiles of its own and the cohort's spread barely
 * moves day to day.
 */
export function valueSeries(s: TrendSeries, miles: number | null | undefined, today?: { period: string; usd: number }): TrendSeries {
  const levelled = levelTo(s, miles);
  const points = levelled.points.map((p) => ({ ...p, price: askToValue(p.price), p25: askToValue(p.p25), p75: askToValue(p.p75) }));
  if (today && Number.isFinite(today.usd) && today.usd > 0 && points.length) {
    const last = points[points.length - 1];
    if (today.period > last.period) {
      points.push({
        period: today.period,
        n: last.n,
        price: today.usd,
        p25: today.usd - Math.max(0, last.price - last.p25),
        p75: today.usd + Math.max(0, last.p75 - last.price),
        odometer: null,
      });
    }
  }
  return { ...levelled, points };
}

export async function fetchPriceTrend(a: {
  make: string;
  model: string;
  year: number;
  vin?: string;
  /** The trim the site stands behind for this car (trimClaim + specTrim), and
   *  its enrichment pack identity (packIdentity). Both, with the VIN, unlock
   *  the trim level; either missing and the read stays at the VIN cohort. */
  trimKey?: string;
  identity?: string;
}): Promise<PriceTrend | null> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const vin8 = a.vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(a.vin.trim()) ? a.vin.trim().slice(0, 8).toUpperCase() : null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/price_trend`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        _make: a.make,
        _model: a.model,
        _model_year: a.year,
        _vin8: vin8,
        _trim_key: a.trimKey?.trim().toUpperCase() || null,
        _identity: a.identity?.trim() || null,
      }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { asks?: TrendSeries | null; site?: SiteTrend | null };
    if (!body || typeof body !== "object") return null;
    return { asks: cleanSeries(body.asks), site: cleanSite(body.site) };
  } catch {
    return null;
  }
}

function cleanSite(s: SiteTrend | null | undefined): SiteTrend | null {
  if (!s || !Array.isArray(s.points)) return null;
  const points = s.points.filter(
    (p) => p && typeof p.period === "string" && Number.isFinite(p.idx) && p.idx > 0 && Number.isFinite(p.cars) && p.cars > 0
  );
  return points.length < 2 ? null : { points };
}

/** A series with fewer than two points is not a trend; it is one number,
 *  and the valuation already prints that. */
function cleanSeries(s: TrendSeries | null | undefined): TrendSeries | null {
  if (!s || !Array.isArray(s.points)) return null;
  const points = s.points.filter(
    (p) => p && typeof p.period === "string" && Number.isFinite(p.price) && Number.isFinite(p.n) && p.n > 0
  );
  if (points.length < 2) return null;
  const slope = typeof s.usdPerMile === "number" && Number.isFinite(s.usdPerMile) ? s.usdPerMile : null;
  return {
    level: s.level === "trim" ? "trim" : s.level === "vin8" ? "vin8" : "model",
    stdOdometer: s.stdOdometer ?? null,
    usdPerMile: slope,
    slopeFromSales: !!s.slopeFromSales,
    points,
  };
}
