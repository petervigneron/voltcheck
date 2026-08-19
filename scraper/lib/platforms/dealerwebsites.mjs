// DealerWebsites.com platform extractor.
//
// DealerWebsites is a dealer-site vendor whose SRP is an Angular app: the served
// HTML carries no schema.org and no VDP links (they are built client-side), so
// the static probe filed these rooftops as unknown/no-lead. But the whole lot is
// right there in the page — the Angular bootstrap ships every car inline:
//   angular.module("app.inventory").factory("BootstrapService", function() {
//     return { vehicles: [ {listingId, vin, year, make, model, trim, price,
//                           mileage, engine, drive, photoUrl, …}, … ] } })
// We parse that array straight out of the HTML. No API call, no login — one SRP
// fetch is the entire inventory, so this is a producer like DCS: given a page
// that carries the blob, it returns every car as a schema.org Vehicle node and
// classifyEv/normalize handle it downstream.
//
// VDP URL is built from the listingId the way the app builds it:
// /{listingId}/{Year}-{Make}-{Model}. The listing resolves on the id, so the
// slug is cosmetic.

// The Angular inventory factory names itself on every DealerWebsites page; the
// asset host is the belt-and-suspenders second signal.
const DW_MARK = /app\.inventory["']\)\.factory\(\s*["']BootstrapService["']|dealerwebsites\.com/i;

export function isDealerWebsites(html) {
  return typeof html === "string" && DW_MARK.test(html);
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// Pull the `vehicles: [ … ]` array out of the bootstrap factory by matching the
// brackets (string-aware), so a `]` inside a value can't end it early. Returns
// [] when the blob is absent or unparseable — never throws into the crawl loop.
function extractVehiclesArray(html) {
  const key = html.search(/\bvehicles\s*:\s*\[/);
  if (key < 0) return [];
  const start = html.indexOf("[", key);
  let depth = 0;
  let inStr = false;
  let esc = false;
  let i = start;
  for (; i < html.length; i++) {
    const c = html[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  try {
    return JSON.parse(html.slice(start, i));
  } catch {
    return [];
  }
}

const slugify = (s) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "");

function vehicleNode(v, origin) {
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;

  // `price` is the dealer's advertised number. The blob also carries payment
  // fields (monthly/weekly/down) and book values (nadaPrice/kbbPrice) — none of
  // which is the asking price, so we read `price` and nothing else.
  const priceRaw = Number(v.price);
  const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : undefined;
  const mileage = Number(v.mileage);
  const year = v.year != null ? String(v.year) : undefined;

  let url = origin;
  if (v.listingId != null) {
    const seg = [year, v.make, v.model].filter(Boolean).map(slugify).join("-") || "vehicle";
    url = `${origin}/${v.listingId}/${seg}`;
  }

  const photo = v.photoUrl || v.mediumPhotoUrl || v.originalPhotoUrl;

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: year,
    brand: v.make || undefined,
    model: v.model || undefined,
    name: [year, v.make, v.model, v.trim].filter(Boolean).join(" ") || undefined,
    vehicleConfiguration: v.trim || undefined,
    mileageFromOdometer:
      Number.isFinite(mileage) && mileage >= 0 ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: v.exteriorColor || undefined,
    vehicleInteriorColor: v.interiorColor || undefined,
    driveWheelConfiguration: v.drive || undefined,
    sku: v.stockNumber || undefined,
    image: typeof photo === "string" && photo ? [photo] : undefined,
    itemCondition: "used",
    // No fuel field in the blob (engine is a displacement string), so fuelType is
    // left unset and classifyEv decides from the nameplate/VIN.
    vehicleEngine: v.engine ? { "@type": "EngineSpecification", name: String(v.engine) } : undefined,
    offers: { "@type": "Offer", price, priceCurrency: "USD", url },
  };
}

// Every car on a DealerWebsites page, as schema.org Vehicle nodes. The blob is
// the whole lot, so one SRP page is the complete inventory.
export function extractDealerWebsitesVehicles(html, pageUrl) {
  if (typeof html !== "string" || !DW_MARK.test(html)) return [];
  let origin;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const out = [];
  for (const v of extractVehiclesArray(html)) {
    const node = vehicleNode(v, origin);
    if (node) out.push(node);
  }
  return out;
}
