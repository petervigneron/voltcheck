// DealerOn platform extractor. Two templates are in the wild and both ship
// everything we need in the HTML served to everyone:
//
//   sdDataLayer — the older one. One `sdDataLayer = {...}` per VDP, holding
//   vehicleDetails (vin, trim, drivetrain, colors, price) plus the dealer's
//   own city/state/zip, with the odometer rendered separately as an
//   info__item--mileage block.
//
//   dotagging — the current one. No sdDataLayer at all; each vehicle carries
//   its facts as `data-dotagging-item-*` attributes on its own element, and
//   the subject car adds `data-odometer`. Measured 2026-08-17: 2,260 listings
//   — 44% of everything we hold on DealerOn sites — were falling out of this
//   extractor because it required sdDataLayer and returned null without it.
//   They reached the site with no mileage, no stock number and no colours;
//   the sample that started this (a 2017 Bolt on familydeal.com) was showing
//   a $11,803 asking price beside no odometer at all, and the car has
//   137,703 miles on it. Silence about mileage on a used car reads as a
//   low-mileage car, so this was the worst-shaped gap on the page.
//
// A VDP carries several dotagging blocks — the subject plus its "similar
// vehicles" rail — so blocks are keyed by VIN and matched to the record,
// never taken positionally. Only the subject's block has data-odometer.

import { DEOL_DISPLAYED, DEOL_SELLING } from "../price-provenance.mjs";
import { priceFromLibraryTagged } from "./dealeron-api.mjs";
import { priceFloor } from "../price-floor.mjs";
import { text } from "../normalize.mjs";

function parseSdDataLayer(html) {
  const m = html.match(/sdDataLayer\s*=\s*\{/);
  if (!m) return null;
  const start = html.indexOf("{", m.index);
  let depth = 0;
  let end = start;
  for (let j = start; j < html.length; j++) {
    if (html[j] === "{") depth++;
    else if (html[j] === "}") {
      depth--;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  try {
    return JSON.parse(html.slice(start, end + 1));
  } catch {
    return null;
  }
}

// The rendered spec list, shared by both templates: <span class="info__label">
// names the field and the sibling info__value carries it in a title attribute.
function infoItem(html, field) {
  const re = new RegExp(`info__item--${field}[\\s\\S]{0,600}?info__value[^"]*"[^>]*title="([^"]*)"`);
  const m = html.match(re);
  const v = m?.[1]?.trim();
  return v || undefined;
}

function num(v) {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Attributes sit on a single element, and no dotagging value contains an
// angle bracket, so the enclosing tag is the span between the surrounding
// < and >.
function enclosingTag(html, at) {
  const open = html.lastIndexOf("<", at);
  const close = html.indexOf(">", at);
  if (open === -1 || close === -1) return "";
  return html.slice(open, close + 1);
}

const DOT_ATTR = /data-dotagging-item-id="([^"]{11,})"/g;

function parseDotagging(html) {
  const byVin = new Map();
  for (const m of html.matchAll(DOT_ATTR)) {
    const tag = enclosingTag(html, m.index);
    if (!tag) continue;
    const attr = (name) => tag.match(new RegExp(`data-dotagging-item-${name}="([^"]*)"`))?.[1]?.trim() || undefined;
    const vin = m[1].trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) continue;
    byVin.set(vin, {
      vin,
      trim: attr("variant"),
      drivetrain: attr("drivetrain"),
      exteriorColor: attr("color"),
      displayedPrice: attr("price"),
      // NOTE: data-dotagging-item-condition is deliberately NOT read. It is an
      // analytics bucket, not a warranty fact, and it contradicts the page's
      // own JSON-LD: haywardkia.com and weatherfordbmw.com both stamp "cpo" on
      // cars their Product schema calls UsedCondition and their H1 carries no
      // certified badge, and one of them is a Kia store applying it to a
      // Hyundai, which no manufacturer CPO programme allows. Certification is a
      // claim about a warranty, so it comes from the feed's own condition or
      // not at all.
      stockNumber: attr("number"),
      // The three price attributes that sit on this same element, none of them
      // under the dotagging namespace. See resolveDealerOnPriceTagged on why
      // displayedPrice above is NOT the advertised price when these disagree.
      sellingPrice: num(tag.match(/data-price="([^"]*)"/)?.[1]),
      msrp: num(tag.match(/data-msrp="([^"]*)"/)?.[1]),
      priceLibrary: tag.match(/data-pricelib="([^"]*)"/)?.[1],
      odometer: num(tag.match(/data-odometer="([^"]*)"/)?.[1]),
    });
  }
  return byVin;
}

