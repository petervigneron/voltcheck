import { allListings } from "./source";
import { displayTrim, enrichListing } from "./enrich";
import { listingTiles } from "./tiles";
import { bodyTypeOf } from "./bodyType";
import { hasRealPrice, priceCut } from "./price";
import { zipCoords } from "@/lib/zips";
import type { CardRow } from "./card";

// Everything the browse grid needs, computed once per revalidation instead of
// once per request: enrichment, tiles, body type, zip centroid, price-cut
// eligibility. The 14-day price-cut window and "new battery" grounds are
// evaluated here; an hour of staleness on a 14-day window is noise.
export async function buildCardIndex(): Promise<CardRow[]> {
  const listings = await allListings();
  const rows: CardRow[] = [];
  for (const l of listings) {
    const e = enrichListing(l);
    const trim = displayTrim(l);
    const cut = priceCut(l);
    rows.push({
      id: l.id,
      hay: `${l.year} ${l.make} ${l.model} ${l.trim ?? ""} ${l.exteriorColor ?? ""}`.toLowerCase(),
      year: l.year,
      make: l.make,
      model: l.model,
      title: `${l.year} ${l.make} ${l.model}${trim ? ` ${trim}` : ""}`,
      priceUsd: l.priceUsd,
      realPrice: hasRealPrice(l),
      cut: cut ? { amountUsd: cut.amountUsd, at: cut.at, prevUsd: l.prevPriceUsd! } : undefined,
      mileage: l.mileage,
      condition: l.condition,
      drive: l.drive,
      body: bodyTypeOf(l),
      city: l.city,
      state: l.state,
      loc: await zipCoords(l.zip),
      imageUrl: l.imageUrl,
      rangeMi: e.realRangeMi?.value,
      heatPump: e.heatPump?.status,
      packReplaced: l.campaignCheck?.packReplaced || undefined,
      tiles: listingTiles(e, 5).map((t) => ({ k: t.kind, t: t.text, ti: t.title })),
    });
  }
  return rows;
}
