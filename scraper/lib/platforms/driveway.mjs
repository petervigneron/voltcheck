// Driveway.com (Lithia Motors' national storefront, ~300 rooftops) — custom
// Next.js app, not a dealer platform. SRP category pages server-render an
// ItemList of schema.org Vehicle nodes at
// __NEXT_DATA__.props.pageProps.inventoryJsonLd; VDPs are client-rendered
// (empty shells), so SRPs are the only extraction surface. The Vehicle nodes
// carry no vehicleIdentificationNumber field, but every vehicle image URL on
// vehicle-images.driveway.com embeds the full VIN as a path segment —
// verified 2026-08-11.
const NEXT_DATA_RE = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
const VIN_SEG_RE = /\/([A-HJ-NPR-Z0-9]{17})[/.]/;

const VEHICLE_TYPES = new Set(["vehicle", "car"]);
function isVehicle(node) {
  const t = node?.["@type"];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).some((x) => VEHICLE_TYPES.has(String(x).toLowerCase()));
}

function* walk(node) {
  if (Array.isArray(node)) for (const x of node) yield* walk(x);
  else if (node && typeof node === "object") {
    yield node;
    for (const v of Object.values(node)) if (v && typeof v === "object") yield* walk(v);
  }
}

export function extractDrivewayVehicles(html) {
  if (!html.includes("inventoryJsonLd")) return [];
  const m = html.match(NEXT_DATA_RE);
  if (!m) return [];
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const jsonld = data?.props?.pageProps?.inventoryJsonLd;
  if (!jsonld) return [];
  const out = [];
  for (const node of walk(jsonld)) {
    if (!isVehicle(node)) continue;
    if (!node.vehicleIdentificationNumber) {
      // Recover the VIN from any image URL path segment.
      const imgs = Array.isArray(node.image) ? node.image : [node.image];
      for (const img of imgs) {
        const url = typeof img === "string" ? img : img?.url ?? img?.contentUrl ?? "";
        const vin = String(url).match(VIN_SEG_RE);
        if (vin) {
          node.vehicleIdentificationNumber = vin[1].toUpperCase();
          break;
        }
      }
    }
    out.push(node);
  }
  return out;
}
