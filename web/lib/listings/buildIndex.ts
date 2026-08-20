import { allListings } from "./source";
import { displayTrim, enrichListing, packIdentity, specTrim } from "./enrich";
import type { EnrichedListing } from "./enrich";
import { listingTiles } from "./tiles";
import { bodyTypeOf } from "./bodyType";
import { hasRealPrice, priceCut } from "./price";
import { askVsMarket, askVsSold, buildAskIndex, cohortIdentityMixed, fetchCompIndex } from "./comps";
import { trimClaim } from "./trimClaim";
import { zipCoords } from "@/lib/zips";
import type { CardRow } from "./card";

// Everything the browse grid needs, computed once per revalidation instead of
// once per request: enrichment, tiles, body type, zip centroid, price-cut
// eligibility. The 14-day price-cut window and "new battery" grounds are
// evaluated here; an hour of staleness on a 14-day window is noise.
export async function buildCardIndex(): Promise<CardRow[]> {
  // A few hundred coefficient rows, fetched once and applied to every
  // listing in memory — the whole transaction-price model costs one request.
  const [feed, comps] = await Promise.all([allListings(), fetchCompIndex()]);
  // A row without an id or VIN cannot be linked, sharded, or deduped — and
  // one of them killed a production build outright (2026-08-16, a TypeError
  // in shardOf(undefined) while prerendering /api/index; the row was gone
  // from the feed within the hour, so most likely it was read mid-ingest).
  // One half-written row must cost the site one card, not the whole build.
  const listings = feed.filter((l) => {
    if (typeof l.id === "string" && l.id && typeof l.vin === "string" && l.vin) return true;
    console.error(`[index] dropping malformed row: vin=${l.vin ?? "?"} id=${l.id ?? "?"} ${l.make ?? ""} ${l.model ?? ""}`);
    return false;
  });
  // The trim we are willing to compare ON, decided once for the whole run so
  // the peer index and the lookup can never disagree about a car. Uppercased
  // because one dealer's "PRO" and the next one's "Pro" are one trim, and two
  // cohorts of one is the failure mode this whole split exists to avoid.
  const trimKeys = new Map<string, string>();
  for (const l of listings) {
    if (!trimClaim(l).assert) continue;
    const t = specTrim(l);
    if (t) trimKeys.set(l.vin, t.toUpperCase());
  }
  // Enrichment once per listing, up front: the peer index needs each car's
  // pack identity before any row is built, and the row loop reuses the same
  // result rather than matching every listing twice.
  const enriched = new Map<string, EnrichedListing>();
  for (const l of listings) enriched.set(l.vin, enrichListing(l));
  // Every live asking price, keyed by variant — cheap next to enrichment, and
  // it needs the full set, so it runs once here rather than per row. Disclosed
  // manufacturer repurchases stay out of the peer pool: their asks price a
  // branded history, and one dealer lists dozens, enough to drag a cohort's
  // median down and make its clean-title cars read as overpriced.
  const asks = buildAskIndex(
    listings
      .filter((l) => !l.buybackDisclosed)
      .map((l) => ({ ...l, trimKey: trimKeys.get(l.vin), identity: packIdentity(enriched.get(l.vin)!) }))
  );
  const rows: CardRow[] = [];
  for (const l of listings) {
    const e = enriched.get(l.vin)!;
    // A trim the listing's own description contradicts is not printed and not
    // offered as a facet — a wrong chip is worse than a missing one, because a
    // shopper filtering on "Lariat" would never see the Lariat that a feed
    // mislabelled "Pro".
    const claim = trimClaim(l);
    const trim = claim.assert ? displayTrim(l) : undefined;
    const cut = priceCut(l);
    const real = hasRealPrice(l);
    // A disclosed manufacturer repurchase gets no price claim on either
    // surface. The models are fitted on and compared against clean-title
    // cars; the seller's own text says this car differs from them in a way
    // neither model can price, so any delta would be a false figure with the
    // buyer's money. The card carries the disclosure itself instead.
    // A cohort whose live cars resolve to two different packs gets none
    // either: the sold fit for that VIN prefix is a mixture the trim-span
    // gate can't see (Teslas file no trim), so it prices nothing.
    const vsSold = l.buybackDisclosed || cohortIdentityMixed(asks, l.vin, l.year, packIdentity(e))
      ? undefined
      : askVsSold(comps, l.vin, l.year, l.mileage, l.priceUsd, real);
    // 2026-08-20 (docs/agents/pricing-model-2026-08-20.md): askVsMarket now
    // computes whenever it can, not only where vsSold above is silent. The
    // single-state (WA) sold model reaches 4.7% of listings and measured
    // 7-35% high outside the Northwest, so its delta is withheld from every
    // display surface until a second regional dataset can validate an
    // offset — vsSold is still computed for slopeFromSales (askVsMarket's
    // mileage adjustment borrows its fitted usd_per_mile) and stays the
    // internal signal the "Recently sold" panel's raw rows already are.
    const vsMarket = l.buybackDisclosed
      ? undefined
      : askVsMarket(asks, comps, l.vin, l.year, l.mileage, l.priceUsd, real, trimKeys.get(l.vin), packIdentity(e));
    rows.push({
      id: l.id,
      hay: `${l.year} ${l.make} ${l.model} ${l.trim ?? ""} ${l.exteriorColor ?? ""}`.toLowerCase(),
      year: l.year,
      make: l.make,
      model: l.model,
      title: `${l.year} ${l.make} ${l.model}${trim ? ` ${trim}` : ""}`,
      priceUsd: l.priceUsd,
      realPrice: real,
      cut: cut ? { amountUsd: cut.amountUsd, at: cut.at, prevUsd: l.prevPriceUsd! } : undefined,
      mileage: l.mileage,
      condition: l.condition,
      drive: l.drive,
      body: bodyTypeOf(l),
      city: l.city,
      state: l.state,
      loc: await zipCoords(l.zip),
      imageUrl: l.imageUrl,
      trim: claim.assert ? specTrim(l) : undefined,
      kwh: e.packKwh ? Math.round(e.packKwh.value) : undefined,
      rangeMi: e.realRangeMi?.value,
      heatPump: e.heatPump?.status,
      packReplaced: l.campaignCheck?.packReplaced || undefined,
      buyback: l.buybackDisclosed || undefined,
      listedOn: l.listedOn,
      askVsSold: vsSold?.deltaUsd,
      askVsMarket: vsMarket
        ? { deltaUsd: vsMarket.deltaUsd, peerN: vsMarket.peerN, trimMatched: vsMarket.trimMatched }
        : undefined,
      tiles: listingTiles(e, 5).map((t) => ({ k: t.kind, t: t.text, ti: t.title })),
    });
  }
  canonicalizeTrims(rows);
  return rows;
}

// specTrim normalizes each listing in isolation, which can't settle casing that
// only differs across feeds ("PRO" at one dealer, "Pro" at the next). Two chips
// for one trim is the failure mode, so within a model the most common spelling
// wins and every row adopts it.
function canonicalizeTrims(rows: CardRow[]): void {
  const forms = new Map<string, Map<string, number>>();
  const key = (r: CardRow) => `${r.make}\u0000${r.model}\u0000${r.trim!.toUpperCase()}`;
  for (const r of rows) {
    if (!r.trim) continue;
    const byForm = forms.get(key(r)) ?? new Map<string, number>();
    byForm.set(r.trim, (byForm.get(r.trim) ?? 0) + 1);
    forms.set(key(r), byForm);
  }
  const winner = new Map<string, string>();
  for (const [k, byForm] of forms) {
    winner.set(k, [...byForm].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  }
  for (const r of rows) if (r.trim) r.trim = winner.get(key(r));
}
