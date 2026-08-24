// Recharged (recharged.com) — a used-EV specialist retailer out of Richmond VA
// with reconditioning centres in Richmond, Charlotte, Jacksonville and
// Fairfax. Every car it sells is electrified, so a rooftop this size is worth
// more per domain than any franchise store: 412 electrified cars on
// 2026-08-24, against a nationwide crawl whose median rooftop holds a handful.
//
// WHY THE CRAWL SEES NOTHING
//
// It is a Next.js app. The search page renders NO cars in HTML — 123 KB of
// shell with one VIN in it — and the VDP does carry a full schema.org Vehicle,
// but wrapped as
//
//   <meta name="script:ld+json" content="[&quot;@context&quot;…]">
//
// rather than the <script type="application/ld+json"> every extractor in this
// project looks for. So lib/jsonld.mjs extracts zero from a page that is
// genuinely publishing structured data, and a VIN-by-VIN walk of the 498 urls
// in its sitemap would be the only door the generic stack could find.
//
// THE DOOR
//
// The site's own SRP asks one same-origin tRPC endpoint, captured in a real
// browser on /vehicles?makes=Tesla (2026-08-24):
//
//   GET /api/trpc/vehicle.search?batch=1&input={"0":{"json":{…}}}
//   → [{"result":{"data":{"json":{"vehicles":[…],"total":412,"nextCursor":100}}}}]
//
// robots.txt allows it: the file's only Disallow rules are /deals/*,
// /offers/*/, /vin/*/test-drive, /appointments/admin, /appointment-board,
// /kiosk, /operations and /admin. No rule touches /api.
//
// The filter block this lane sends is the page's own, minus the shopper: no
// makes, no models, no price or range bounds, no location or personalization.
// `inventoryMode: "ev"` is kept because it is what the UNFILTERED page sends,
// and its answer is the number the page prints — 412 with no filters, 109 with
// `makes:["Tesla"]` against the "109 results" the page rendered. Dropping it
// would be asking a different question than the one the site answers.
//
// PRICE
//
// `price` is the ask: the record's 39998.00 is the VDP's rendered $39,998 and
// its schema.org offers.price, checked byte-for-byte on 7SAYGDEF8SA339578.
// The same record carries `jdpRetail`, `jdpTrade`, `bbRetail`, `bbWholesale`
// and `actualCashValue` — J.D. Power and Black Book book values and the
// store's own ACV. None of them is what a shopper is asked to pay and none is
// ever read; `previousPrice` (the markdown rung) is left alone for the reason
// AUTOFUNDS_REDUCED is a separate tag.
//
// CONDITION
//
// The record carries no condition field, and this lane invents none. The site
// is a used-EV retailer and its VDP JSON-LD says UsedCondition on every car,
// but that is a page we do not fetch and a string the API does not publish —
// and the lot does hold a 2027 Bolt with 51 miles, so "they are all used" is
// not a fact the data supports either. ../condition.mjs's whole point is that
// an absent field becoming "used" is a claim made from no evidence.
import { RECHARGED_PRICE } from "../price-provenance.mjs";
import { stabilizeImages } from "../images.mjs";
import { politeGetJson } from "../http.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export const RECHARGED_HOST_RE = /^(?:www\.)?recharged\.com$/i;

// The Organization JSON-LD every page carries names this exact same-origin
// asset. Specific by construction: the string contains the host, so no other
// rooftop can trip it, which is what a single-site lane's detector must be.
const RECHARGED_MARK_RE = /https:\/\/recharged\.com\/logo\.svg/i;

export function isRecharged(html) {
  return typeof html === "string" && RECHARGED_MARK_RE.test(html);
}

export function isRechargedOrigin(origin) {
  try {
    return RECHARGED_HOST_RE.test(new URL(origin).host);
  } catch {
    return false;
  }
}

// The page's own unfiltered query. `limit` and `cursor` are supplied per call.
const BASE_INPUT = { inventoryMode: "ev", sort: "recommended", direction: "forward" };

