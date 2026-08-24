// Wayne Reaves — a used-car DMS whose website product runs small independents.
// Its rooftops are the purest "nothing to walk" case in the pile: EVERY path on
// the host returns the same 272 KB Ractive shell. /inventory, /vehicles,
// /sitemap.xml and /robots.txt all answered 200 with byte-identical length on
// suncoastqualitycars.com, and none of them contains a VIN, an ItemList or a
// link to a real page — so the probe saw no sitemap, no ItemList and no
// vehicles, which is exactly the verdict `nothing-to-walk` was coined for.
//
// The whole lot is one same-origin request the page's own client makes:
//
//   GET /service/inventory/website  → a JSON array, one object per car
//
// Found by watching the browser's network on suncoastqualitycars.com — the
// house lesson about dark-tail vendors, which a static probe cannot see. No
// key, no token, no per-rooftop id in the path.
//
// Six rooftops in a seeded random 400 of the written-off pile answered it
// (2026-08-23; ~76 across the pile if the rate holds), returning 136 records
// with a complete car each: vin, year, make, model, trim, style, engine,
// cylinders, transmission, driveTrain, fuel, mileage, both colours, price,
// pictures, and machine booleans for used/certified.
//
// SOLD CARS ARE IN THE FEED, AND THE SITE SAYS SO
//
// 31 of those 136 records carry a `soldOn` date — 27 of 28 on
// cawleymotorsports.com alone, a classics dealer that keeps a gallery of what
// it has sold. The rendered page stamps each of them "SOLD" and prints no
// price. Publishing them would put 23% of this lane's rows on the site as
// live inventory that cannot be bought, so `soldOn` (with `deletedAt` and a
// false `forWeb`) is a hard filter and not a nicety.
//
// PRICE
//
// `price` is the number the card prints. `specialPrice` exists and is almost
// never used: one record in 136 had `special: true`, and its specialPrice
// equalled its price, so there is no observed case of the two disagreeing and
// therefore no evidence for which one a marked-down card shows. A record where
// they DO disagree abstains rather than pick a rung — the same rule
// automanager.mjs applies to its own unresolved ladder, for the same reason:
// inventing a precedence for a ladder nobody has seen is how the dealer.com
// internetPrice rule overstated 1,256 live listings.
//
// A price of 0 or absent is an abstention too. It is what the platform stores
// for "Contact Us" (2 of 105 live records), which is a real state and not a
// parse failure.
import { WAYNEREAVES_PRICE } from "../price-provenance.mjs";
import { stabilizeImages } from "../images.mjs";
import { fetchPage } from "../http.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The footer credits the vendor on every rooftop's page ("Wayne Reaves
// Automotive Dealer Websites", linking waynereaves.com; some rooftops link
// waynereaves.net instead). Nothing else on these pages names the platform —
// there is no asset CDN, because every asset is served same-origin.
const WR_RE = /waynereaves\.(?:com|net)/i;

export function isWayneReaves(html) {
  return typeof html === "string" && WR_RE.test(html);
}

export const WAYNEREAVES_FEED_PATH = "/service/inventory/website";

