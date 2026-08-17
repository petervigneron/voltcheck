// dealr.cloud — a used-dealer SaaS (cdn.dealrcloud.com assets), 34 registry
// rooftops as of 2026-08-16, most of them Colorado independents off the
// Vehicle Exchange Colorado roster. Everything is server-rendered — the
// "dealr.cloud api-hosts" probe lead turned out to be asset CDNs, and SRP
// pagination that looks JS-driven (dealr-pagination-target) is answered
// server-side by a plain ?page=N — but the generic stack still saw nothing,
// for two reasons:
//   1. SRPs publish no ItemList and no vehicle JSON-LD;
//   2. VDP JSON-LD is a schema.org Car with NO vehicleIdentificationNumber,
//      and on some templates the block carries a raw control character inside
//      a string literal that kills JSON.parse outright (eprius.com).
// The platform's own markup is regular and carries everything instead: every
// SRP tile and VDP has one vehicle-inquiry="VIN|year|make|model" attribute,
// VDPs add vin-/odo-/stock-containers and an entry-price heading, and tiles
// carry a Mileage/Exterior/Interior key-value list.

const INQUIRY_RE = /vehicle-inquiry="([A-HJ-NPR-Z0-9]{17})\|(\d{4})\|([^|"]*)\|([^"]*)"/;

export function isDealrCloud(html) {
  return /cdn\.dealrcloud\.com|dealr-dealer-id|dealr-inventory-list/.test(html);
}

export const DEALR_SRP_PATH = "/inventory";

export function dealrSeeds(origin) {
  return [origin + DEALR_SRP_PATH];
}

// Pagination is server-side ?page=N; the page count is published in the
// dealr-pagination-target markers (verified: giantautowarehouse.com pages 1-3
// each serve distinct tiles to a plain GET).
export function dealrNextPageUrl(html, pageUrl) {
  const pages = [...html.matchAll(/dealr-pagination-target="(\d+)"/g)].map((m) => Number(m[1]));
  if (!pages.length) return null;
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const cur = Number(u.searchParams.get("page") ?? 1);
  if (cur >= Math.max(...pages)) return null;
  u.searchParams.set("page", String(cur + 1));
  return u.toString();
}

const textOf = (s) => s?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || undefined;

// Dealer identity from the page's AutoDealer JSON-LD. Field-level regexes on
// the raw block rather than JSON.parse, because the block is exactly what is
// broken on some templates (see header) while its field syntax stays regular.
function dealerFromLdJson(html) {
  const block = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!block || !/AutoDealer/.test(block)) return undefined;
  const f = (name) => block.match(new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`))?.[1]?.trim();
  const name = f("name");
  const address = {
    "@type": "PostalAddress",
    streetAddress: f("streetAddress"),
    addressLocality: f("addressLocality"),
    addressRegion: f("addressRegion"),
    postalCode: f("postalCode"),
  };
  return { "@type": "AutoDealer", name: name || undefined, address: address.addressLocality ? address : undefined };
}

// Value of a key/value detail row ("Mileage" → "52,519") within one chunk.
function detailValue(chunk, key) {
  const re = new RegExp(`__item__key[^>]*>\\s*${key}\\s*<[\\s\\S]{0,200}?__item__value[^>]*>\\s*([^<]*)`);
  return re.exec(chunk)?.[1]?.trim() || undefined;
}

function firstPrice(chunk) {
  // First figure only: the price container appends doc-fee and "Total Price"
  // paragraphs after the advertised price on some rooftops (eprius.com), and
  // the advertised price is the claim every other platform's listing makes.
  const m = /dealr-inventory-price[^>]*>[\s\S]{0,80}?\$\s?([\d,]{4,})/.exec(chunk) ?? /entry-price[^>]*>\s*\$\s?([\d,]{4,})/.exec(chunk);
  return m ? Number(m[1].replace(/,/g, "")) : undefined;
}

function record({ vin, year, make, model, name, price, mileage, vdpUrl, seller, extras = {} }) {
  return {
    "@type": "Car",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: year,
    brand: make || undefined,
    model: model || undefined,
    name: name || [year, make, model].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer: mileage != null ? { value: mileage } : undefined,
    offers: { "@type": "Offer", price, url: vdpUrl, seller },
    ...extras,
  };
}

// One vehicle per SRP tile; tiles without a vehicle-inquiry VIN are skipped —
// crawl.mjs keys VIN-less records by their source URL, and every tile on a
// page shares that URL, so emitting them would collapse the page to one car.
export function dealrTiles(html, pageUrl) {
  if (!isDealrCloud(html)) return [];
  const chunks = html.split(/class="dealr-inventory-list__vehicle /).slice(1);
  const seller = dealerFromLdJson(html);
  const out = [];
  for (const chunk of chunks) {
    const inquiry = INQUIRY_RE.exec(chunk);
    if (!inquiry) continue;
    const [, vin, year, make, model] = inquiry;
    const href = /href="([^"]*inventory\/[^"]+\/\d+)"/.exec(chunk)?.[1];
    let vdpUrl;
    try {
      vdpUrl = href ? new URL(href, pageUrl).toString() : undefined;
    } catch {}
    const title = textOf(/__container__title">\s*<h\d[^>]*>([^<]*)/.exec(chunk)?.[1]);
    const mileageStr = detailValue(chunk, "Mileage");
    out.push(
      record({
        vin: vin.toUpperCase(),
        year,
        make,
        model,
        name: title,
        price: firstPrice(chunk),
        mileage: mileageStr ? Number(mileageStr.replace(/,/g, "")) : undefined,
        vdpUrl,
        seller,
        extras: {
          color: detailValue(chunk, "Exterior"),
          vehicleInteriorColor: detailValue(chunk, "Interior"),
          driveWheelConfiguration: detailValue(chunk, "Drivetrain"),
          sku: detailValue(chunk, "Stock"),
        },
      })
    );
  }
  return out;
}

// A VDP is recognised by its vin-container. Fuel type comes from the JSON-LD
// block by field regex (parse-proof, see header) — "electric" there is the
// dealer's own structured claim, which classifyEv treats as high confidence.
export function dealrVdpVehicle(html, pageUrl) {
  if (!isDealrCloud(html)) return null;
  const vin = /vin-container[^>]*>\s*([A-HJ-NPR-Z0-9]{17})\s*</.exec(html)?.[1];
  if (!vin) return null;
  const inquiry = INQUIRY_RE.exec(html);
  const odo = /odo-container[^>]*>\s*([\d,]+)\s*Miles/i.exec(html)?.[1];
  const stock = /stock-container[^>]*>\s*Stock\s*#?:?\s*([^<]*)/i.exec(html)?.[1]?.trim();
  const ld = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1] ?? "";
  const ldField = (name) => ld.match(new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`))?.[1]?.trim() || undefined;
  const image = /property="og:image"\s+content="([^"]+)"/.exec(html)?.[1];
  return record({
    vin: vin.toUpperCase(),
    year: inquiry?.[2],
    make: inquiry?.[3],
    model: inquiry?.[4],
    price: firstPrice(html),
    mileage: odo ? Number(odo.replace(/,/g, "")) : undefined,
    vdpUrl: pageUrl,
    seller: dealerFromLdJson(html),
    extras: {
      fuelType: ldField("fuelType"),
      color: ldField("color"),
      vehicleInteriorColor: ldField("vehicleInteriorColor"),
      sku: stock || undefined,
      image: image ? [image] : undefined,
    },
  });
}

// Both page kinds through one call, mirroring extractDcsVehicles' contract.
export function dealrVehicles(html, pageUrl) {
  const vdp = dealrVdpVehicle(html, pageUrl);
  return vdp ? [vdp] : dealrTiles(html, pageUrl);
}
