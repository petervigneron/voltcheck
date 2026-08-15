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

// ── The other half of the market: what these are ASKING right now ──────────
//
// askVsSold above answers "what does this car sell for". It goes quiet on
// 55% of inventory, because 837 of 1,181 live cohorts have no Washington
// title history at all, and quiet again whenever a car sits outside its
// cohort's fitted odometer band — 257 cohorts have listings past that edge.
// A 2022 Extended Range Lightning at 64,768 miles hits both walls at once:
// no WA sale of that truck above 40,000 miles exists.
//
// The live inventory does cover it, and a shopper comparing that truck to the
// others listed today is doing something real. So this is a SECOND signal,
// never blended into the first: the sold model stays fitted on money that
// changed hands, and this one is labelled for what it is.
//
// Two reasons an ask-side gap is weaker evidence than a sold-side one, both
// pushing the same direction:
//   - asks run about $1,100 above sale prices across this dataset;
//   - live inventory is survivorship-biased toward cars that AREN'T selling,
//     which is disproportionately the overpriced ones.
// Both inflate the peer median, so "below the asking market" overstates the
// bargain. It is a real fact about a shopper's alternatives today; it is not
// a valuation, and callers must not print it as one.

export interface AskPeer {
  vin: string;
  mileage: number;
  askUsd: number;
}
export type AskIndex = Map<string, AskPeer[]>;

/** Cohort key is VIN 1-8 + model year — the same key the sold model uses, so
 *  the pack code in position 8 keeps Extended and Standard Range apart. */
export function buildAskIndex(
  listings: { vin?: string; year: number; mileage?: number; priceUsd: number; condition?: string }[]
): AskIndex {
  const index: AskIndex = new Map();
  for (const l of listings) {
    if (!l.vin || l.vin.length < 8) continue;
    if (l.mileage == null || l.mileage < 2000 || l.mileage > 200_000) continue;
    if (!Number.isFinite(l.priceUsd) || l.priceUsd < 1000) continue;
    const k = key(l.vin.slice(0, 8), l.year);
    const bucket = index.get(k);
    const peer = { vin: l.vin.toUpperCase(), mileage: l.mileage, askUsd: l.priceUsd };
    if (bucket) bucket.push(peer);
    else index.set(k, [peer]);
  }
  return index;
}

export interface AskVsMarket {
  /** Ask minus the mileage-adjusted median peer ask. Negative = cheaper. */
  deltaUsd: number;
  /** That median, at THIS car's mileage. */
  peerMedianUsd: number;
  /** Peers it was measured against — self excluded. */
  peerN: number;
  /** True when the mileage adjustment used the cohort's own sold-fit slope
   *  rather than a fallback, i.e. the adjustment is anchored in transactions. */
  slopeFromSales: boolean;
}

// Four peers is the floor. Below that the median is one or two dealers'
// opinions, and a single aspirational asking price moves it thousands.
const MIN_PEERS = 4;
// A peer 40,000 miles away from this car needs a $4,000+ adjustment before it
// can be compared, which is more correction than signal. Drop it instead.
const MAX_PEER_MILE_GAP = 40_000;
// Without a fitted cohort slope, fall back to the dataset-wide used-EV rate.
// Deliberately gentle: under-correcting a high-mileage car makes it look
// EXPENSIVE, which is the safe direction to be wrong in.
const FALLBACK_USD_PER_MILE = -0.09;
// Same asymmetric caution as the sold side, same reason: a car asking 30%
// under everything else listed differs from its cohort in a way the listing
// doesn't say, and we will not guess at it with a shopper's money.
const ASK_MAX_UNDER_FRACTION = 0.3;
// Asks are noisier than the fitted sale line, so the bar to say anything is
// higher than the sold side's $1,500 floor.
const ASK_MIN_ABS_USD = 2000;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function askVsMarket(
  asks: AskIndex,
  comps: CompIndex,
  vin: string | undefined,
  year: number,
  mileage: number | undefined,
  askUsd: number,
  realPrice: boolean
): AskVsMarket | undefined {
  if (!realPrice || !vin || vin.length < 8) return undefined;
  if (mileage == null || mileage < 2000 || mileage > 200_000) return undefined;
  if (!Number.isFinite(askUsd) || askUsd <= 0) return undefined;

  const k = key(vin.slice(0, 8), year);
  const peers = (asks.get(k) ?? []).filter(
    (p) => p.vin !== vin.toUpperCase() && Math.abs(p.mileage - mileage) <= MAX_PEER_MILE_GAP
  );
  if (peers.length < MIN_PEERS) return undefined;

  // Depreciation per mile is the part of the sold fit that survives outside
  // the fitted band — the intercept is what a thin cohort gets wrong. So we
  // borrow the slope to move peers to this car's mileage even when askVsSold
  // itself has gone quiet, and say which slope we used.
  const c = comps.get(k);
  const slopeFromSales = c != null && Number.isFinite(c.usdPerMile) && c.usdPerMile < 0;
  const perMile = slopeFromSales ? c!.usdPerMile : FALLBACK_USD_PER_MILE;

  const adjusted = peers.map((p) => p.askUsd + perMile * (mileage - p.mileage));
  const peerMedian = median(adjusted);
  if (!Number.isFinite(peerMedian) || peerMedian <= 0) return undefined;

  const delta = askUsd - peerMedian;
  if (Math.abs(delta) < ASK_MIN_ABS_USD) return undefined;
  if (delta < 0 && -delta > ASK_MAX_UNDER_FRACTION * askUsd) return undefined;

  return {
    deltaUsd: Math.round(delta),
    peerMedianUsd: Math.round(peerMedian),
    peerN: peers.length,
    slopeFromSales,
  };
}

// "$2,400" — the shape both surfaces use.
export function usd(n: number): string {
  return `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
