// The market-trend read for one car: two series from price_trend() (0062),
// the security-definer RPC that is the ONLY reader of the 0061 views.
//
//   sales — what a standard car of this cohort FETCHED, by quarter, from
//           arms-length Washington title sales since 2019 (n ≥ 8 a quarter).
//   asks  — what one is being ASKED, by week, from our own listings since
//           2026-08-11 (n ≥ 4 a week, used cars).
//
// "Standard car": every price was first moved to the cohort's fixed standard
// odometer along its fitted mileage slope, so the line moves when the market
// moves and not when the mix of cars does. The RPC picks the level — the
// VIN cohort when a VIN was given and it clears the floor, else the model
// pool — and says which in `level`. Each point carries its n and the
// period's median odometer, and the series its standard odometer, because
// the chart must print those beside the line (0057/0061 rule).
//
// Anon key, like every other web read; cached an hour. The views refresh
// nightly, so an hour is freshness enough and one RPC per car per hour is
// nothing the database notices.

export interface TrendPoint {
  /** ISO date: the quarter's or week's first day. */
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
  slopeFromSales: boolean;
  points: TrendPoint[];
}

export interface PriceTrend {
  sales: TrendSeries | null;
  asks: TrendSeries | null;
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
  return { level: s.level === "vin8" ? "vin8" : "model", stdOdometer: s.stdOdometer ?? null, slopeFromSales: !!s.slopeFromSales, points };
}
