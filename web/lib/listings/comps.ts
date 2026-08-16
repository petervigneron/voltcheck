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
  /** Cheapest and dearest this cohort actually sold for. An ask outside the
   *  band is a price no car in the cohort ever reached. */
  saleLo: number;
  saleHi: number;
  /** How far apart the versions in this cohort ASK, from live inventory
   *  (migration 0022). Big means the line describes a mixture, not a car. */
  trimSpanUsd: number;
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
      `${base}/rest/v1/ev_price_model?select=vin8,model_year,intercept_usd,usd_per_mile,sales_n,odo_lo,odo_hi,sale_lo,sale_hi,trim_span_usd,resid_medae_usd`,
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
          sale_lo: string | number;
          sale_hi: string | number;
          trim_span_usd: string | number;
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
        saleLo: Number(r.sale_lo),
        saleHi: Number(r.sale_hi),
        trimSpanUsd: Number(r.trim_span_usd),
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

// ── Is this cohort one car, or several? ────────────────────────────────────
//
// The line is fitted per VIN(1-8) + model year. That key usually carries the
// trim, but Ford stamped none on 2022-23 Lightnings and Tesla's position 8 is
// a motor code, so some cohorts run Pro through Platinum — cars $30k apart new
// — and the line lands in the middle of the mixture.
//
// The resulting error is BIASED, not noisy, which is why the residual cap
// never caught it: every loaded car reads as overpriced and every basic one as
// a bargain. wa_ev_sales carries no trim, so the sales cannot be split; what
// migration 0022 measures instead is how far apart those versions ASK in live
// inventory, which is the only place trim exists for these VINs. Where that
// span clears this cohort's own error bar, the line is describing a mixture
// and has no business quoting a number at one car.
//
// Held against the cohort's own bar rather than a fixed figure, for the same
// reason the show-threshold is: a $3,000 spread is decisive in a cohort that
// predicts itself to $1,500 and is noise in one that predicts itself to $5,000.
const cohortIsMixed = (c: CompCohort): boolean =>
  c.trimSpanUsd >= Math.max(c.residMedaeUsd, MIN_ABS_USD);

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

  // Nor about a car it cannot tell apart from a different version of itself.
  if (cohortIsMixed(c)) return undefined;

  // The price axis of the same argument as the odometer band above. A cohort
  // whose dearest sale was $61,798 cannot say by how much a $62,025 ask is
  // over the market — it has never seen a car sell at this level, so the
  // distance is extrapolation dressed as a measurement.
  if (askUsd > c.saleHi || askUsd < c.saleLo) return undefined;

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
  /** Normalized trim, or undefined where we aren't willing to assert one.
   *  Supplied by the caller (buildIndex.ts) because deciding it needs
   *  trimClaim's contradiction gate, which comps.ts has no business owning. */
  trimKey?: string;
  /** Pack-level identity from the enrichment layer (lib/listings/enrich.ts
   *  packIdentity), supplied by the caller for the same layering reason as
   *  trimKey. Undefined where enrichment has no exact row for the car. */
  identity?: string;
}

/**
 * Peers at two resolutions, because VIN 1-8 is a cohort key of wildly varying
 * quality and the caller can't know which kind it got.
 *
 * For 295 of the 515 cohorts big enough to price anything, positions 1-8
 * already separate the trims and the wide group is exactly right. But Ford
 * stamped no trim on 2022-23 Lightnings (every truck is `W1E`; only the pack
 * code in position 8 varies) and Tesla's position 8 is a motor code, so the
 * other 220 mix Pro with Platinum — trucks that were $30k apart new.
 * Comparing against that mixture is what told a 2023 Lightning Platinum
 * asking $69,685 it was $18,408 over a median drawn mostly from Pros and XLTs.
 *
 * `narrow` therefore keys on trim as well, and askVsMarket picks between them
 * per listing rather than globally. Measured 2026-08-15: splitting EVERY
 * cohort by trim instead costs 14% of claims, changes the median claim by $0
 * and flips no verdict at all, because in a single-trim cohort the split only
 * thins the peer group.
 */
export interface AskIndex {
  wide: Map<string, AskPeer[]>;
  narrow: Map<string, AskPeer[]>;
}

const push = (m: Map<string, AskPeer[]>, k: string, p: AskPeer): void => {
  const bucket = m.get(k);
  if (bucket) bucket.push(p);
  else m.set(k, [p]);
};

/** Cohort key is VIN 1-8 + model year — the same key the sold model uses, so
 *  the pack code in position 8 keeps Extended and Standard Range apart. */
export function buildAskIndex(
  listings: {
    vin?: string;
    year: number;
    mileage?: number;
    priceUsd: number;
    condition?: string;
    trimKey?: string;
    identity?: string;
  }[]
): AskIndex {
  const index: AskIndex = { wide: new Map(), narrow: new Map() };
  for (const l of listings) {
    if (!l.vin || l.vin.length < 8) continue;
    if (l.mileage == null || l.mileage < 2000 || l.mileage > 200_000) continue;
    if (!Number.isFinite(l.priceUsd) || l.priceUsd < 1000) continue;
    const k = key(l.vin.slice(0, 8), l.year);
    const peer: AskPeer = {
      vin: l.vin.toUpperCase(),
      mileage: l.mileage,
      askUsd: l.priceUsd,
      trimKey: l.trimKey,
      identity: l.identity,
    };
    push(index.wide, k, peer);
    if (l.trimKey) push(index.narrow, `${k}|${l.trimKey}`, peer);
  }
  return index;
}

