import { createHash } from "node:crypto";

// Two facts about a NEW car's price that the lanes used to read and drop:
//
//   msrpUsd                 the car's own sticker (MSRP), as its platform states it
//   priceBeforeIncentives   whether the stored asking price has NO manufacturer
//                           incentive taken off it (true), provably HAS one
//                           taken off (false), or cannot be told (absent)
//
// WHY. A study on 2026-11-18 (branch new-car-band, web/lib/listings/
// newCarBand.ts) found a price signal for new cars cannot stand on raw asks:
// one dealer advertises MSRP, the next MSRP minus rebates most buyers do not
// qualify for (Ford's $4,500 retail stack on a Mach-E), and options move a
// sticker by thousands inside one trim. Of 9 "below" labels a raw-ask rule gave
// whose page could be read, 4 were false. What is honest is each car's
// discount from ITS OWN sticker, compared only among prices read before
// manufacturer incentives — and that needs these two facts per listing.
//
// THE RULES, all of which exist because a wrong value here becomes a false
// bargain later (the expensive error, CLAUDE.md "The house rule on claims"):
//
//  1. msrpUsd only for a car the lane's OWN machine-readable condition says is
//     new. dealer.com fills `msrp` on a USED car with the dealer's retail book
//     value (lib/platforms/dealercom.mjs, camelbackcars.com 2026-10-25); a used
//     car's "msrp" is never stored. ingest.mjs re-checks the published
//     condition on top of the lane's own word.
//  2. priceBeforeIncentives is a claim. A lane sets it true only when its
//     platform's own structured fields show the stored price has no
//     manufacturer incentive in it — the price IS the sticker, or the platform
//     lists dealer discount and incentives as separate lines and the stored
//     price is the subtotal above the incentive lines. false only when the
//     fields show incentives WERE subtracted. Absent everywhere else; absent is
//     the default, and a wrong `true` is the one that costs a shopper money.
//  3. The claim is about ONE number. The flag travels with the price it was
//     judged on (`forPrice` below, `priceBeforeIncentivesUsd` in the payload),
//     because that price can be replaced after the lane judged it: a VDP read
//     replacing a Dealer Inspire card, the ingest floor turning a sub-floor
//     price into an abstain, ingest_listings keeping another reader's price
//     (0103), recheck_listings jsonb_set-ing a new priceUsd into the payload.
//     A flag whose price is no longer the listing's price says nothing, and
//     every reader must ask incentiveBasis() (web/lib/listings/incentiveBasis.ts),
//     never the raw flag.

/**
 * Where a platform extractor puts these facts on the schema.org-shaped node it
 * hands normalize(). A Symbol, not a string key, on purpose: the generic lane
 * hands normalize() JSON-LD a dealer's own page served, and page-controlled
 * JSON must not be able to plant an "msrpUsd" on a node — JSON.parse cannot
 * produce a Symbol-keyed property. (offerProvenance() solves the same problem
 * for priceProvenance with an allowlist; a number has no allowlist.)
 */
export const STICKER = Symbol("sticker");

/** Sticker bounds, in whole dollars. The floor is the new-car price floor
 *  (lib/price-floor.mjs, $15,000: no new EV or PHEV sells for less — the
 *  cheapest new car in the 2026-11-03 snapshot asks $21,005). The ceiling sits
 *  above the dearest new plug-in the feed carries (a 2026 Lamborghini Revuelto
 *  asking $893,990) and below the misreads seen in the same snapshot (a
 *  $1,943,747 Tucson Plug-in Hybrid). */
export const MSRP_MIN_USD = 15_000;
export const MSRP_MAX_USD = 1_000_000;

/** How far the stored price may sit from the sticker before the pair is
 *  treated as a misread rather than a deal, as price / MSRP.
 *
 *  Below 0.6: lib/platforms/dealercom.mjs abstains on any discount deeper than
 *  40% off MSRP (MIN_TRUSTED_PRICE_FRACTION) as a conditional-rebate stack, and
 *  the same line serves here — a sticker more than 1/0.6 = 1.67x the price is
 *  either not this car's sticker (buddychevy.com's $414,811 retailValue on a
 *  $38,481 Lyriq) or a price that is not an unconditional ask, and the pair
 *  says nothing either way.
 *
 *  Above 1.3: dealer markups and add-ons topped out at +9.7% across the
 *  2026-11-18 sample (mbwestcovina.com's "Market Adjustment" rows, DealerOn
 *  dealer up-fits); past +30% the "sticker" is likelier a base price or a
 *  misread than the car's own (BMW's baseMsrp sat $5,650-$17,100 under its
 *  totalMsrp on the same cars).
 *
 *  Measured on the 2026-11-18 sample (7,273 new cars: dealer.com, DealerOn,
 *  Team Velocity, Dealer Inspire cards, GM/Kia/Hyundai/BMW locators), (price
 *  − MSRP)/MSRP ran
 *  −39.2% to +9.7%, and exactly one pair fell outside the bounds — a Team
 *  Velocity 2026 ID.4 at mckennacars.com, MSRP $47,932, stored $27,932
 *  (ratio 0.58: $6,500 of dealer discount and $13,500 of rebates), withheld.
 *  Its twin at $50,972 / $30,972 (0.61) passes, with priceBeforeIncentives
 *  false. (buddychevy.com's Lyriq is kept out twice over: no lane reads
 *  retailValue as a sticker.) */
export const PRICE_TO_MSRP_MIN = 0.6;
export const PRICE_TO_MSRP_MAX = 1.3;

/** Staging (ingest.mjs STICKER_BUCKETS): is this VIN's bucket, of 16, on? A
 *  stable hash of the VIN, so a car's bucket never changes between nights. */
