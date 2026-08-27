// Which served number is a rechecked listing's asking price?
//
// Lifted out of recheck.mjs so it can be tested: that script does its whole
// night's work at import time, so nothing there is reachable from a test.
// lib/recheck-oem-crosscheck.mjs was split off for the same reason.
//
import { extractVehicles } from "./jsonld.mjs";
import { extractDdcVehicles, resolveDdcPriceTagged } from "./platforms/dealercom.mjs";
import { extractDealerOn, resolveDealerOnPriceTagged } from "./platforms/dealeron.mjs";
import { extractDcsVehicles } from "./platforms/dealercarsearch.mjs";
import { dealrVehicles } from "./platforms/dealrcloud.mjs";
import { priceFloor } from "./price-floor.mjs";
import { JSONLD, DCS_TILE, DEALR_ENTRY } from "./price-provenance.mjs";

// MUST mirror the precedence in lib/normalize.mjs + platforms/dealercom.mjs:
// the JSON-LD offer price wins, and the platform's own fields are only a
// fallback. Reversing this makes every dealer.com car look like it changed
// price on the first run and writes fiction into listing_price_history.
//
// `floor` is the plausibility gate from lib/price-floor.mjs, computed from
// the listing we're rechecking. dealer.com intermittently serves a finance
// payment as the JSON-LD offer price ($1,996 dips on hyundaioflasvegas.com
// that recovered days later, 2026-08-19) — a sub-floor reading here proves
// nothing about the price, so it returns null (leave the stored price alone)
// rather than writing a false cut into listing_price_history.
//
// Returns { price, provenance } — the number AND which served field gave it
// (migration 0041). Naming the field is what makes this lane's readings
// comparable with the crawl's instead of merely suspicious: 0040 had to
// suppress every nightly↔recheck pair on principle (27,139 steps, most of them
// real dealer moves) because a run source cannot distinguish "recheck saw a
// genuine markdown first" from "recheck read a different field". Each leg
// below tags itself with the SAME constant the crawl-side extractor uses for
// that field, so the first pair matches and the second still does not.
export const priceOf = (body, vin, url, l) => {
  const none = { price: null, provenance: undefined };
  // `l.year` is text, not a number: `payload->>year` in the select above
  // extracts the JSON value as text. priceFloor() coerces with Number() and
  // treats an unparseable year the same as a missing one (the low used floor),
  // so the tiering is unchanged — but do not compare it to a number without
  // coercing.
  const floor = priceFloor({ isNew: l.condition === "new", year: l.year });
  // Dealer Car Search publishes no JSON-LD, so without this its rows would
  // hold whatever price the last crawl saw and never move. The VDP's own data
  // layer is the same field lib/platforms/dealercarsearch.mjs reads into the
  // offer, so the precedence above is preserved rather than bypassed — and it
  // carries that file's tag for the same reason.
  for (const v of extractDcsVehicles(body, url)) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() !== vin) continue;
    const p = Number(v.offers?.price);
    if (Number.isFinite(p) && p >= floor) return { price: Math.round(p), provenance: DCS_TILE };
  }
  // dealr.cloud's JSON-LD Car has no VIN (and on some templates doesn't
  // parse), so like DCS its price is read from the platform's own markup —
  // the same entry-price field lib/platforms/dealrcloud.mjs builds the offer
  // from, so JSON-LD-first precedence is preserved, not bypassed.
  for (const v of dealrVehicles(body, url)) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() !== vin) continue;
    const p = Number(v.offers?.price);
    if (Number.isFinite(p) && p >= floor) return { price: Math.round(p), provenance: DEALR_ENTRY };
  }
  // The page's own schema.org offer — the same node lib/normalize.mjs reads,
  // hence the same tag. This is the leg that carries most of the win: a car
  // the nightly crawl priced from JSON-LD and recheck re-prices from JSON-LD
  // now pairs, and a real cut between them is claimable for the first time.
  //
  // It is read but NOT returned here. On the two platforms that publish an
  // MSRP beside the offer, the offer has been caught carrying something that
  // is not the price, and the floor cannot see it: suntrupfordwest.com's 2025
  // F-150 Lightning Flash 1FT6W3LU6SWG26144 published "price": 15021.0 — the
  // SAVINGS line off a $72,965 sticker, not the $57,944 ask. $15,021 clears
  // the $15,000 new-car floor by $21. The crawl's DealerOn resolver rejected
  // it from 2026-08-23 (commit 5ebca37); this lane did not, re-published the
  // discount as the asking price on 2026-08-26, and because both readings are
  // honestly tagged `jsonld` they PAIRED — the detail page drew a −$42,923
  // price cut nobody made. A guard that only half the lanes run is not a
  // guard, so the offer now goes to the same resolvers the crawl uses.
  let jsonld;
  for (const v of extractVehicles(body)) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() !== vin) continue;
    const offer = Array.isArray(v.offers) ? v.offers[0] : v.offers;
    const p = Number(String(offer?.price ?? "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(p)) { jsonld = Math.round(p); break; }
  }
  // What normalize() hands the crawl-side resolvers, rebuilt from this page.
  const rec = { vin, condition: l.condition, year: l.year, priceUsd: jsonld, priceProvenance: JSONLD };

  // DealerOn: resolveDealerOnPriceTagged owns the MSRP veto and the price
  // library ladder. Reusing it — rather than restating the rule — is what
  // keeps the two lanes from drifting apart again.
  const deol = extractDealerOn(body);
  const dv =
    deol &&
    ((deol.vehicle && String(deol.vehicle.vin).toUpperCase() === vin ? deol.vehicle : undefined) ??
      deol.dotagging.get(vin));
  if (dv) {
    const r = resolveDealerOnPriceTagged(rec, dv);
    // 0 is the resolver's abstain. Here that means leave the stored price
    // alone: a page we cannot price makes no claim, and writing nothing is
    // not the same as writing a cut.
    return r.priceUsd > 0 ? { price: r.priceUsd, provenance: r.provenance } : none;
  }

  // dealer.com, same argument. This replaces a lone internetPrice rung that
  // read one field of a stack the crawl reads whole — askingPrice is not a
  // price on these feeds (observed 595/695/999, dealer fees), and the
  // resolver already knows that. It also ends the jsonld↔ddc-internet field
  // flip that printed "$53,770→$29,495" on a car whose page showed both
  // numbers at once: both lanes now take the same field for the same page.
  const ddc = extractDdcVehicles(body).find((d) => String(d.vin).toUpperCase() === vin);
  if (ddc) {
    const r = resolveDdcPriceTagged(rec, ddc);
    return r.priceUsd > 0 ? { price: r.priceUsd, provenance: r.provenance } : none;
  }

  // Everywhere else the offer stands on its own, gated by the floor as before.
  return jsonld != null && jsonld >= floor ? { price: jsonld, provenance: JSONLD } : none;
};