export function rechargedSearchUrl(origin, { limit = 100, cursor = null } = {}) {
  const input = { 0: { json: { ...BASE_INPUT, limit: Number(limit), ...(cursor != null ? { cursor: Number(cursor) } : {}) } } };
  return `${origin.replace(/\/$/, "")}/api/trpc/vehicle.search?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`;
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// The VDP path. The site slugs it "/vehicles/{make}/{model}/{VIN}", lowercased
// with whitespace runs replaced by a hyphen — checked against the site's own
// sitemap for every car that was in it: 326 of 326 built urls matched the
// published one exactly, 0 mismatches (2026-08-24), including the awkward ones
// ("ID.4" → id.4, "Q5 e" → q5-e, "Hummer EV Pickup" → hummer-ev-pickup).
//
// And the slug turns out to be cosmetic, which is the reassuring part: asking
// for /vehicles/tesla/model-zzz/1FTBW1YK6RKA26526 serves 200 and the right car
// (a Ford E-Transit). The VIN is the key, so a slug this lane got wrong would
// still point at the car it belongs to rather than at some other one.
const slug = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

export function rechargedVdpUrl(rec, origin) {
  const vin = String(rec?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return undefined;
  const make = slug(rec?.make);
  const model = slug(rec?.model);
  if (!make || !model) return undefined;
  try {
    return new URL(`/vehicles/${encodeURIComponent(make)}/${encodeURIComponent(model)}/${vin}`, origin).toString();
  } catch {
    return undefined;
  }
}

// Every image url the platform stores lives on the DMS vendor's bucket. Pinned
// to that host so a record whose `url` was ever something else — a tracking
// pixel, a relative path, an attacker-supplied string — cannot become a photo
// we publish as the car's.
const IMAGE_HOST_RE = /^https:\/\/dealerslink\.s3\.amazonaws\.com\//i;

// The platform's own electrification roll-up. Used only as the FUEL STRING —
// classifyEv still decides — and mapped rather than passed through, because
// "BEV" and "PHEV" are exactly the two tokens ../ev.mjs treats as a dealer's
// explicit claim. A value that is neither says nothing (the lot holds one
// record with electricType null).
const ELECTRIC_TYPE = { BEV: "BEV", PHEV: "Plug-In Hybrid" };

export function rechargedVehicle(rec, origin) {
  const vin = String(rec?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const price = num(rec?.price);
  const mileage = Number(rec?.mileage);
  const fuel = ELECTRIC_TYPE[String(rec?.electricType ?? "").toUpperCase()];
  const images = stabilizeImages(
    (Array.isArray(rec?.images) ? rec.images : [])
      .slice()
      .sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0))
      .map((i) => i?.url)
      .filter((u) => typeof u === "string" && IMAGE_HOST_RE.test(u)),
  );
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: rec?.year != null ? String(rec.year) : undefined,
    brand: rec?.make || undefined,
    model: rec?.model || undefined,
    vehicleConfiguration: rec?.trim || undefined,
    name: [rec?.year, rec?.make, rec?.model, rec?.trim].filter(Boolean).join(" ") || undefined,
    bodyType: rec?.bodyStyle || undefined,
    // 0 is a real odometer reading on this lot (a delivery-mileage van), so
    // the usual "> 0" numeric guard would silently drop it.
    mileageFromOdometer:
      Number.isFinite(mileage) && mileage >= 0
        ? { "@type": "QuantitativeValue", value: mileage, unitCode: "SMI" }
        : undefined,
    color: rec?.exteriorColor || undefined,
    vehicleInteriorColor: rec?.interiorColor || undefined,
    driveWheelConfiguration: rec?.driveTrain || undefined,
    sku: rec?.stockNumber ? String(rec.stockNumber) : undefined,
    image: images.length ? images : undefined,
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", name: rec?.motor || undefined, fuelType: fuel },
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? RECHARGED_PRICE : undefined,
      priceCurrency: "USD",
      url: rechargedVdpUrl(rec, origin),
    },
  };
}

/** A record a shopper can actually buy.
 *
 *  Two separate flags have to be right here, and the second one is the one
 *  that had to be looked at rather than reasoned about.
 *
 *  `saleStatus` is the platform's own string; the lot carries exactly two
 *  values, "Available For Sale" (392) and "Sale Pending" (20). Only a status
 *  this lane has actually seen and checked counts as for sale — a `soldAt`
 *  date or an unseen status is not something we will claim about a car.
 *
 *  `isReserved` is the flag that matters. It is true on 73 of 412 and the site
 *  keeps every one of them in the 412 its SRP prints, with a price and a
 *  Recharged Score, which is exactly how it would look if they were for sale.
 *  They are not. Opening one (KNDAEFS52R6041838, a $46,799 Kia EV9 whose
 *  saleStatus is "Available For Sale", 2026-08-24) replaces the buy path with
 *  a "Reserved" chip and the words "Another customer currently has this
 *  vehicle reserved … We can let you know if this vehicle becomes available
 *  again" beside "Notify me if available" and "Shop similar vehicles". There
 *  is no way to buy it. Publishing 73 cars a shopper cannot buy — 18% of the
 *  lot — is the kind of claim this house does not make, and no field short of
 *  this one would have caught it, because saleStatus says the car is
 *  available. */
const FOR_SALE = new Set(["available for sale", "sale pending"]);

export function rechargedIsLive(rec) {
  if (rec?.soldAt) return false;
  if (rec?.isReserved === true) return false;
  return FOR_SALE.has(String(rec?.saleStatus ?? "").trim().toLowerCase());
}

function unwrap(json) {
  const d = Array.isArray(json) ? json[0]?.result?.data?.json : json?.result?.data?.json;
  return d && Array.isArray(d.vehicles) ? d : null;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 60;

/** The whole lot, as schema.org Vehicle nodes.
 *
 *  `complete` needs both halves: every page answered, and the number of
 *  records read reached the endpoint's own `total`. The cursor is an integer
 *  offset the endpoint hands back, so a walk that stopped early is invisible
 *  in the rows themselves — only the count catches it, and db-sync must not
 *  read an unfinished read as a lot that shrank. */
export async function pullRecharged(origin) {
  const out = [];
  let cursor = null;
  let seen = 0;
  let total = null;
  let ok = false;
  let requests = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { status, json } = await politeGetJson(rechargedSearchUrl(origin, { limit: PAGE_SIZE, cursor }));
    requests++;
    const data = status === 200 ? unwrap(json) : null;
    if (!data) break;
    ok = true;
    if (Number.isFinite(data.total)) total = data.total;
    seen += data.vehicles.length;
    for (const rec of data.vehicles) {
      if (!rechargedIsLive(rec)) continue;
      const v = rechargedVehicle(rec, origin);
      if (v) out.push(v);
    }
    if (data.nextCursor == null || !data.vehicles.length) break;
    cursor = data.nextCursor;
  }
  return { ok, vehicles: out, found: total ?? seen, complete: ok && total != null && seen >= total, requests };
}

/** The probe's one-request settle. */
export async function countRecharged(origin) {
  const { status, json } = await politeGetJson(rechargedSearchUrl(origin, { limit: 3 }));
  const data = status === 200 ? unwrap(json) : null;
  if (!data) return { ok: false, found: 0, hasVin: false };
  return {
    ok: true,
    found: Number.isFinite(data.total) ? data.total : data.vehicles.length,
    hasVin: data.vehicles.some((r) => VIN_RE.test(String(r?.vin ?? "").toUpperCase())),
  };
}
