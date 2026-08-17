import type { EnrichedListing } from "./enrich";
import type { TileKind } from "@/components/Tile";

// The key facts a shopper compares — range, heat pump, drivetrain — come
// first and always survive the cap; extras (fast charging, new battery, pack
// size, mileage outliers) fill whatever room is left.
//
// Server-side: this reads the full enrichment result. The browse grid gets
// the finished tiles through the card index (lib/listings/card.ts); the
// detail page calls it directly.
export function listingTiles(
  e: EnrichedListing,
  max?: number
): { kind: TileKind; text: string; title?: string }[] {
  const l = e.listing;
  const t: { kind: TileKind; text: string; title?: string }[] = [];

  if (e.enrichment.candidates) {
    const ranges = e.enrichment.candidates
      .map((r) => r.range?.epaRangeMi?.value)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    if (ranges.length >= 2) {
      t.push({
        kind: "flag",
        text: `${ranges[0]}–${ranges[ranges.length - 1]} mi`,
        title: e.enrichment.discriminator ?? "This listing doesn't say which version it is",
      });
    }
  } else if (e.realRangeMi) {
    t.push({ kind: "range", text: `${e.realRangeMi.value} mi`, title: e.realRangeMi.note ?? undefined });
  }

  if (e.heatPump?.status === "no") t.push({ kind: "miss", text: "No heat pump", title: e.heatPump.detail });
  else if (e.heatPump?.status === "verify") t.push({ kind: "flag", text: "Heat pump?", title: e.heatPump.detail });
  else if (e.heatPump?.status === "yes") t.push({ kind: "kit", text: "Heat pump", title: e.heatPump.detail });

  if (l.drive) t.push({ kind: "spec", text: l.drive });

  if (e.fastCharge.status === "no") t.push({ kind: "miss", text: "No fast charging", title: e.fastCharge.detail });
  else if (e.fastCharge.status === "verify") t.push({ kind: "flag", text: "Fast charging?", title: e.fastCharge.detail });

  // Which plug the car fast-charges through. J1772 is omitted: it only appears
  // on cars whose missing DC option already shows as the louder tile above.
  if (e.port?.value === "NACS") t.push({ kind: "kit", text: "NACS", title: e.port.note ?? "Tesla-style port; plugs into the Supercharger network" });
  else if (e.port?.value === "CCS1") t.push({ kind: "spec", text: "CCS", title: e.port.note ?? undefined });
  else if (e.port?.value === "CHAdeMO") t.push({ kind: "flag", text: "CHAdeMO", title: e.port.note ?? "Aging fast-charge standard; new public CHAdeMO stations are rare" });

  if (l.campaignCheck?.packReplaced) {
    t.push({
      kind: "kit",
      text: `New battery ${l.campaignCheck.packReplacedDate?.slice(0, 4) ?? ""}`.trim(),
      title: `GM program ${l.campaignCheck.gmProgramNumber} · ${l.campaignCheck.packReplacedDate}`,
    });
  }

  // A pack size the maker never published gets the number and the word "est",
  // because "84 kWh" and "84 kWh, someone measured it" are different claims and
  // the second one shouldn't be able to pass as the first. Which capacity it is
  // — usable or total — is the smaller question and stays in the tooltip.
  if (e.packKwh) {
    const { value, basis, estimated, source, note } = e.packKwh;
    const what = basis === "total" ? "Total capacity" : "Usable capacity";
    const how = !estimated
      ? "manufacturer-published"
      : source === "agg"
        ? "unverified, no primary source found"
        : source === "vin"
          ? "from the maker's Part 565 filing, declared per VIN pattern rather than per car"
          : "estimated, the maker publishes no figure";
    t.push({
      kind: "spec",
      text: `${Math.round(value)} kWh${estimated ? " est" : ""}`,
      title: `${what}, ${how}${note ? ` · ${note}` : ""}`,
    });
  }

  // Only a used car can have low miles. On a new one the odometer reads
  // delivery and demo trips, so the flag fired on ~6,800 cars that had nothing
  // to boast about — a 2026 i5 with 3 miles on it and a Range Rover with 1 —
  // and said, of a car whose own card already reads "New", that its mileage
  // was a reason to buy it. High miles stays unconditional: a "new" car with
  // 100,000 miles on it is a fact worth printing whatever the feed calls it.
  if (l.condition !== "new" && l.mileage != null && l.mileage > 0 && l.mileage < 15000) {
    t.push({ kind: "flag", text: "Low miles" });
  } else if (l.mileage != null && l.mileage > 100000) t.push({ kind: "flag", text: "High miles" });

  return max ? t.slice(0, max) : t;
}
