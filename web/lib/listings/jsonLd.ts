import { BASE } from "@/lib/sitemap";
import type { EnrichedListing } from "./enrich";
import { displayTrim } from "./enrich";
import { trimClaim } from "./trimClaim";
import { hasRealPrice } from "./price";
import { vehicleKind } from "./kind";
import type { HubCar } from "./hubIndex";

// schema.org for the listing page — the machine-readable copy of what the page
// already says, for agents that shop on someone's behalf and for search
// engines' vehicle-listing surfaces. Same publication shape as
// components/facts/FactJsonLd.tsx: a plain object built here, serialized into
// one <script type="application/ld+json"> by the component.
//
// THE HOUSE RULE ON CLAIMS APPLIES TO EVERY FIELD, and it binds harder here
// than on the page: a shopper reads a tile with its "est" suffix and its
// hover, an agent reads a number with a name on it and nothing else. So every
// value below comes from the same summaries the page's own tiles and rows are
// built from (lib/listings/tiles.ts, EnrichmentReport) — never from the
// enrichment row directly — and where a summary carries a qualifier the page
// prints, this file prints it too:
//
//   - "est" rides in the property NAME ("Battery capacity (est)"), because a
//     PropertyValue's value has to stay a bare number for unitCode to mean
//     anything, and an unmarked figure beside a manufacturer's own is the
//     false equivalence tiles.ts's comment describes. Yes/no facts (heat
//     pump) never carry it — owner, 2026-09-03.
//   - a manufacturer's simulated range is NOT called "EPA range". It is the
//     same figure the tile marks est, and naming it after a rating the car
//     never got would be matching the wrong thing in the one field an agent
//     would trust most.
//   - no `offers` at all when the price is not one we could confirm; the page
//     says "See dealer for price" there and this file says nothing rather
//     than publishing a number the page won't stand behind.
//   - a `note` on a Fact is never emitted, by rule (lib/enrichment/noteRule.ts,
//     scripts/note-hygiene.mjs). Nothing in this file reads one.
//
// The trim follows the page's own verdict (trimClaim): a contradicted trim
// renders as a disagreement on the page, and goes into no machine-readable
// name at all.

const DRIVE_WHEELS: Record<string, string> = {
  RWD: "https://schema.org/RearWheelDriveConfiguration",
  AWD: "https://schema.org/AllWheelDriveConfiguration",
  FWD: "https://schema.org/FrontWheelDriveConfiguration",
};

type PropertyValue = {
  "@type": "PropertyValue";
  name: string;
  value: string | number;
  unitCode?: string;
};

/** The page's "est" marker, in the only place a machine will read it. */
const est = (name: string, estimated: boolean) => (estimated ? `${name} (est)` : name);

export function listingPath(id: string): string {
  return `/listing/${id}`;
}

