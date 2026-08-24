// DealerSync — a dealer-website vendor for independents. Its rooftops serve on
// their own apex (pluginauto.com) and load every asset from the vendor's two
// hosts, which is the only mark it leaves on the page.
//
// WHY THE HTML IS A DEAD END, AND WHAT IS BEHIND IT
//
// A DealerSync SRP ships the vendor's Handlebars TEMPLATE inline — literal
// `{{Vin}}`, `{{FinalPrice}}`, `{{PriceDisplay}}` — beside the first 15 or 16
// cars it happens to have server-rendered. A VIN regex over that page finds
// the rendered cars and nothing else, and the rest of the lot arrives through
// a web worker (themes/…/ds-page-inventory-worker.js) that a static probe
// cannot see. That is the dark-tail shape this project has hit before.
//
// The worker asks ONE same-origin endpoint, captured off pluginauto.com's own
// "Load More" button in a real browser (2026-08-24):
//
//   GET /Inventory/Search?startIndex=N&version=2
//   → {"Success":true,"startIndex":N,"totalResults":339,"vehicles":[…]}
//
// 15 records a page, one JSON object per car, every field this project needs:
// Vin, Year, Make, Model, Trim, Style, Mileage, Drivetrain, Engine, Fuel,
// FactoryColorText, FactoryInteriorText, Transmission, StockNo, FinalPrice,
// IsNew, IsSold, CertifiedStatus, VehicleDetailUrl, FirstImageUrl. 339 cars
// came out of pluginauto.com in 23 requests, 339 distinct VINs, matching the
// "339 Vehicles" its own SRP header prints.
//
// WHAT WE DELIBERATELY DO NOT SEND, AND WHY
//
// The browser's own request carries 30 more parameters — Results=15,
// SortCriteria, SortDirection, PriceStart, BodyType, Color, Model… This lane
// sends `startIndex` and `version` and nothing else.
//
// That is a robots decision, not tidiness. pluginauto.com's robots.txt
// disallows a family of query shapes for every crawler:
//
//   Disallow: /*?*results=*   Disallow: /*?*sort=*    Disallow: /*?*model=*
//   Disallow: /*?*color=*     Disallow: /*?*bodytype=*  Disallow: /*?*price…=*
//
// Those rules are lowercase and the API's parameters are capitalised
// (`Results=`, `SortCriteria=`, `Model=`), so a case-sensitive matcher — which
// is the standard, and is what lib/http.mjs implements — says they do not
// apply. Leaning on that would be working around a stated intent on a
// technicality, and this project does not do that (see the header of
// lib/http.mjs). The two parameters we do send have no rule of any case
// against them, and the endpoint answers completely without the others: the
// server defaults to its own page size and its own sort, which is precisely
// what the site shows a shopper who never touches a filter.
//
// PRICE
//
// `FinalPrice` is the number the tile prints under the label "Today's Price",
// and the number the tile's own schema.org microdata publishes as
// offers.price. `PriceDisplay` is that same number formatted ("$149,870"), so
// the two are a label-read check on each other and a record where they
// disagree abstains rather than pick a rung. A FinalPrice of 0 is an
// abstention too — it is what the platform stores for a car with no
// advertised price (18 of 339 on pluginauto.com), which is a real state, not
// a parse failure.
import { DEALERSYNC_FINAL } from "../price-provenance.mjs";
import { stabilizeImages } from "../images.mjs";
import { politeGetJson } from "../http.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The vendor's own asset and image hosts. Never the brand word: a dealer is
// free to be named "… Sync", and finding #4 of api-leads.mjs is that a cohort
// must be fingerprinted on the host that actually serves it.
const DS_RE = /\b(?:dealer-cdn|images)\.dealersync\.com/i;

export function isDealerSync(html) {
  return typeof html === "string" && DS_RE.test(html);
}

export const DEALERSYNC_SEARCH_PATH = "/Inventory/Search";
export const DEALERSYNC_SRP_PATH = "/pre-owned-cars";

