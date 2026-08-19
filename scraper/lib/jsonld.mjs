// Extract schema.org JSON-LD from an HTML page and return every object whose
// @type looks like a vehicle. Dealer platforms (Dealer.com, DealerOn, Dealer
// Inspire, Sincro…) emit Vehicle/Car JSON-LD on vehicle detail pages — this is
// the workhorse of the whole scraper.
const SCRIPT_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function* walk(node) {
  if (Array.isArray(node)) {
    for (const x of node) yield* walk(x);
  } else if (node && typeof node === "object") {
    yield node;
    if (node["@graph"]) yield* walk(node["@graph"]);
    // some platforms nest offers/vehicles inside other entities
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") yield* walk(v);
    }
  }
}

const VEHICLE_TYPES = new Set(["vehicle", "car", "motorizedbicycle", "motorcycle", "busortruck"]);

export function extractNodes(html) {
  const out = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    let parsed;
    try {
      // tolerate stray control chars that dealer CMSes emit
      parsed = JSON.parse(m[1].trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " "));
    } catch {
      continue;
    }
    for (const node of walk(parsed)) out.push(node);
  }
  return out;
}

function hasType(node, wanted) {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).some((x) => wanted.has(String(x).toLowerCase()));
}

export function extractVehicles(html) {
  return extractNodes(html).filter((n) => hasType(n, VEHICLE_TYPES));
}

// Some dealer platforms (AutoFunds/DealerClick, and others) publish the same
// schema.org Vehicle vocabulary as MICRODATA (itemscope/itemprop) rather than
// JSON-LD — so the JSON-LD reader above finds nothing though the page is fully
// marked up. This reads that microdata into the identical node shape, so it
// flows through the same classifyEv/normalize path. It is a standards-based
// reader, not a per-vendor scraper: any dealer emitting schema.org/Vehicle
// microdata is covered, not one platform.
const MD_VEHICLE_RE = /itemtype=["']https?:\/\/schema\.org\/(?:Vehicle|Car|Motorcycle|BusOrTruck)["']/gi;

const mdDecode = (s) =>
  String(s ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// The value of the FIRST element in `frag` carrying itemprop="name": a meta's
// content=, a link/a's href=, an img's src=, else the element's text. `after`
// lets a later itemprop (a card can list the same prop twice) be read past an
// offset — used to prefer the Offer's price.
function mdProp(frag, name, after = 0) {
  const re = new RegExp(`<([a-z0-9]+)\\b([^>]*\\bitemprop=["']${name}["'][^>]*)>([^<]*)`, "i");
  const m = frag.slice(after).match(re);
  if (!m) return undefined;
  const tag = m[1].toLowerCase();
  const attrs = m[2];
  const content = attrs.match(/\bcontent=["']([^"']*)["']/i)?.[1];
  const href = attrs.match(/\bhref=["']([^"']*)["']/i)?.[1];
  const src = attrs.match(/\bsrc=["']([^"']*)["']/i)?.[1];
  const text = m[3];
  let val;
  if (content != null) val = content;
  else if (tag === "meta") val = content;
  else if (tag === "link") val = href;
  else if (tag === "img") val = src;
  else val = text || href || src;
  const out = mdDecode(val);
  return out || undefined;
}

// The vehicle's detail URL. itemprop="url" is unreliable here: the nested
// itemCondition scope carries <link itemprop="url" href="https://schema.org/
// UsedCondition"> first, so we skip any schema.org enum URL and fall back to the
// anchor that wraps the vehicle's name (the card's link to its own VDP).
function mdUrl(frag) {
  for (const m of frag.matchAll(/itemprop=["']url["'][^>]*\bhref=["']([^"']+)["']/gi)) {
    if (!/schema\.org/i.test(m[1])) return mdDecode(m[1]);
  }
  const ni = frag.search(/itemprop=["']name["']/i);
  if (ni > 0) {
    const anchors = [...frag.slice(0, ni).matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)];
    const href = anchors.length ? anchors[anchors.length - 1][1] : null;
    if (href && !/schema\.org|^javascript:|^#/.test(href)) return mdDecode(href);
  }
  return undefined;
}

function microdataNode(frag) {
  const vin = mdProp(frag, "vehicleIdentificationNumber");
  if (!vin || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin.toUpperCase())) return null;

  const mileageRaw = mdProp(frag, "mileageFromOdometer");
  const mileage = mileageRaw ? Number(String(mileageRaw).replace(/[^\d.]/g, "")) : undefined;
  const priceRaw = mdProp(frag, "price");
  const price = priceRaw ? Number(String(priceRaw).replace(/[^\d.]/g, "")) : undefined;

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin.toUpperCase(),
    vehicleModelDate: mdProp(frag, "vehicleModelDate") ?? mdProp(frag, "productionDate"),
    // schema.org's Vehicle uses `manufacturer`; the pages label the make with it.
    manufacturer: mdProp(frag, "manufacturer") ?? mdProp(frag, "brand"),
    model: mdProp(frag, "model"),
    vehicleConfiguration: mdProp(frag, "vehicleConfiguration"),
    name: mdProp(frag, "name"),
    mileageFromOdometer:
      Number.isFinite(mileage) && mileage >= 0 ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: mdProp(frag, "color"),
    vehicleInteriorColor: mdProp(frag, "vehicleInteriorColor"),
    driveWheelConfiguration: mdProp(frag, "driveWheelConfiguration"),
    sku: mdProp(frag, "sku"),
    image: mdProp(frag, "image"),
    itemCondition: mdProp(frag, "itemCondition"),
    vehicleEngine: { "@type": "EngineSpecification", fuelType: mdProp(frag, "fuelType") },
    offers: {
      "@type": "Offer",
      price: Number.isFinite(price) && price > 0 ? price : undefined,
      priceCurrency: mdProp(frag, "priceCurrency") || "USD",
      url: mdUrl(frag),
    },
  };
}

// Vehicles marked up as schema.org microdata. Cards are contiguous, so each
// Vehicle itemscope runs to where the next one starts (the trailing markup is
// harmless nav/whitespace). Deduped by VIN downstream, so a page carrying BOTH
// JSON-LD and microdata never double-counts.
export function extractMicrodataVehicles(html) {
  if (typeof html !== "string") return [];
  const idx = [...html.matchAll(MD_VEHICLE_RE)].map((m) => m.index);
  const out = [];
  for (let i = 0; i < idx.length; i++) {
    const node = microdataNode(html.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : html.length));
    if (node) out.push(node);
  }
  return out;
}

// SRPs on DealerOn (and other platforms) publish an ItemList of VDPs:
// {url, name, identifier (VIN)}. This is the discovery bridge from a search
// page to every vehicle page, even when the sitemap lists none.
const LIST_ITEM = new Set(["listitem"]);
export function extractItemListEntries(html) {
  const entries = [];
  for (const node of extractNodes(html)) {
    if (!hasType(node, LIST_ITEM)) continue;
    if (node.url) entries.push({ url: node.url, name: node.name, vin: node.identifier });
  }
  return entries;
}