export function extractDealerOn(html) {
  const dl = parseSdDataLayer(html);
  const dotagging = parseDotagging(html);
  // Neither template present: not a DealerOn page, and saying so matters —
  // crawl.mjs only stamps `platform` when this returns something.
  if (!dl && dotagging.size === 0) return null;

  const mileage = num(infoItem(html, "mileage"));
  return {
    vehicle: dl?.vehicleDetails ?? null,
    dotagging,
    dealer: dl
      ? { city: dl.dealerCity, state: dl.dealerState, zip: dl.dealerZipCode, name: dl.dealerName }
      : // The dotagging template carries no dealer address anywhere on the
        // VDP (checked: no sdDataLayer, no addressLocality, no AutoDealer
        // JSON-LD). The city in the URL slug is not it either — it is the
        // rooftop's marketing city and appears as "Portland+Oregon" on some
        // sites. Left absent rather than guessed.
        null,
    mileage,
    interiorColor: infoItem(html, "interior-color"),
    exteriorColor: infoItem(html, "exterior-color"),
  };
}

// Below this fraction of the page's own MSRP a JSON-LD offer price is not a
// discount, it is a different number sitting in the price slot. Same threshold
// and the same reasoning as dealercom.mjs's JSONLD_JUNK_FRACTION.
const JSONLD_JUNK_FRACTION = 0.5;

// Which served number is the price a human reads off a DealerOn VDP?
//
// The old answer was "whatever normalize() read out of JSON-LD offers.price,
// and the dotagging price attribute only if that was missing". Both halves are
// wrong on a rooftop that advertises a dealer discount, and one of them is
// wrong in the expensive direction:
//
//   suntrupfordkirkwood.com, 2025 F-150 Lightning Flash 1FT6W3LU6SWG26144
//   (2026-08-23). The VDP renders MSRP $72,965 / Suntrup Savings -$15,021 /
//   Final Price $57,944. Its JSON-LD publishes "price": 15021.0 — the SAVINGS
//   line, not the price — and the site printed a $15,021 asking price on a
//   $57,944 truck, a false bargain of exactly the kind the house rule calls
//   the most expensive error. $15,021 cleared the $15,000 new-car floor by
//   $21, so lib/price-floor.mjs could not catch it; only the page's own MSRP
//   can, which is what the junk fraction above is for.
//
//   The same page shows why the fallback could not have saved it either.
//   data-dotagging-item-price is $72,965 there — the STICKER, byte-equal to
//   data-msrp on all five cars the page carries — so publishing it would have
//   overstated by the whole discount. It reads as the advertised price only on
//   used cars, where sticker and ask are the same number (goosecreekmitsubishi
//   Model Y and hartmotors Wrangler 4xe, both 2026-08-23: dot price == msrp ==
//   the ask). It is kept as the last rung for exactly that case and no other.
//
// The rooftop's own price library is the number that survives all three pages:
// calc_INTERNET PRICE is $57,944 on the Suntrup truck (the rendered Final
// Price) and byte-equal to a healthy JSON-LD offer on both used cars ($23,888
// and $27,647, the latter including the doc fee the offer also carries). That
// is the same field, read the same way, as the DealerOn API lane — hence the
// shared reader rather than a second copy of the ladder.
//
// A healthy JSON-LD offer still wins, so the overwhelming majority of DealerOn
// rows keep the number and the provenance tag they already had; this only
// changes what happens when the page contradicts itself.
export function resolveDealerOnPriceTagged(rec, v) {
  const floor = priceFloor({ isNew: rec.condition === "new", year: rec.year });
  const msrp = v.msrp;
  const jsonld = num(rec.priceUsd);
  // ONE test, asked of every rung — not just of JSON-LD, which is how it was
  // written and how a false bargain got through. glassmankia.com, 2026-08-28:
  // a 2026 Kia EV9 Wind, data-msrp 65875, whose library stacks
  // "calc_Dealer Discount:50000.0" onto a $65,875 car and lands at
  // calc_INTERNET PRICE 15875. The JSON-LD offer of $15,875 WAS caught here —
  // it is a quarter of MSRP — and then the very same number was picked up off
  // the library rung one line down, which nothing tested, and published. The
  // site showed a $15,875 EV9. A false bargain is the most expensive error
  // this project can make, and the guard that would have stopped it was
  // already present and simply not asked.
  const isJunk = (p) => p != null && msrp != null && p < msrp * JSONLD_JUNK_FRACTION;
  const jsonldJunk = isJunk(jsonld);

  if (jsonld != null && jsonld >= floor && !jsonldJunk) {
    // Unchanged: the dealer's declared offer price, keeping normalize()'s tag.
    return { priceUsd: jsonld, provenance: rec.priceProvenance };
  }

  const library = priceFromLibraryTagged(v.priceLibrary);
  const ladder = [
    { price: library.price, provenance: library.provenance },
    { price: v.sellingPrice, provenance: DEOL_SELLING },
    // Only where nothing above answered. Suppressed once the page has been
    // caught contradicting itself: this rung is the sticker, and on a
    // discounted car it is demonstrably not the ask, so the claim goes quiet
    // rather than overstating by the discount.
    { price: jsonldJunk ? undefined : num(v.displayedPrice), provenance: DEOL_DISPLAYED },
  ];
  // Both bars, on every rung: the absolute floor, and the page's own MSRP.
  // A rung that fails either is a different number sitting in the price slot.
  const picked = ladder.find((c) => c.price != null && c.price >= floor && !isJunk(c.price));
  // 0 is ingest.mjs's abstain: the car stays, the price claim goes quiet.
  return picked
    ? { priceUsd: picked.price, provenance: picked.provenance }
    : { priceUsd: 0, provenance: undefined };
}