export function dealerSyncSearchUrl(origin, startIndex = 0) {
  return `${origin.replace(/\/$/, "")}${DEALERSYNC_SEARCH_PATH}?startIndex=${Number(startIndex) || 0}&version=2`;
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** A record that is actually for sale. `IsSold` is the platform's own boolean
 *  — the tile template switches its microdata availability on it — so a sold
 *  car never becomes a listing even if the endpoint still returns it. */
export function dealerSyncIsLive(rec) {
  return rec?.IsSold !== true;
}

/** The advertised price, or undefined.
 *
 *  Two readings of the same number have to agree: `FinalPrice` (what the
 *  microdata publishes) and `PriceDisplay` (what the eye reads under "Today's
 *  Price"). They were equal on 339 of 339 records, and the point of checking
 *  is the day they are not — a formatted display that has drifted from the
 *  machine field is exactly the badge-disagreement case automanager.mjs
 *  abstains on. */
export function dealerSyncPrice(rec) {
  const final = num(rec?.FinalPrice);
  if (final == null) return undefined;
  const shown = num(rec?.PriceDisplay);
  if (shown != null && shown !== final) return undefined;
  return final;
}

/** Absolute VDP url. The record's `VehicleDetailUrl` is site-relative
 *  ("/pre-owned-cars/detail/2024-Tesla-Model-S/1525104") and `BaseUrl` is
 *  empty on every record seen, so the origin we asked is the base. */
export function dealerSyncVdpUrl(rec, origin) {
  const p = typeof rec?.VehicleDetailUrl === "string" ? rec.VehicleDetailUrl.trim() : "";
  if (!p) return undefined;
  try {
    return new URL(p, origin).toString();
  } catch {
    return undefined;
  }
}

// The record's photo urls are protocol-relative ("//images.dealersync.com/…").
const abs = (u) => {
  const s = typeof u === "string" ? u.trim() : "";
  if (!s) return undefined;
  return s.startsWith("//") ? `https:${s}` : s;
};

export function dealerSyncVehicle(rec, origin) {
  const vin = String(rec?.Vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const price = dealerSyncPrice(rec);
  const mileage = num(rec?.Mileage);
  // The dealer's OWN fuel string, passed through untouched — "Electric Fuel
  // System", "Plug-In Electric/Gas", "Gas/Electric Hybrid", "Gasoline Fuel",
  // "Hydrogen Fuel" (the five values pluginauto.com's lot carries, plus Diesel
  // and Flex). classifyEv decides what is electrified; nothing here pre-judges
  // it, which is what keeps the 207 petrol cars in that lot out.
  const fuel = typeof rec?.Fuel === "string" && rec.Fuel.trim() ? rec.Fuel.trim() : undefined;
  // The machine boolean, not a display string — see ../condition.mjs. A record
  // without it says nothing rather than defaulting to "used".
  const itemCondition = rec?.IsNew === true ? "new" : rec?.IsNew === false ? "used" : undefined;
  const images = stabilizeImages([abs(rec?.FirstImageUrl)].filter(Boolean));
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: rec?.Year != null ? String(rec.Year) : undefined,
    brand: rec?.Make || undefined,
    model: rec?.Model || undefined,
    // `Trim` is the short badge ("4MATIC SUV"); `Style` is the full one
    // ("AMG G 63 4MATIC SUV"). The shorter one is the trim.
    vehicleConfiguration: rec?.Trim || undefined,
    name: rec?.VehicleName || [rec?.Year, rec?.Make, rec?.Model, rec?.Trim].filter(Boolean).join(" ") || undefined,
    ...(itemCondition ? { itemCondition } : {}),
    // Certification is a warranty claim. `CertifiedStatus` is 0 on every
    // record seen so far, so there is no observed non-zero value to read and
    // no evidence for what one would mean — a manufacturer CPO programme or
    // the rooftop's own inspection badge. Until a rooftop shows one and it can
    // be checked against what its VDP claims, this lane makes no certification
    // claim at all. Silence is the honest answer; guessing is the expensive one.
    bodyType: rec?.Style || undefined,
    mileageFromOdometer:
      mileage != null ? { "@type": "QuantitativeValue", value: mileage, unitCode: "SMI" } : undefined,
    color: rec?.FactoryColorText || undefined,
    vehicleInteriorColor: rec?.FactoryInteriorText || undefined,
    driveWheelConfiguration: rec?.Drivetrain || undefined,
    vehicleTransmission: rec?.Transmission || undefined,
    sku: rec?.StockNo ? String(rec.StockNo) : undefined,
    image: images.length ? images : undefined,
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", name: rec?.Engine || undefined, fuelType: fuel },
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? DEALERSYNC_FINAL : undefined,
      priceCurrency: "USD",
      url: dealerSyncVdpUrl(rec, origin),
      // The record's own selling rooftop. A DealerSync account can hold more
      // than one lot (pluginauto.com serves West Covina and Costa Mesa off one
      // site), and the address is per-record.
      seller: rec?.DealerLocation
        ? {
            "@type": "AutoDealer",
            address: {
              "@type": "PostalAddress",
              streetAddress: rec.DealerLocationStreet || undefined,
              addressLocality: rec.DealerLocationCity || undefined,
            },
          }
        : undefined,
    },
  };
}

