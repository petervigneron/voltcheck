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
      .map((r) => r.range?.epaRangeMi?.value ?? r.range?.mfrRangeMi?.value)
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
    // A maker's own figure where EPA never rated the vehicle carries "est" —
    // not because we doubt it, but because "272 mi" beside a rated car's
    // "272 mi" is a false equivalence, and these are simulations the maker
    // itself footnotes "EPA estimates not yet available". Same suffix
    // convention as the port and heat-pump tiles below.
    t.push({
      kind: "range",
      text: `${e.realRangeMi.value} mi${e.rangeIsMfrEstimate ? " est" : ""}`,
      title: e.realRangeMi.note ?? undefined,
    });
  }

  // A heat pump is a yes-or-no fact, so it never carries "est": that suffix
  // exists for numbers, where a maker's simulation beside an EPA rating is a
  // false equivalence. "No heat pump est" on an ID.4 read as a hedge on a
  // guess, which the claims rule forbids — the owner (2026-09-03): "there's
  // not uncertainty around the ID.4 heat pump; we just say it doesn't
  // exist." Either the source clears the bar to print, or nothing prints.
  // "verify" (a factory option, or AWD-only with the drivetrain unknown) is
  // not an answer, and the card does not print a question mark for it: if
  // there is nothing to say, print nothing. The rail's toggle already
  // treated "verify" as no answer (2026-08-31).
  if (e.heatPump?.status === "no") t.push({ kind: "miss", text: "No heat pump", title: e.heatPump.detail });
  else if (e.heatPump?.status === "yes") t.push({ kind: "kit", text: "Heat pump", title: e.heatPump.detail });

  if (l.drive) t.push({ kind: "spec", text: l.drive });

  if (e.fastCharge.status === "no") t.push({ kind: "miss", text: "No fast charging", title: e.fastCharge.detail });
  else if (e.fastCharge.status === "verify") t.push({ kind: "flag", text: "Fast charging?", title: e.fastCharge.detail });

  // Which plug the car fast-charges through. J1772 is omitted: it only appears
  // on cars whose missing DC option already shows as the louder tile above.
  // "est" whenever the port fact is agg-sourced rather than the maker's own
  // spec (GM Ultium, Cadillac Lyriq, Audi e-tron GT, Mercedes EQE rows among
  // others) — same convention as chargeTime1080Min.
  const portEst = e.port && e.port.source !== "mfr" ? " est" : "";
  if (e.port?.value === "NACS") t.push({ kind: "kit", text: `NACS${portEst}`, title: e.port.note ?? "Tesla-style port; plugs into the Supercharger network" });
  else if (e.port?.value === "CCS1") t.push({ kind: "spec", text: `CCS${portEst}`, title: e.port.note ?? undefined });
  else if (e.port?.value === "CHAdeMO") t.push({ kind: "flag", text: `CHAdeMO${portEst}`, title: e.port.note ?? "Aging fast-charge standard; new public CHAdeMO stations are rare" });

  // The maker's own 10-80% DC figure, previously buried in dcPeakKw's tooltip
  // note (see docs/agents/enrichment-gaps-2026-08-20.md) — condition (which
  // charger, whose peak rate) rides in the title, same as dcPeakKw's own notes.
  // Every row migrated so far is mfr-sourced; the "est" suffix is here so a
  // future agg/tested row doesn't silently read as the maker's own claim.
  if (e.chargeTime1080Min) {
    const { value, source, note } = e.chargeTime1080Min;
    t.push({
      kind: "spec",
      text: `${value} min 10–80%${source !== "mfr" ? " est" : ""}`,
      title: note ?? undefined,
    });
  }

  // The maker's own "low"-to-80% figure, for makers who state a looser start
  // than 10% (lib/types.ts). Its own label, because 45 minutes from GM's "low"
  // and 45 minutes from 10% are not the same claim.
  if (e.chargeTimeTo80Min) {
    const { value, source, note } = e.chargeTimeTo80Min;
    t.push({
      kind: "spec",
      text: `${value} min to 80%${source !== "mfr" ? " est" : ""}`,
      title: note ?? undefined,
    });
  }

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
  // Asked positively — a car we KNOW is used — rather than "not new". The
  // negative form fired on any car whose condition we never resolved, which
  // after the platform extractors stopped asserting "used" from an absent
  // field (scraper/lib/condition.mjs) includes cars that are new.
  if ((l.condition === "used" || l.condition === "certified") && l.mileage != null && l.mileage > 0 && l.mileage < 15000) {
    t.push({ kind: "flag", text: "Low miles" });
  } else if (l.mileage != null && l.mileage > 100000) t.push({ kind: "flag", text: "High miles" });

  return max ? t.slice(0, max) : t;
}