export function wayneReavesFeedUrl(origin) {
  return origin.replace(/\/$/, "") + WAYNEREAVES_FEED_PATH;
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** A record that is actually for sale right now. See the header: the feed
 *  carries the rooftop's sold gallery too, and the site labels it SOLD. */
export function wayneReavesIsLive(rec) {
  return !rec?.soldOn && !rec?.deletedAt && rec?.forWeb !== false;
}

/** The advertised price, or undefined — including for the ladder we have never
 *  seen resolved. */
export function wayneReavesPrice(rec) {
  const price = num(rec?.price);
  const special = num(rec?.specialPrice);
  if (rec?.special === true && special != null && price != null && special !== price) return undefined;
  return price ?? (rec?.special === true ? special : undefined);
}

/** The rooftop's own page for one car. The client builds it from the record;
 *  the trailing slug is cosmetic but the platform 404s without the shape. */
export function wayneReavesVdpUrl(rec, origin) {
  const acct = rec?.accountNo ?? rec?.accountId;
  if (!acct || !rec?.stockNo) return undefined;
  const slug = [rec.year, rec.make, rec.model].filter(Boolean).join("-");
  return `${origin.replace(/\/$/, "")}/inventory/${acct}/view/${rec.stockNo}/${encodeURIComponent(slug)}`;
}

export function wayneReavesVehicle(rec, origin) {
  const vin = String(rec?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const price = wayneReavesPrice(rec);
  const mileage = num(rec?.mileage);
  const fuel = typeof rec?.fuel === "string" && rec.fuel.trim() ? rec.fuel.trim() : undefined;
  // Machine booleans, not display strings — see ../condition.mjs. `certified`
  // is a used car with an extra claim on it, so it does not become a third
  // condition here; ingest promotes the row from the flag.
  const itemCondition = rec?.used === true ? "used" : rec?.used === false ? "new" : undefined;
  const images = stabilizeImages(
    (Array.isArray(rec?.pictures) ? rec.pictures : [])
      .slice()
      .sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0))
      .map((p) => p?.url)
      .filter((u) => typeof u === "string"),
  );
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: rec?.year ? String(rec.year) : undefined,
    brand: rec?.make || undefined,
    model: rec?.model || undefined,
    vehicleConfiguration: rec?.trim || undefined,
    name: [rec?.year, rec?.make, rec?.model, rec?.trim].filter(Boolean).join(" ") || undefined,
    ...(itemCondition ? { itemCondition } : {}),
    ...(rec?.certified === true ? { certified: true } : {}),
    bodyType: rec?.style || rec?.body || undefined,
    mileageFromOdometer:
      mileage != null ? { "@type": "QuantitativeValue", value: mileage, unitCode: "SMI" } : undefined,
    color: rec?.exteriorColor || undefined,
    vehicleInteriorColor: rec?.interiorColor || undefined,
    driveWheelConfiguration: rec?.driveTrain || undefined,
    vehicleTransmission: rec?.transmission || undefined,
    sku: rec?.stockNo ? String(rec.stockNo) : undefined,
    description: typeof rec?.description === "string" ? rec.description.slice(0, 2000) : undefined,
    image: images.length ? images : undefined,
    fuelType: fuel,
    vehicleEngine: {
      "@type": "EngineSpecification",
      name: rec?.engine || undefined,
      fuelType: fuel,
    },
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? WAYNEREAVES_PRICE : undefined,
      priceCurrency: "USD",
      url: wayneReavesVdpUrl(rec, origin),
    },
  };
}

/** Every live car on a Wayne Reaves rooftop, from the one feed body. */
export function wayneReavesVehicles(body, origin) {
  let rows;
  try {
    rows = JSON.parse(body);
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  const out = [];
  const seen = new Set();
  for (const rec of rows) {
    if (!wayneReavesIsLive(rec)) continue;
    const v = wayneReavesVehicle(rec, origin);
    if (!v || seen.has(v.vehicleIdentificationNumber)) continue;
    seen.add(v.vehicleIdentificationNumber);
    out.push(v);
  }
  return out;
}

/** One request: the whole lot. `ok` is false when the feed did not answer, so
 *  a caller can refuse to certify a complete crawl off a failed pull. */
export async function pullWayneReaves(origin) {
  const res = await fetchPage(wayneReavesFeedUrl(origin));
  if (res.status !== 200 || !res.body) return { ok: false, vehicles: [], found: 0, requests: 1 };
  const vehicles = wayneReavesVehicles(res.body, origin);
  if (!vehicles) return { ok: false, vehicles: [], found: 0, requests: 1 };
  let found = 0;
  try {
    found = JSON.parse(res.body).length;
  } catch {}
  return { ok: true, vehicles, found, requests: 1 };
}

/** The probe's one-request settle, like DealerVenom/Overfuel/Motive/AutoFunds. */
export async function countWayneReaves(origin) {
  const { ok, vehicles, found } = await pullWayneReaves(origin);
  return { ok, found, live: vehicles.length, hasVin: vehicles.length > 0 };
}
