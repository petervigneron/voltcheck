// DealerClick's current product ("DealerNetwork", a Next.js app) — two
// rooftops in the registry pile (donjoseautosales.com, blueridgemotorworks
// .com, 2026-08-31). The pages DO publish a complete schema.org ItemList —
// every Car node carries vehicleIdentificationNumber, offers.price,
// itemCondition, availability, mileageFromOdometer and a per-car url — but
// it reaches the browser inside the React Server Component flight stream
// (`self.__next_f.push([1,"…"])`), where every quote is escaped. The DOM gets
// a real <script type="application/ld+json"> only after hydration, so the
// generic extractor sees nothing in the fetched HTML and both rooftops sat in
// needs-investigation as "0 VIN vehicles".
//
// This module unescapes the flight chunks and parses the ItemList out of
// them. The nodes are then the dealer's own JSON-LD, read verbatim — the same
// reading the generic path makes on a server-rendered site, one unescape
// away — so prices ride the generic JSONLD provenance and no field mapping
// happens here beyond dropping cars whose own Offer says they are not
// InStock. donjoseautosales serves its whole 45-car lot in one page's
// payload; blueridge its 17.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The vendor's own hosts and its Cloudinary folder — never the brand word.
// Kept byte-identical to the fingerprint.mjs entry (test-asserted).
const MARK_RE = /goroutes\.dealerclick\.com|dealerclick\/image\/upload|www\.dealernetwork\.com\/images\/inventory/i;

export function isDealerClick(html) {
  return typeof html === "string" && MARK_RE.test(html);
}

export const DEALERCLICK_SRP_PATH = "/inventory";

export function dealerClickSeeds(origin) {
  return [origin.replace(/\/$/, "") + DEALERCLICK_SRP_PATH];
}

/** Balanced-brace JSON slice starting at `start` (which must be a "{"),
 *  string-aware. Returns the parsed object or null. */
function parseObjectAt(s, start) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Every ItemList the page's flight stream carries, parsed. */
export function dealerClickItemLists(html) {
  if (typeof html !== "string") return [];
  const out = [];
  for (const m of html.matchAll(/__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    let chunk;
    try {
      chunk = JSON.parse(`"${m[1]}"`);
    } catch {
      continue;
    }
    let from = 0;
    for (;;) {
      const i = chunk.indexOf('"@type": "ItemList"', from);
      if (i < 0) break;
      from = i + 1;
      const start = chunk.lastIndexOf("{", i);
      if (start < 0) continue;
      const obj = parseObjectAt(chunk, start);
      if (obj && Array.isArray(obj.itemListElement)) out.push(obj);
    }
  }
  return out;
}

/** A flight URL rebased onto the page actually fetched. donjoseautosales
 *  publishes every url as https://localhost:3000/… — the vendor's app was
 *  deployed with its dev base URL — and a listing pointing a shopper (or
 *  recheck) at localhost is broken however correct the rest of the node is. */
function rebase(url, pageUrl) {
  try {
    const u = new URL(url);
    if (/^(localhost|127\.0\.0\.1)$/i.test(u.hostname) && pageUrl) {
      const page = new URL(pageUrl);
      u.protocol = page.protocol;
      u.hostname = page.hostname;
      u.port = page.port;
    }
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Every in-stock, VIN'd car in the page's embedded ItemLists, as the
 *  schema.org nodes the dealer published — untouched beyond the localhost
 *  rebase, so the generic normalize path reads them exactly as it would off
 *  a rendered page. */
export function dealerClickVehicles(html, pageUrl) {
  if (!isDealerClick(html)) return [];
  const out = [];
  const seen = new Set();
  for (const list of dealerClickItemLists(html)) {
    for (const el of list.itemListElement) {
      const item = el?.item;
      if (!item || !/^(Car|Vehicle)$/.test(String(item["@type"]))) continue;
      const vin = String(item.vehicleIdentificationNumber ?? "").toUpperCase();
      if (!VIN_RE.test(vin) || seen.has(vin)) continue;
      const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
      // The page's own word: a node whose Offer is not InStock is not for sale.
      if (offer?.availability && !/InStock/i.test(String(offer.availability))) continue;
      seen.add(vin);
      if (item.url) item.url = rebase(item.url, pageUrl) ?? item.url;
      // The node's `url` is the VDP; the generic path reads offers.url, so
      // mirror it there without disturbing anything else.
      if (item.url && offer && !offer.url) offer.url = item.url;
      else if (offer?.url) offer.url = rebase(offer.url, pageUrl) ?? offer.url;
      out.push(item);
    }
  }
  return out;
}