/** Does this car's whole VIN cohort mix pack identities? The sold-side twin
 *  of the peer-pool guard in askVsMarket, for a mixture the trim-span gate
 *  (cohortIsMixed above) is structurally blind to: Tesla stamps single-motor
 *  2024 Model Ys with one VIN code whether the pack is Long Range (320 mi)
 *  or standard (260 mi), and Teslas carry no feed trim, so trim spread reads
 *  as zero while cohort 7SAYGDED holds two different cars. The fitted line
 *  was regressed over whatever Washington sold under this prefix; the live
 *  cohort is the only observable sample of what the prefix contains, so when
 *  live cars of one prefix resolve to two packs, the fit is a mixture and
 *  askVsSold must not quote it. */
export function cohortIdentityMixed(
  asks: AskIndex,
  vin: string | undefined,
  year: number,
  identity?: string
): boolean {
  if (!vin || vin.length < 8) return false;
  const ids = new Set<string>();
  if (identity) ids.add(identity);
  for (const p of asks.wide.get(key(vin.slice(0, 8), year)) ?? []) if (p.identity) ids.add(p.identity);
  return ids.size > 1;
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
  /** True when the peers are the same TRIM, not just the same VIN cohort.
   *  Copy that says "this exact version" may only run when this is true. */
  trimMatched: boolean;
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
  realPrice: boolean,
  trimKey?: string,
  identity?: string
): AskVsMarket | undefined {
  if (!realPrice || !vin || vin.length < 8) return undefined;
  if (mileage == null || mileage < 2000 || mileage > 200_000) return undefined;
  if (!Number.isFinite(askUsd) || askUsd <= 0) return undefined;

  const k = key(vin.slice(0, 8), year);
  const self = vin.toUpperCase();
  const comparable = (p: AskPeer) =>
    p.vin !== self && Math.abs(p.mileage - mileage) <= MAX_PEER_MILE_GAP;

  const widePeers = (asks.wide.get(k) ?? []).filter(comparable);
  if (widePeers.length < MIN_PEERS) return undefined;

  // Depreciation per mile is the part of the sold fit that survives outside
  // the fitted band — the intercept is what a thin cohort gets wrong. So we
  // borrow the slope to move peers to this car's mileage even when askVsSold
  // itself has gone quiet, and say which slope we used.
  const c = comps.get(k);
  const slopeFromSales = c != null && Number.isFinite(c.usdPerMile) && c.usdPerMile < 0;
  const perMile = slopeFromSales ? c!.usdPerMile : FALLBACK_USD_PER_MILE;
  const medianAt = (ps: AskPeer[]) =>
    median(ps.map((p) => p.askUsd + perMile * (mileage - p.mileage)));

  const trimPeers = trimKey ? (asks.narrow.get(`${k}|${trimKey}`) ?? []).filter(comparable) : [];

  // Does the VIN pin the trim, or only the pack? Asked of the WHOLE cohort
  // rather than the mileage-windowed peers, and by counting versions rather
  // than measuring what they cost.
  //
  // Both parts were mistakes I made first. Windowing starved the question on
  // exactly the cohorts it exists for — most Lightning listings carry a cab
  // style where the trim belongs, so few trims cleared any per-trim minimum.
  // And pricing it needed several listings PER trim before it could answer,
  // which the small cohorts can never supply; those are the cohorts where a
  // four-car mixed median is most dangerous, and it let a 2022 Platinum be
  // called $11,384 over a median drawn from a Pro, an XLT and a Lariat.
  //
  // Counting is the honest question anyway: this is not "is the mixture
  // expensive" but "are these the same car". Only asserted trims count — a
  // cohort we have no trim evidence about cannot argue that it is mixed, which
  // is the one hole left here, and it closes as feeds improve.
  const cohortTrims = new Set<string>();
  for (const p of asks.wide.get(k) ?? []) if (p.trimKey) cohortTrims.add(p.trimKey);
  const vinPinsTrim = cohortTrims.size <= 1;

  let peers: AskPeer[];
  if (vinPinsTrim) {
    peers = widePeers;
  } else if (trimPeers.length >= MIN_PEERS) {
    peers = trimPeers;
  } else {
    // The cohort holds several versions and too few of this car's are listed.
    // The wide median is a mixture of different cars, so quoting a distance
    // from it would be inventing precision we do not have.
    return undefined;
  }
  const trimMatched = !vinPinsTrim;
  if (peers.length < MIN_PEERS) return undefined;

  // A pool is only a market if its members are the same car, and VIN 1-8
  // does not always guarantee that: 2024 Model Y cohort 7SAYGDED holds Long
  // Range RWD (320 mi) and standard RWD (260 mi) trucks under one code, and
  // its median priced neither. The enrichment layer can tell such cars apart
  // when the VIN cannot, so a pool whose members resolve to more than one
  // pack identity is a mixture and quotes nothing. Identity is pack-level
  // (packVariant before row id) deliberately: the 2022 Lightning Platinum
  // has its own enrichment row for its 300-mile EPA rating but the same
  // Extended Range pack as the XLT beside it, and pricing trims apart is the
  // narrow index's job, not this guard's.
  const identities = new Set<string>();
  if (identity) identities.add(identity);
  for (const p of peers) if (p.identity) identities.add(p.identity);
  if (identities.size > 1) return undefined;

  const peerMedian = medianAt(peers);
  if (!Number.isFinite(peerMedian) || peerMedian <= 0) return undefined;

  const delta = askUsd - peerMedian;
  if (Math.abs(delta) < ASK_MIN_ABS_USD) return undefined;
  if (delta < 0 && -delta > ASK_MAX_UNDER_FRACTION * askUsd) return undefined;

  return {
    deltaUsd: Math.round(delta),
    peerMedianUsd: Math.round(peerMedian),
    peerN: peers.length,
    slopeFromSales,
    trimMatched,
  };
}

// "$2,400" — the shape both surfaces use.
export function usd(n: number): string {
  return `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