export function listingJsonLd(e: EnrichedListing): Record<string, unknown> {
  const l = e.listing;
  const url = `${BASE}${listingPath(l.id)}`;
  const claim = trimClaim(l);
  const trim = claim.assert && displayTrim(l) ? ` ${claim.trim}` : "";

  const props: PropertyValue[] = [];

  // Battery capacity. packKwh exists only on an exact enrichment match, and
  // `estimated` is true for anything that is not the maker's own published
  // figure — the same boolean the tile turns into its "est" suffix. Rounded
  // the same way the tile rounds it, so page and markup print one number.
  if (e.packKwh) {
    props.push({
      "@type": "PropertyValue",
      name: est("Battery capacity", e.packKwh.estimated),
      value: Math.round(e.packKwh.value),
      unitCode: "KWH",
    });
  }

  // Range. EPA first and always (enrich.ts): rangeIsMfrEstimate means no EPA
  // rating exists for this car at all, so the property is not called an EPA
  // range and carries the est marker instead.
  if (e.realRangeMi) {
    props.push({
      "@type": "PropertyValue",
      name: e.rangeIsMfrEstimate ? "Range (est)" : "EPA range",
      value: e.realRangeMi.value,
      unitCode: "SMI",
    });
  }

  // Charge port, marked est whenever the fact is not the maker's own spec —
  // the same `source !== "mfr"` test the tile uses.
  if (e.port) {
    props.push({
      "@type": "PropertyValue",
      name: est("Charge port", e.port.source !== "mfr"),
      value: e.port.value,
    });
  }

  // Heat pump: a yes-or-no fact, so never est, and "verify" is not an answer
  // — the card prints nothing for it and neither does this.
  if (e.heatPump?.status === "yes" || e.heatPump?.status === "no") {
    props.push({
      "@type": "PropertyValue",
      name: "Heat pump",
      value: e.heatPump.status === "yes" ? "Yes" : "No",
    });
  }

  const condition =
    l.condition === "new"
      ? "https://schema.org/NewCondition"
      : l.condition === "used" || l.condition === "certified"
        ? "https://schema.org/UsedCondition"
        : undefined;

  const kind = vehicleKind(e);

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Car",
    "@id": `${url}#vehicle`,
    url,
    name: `${l.year} ${l.make} ${l.model}${trim}`,
    vehicleIdentificationNumber: l.vin.toUpperCase(),
    brand: { "@type": "Brand", name: l.make },
    model: l.model,
    vehicleModelDate: String(l.year),
  };

  // The odometer, except when it reads zero: the page prints "0 mi
  // (dealer-listed)" there, which is a hedge, not a reading, and a bare 0 in
  // markup is the hedge deleted.
  if (l.mileage != null && l.mileage > 0) {
    node.mileageFromOdometer = {
      "@type": "QuantitativeValue",
      value: l.mileage,
      unitCode: "SMI",
    };
  }
  if (condition) node.itemCondition = condition;
  // Only from the enrichment row's own answer (lib/listings/kind.ts); a car
  // that matched nothing gets no fuel type rather than a guess, because
  // "Electric" on a Wrangler 4xe is exactly the wrong thing to tell an agent.
  if (kind) node.fuelType = kind === "PHEV" ? "Plug-in hybrid" : "Electric";
  if (l.exteriorColor) node.color = l.exteriorColor;
  if (l.drive && DRIVE_WHEELS[l.drive]) node.driveWheelConfiguration = DRIVE_WHEELS[l.drive];
  if (l.previousOwners != null) node.numberOfPreviousOwners = l.previousOwners;
  if (props.length) node.additionalProperty = props;

  if (hasRealPrice(l)) {
    const offer: Record<string, unknown> = {
      "@type": "Offer",
      price: l.priceUsd,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: l.sourceUrl ?? url,
    };
    if (condition) offer.itemCondition = condition;
    // A named rooftop only. "Dealer" and "Private seller" are what the page
    // shows when the feed never named one, and neither is an organization.
    if (l.dealerName && l.sellerType === "dealer") {
      const seller: Record<string, unknown> = { "@type": "Organization", name: l.dealerName };
      if (l.sourceUrl) seller.url = l.sourceUrl;
      offer.seller = seller;
    }
    if (l.city && l.state) {
      offer.availableAtOrFrom = {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: l.city,
          addressRegion: l.state,
          addressCountry: "US",
        },
      };
    }
    node.offers = offer;
  }

  return node;
}

/** The cars a model hub lists, as an ItemList pointing at their own pages.
 *  Names and prices only — everything a shopper can see on the hub itself.
 *  The hub lists a page of its cars and says so; `numberOfItems` is what this
 *  list holds, not the hub's total, so the markup can't overstate it. */
export function hubItemListJsonLd(name: string, path: string, cars: HubCar[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${BASE}${path}#listings`,
    name,
    numberOfItems: cars.length,
    itemListElement: cars.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE}${listingPath(c.id)}`,
      name: c.title,
    })),
  };
}