/** Every live car in one page of the search endpoint. */
export function dealerSyncVehicles(json, origin) {
  if (!json || json.Success !== true || !Array.isArray(json.vehicles)) return null;
  const out = [];
  for (const rec of json.vehicles) {
    if (!dealerSyncIsLive(rec)) continue;
    const v = dealerSyncVehicle(rec, origin);
    if (v) out.push(v);
  }
  return out;
}

// The endpoint pages by absolute offset and reports its own total, so the walk
// stops on the total rather than on a short page: a rooftop whose last page is
// exactly full would otherwise ask one more time for nothing. MAX_PAGES bounds
// a rooftop whose total is wrong or whose paging loops.
const MAX_PAGES = 200;

/** Page a rooftop's whole lot, as schema.org Vehicle nodes.
 *
 *  `complete` is true only when the walk actually reached the end — every page
 *  answered AND the number of records read reached the endpoint's own
 *  `totalResults`. A mid-stream failure leaves it false, so crawl.mjs reports
 *  truncated and db-sync never reads an unfinished read as "sold". */
export async function pullDealerSync(origin) {
  const out = [];
  let seen = 0;
  let total = null;
  let ok = false;
  let requests = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { status, json } = await politeGetJson(dealerSyncSearchUrl(origin, seen));
    requests++;
    if (status !== 200 || !json || json.Success !== true || !Array.isArray(json.vehicles)) break;
    ok = true;
    if (Number.isFinite(json.totalResults)) total = json.totalResults;
    if (!json.vehicles.length) break;
    seen += json.vehicles.length;
    for (const v of dealerSyncVehicles(json, origin) ?? []) out.push(v);
    if (total != null && seen >= total) break;
  }
  return {
    ok,
    vehicles: out,
    found: total ?? seen,
    complete: ok && total != null && seen >= total,
    requests,
  };
}

/** The probe's one-request settle, like DealerVenom/Overfuel/Motive/AutoFunds. */
export async function countDealerSync(origin) {
  const { status, json } = await politeGetJson(dealerSyncSearchUrl(origin, 0));
  if (status !== 200 || !json || json.Success !== true || !Array.isArray(json.vehicles)) {
    return { ok: false, found: 0, hasVin: false };
  }
  return {
    ok: true,
    found: Number.isFinite(json.totalResults) ? json.totalResults : json.vehicles.length,
    hasVin: json.vehicles.some((r) => VIN_RE.test(String(r?.Vin ?? "").toUpperCase())),
  };
}
