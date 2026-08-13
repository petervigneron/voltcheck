import { dbConfigured } from "./db";

// What people actually paid, from Washington State DOL title records
// (data.wa.gov rpr4-cgyd, ODbL). Listings carry ASKING prices; this is the
// only public US dataset of transaction prices, so it is the one place a
// shopper can see the gap between the two.
//
// The values here are Washington-only and must be labelled as such wherever
// they render — they are a national reference point, not a local comp,
// unless the car itself is in WA.

export interface PriceComps {
  n: number;
  median: number;
  p25: number;
  p75: number;
  medianOdometer: number | null;
  /** How far the query had to widen to find a usable sample. */
  basis: "year_and_mileage" | "year_and_mileage_wide" | "year" | "year_range";
  /**
   * Whether the comparison holds mileage roughly constant. When false the
   * median is context only — the cars in it may have far fewer or more
   * miles, and most of what looks like market movement over time is
   * actually odometer accumulation, so no "above/below market" claim is
   * made. See supabase/migrations/0005.
   */
  mileageControlled: boolean;
  yearLow: number;
  yearHigh: number;
  months: number;
}

const REVALIDATE_SECONDS = 86_400; // upstream refreshes monthly

/** Comparable sales, or null when fewer than 5 exist — too thin to show. */
export async function fetchPriceComps(
  make: string,
  model: string,
  year: number,
  mileage?: number
): Promise<PriceComps | null> {
  if (!dbConfigured()) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/wa_price_comps`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        _make: make,
        _model: model,
        _year: year,
        _mileage: mileage ?? null,
      }),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    const data = (await res.json()) as PriceComps | null;
    return data && typeof data.median === "number" ? data : null;
  } catch (err) {
    console.error("[prices] Washington comps lookup failed:", err);
    return null;
  }
}

/** Plain-language description of what the sample actually covers. */
export function describeBasis(c: PriceComps): string {
  const window = c.months === 12 ? "the last year" : `the last ${Math.round(c.months / 12)} years`;
  const n = c.n.toLocaleString();
  if (c.basis === "year_and_mileage")
    return `${n} sales of this model year with similar mileage, over ${window}`;
  if (c.basis === "year_and_mileage_wide")
    return `${n} sales of this model year within a wider mileage range, over ${window}`;
  if (c.basis === "year")
    return `${n} sales of this model year, any mileage, over ${window}`;
  return `${n} sales from ${c.yearLow}–${c.yearHigh}, any mileage, over ${window}`;
}
