import type { EnrichedListing } from "./enrich";

export type VehicleKind = "BEV" | "PHEV";

/** Battery-electric or plug-in hybrid, settled from the enrichment row alone.
 *
 *  The stored listing payload carries no fuel kind (payload->>evKind was null
 *  on every live row read 2026-09-02; crawl.mjs computes it and ingest.mjs's
 *  field list drops it). A row declares a plug-in by `plugIn`, by carrying a
 *  total (gas + electric) range, or by a "PHEV" pack variant; a row with an
 *  EPA range and none of those is a battery-electric. Anything else is
 *  unknown, and unknown is not BEV: New Jersey, Illinois, Massachusetts and
 *  Maine pay on BEVs only, and a Wrangler 4xe matched to no row must not be
 *  told it meets them.
 *
 *  Lived in lib/incentives/match.ts until 2026-09-03, when the card tiles
 *  needed the same answer (lib/listings/tiles.ts: a plug-in is not "missing"
 *  fast charging or a heat pump). One function, so the two surfaces cannot
 *  disagree about what a plug-in is. */
export function vehicleKind(e: EnrichedListing): VehicleKind | undefined {
  const rows = e.row ? [e.row] : (e.enrichment.candidates ?? []);
  if (!rows.length) return undefined;
  const kinds = new Set<VehicleKind | "?">(
    rows.map((r) => {
      if (r.plugIn || r.range?.epaRangeTotalMi || r.packVariant?.toUpperCase() === "PHEV") return "PHEV";
      if (r.range?.epaRangeMi || r.range?.mfrRangeMi) return "BEV";
      return "?";
    })
  );
  if (kinds.size !== 1) return undefined;
  const [k] = [...kinds];
  return k === "?" ? undefined : k;
}
