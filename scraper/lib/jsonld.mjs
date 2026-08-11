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
