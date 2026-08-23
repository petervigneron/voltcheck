// Which served field produced a listing's price.
//
// WHY THIS EXISTS
//
// listing_price_history records a price CLAIM, and the site turns a pair of
// them into "$3,131 under sold price" / "price cut $X" / the detail-page
// sparkline. A pair is only a claim about the DEALER if both readings came
// from the same place on the page. When they did not, the "change" is ours:
// the crawl read dealer.com's internetPrice while recheck read the JSON-LD
// offer, both numbers sit on the VDP simultaneously, and the swap published a
// price cut nobody made. Measured 2026-08-19: 7,036 of 9,154 chip-eligible
// cards were standing on such a step, 2,814 of them claiming >= $5,000.
//
// Migration 0040 stopped that with two blunt guards — the two rows must share
// an ingest RUN SOURCE, and no methodology transition may fall between them.
// They work, and they are coarse in both directions. Pairing on the lane
// cannot tell a genuine markdown that recheck happened to see first from a
// cross-lane field flip, so it suppresses both: of 98,395 observed steps,
// 50,182 (51%) are dropped as cross-lane and 21,860 (22%) for straddling a
// transition — 73% of everything we see, most of it real.
//
// Migration 0041 replaced the lane test with this one. The tag names the
// FIELD, not the lane, so the SAME reading taken by two different lanes
// matches and a real cut survives the lane change, while two DIFFERENT
// fields never pair no matter which lane read them. That is the whole point,
// and it is why the vocabulary below is organised by extractor+field.
//
// THE RULE FOR ADDING ONE: WHEN IN DOUBT, SPLIT.
//
// The two failure directions are not symmetric, and this file inherits the
// house rule's asymmetry. Giving two genuinely different fields the same tag
// manufactures a false price cut — the expensive error, the one that costs a
// shopper money and us trust. Giving one field two tags only makes the claim
// go quiet until the next matching observation — a missed chip, which costs
// nothing. So a new extractor gets its OWN tag unless its number has been
// verified byte-for-byte equal to an existing one on live rooftops. Two tags
// share a name here only where that check was actually done, and the comment
// says where.
//
// A tag must be stable over time as well as across lanes: renaming one
// silently breaks every pair that straddles the rename (old row tagged A, new
// row tagged B, no match) and goes quiet for a cycle. That is survivable but
// pointless, so treat these strings as append-only.

// The schema.org Offer price the dealer's own page publishes. Deliberately
// shared by four readers, each verified against the others on live rooftops:
//
//   - lib/normalize.mjs, reading offers.price off parsed page JSON-LD;
//   - recheck.mjs's generic JSON-LD leg, which reads the same node;
//   - lib/platforms/dealercom-api.mjs's renderedFinalPrice — the dprice row
//     flagged isFinalPrice, "byte-for-byte the VDP's JSON-LD offers.price"
//     (verified on live rooftops 2026-08-19, see that file's header);
//   - lib/platforms/dealeron-api.mjs's calc_INTERNET PRICE library line —
//     "verified byte-for-byte against the VDP's JSON-LD offers.price the old
//     path used (dublinchevrolet OPTIQ: 54083 both ways, 2026-08-19)".
//
// This sharing is the feature. It is what lets a dealer's genuine markdown be
// claimed when the nightly crawl saw the old price through one of these doors
// and recheck saw the new one through another.
export const JSONLD = "jsonld";

// dealer.com's own price stack (DDC.dataLayer on the HTML path,
// trackingPricing on the API path — the same fields either way). These are
// SEPARATE tags from JSONLD and from each other because they are separate
// numbers on the page: the whole incident above is a jsonld reading paired
// against a ddc-internet one.
export const DDC_INTERNET = "ddc-internet";
export const DDC_SALE = "ddc-sale";
export const DDC_ASKING = "ddc-asking";
export const DDC_MSRP = "ddc-msrp";

// DealerOn. Only the price library's `calc_INTERNET PRICE` line carries the
// JSONLD tag, and only because that specific line is the one that was checked
// (dublinchevrolet OPTIQ: 54083 both ways). Every other rung of that library's
// fallback ladder gets its own tag — including the un-prefixed `INTERNET
// PRICE`, which looks like the same field and has never been shown to be it.
// Likewise the card's own VehicleInternetPrice (a different field on a
// different object, and 0 on every record observed) and the HTML path's
// displayedPrice attribute.
export const DEOL_INTERNET = "deol-internet";
export const DEOL_SELLING = "deol-selling";
export const DEOL_MSRP = "deol-msrp";
export const DEOL_CARD_INTERNET = "deol-card-internet";
export const DEOL_DISPLAYED = "deol-displayed";

