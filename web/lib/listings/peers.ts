import type { Listing } from "./types";
import { fetchCohortFromDb } from "./db";
import { enrichListing, packIdentity, specTrim } from "./enrich";
import { trimClaim } from "./trimClaim";
import { hasRealPrice } from "./price";
import {
  askCohortFetchPattern,
  askVsMarket,
  askVsSold,
  buildAskIndex,
  cohortIdentityMixed,
  fetchCompIndex,
  type AskVsMarket,
  type AskVsSold,
} from "./comps";

// The listing page's price signals, decided exactly as the browse grid
// decides them. The grid's index build (buildIndex.ts) sees the whole feed
// at once; this page sees one row, so the peer pool is fetched as one
// cohort-sized request (db.ts fetchCohortFromDb) and run through the same
// functions with the same gates in the same order. Any rule added to one
// caller belongs in the other — a card that says "$3,064 above similar
// listings" and a page that says nothing is how this module came to exist.

export interface PriceSignals {
  vsSold?: AskVsSold;
  vsMarket?: AskVsMarket;
  /**
   * The cohort's other live asks, for the price-vs-mileage chart — the same
   * members the ask index above was built from (real prices, repurchases
   * already out), so the chart can never plot a car the comparison wouldn't
   * count. sameTrim: true = same asserted trim as this car; false = a
   * different asserted trim; null = one side unknown. The chart renders the
   * distinction (solid vs hollow) because a mixed cloud read as one cohort
   * is exactly the biased-mixture error 0022 suppresses in the models.
   */
  peerAsks: { mileage: number; priceUsd: number; sameTrim: boolean | null }[];
}

export async function listingPriceSignals(l: Listing): Promise<PriceSignals> {
  // A disclosed manufacturer repurchase gets no price claim on either
  // surface — same rule, same reason as the browse grid: the models price
  // clean-title cars and the seller's own text says this isn't one.
  if (l.buybackDisclosed) return { peerAsks: [] };
  if (!l.vin || l.vin.length < 8) return { peerAsks: [] };

  const [comps, cohort] = await Promise.all([
    fetchCompIndex(),
    // The pattern widens the fetch to the whole ask cohort where a VIN digit
    // is masked (a 2023 Lightning's peers sit on both sides of the GVWR
    // digit); everywhere else it is the plain vin8 prefix this always was.
    fetchCohortFromDb(askCohortFetchPattern(l.vin.slice(0, 8)), l.year),
  ]);

  // Same derivations as the index build: trim only where trimClaim will
  // stand behind it, identity from the enrichment layer, repurchases out of
  // the pool.
  const members = (cohort ?? [])
    .filter((m) => !m.buybackDisclosed)
    .map((m) => {
      const t = trimClaim(m).assert ? specTrim(m) : undefined;
      return { ...m, trimKey: t ? t.toUpperCase() : undefined, identity: packIdentity(enrichListing(m)) };
    });
  const asks = buildAskIndex(members);

  const self = members.find((m) => m.vin === l.vin);
  const identity = self?.identity ?? packIdentity(enrichListing(l));
  const selfTrim = trimClaim(l).assert ? specTrim(l) : undefined;
  const trimKey = self?.trimKey ?? (selfTrim ? selfTrim.toUpperCase() : undefined);

  const real = hasRealPrice(l);
  const vsSold = cohortIdentityMixed(asks, l.vin, l.year, identity)
    ? undefined
    : askVsSold(comps, l.vin, l.year, l.mileage, l.priceUsd, real);
  // Only where the transaction model is silent, exactly as on the card: two
  // price claims on one surface invite reading them as corroboration.
  const vsMarket = vsSold
    ? undefined
    : askVsMarket(asks, comps, l.vin, l.year, l.mileage, l.priceUsd, real, trimKey, identity);

  const peerAsks = members
    .filter((m) => m.vin !== l.vin && hasRealPrice(m) && m.mileage != null && m.mileage > 0)
    .map((m) => ({
      mileage: m.mileage!,
      priceUsd: m.priceUsd,
      sameTrim: m.trimKey && trimKey ? m.trimKey === trimKey : null,
    }));

  return { vsSold, vsMarket, peerAsks };
}