export function stickerBucketOn(vin, bucketsOn) {
  if (!(bucketsOn > 0)) return false;
  if (bucketsOn >= 16) return true;
  const b = createHash("sha1").update(String(vin ?? "").toUpperCase()).digest()[0] & 15;
  return b < bucketsOn;
}

const posInt = (v) => {
  if (v == null || v === "" || typeof v === "boolean") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** A served sticker string or number → whole dollars, or undefined. "$55,840",
 *  "55840", "55840.0" and 55840 all read as 55840; "55840.50" is rejected
 *  rather than rounded (no maker prints cents on a sticker, so cents mean the
 *  field is something else), as is anything with letters ("PLEASE_CALL"). */
export function stickerDollars(v) {
  if (typeof v === "string" && !/^\s*\$?\s*[0-9][0-9,]*(\.0+)?\s*$/.test(v)) return undefined;
  const n = posInt(v);
  return n != null && Number.isInteger(n) ? n : undefined;
}

/**
 * Attach a lane's reading to the node it built. `forPrice` is the number the
 * flag was judged against — normally the node's offer price.
 */
export function withSticker(node, { msrpUsd, priceBeforeIncentives, forPrice } = {}) {
  if (!node || msrpUsd == null) return node;
  node[STICKER] = {
    msrpUsd,
    ...(typeof priceBeforeIncentives === "boolean" && forPrice != null ? { priceBeforeIncentives, forPrice } : {}),
  };
  return node;
}

/** The fields a normalized record carries, from a node's sticker, given the
 *  price normalize() actually read. A flag judged on a different price is
 *  dropped here; the MSRP, a fact about the car, is kept. */
export function stickerFields(node, priceUsd) {
  const s = node?.[STICKER];
  if (!s || s.msrpUsd == null) return {};
  const flagStands = typeof s.priceBeforeIncentives === "boolean" && s.forPrice === priceUsd;
  return {
    msrpUsd: s.msrpUsd,
    ...(flagStands ? { priceBeforeIncentives: s.priceBeforeIncentives, priceBeforeIncentivesUsd: priceUsd } : {}),
  };
}

/** For lanes that build normalized records directly (lib/oem/*): the two
 *  record fields, the flag bound to `priceUsd`. */
export function stickerRecord({ msrpUsd, priceBeforeIncentives, priceUsd }) {
  if (msrpUsd == null) return {};
  return {
    msrpUsd,
    ...(typeof priceBeforeIncentives === "boolean" && priceUsd != null
      ? { priceBeforeIncentives, priceBeforeIncentivesUsd: priceUsd }
      : {}),
  };
}

/**
 * The last gate, run by ingest.mjs on every record from every lane, after the
 * price floor has had its say. Returns the payload fields, or {} when the pair
 * cannot be stood behind. `reason` names the rule that refused (for the
 * ingest log and the tests).
 *
 *  - only a published-new car (ingest's own condition(), on top of the lane's);
 *  - only beside a real price (an abstain has nothing to compare against);
 *  - the sticker inside [MSRP_MIN_USD, MSRP_MAX_USD], whole dollars;
 *  - price/MSRP inside [PRICE_TO_MSRP_MIN, PRICE_TO_MSRP_MAX];
 *  - the flag only for the price it was judged on, and otherwise — when the
 *    price equals the sticker to the dollar — true: a price equal to the car's
 *    own MSRP has nothing taken off it, whichever field it was read from.
 *    A lane's explicit `false` is kept even then (it read the subtraction).
 */
export function checkSticker({ msrpUsd, priceBeforeIncentives, priceBeforeIncentivesUsd, priceUsd, condition }) {
  if (msrpUsd == null) return { fields: {} };
  if (condition !== "new") return { fields: {}, reason: "not-new" };
  if (!(priceUsd > 0)) return { fields: {}, reason: "no-price" };
  const msrp = stickerDollars(msrpUsd);
  if (msrp == null) return { fields: {}, reason: "not-whole-dollars" };
  if (msrp < MSRP_MIN_USD || msrp > MSRP_MAX_USD) return { fields: {}, reason: "msrp-out-of-range" };
  const ratio = priceUsd / msrp;
  if (ratio < PRICE_TO_MSRP_MIN || ratio > PRICE_TO_MSRP_MAX) return { fields: {}, reason: "price-msrp-ratio" };
  let flag = typeof priceBeforeIncentives === "boolean" && priceBeforeIncentivesUsd === priceUsd ? priceBeforeIncentives : undefined;
  if (flag === undefined && priceUsd === msrp) flag = true;
  return {
    fields: {
      msrpUsd: msrp,
      ...(flag === undefined ? {} : { priceBeforeIncentives: flag, priceBeforeIncentivesUsd: priceUsd }),
    },
  };
}

/**
 * How many of the 16 buckets are on today: 4 from 2026-11-19 (UTC), 8 the
 * next day, 12, then all 16 from 2026-11-22.
 *
 * A calendar, not a constant someone raises each night. The owner has under
 * an hour a week for this project and no session is guaranteed to be open on
 * four consecutive nights; a ramp that waits for a commit stops at whatever
 * step the last session reached. Keyed on the UTC date so that every ingest
 * run of a day (the nightly and each rolling slice) computes the same number:
 * runs that disagreed would add and remove the keys from the same rows and
 * rewrite them every time, which is the cost the staging exists to avoid.
 * A run that straddles midnight UTC uses the value from its start; the worst
 * case is one extra rewrite of the rows it touched.
 */
export const STICKER_RAMP_START = Date.UTC(2026, 10, 19);
export function stickerBucketsOn(now = Date.now()) {
  const day = Math.floor((now - STICKER_RAMP_START) / 86_400_000);
  return Math.max(0, Math.min(16, 4 * (day + 1)));
}
