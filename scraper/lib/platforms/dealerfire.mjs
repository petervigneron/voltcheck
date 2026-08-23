// DealerFire (DealerSocket's website platform; cdn-ds.com assets, Moff JS).
//
// DealerFire VDPs do publish a schema.org Car node, so the generic extractor
// was never the problem here. Two other things were:
//
//   1. Discovery. The SRP's only JSON-LD is a SearchResultsPage whose offers
//      carry a name and the dealer's address and nothing else — no VIN, no
//      price, no URL — so the ItemList bridge has nothing to follow, and the
//      VDP list lives in a gzipped sitemap the fetcher couldn't read until
//      lib/http.mjs learned to gunzip. (These sites also set Crawl-delay: 10,
//      which we honour, so a per-VDP walk is expensive: the SRP below returns
//      100 complete records in one request instead.)
//
//   2. The price. The JSON-LD offer publishes `finalPrice`, which is the
//      advertised price plus the dealer's fees — the VDP itself prints
//      "Advertised Price $32,175 / Doc Fee + $250 / $32,425" and the JSON-LD
//      says 32425 (beavertoncarcompany.com, 2T3G1RFV1RC482670, 2026-08-16).
//      Every DealerFire car would have gone onto the site priced above what
//      its dealer advertises, and been compared against sold prices that
//      contain no doc fee. `sellingPrice` is the advertised figure.
//
// Both are fixed from the same place: the page's own data layer, which pushes
// a complete record per car — on the SRP as well as the VDP —
//   Moff.modules.get('DataLayer').pushData('VehicleObject_65462874', {…})
// carrying vin, mileage, sellingPrice, trim, drivetrain, colours and the
// certification flags.

import { DFIRE_ADVERTISED } from "../price-provenance.mjs";