// One tag per remaining platform extractor, each naming that platform's own
// advertised-price field. None of these has been verified equal to the page's
// JSON-LD offer, so none of them claims to be JSONLD.
export const DFIRE_ADVERTISED = "dfire-advertised";   // DealerFire advertisedPrice
export const DVENOM_FINAL = "dvenom-final";           // DealerVenom finalPriceInt/price
export const DEALR_ENTRY = "dealr-entry";             // dealr.cloud inventory/entry-price markup
export const DCS_TILE = "dcs-tile";                   // Dealer Car Search tile/data-layer price
export const OVERFUEL_PRICE = "overfuel-price";       // Overfuel `price` (never `specialprice`)
export const TV_SELLING = "tv-selling";               // Team Velocity sellingPrice/yourPrice

// OEM/aggregator inventory APIs. Each lane reads one documented field out of
// one vendor's endpoint; none of them shares a code path with any other, so
// each gets its own tag rather than a single "oem" bucket that would let a
// Hyundai field pair against a Kia one on a co-listed VIN.
export const OEM = (lane) => `oem-${lane}`;

/** Walk an OEM lane's price fallback ladder and return both the number and the
 *  rung it came from, as `oem-<lane>-<field>`.
 *
 *  Every locator lane has a ladder — Hyundai's is dealerInternetPrice → msrp →
 *  startingMsrp, Mercedes' is dealPrice → inventoryPrice → msrp — and the rung
 *  a given car lands on is not stable. A dealer's internet price appears on
 *  Tuesday and the row silently moves from `msrp` to `dealerInternetPrice`,
 *  several thousand dollars lower. Migration 0040's guard cannot see that: both
 *  observations came from the same ingest source (`oem-direct`), so the pair
 *  passes and the site publishes a price cut the dealer never made. This is the
 *  same class of bug as the crawl/recheck field flip, inside one lane.
 *
 *  Tagging the RUNG is what closes it: the two observations carry different
 *  provenances, do not pair, and the claim goes quiet — while an honest
 *  markdown observed twice on the same rung still claims normally.
 *
 *  `candidates` is [fieldName, value] in the lane's own precedence order; the
 *  first non-null wins, exactly as the `??` chain it replaces did. */
export function pickTaggedPrice(lane, candidates) {
  for (const [field, value] of candidates) {
    if (value != null) {
      return { priceUsd: value, priceProvenance: `${OEM(lane)}-${slug(field)}` };
    }
  }
  return { priceUsd: undefined, priceProvenance: undefined };
}

/** The tag for one named field of one OEM lane, when the caller resolved the
 *  price itself. Used where the lane's precedence lives inside a single
 *  `num(a ?? b)` — rewriting those as a ladder would change which value wins
 *  when the first field is present but unparseable, and this change is not
 *  allowed to move a price. */
export const oemField = (lane, field) => `${OEM(lane)}-${slug(field)}`;

const slug = (s) =>
  String(s)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const KNOWN = new Set([
  JSONLD,
  DDC_INTERNET, DDC_SALE, DDC_ASKING, DDC_MSRP,
  DEOL_INTERNET, DEOL_SELLING, DEOL_MSRP, DEOL_CARD_INTERNET, DEOL_DISPLAYED,
  DFIRE_ADVERTISED, DVENOM_FINAL, DEALR_ENTRY, DCS_TILE, OVERFUEL_PRICE, TV_SELLING,
]);

/** True for a tag this build knows how to emit. OEM lane tags are accepted by
 *  shape (`oem-<lane>`) rather than enumerated, so adding a locator lane does
 *  not need an edit here. */
export function isProvenance(tag) {
  return typeof tag === "string" && (KNOWN.has(tag) || /^oem-[a-z0-9][a-z0-9-]{0,62}$/.test(tag));
}

/** The tag a platform extractor stamped on the Offer node it synthesized, or
 *  undefined.
 *
 *  Platform builders hand normalize() a schema.org-shaped node they assembled
 *  from an API record, so `offers.price` is NOT the page's JSON-LD offer and
 *  must not be tagged as one. They declare what it really is by setting
 *  `offers.priceProvenance`; normalize() reads it through here and falls back
 *  to JSONLD only for a node it genuinely parsed off a dealer's page.
 *
 *  Unknown values are dropped rather than trusted. A tag reaching this
 *  function came either from our own extractors or, on the generic path, from
 *  JSON-LD a dealer's site served — and page-controlled text must not be able
 *  to name a provenance, least of all one that would pair with a real field's.
 *  Dropping it falls back to JSONLD, which is what the reading actually is. */
export function offerProvenance(offer) {
  const tag = Array.isArray(offer) ? offer[0]?.priceProvenance : offer?.priceProvenance;
  return isProvenance(tag) ? tag : undefined;
}