const DRIVES = new Set(["FWD", "RWD", "AWD", "4WD"]);

// String fields go through text(), which drops the placeholder literals
// ("null", "N/A", "-") both templates carry when a field is missing.
export function enrichFromDealerOn(rec, data) {
  // sdDataLayer describes exactly one car; dotagging describes several, so it
  // is looked up by VIN. Either way the record only takes facts stamped with
  // its own VIN.
  const dot = rec.vin ? data?.dotagging?.get(String(rec.vin).toUpperCase()) : undefined;
  const sd = data?.vehicle && String(data.vehicle.vin).toUpperCase() === rec.vin ? data.vehicle : null;
  const v = sd ?? dot;
  if (!v) return rec;
  // The rendered spec list belongs to the page's subject car, so it only
  // applies to whichever record the odometer block was rendered for. On the
  // dotagging template that is the block carrying data-odometer; on the old
  // one it is the single sdDataLayer car.
  const isSubject = Boolean(sd) || dot?.odometer != null;
  const price = resolveDealerOnPriceTagged(rec, v);
  const trim = text(v.trim);
  return {
    ...rec,
    // Dealer-stated mileage passes through verbatim, 0 included — it has the
    // same standing as the dealer's price. (Verified: the dealer's own page
    // shows "Mileage: 0" to shoppers on these cars.) Implausible values get
    // flagged at display, not suppressed.
    mileage: (isSubject ? data.mileage : undefined) ?? dot?.odometer ?? rec.mileage,
    trim: trim && trim !== "Base" ? trim : rec.trim ?? trim,
    driveLine: DRIVES.has(v.drivetrain) ? v.drivetrain : rec.driveLine,
    exteriorColor:
      text(v.exteriorColor) ?? (isSubject ? text(data.exteriorColor) : undefined) ?? rec.exteriorColor,
    interiorColor:
      text(v.interiorColor) ?? (isSubject ? text(data.interiorColor) : undefined) ?? rec.interiorColor,
    // See resolveDealerOnPriceTagged: a healthy JSON-LD offer still wins and
    // keeps its tag, but the page's own MSRP now gets a veto over one that is
    // too far below sticker to be a price at all.
    priceUsd: price.priceUsd,
    priceProvenance: price.provenance,
    condition: typeof sd?.status === "string" ? sd.status.toLowerCase() : rec.condition,
    city: text(data.dealer?.city) ?? rec.city,
    state: text(data.dealer?.state) ?? rec.state,
    zip: text(data.dealer?.zip) ?? rec.zip,
    dealerName: text(data.dealer?.name) ?? rec.dealerName,
    stockNumber: text(v.stockNumber) ?? rec.stockNumber,
    platform: "dealeron",
  };
}
