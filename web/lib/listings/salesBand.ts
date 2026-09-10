import { dbConfigured } from "./db";

// The transactions end of the /worth range: what the cohort closed at in
// Washington over the last year near this odometer (migration 0081
// cohort_sales_band — aggregates only, the raw table is revoked for anon).
// Sibling of sales.ts, which feeds the listing page's excerpt of ten sales;
// this one answers with five numbers for a range. A failed read is null and
// the range simply does not print — the retail figure stands on its own.

export interface SalesBand {
  n: number;
  /** Mileage-adjusted to the odometer asked for, in the Washington price
   *  frame — value.ts deflates to national before printing. */
  p25Usd: number;
  medianUsd: number;
  p75Usd: number;
  slopeFromSales: boolean;
}

const REVALIDATE_SECONDS = 86_400; // the upstream file lands monthly

export async function fetchSalesBand(vin8: string, year: number, mileage: number): Promise<SalesBand | null> {
  if (!dbConfigured()) return null;
  if (!/^[A-HJ-NPR-Z0-9]{8}$/i.test(vin8)) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/cohort_sales_band`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _vin8: vin8.toUpperCase(), _model_year: year, _odometer: Math.round(mileage) }),
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { n?: number; p25?: number; median?: number; p75?: number; slopeFromSales?: boolean } | null;
    if (!j || !Number.isFinite(j.n) || !Number.isFinite(j.p25) || !Number.isFinite(j.median) || !Number.isFinite(j.p75)) return null;
    return { n: j.n!, p25Usd: j.p25!, medianUsd: j.median!, p75Usd: j.p75!, slopeFromSales: !!j.slopeFromSales };
  } catch {
    return null;
  }
}