const VEHICLE_OBJ_RE = /pushData\(\s*['"]VehicleObject_(\d+)['"]\s*,\s*\{/g;
const DEALER_OBJ_RE_G = /pushData\(\s*['"]DealerObject_\d+['"]\s*,\s*\{/g;

export function isDealerFire(html) {
  return typeof html === "string" && /pushData\(\s*['"](?:Vehicle|Dealer)Object_/.test(html);
}

// Read the object literal that starts at the `{` on or after `from`, by
// brace-matching. String-aware, because these blobs embed dealer-written
// descriptions full of braces and escaped quotes.
function objectAt(html, from) {
  const start = html.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const str = (v) => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s && s !== "0" ? s : undefined;
};

// Every rooftop the page names. A single-rooftop site pushes one; a group
// site pushes one per store plus a "Sheehy Placeholder" with a blank city and
// state that PrimaryDealerId points at — taking the first blob attributed
// Manassas VA and Hagerstown MD cars to a placeholder whose only address was
// zip 54901, which is Oshkosh, Wisconsin. Blocks without a state are dropped
// for that reason.
export function extractDealerFireDealers(html) {
  const out = [];
  for (const m of html.matchAll(DEALER_OBJ_RE_G)) {
    const d = objectAt(html, m.index + m[0].length - 1);
    if (!d || !str(d.state)) continue;
    out.push({ name: str(d.name), city: str(d.city), state: str(d.state), zip: str(d.zip) });
  }
  return out;
}

const slugify = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Which rooftop is this car at? One rooftop on the page settles it. On a
// group site the VehicleObject carries no store id, but the platform's own
// VDP slug ends "-{city}-{state}-id-{vuid}" — joining that against the
// rooftop list is a match on the page's own data rather than a guess, and it
// resolves even where several rooftops share a town (Hagerstown has five,
// all at 21740). Two towns that disagree, or none, means we don't know, and
// the car goes out with no location rather than a wrong one.
export function dealerFor(dealers, href) {
  if (dealers.length === 1) return dealers[0];
  const m = String(href ?? "").toLowerCase().match(/-([a-z0-9-]+)-([a-z]{2})-id-\d+\/?$/);
  if (!m) return null;
  const [, citySlug, slugState] = m;
  const hits = dealers.filter((d) => d.state?.toLowerCase() === slugState && citySlug.endsWith(slugify(d.city)) && d.city);
  if (!hits.length) return null;
  // Each field is claimed only where the matching rooftops agree on it, so a
  // town with several stores still places the car: Tucson AZ has six Royal
  // rooftops on three postcodes, and the car gets the city and the state it
  // certainly has rather than nothing at all because the postcode is a
  // coin-toss between 85705, 85711 and 85712.
  const agreed = (k) => (new Set(hits.map((d) => d[k])).size === 1 ? hits[0][k] : undefined);
  const city = agreed("city");
  const state = agreed("state");
  if (!city || !state) return null;
  return { name: agreed("name"), city, state, zip: agreed("zip") };
}

// Every car the page knows about, keyed by VIN.
export function extractDealerFire(html) {
  const out = new Map();
  if (typeof html !== "string") return out;
  VEHICLE_OBJ_RE.lastIndex = 0;
  for (const m of html.matchAll(VEHICLE_OBJ_RE)) {
    const v = objectAt(html, m.index + m[0].length - 1);
    const vin = String(v?.vin ?? "").toUpperCase();
    if (!VIN_RE.test(vin)) continue;
    out.set(vin, { ...v, vin, vuid: m[1] });
  }
  return out;
}

const DRIVES = { FWD: "FWD", RWD: "RWD", AWD: "AWD", "4WD": "4WD", "4X4": "4WD" };

// The advertised price, never `finalPrice` — see the header. originalPrice is
// the same figure on every car observed and stands in when a rooftop leaves
// sellingPrice at 0; a car with neither has no advertised price, and gets
// none rather than the fee-inclusive one.
const advertisedPrice = (v) => num(v.sellingPrice) ?? num(v.internetPrice) ?? num(v.originalPrice);

// vuid -> the tile's own link. The blob doesn't carry the VDP URL, but every
// DealerFire link ends in -id-{vuid}.
function vdpHref(html, vuid) {
  const m = html.match(new RegExp(`href=["']([^"']*-id-${vuid})["']`, "i"));
  return m ? m[1] : undefined;
}

export function dealerFireVehicles(html, pageUrl) {
  const cars = extractDealerFire(html);
  if (!cars.size) return [];
  const dealers = extractDealerFireDealers(html);
  const out = [];
  for (const v of cars.values()) {
    const href = vdpHref(html, v.vuid);
    let url;
    try {
      url = href ? new URL(href, pageUrl).toString() : pageUrl;
    } catch {
      url = pageUrl;
    }
    const dealer = dealerFor(dealers, href ?? url);
    out.push({
      "@type": "Vehicle",
      vehicleIdentificationNumber: v.vin,
      vehicleModelDate: str(v.year),
      brand: str(v.make),
      model: str(v.model),
      vehicleConfiguration: str(v.trim),
      name: [v.year, v.make, v.model].filter(Boolean).join(" "),
      mileageFromOdometer: v.mileage != null ? { "@type": "QuantitativeValue", value: Number(v.mileage) } : undefined,
      color: str(v.exteriorColor),
      vehicleInteriorColor: str(v.interiorColor),
      driveWheelConfiguration: DRIVES[String(v.drivetrain ?? "").toUpperCase()],
      sku: str(v.stockNumber),
      itemCondition: v.isNew ? "new" : "used",
      vehicleEngine: { "@type": "EngineSpecification", fuelType: str(v.fuelType), description: str(v.engineDescription) },
      fuelType: str(v.fuelType),
      offers: {
        "@type": "Offer",
        price: advertisedPrice(v),
        priceCurrency: "USD",
        url,
        seller: dealer
          ? {
              "@type": "AutoDealer",
              name: dealer.name,
              address: {
                "@type": "PostalAddress",
                addressLocality: dealer.city,
                addressRegion: dealer.state,
                postalCode: dealer.zip,
              },
            }
          : undefined,
      },
    });
  }
  return out;
}

// Correct a record the generic JSON-LD path produced on a DealerFire VDP:
// the odometer it has no field for, the price it gets wrong, and — on a group
// site — the seller. A group VDP's AutoDealer JSON-LD is the same placeholder
// rooftop, so normalize() reads a name of "Sheehy Placeholder" and a postcode
// in Wisconsin off a car sitting in Virginia. Where the slug resolves a real
// rooftop we substitute it; where nothing resolves, the location is dropped,
// because no location is a gap and a wrong one is a false claim.
export function enrichFromDealerFire(rec, cars, dealers = []) {
  const v = cars?.get?.(rec.vin);
  if (!v) return rec;
  const dealer = dealers.length ? dealerFor(dealers, rec.vdpUrl ?? rec.sourceUrl) : null;
  const location = dealer
    ? { dealerName: dealer.name ?? rec.dealerName, city: dealer.city, state: dealer.state, zip: dealer.zip }
    : dealers.length > 1
      ? { dealerName: undefined, city: undefined, state: undefined, zip: undefined }
      : {};
  return {
    ...rec,
    ...location,
    mileage: v.mileage != null ? Number(v.mileage) : rec.mileage,
    trim: str(v.trim) ?? rec.trim,
    priceUsd: advertisedPrice(v) ?? rec.priceUsd,
    // The tag follows whichever number actually won: DealerFire's own
    // advertisedPrice when it supplied one, otherwise whatever normalize()
    // already recorded for the JSON-LD offer it fell back to.
    priceProvenance: advertisedPrice(v) != null ? DFIRE_ADVERTISED : rec.priceProvenance,
    driveLine: DRIVES[String(v.drivetrain ?? "").toUpperCase()] ?? rec.driveLine,
    exteriorColor: str(v.exteriorColor) ?? rec.exteriorColor,
    interiorColor: str(v.interiorColor) ?? rec.interiorColor,
    certified: v.isOEMCertified === 1 || v.isDealerCertified === 1 || undefined,
    stockNumber: str(v.stockNumber) ?? rec.stockNumber,
    condition: v.isNew ? "new" : "used",
    platform: "dealerfire",
  };
}

// The SRP, from the page's own SearchAction target ("…/cars-for-sale-{city}-
// {state}?q={search_term_string}"), which is the one place a DealerFire page
// names its inventory URL without us having to guess the rooftop's slug.
// `limit=100` is honoured; the default page is 20.
export function dealerFireSeeds(html, pageUrl) {
  const seeds = new Set();
  const add = (href) => {
    try {
      const u = new URL(href, pageUrl);
      u.search = "";
      u.searchParams.set("limit", "100");
      seeds.add(u.toString());
    } catch {}
  };
  const target = html.match(/"target"\s*:\s*"([^"]*(?:cars-for-sale|vehicles)[^"]*)"/i)?.[1];
  if (target) add(target.replace(/\\\//g, "/").split("?")[0]);
  for (const m of html.matchAll(/href=["'](\/(?:used|new|certified)-vehicles?-[a-z0-9-]+)["']/gi)) {
    add(m[1]);
    if (seeds.size >= 3) break;
  }
  return [...seeds];
}

export function dealerFireNextPageUrl(html, pageUrl) {
  const onThisPage = extractDealerFire(html).size;
  if (!onThisPage) return null;
  const total = Number(html.match(/data-total-items=["'](\d+)["']/)?.[1]);
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const offset = Number(u.searchParams.get("offset")) || 0;
  const seen = offset + onThisPage;
  if (!Number.isFinite(total) || seen >= total) return null;
  u.searchParams.set("offset", String(seen));
  u.searchParams.set("limit", String(onThisPage));
  return u.toString();
}
