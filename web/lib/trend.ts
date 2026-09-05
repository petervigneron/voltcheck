// The market-trend read for one car: two series from price_trend() (0064),
// the security-definer RPC that is the ONLY reader of the trend tables.
//
//   sales — what a standard car of this cohort FETCHED, by quarter, from
//           arms-length Washington title sales since 2019 (n ≥ 8 a quarter).
//   asks  — what one is being ASKED, by day, from our own listings since
//           2026-08-12 (n ≥ 4 a day, used cars, closed days only).
//
// "Standard car": every price was first moved to one odometer along the
// cohort's fitted mileage slope, so the line moves when the market moves and
// not when the mix of cars does. Each series says which odometer that was
// (stdOdometer) and the slope it used (usdPerMile), and levelTo() moves the
// whole series to a different one — the shopper's own mileage — before it
// is drawn. That is what makes the two charts comparable: until 0064 each
// was standardized to its own population's median (31,936 mi of Washington
// titles against 59,736 mi on lots today for a 2021 Model 3), and the gap
// between them was 28,000 miles of odometer read as a $5,700 bargain.
//
// The RPC picks the level — the VIN cohort when a VIN was given and it clears
// the floor, else the model pool — and says which in `level`. Each point
// carries its n and the period's median odometer, because the chart must
// print those beside the line (0057/0061 rule).
//
// Anon key, like every other web read; cached an hour. The tables move once
// a night, so an hour is freshness enough and one RPC per car per hour is
// nothing the database notices.

export interface TrendPoint {
  /** ISO date: the quarter's first day, or the day. */
  period: string;
  n: number;
  price: number;
  p25: number;
  p75: number;
  /** Median odometer of the cars in this period, before adjustment. */
  odometer: number | null;
}

export interface TrendSeries {
  level: "vin8" | "model";
  /** The odometer every price in this series was moved to. */
  stdOdometer: number | null;
  /** The slope that moved them, dollars per mile (negative). */
  usdPerMile: number | null;
  slopeFromSales: boolean;
  points: TrendPoint[];
}

export interface PriceTrend {
  sales: TrendSeries | null;
  asks: TrendSeries | null;
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

export async function fetchPriceTrend(a: {
  make: string;
  model: string;
  year: number;
  vin?: string;
}): Promise<PriceTrend | null> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const vin8 = a.vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(a.vin.trim()) ? a.vin.trim().slice(0, 8).toUpperCase() : null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/price_trend`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _make: a.make, _model: a.model, _model_year: a.year, _vin8: vin8 }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PriceTrend;
    if (!body || typeof body !== "object") return null;
    return { sales: cleanSeries(body.sales), asks: cleanSeries(body.asks) };
  } catch {
    return null;
  }
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
    level: s.level === "vin8" ? "vin8" : "model",
    stdOdometer: s.stdOdometer ?? null,
    usdPerMile: slope,
    slopeFromSales: !!s.slopeFromSales,
    points,
  };
}
