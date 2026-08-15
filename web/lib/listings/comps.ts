import { dbConfigured } from "./db";

// What these cars actually SELL for, against what this dealer is ASKING.
//
// Every other price signal on the site is an asking price. ev_price_model
// (migration 0014) is fitted on Washington title records — money that
// changed hands — one line per vehicle variant and model year:
//
//   sale price = intercept_usd + usd_per_mile * odometer
//
// The whole model is a few hundred coefficient rows, so it ships as one
// small request per revalidation and every listing is priced from memory.
// Sourced from data.wa.gov rpr4-cgyd (ODbL) — attribution required
// wherever a derived figure renders, same rule as sales.ts.

export interface CompCohort {
  vin8: string;
  modelYear: number;
  interceptUsd: number;
  usdPerMile: number;
  salesN: number;
  /** Odometer band the line was fitted over. Outside it, the line is a guess. */
  odoLo: number;
  odoHi: number;
  /** This cohort's own median absolute residual — its error bar, in dollars. */
  residMedaeUsd: number;
}

export type CompIndex = Map<string, CompCohort>;

const REVALIDATE_SECONDS = 86_400; // the underlying title data refreshes monthly

const key = (vin8: string, year: number) => `${vin8.toUpperCase()}|${year}`;

export async function fetchCompIndex(): Promise<CompIndex> {
  const index: CompIndex = new Map();
  if (!dbConfigured()) return index;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(
      `${base}/rest/v1/ev_price_model?select=vin8,model_year,intercept_usd,usd_per_mile,sales_n,odo_lo,odo_hi,resid_medae_usd`,
      {
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          "Accept-Encoding": "gzip",
        },
        next: { revalidate: REVALIDATE_SECONDS },
      }
    );
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    const rows = (await res.json()) as
      | {
          vin8: string;
          model_year: number;
          intercept_usd: string | number;
          usd_per_mile: string | number;
          sales_n: number;
          odo_lo: string | number;
          odo_hi: string | number;
          resid_medae_usd: string | number;
        }[]
      | null;
    for (const r of rows ?? []) {
      index.set(key(r.vin8, r.model_year), {
        vin8: r.vin8,
        modelYear: r.model_year,
        // PostgREST may render numeric as string to protect precision.
        interceptUsd: Number(r.intercept_usd),
        usdPerMile: Number(r.usd_per_mile),
        salesN: r.sales_n,
        odoLo: Number(r.odo_lo),
        odoHi: Number(r.odo_hi),
        residMedaeUsd: Number(r.resid_medae_usd),
      });
    }
  } catch (err) {
    console.error("[comps] price model fetch failed:", err);
  }
  return index;
}

export interface AskVsSold {
  /** Ask minus fitted sale price. Positive = asking above what these sell for. */
  deltaUsd: number;
  /** The fitted transaction price this was measured against. */
  soldUsd: number;
  salesN: number;
}

// A gap is only worth showing when it clears the noise in its own cohort.
// Median absolute error is $2,196 across the model and varies a lot by
// cohort, so the bar is the cohort's own residual — never a global guess —
// with a floor that keeps thin, suspiciously-tight cohorts honest.
const MIN_ABS_USD = 1500;

// The far side of the same caution, and deliberately asymmetric.
//
// A car asking 84% below what its cohort sells for is not a dealer error a
// shopper can exploit — it is a car that differs from its cohort in a way
// the listing does not say: a battery well down on health, accident
// history, a salvage title. Battery state of charge is T4 in the
// enrichment schema precisely because it cannot be derived, so a bargain
// claim that loud would be guessing on the shopper's behalf, with their
// money. Above this line the model goes quiet.
//
// No matching ceiling on the over side: "asks more than these sell for" is
// checkable against the sales list right below it, and a dealer asking
// $52,995 for a 32k-mile Model Y is exactly the fact a shopper wants.
const MAX_UNDER_FRACTION = 0.3;

export function askVsSold(
  comps: CompIndex,
  vin: string | undefined,
  year: number,
  mileage: number | undefined,
  askUsd: number,
  realPrice: boolean
): AskVsSold | undefined {
  // Junk prices (lease payments, accessory totals) and delivery-mileage cars
  // have nothing to compare: the model is fitted on driven cars only.
  if (!realPrice || !vin || vin.length < 8) return undefined;
  if (mileage == null || mileage < 2000 || mileage > 200_000) return undefined;
  if (!Number.isFinite(askUsd) || askUsd <= 0) return undefined;

  const c = comps.get(key(vin.slice(0, 8), year));
  if (!c) return undefined;

  // A line says nothing about mileage its cohort never saw. Extrapolating
  // is what called a 5,900-mile 2020 Taycan $11k underpriced off a fit
  // built on 40k-mile cars, so the band is a hard gate, not a warning.
  if (mileage < c.odoLo || mileage > c.odoHi) return undefined;

  const sold = c.interceptUsd + c.usdPerMile * mileage;
  if (!Number.isFinite(sold) || sold <= 0) return undefined;

  const delta = askUsd - sold;
  const bar = Math.max(c.residMedaeUsd, MIN_ABS_USD);
  if (Math.abs(delta) < bar) return undefined;
  if (delta < 0 && -delta > MAX_UNDER_FRACTION * askUsd) return undefined;

  return { deltaUsd: Math.round(delta), soldUsd: Math.round(sold), salesN: c.salesN };
}

// "$2,400" — the shape both surfaces use.
export function usd(n: number): string {
  return `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
