// ProMax (the "CX5" website product; promaxunlimited.com). A DMS-and-website
// vendor for small BHPH / independent lots — the five rooftops in the registry
// cohort are 5-to-50-car stores.
//
// The good news first: a ProMax SRP is SERVER-RENDERED and publishes one real
// schema.org Vehicle node per tile, so lib/jsonld.mjs's generic extractVehicles
// already reads the cars. Measured 2026-08-31 on www.bradleyautofinance.com
// /inventory: 10 nodes on page one, each carrying
// vehicleIdentificationNumber, mileageFromOdometer, vehicleEngine, brand,
// model, sku, itemCondition and an offers{price, priceCurrency}. Nothing in
// this module re-reads a price or tags a provenance: the JSON-LD path already
// does both, and its answer is the page's own offer.
//
// So this module is only the WAY IN, and it is four narrow jobs:
//
//   1. proMaxSeeds — the SRP slug is per-rooftop. It is "/inventory" on two
//      of the three rooftops that hold stock and a hand-written marketing slug
//      on the third ("/used-vehicles-garner", "/bridgeport-used-trucks"), and
//      ProMax writes its own nav PROTOCOL-RELATIVE, sometimes onto a sister
//      domain (bradleymotors.com's buttons all point at
//      //www.bradleyautofinance.com/…). Read off the homepage, like
//      overfuelSeeds.
//
//   2. proMaxVehicles — the SRP tile's node is missing two things normalize()
//      needs, and both are one line to repair. There is no offers.url, so
//      normalize falls back to `sourceUrl` (lib/normalize.mjs:
//      `sourceUrl: vdpUrl ?? sourceUrl`) and every car on the page publishes
//      pointing at the search page it was found on; the tile's own anchor is
//      the missing link, keyed by the same `sku` the node carries. And the
//      model year is stated as `releaseDate`, which normalize does not read
//      (it reads vehicleModelDate / productionDate / modelDate), so an
//      untouched SRP record has no year at all. Nothing else is rewritten.
//
//   3. proMaxEntries — the same sku→anchor pairing as a {url, name, vin}
//      bridge, for crawl.mjs's ItemList queue. The VDP is worth its fetch when
//      it parses: its node carries vehicleConfiguration ("4d SUV 4WD Limited
//      V6"), bodyType, driveWheelConfiguration and a real photo instead of the
//      tile's shared placeholder, and richness() ranks it above the SRP
//      record, so it wins the byVin merge.
//
//   4. proMaxNextPageUrl / proMaxFacetSeeds — there is no next page url; the
//      "Load Next Page" button is a session-stateful POST. What the platform
//      does give is its filter urls, and the year facet reaches the whole lot
//      (47/47 on tecforce, where the SRP slugs alone reach 22). Both are
//      documented at length where they are defined, because the negative is
//      the part worth keeping.
//
// WHY THE SRP IS THE SOURCE AND THE VDP IS THE SUPPLEMENT — the VDP's JSON-LD
// is INVALID JSON on any car whose trim contains an inch mark. ProMax escapes
// the quote in `name` (&quot;) and not in `vehicleConfiguration`, so the block
// reads
//
//     "name":"2023 Chevrolet Silverado 1500 4WD Crew Cab 147&quot; LTZ",
//     "vehicleConfiguration":"Crew Cab 147" LTZ",
//
// and JSON.parse throws — extractVehicles returns nothing and the page
// publishes no car at all. Measured 2026-08-31 over 12 sitemap VDPs on each
// stocked rooftop: 2/12 bradley, 6/12 ollenburg, 7/12 tecforce — 15 of 36,
// and every failure is a truck or a cab-length trim. The VDP url slug carries
// the same character as %22, so the url predicts the failure.
//
// That is why the SRP nodes are repaired rather than left to the VDP: the SRP
// node is well-formed on every car (it has no vehicleConfiguration field to
// break on, and its `name` is escaped), so a car whose VDP cannot be read
// still publishes — with a VIN, price, condition, odometer, year and its own
// url — from the search page.
//
// The VDP's node is typed ["Product","Car"] rather than "Vehicle" — "car" is
// in jsonld.mjs's VEHICLE_TYPES, so where it does parse the generic reader
// picks it up unchanged and no VDP parser is needed here.

import { extractNodes } from "../jsonld.mjs";

// Byte-identical to the promax entry in lib/fingerprint.mjs (test-asserted).
// The stylesheet library (CX5_Front_Inventory*.css), the inventory image
// server, and the vendor's own credit link in the footer. Never the bare word
// "promax": a dealer is free to write it in its copy.
const ASSET_RE = /CX5_Front_Inventory|promaxinventory\.com|www\.promaxunlimited\.com/i;

export function isProMax(html) {
  return typeof html === "string" && ASSET_RE.test(html);
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// One lowercase path segment, nothing else — no VDP (/VehicleDetails/{did}/…
// is three segments), no asset under /cssLib or /ScriptLib, no query, no hash.
const ONE_SEGMENT_RE = /^\/[a-z0-9][a-z0-9-]{2,60}$/;

// What a ProMax SRP slug looks like, from the 20 that render a search page
// across the three stocked rooftops (2026-08-31):
//
//   /inventory                        bradley, tecforce
//   /featured-vehicles                bradley
//   /new-vehicles-garner              ollenburg   (16 new)
//   /used-vehicles-garner             ollenburg   (18 used)
//   /used-cars-for-sale-in-garner     ollenburg   /used-suvs-… /used-trucks-…
//   /new-vehicle-specials             ollenburg   /used-vehicle-specials
//   /new-chevy-equinox                ollenburg   (+9 more /new-chev*-MODEL)
//   /used-vehicles-14995-or-less      ollenburg
//   /bridgeport-used-cars             tecforce    /-suvs /-trucks /-vans
//   /vehicle-specials                 tecforce
//   /used-car-dealer-syracuse         tecforce
//   /used-super-duty-trucks-syracuse  tecforce    /used-34-ton-trucks-syracuse
//
// The narrow slugs are not decoration — they are the only way past the SRP's
// ten-car page-one cap (see proMaxNextPageUrl). On ollenburg
// /used-cars-… + /used-suvs-… + /used-trucks-… is 2+9+7 = 18, which is exactly
// the used lot, and the ten /new-chev*-MODEL slugs partition the new one. So
// seeding all of them is deliberate, not shotgunning.
const SRP_TOKEN_RE =
  /^\/(?:new|used|certified|pre-owned)-|-(?:new|used|certified)-|inventory|vehicles?\b|\bcars\b|trucks|suvs|vans|for-sale/;

// Pages that carry an inventory word and are NOT a search page. Every entry
// here is a page seen in this cohort: /vehicle-finder is ollenburg's trade
// form, and the financing/service/company pages are on every rooftop. Two
// known misses are left in on purpose — ollenburg's own nav links
// /new-inventory-garner and /used-inventory-garner and both 404 — because no
// rule separates them from tecforce's live /inventory except fetching them.
// Two wasted fetches on one rooftop is the cheaper error than a deny rule
// that could hide a real rooftop's SRP.
const DENY_RE =
  /finder|value-your-trade|trade-in|sell-(?:us-)?your|service|parts|financ|credit|loan|lease|about|contact|hours|directions|staff|employ|privacy|terms|accessib|sitemap|testimonial|\bfaq\b|thank-you|error|warrant|review/;

function isSrpPath(path) {
  if (!ONE_SEGMENT_RE.test(path)) return false;
  if (DENY_RE.test(path)) return false;
  return SRP_TOKEN_RE.test(path);
}

// A cross-host seed is allowed only when the link is PROTOCOL-RELATIVE.
//
// That is not a guess about intent, it is how this template is written.
// ProMax emits a rooftop's own canonical host protocol-relative throughout —
// favicon, theme stylesheet, every nav item, every VDP anchor
// (//www.bradleyautofinance.com/inventory) — while every genuinely OUTBOUND
// link in the cohort carries an explicit scheme: nourseezcredit's
// https://www.nourse.com/used-inventory/index.htm, outtencars'
// https://www.outtenchevyallentown.com/, the vendor's own
// http://www.promaxunlimited.com. Checked on all five rooftops 2026-08-31;
// no counter-example.
//
// It matters because crawl.mjs attributes what it fetches to the REGISTRY
// row (`dealerDomain: domain`), not to the host that served the page. A seed
// onto an unrelated dealer's SRP would publish that dealer's cars under this
// one's name — a false claim, not a wasted fetch. In practice the redirect
// gets there first (bradleymotors.com 301s to www.bradleyautofinance.com,
// tecforceauto.com to www.tecforceautomotive.com), so by the time the
// homepage is parsed the sister host is already the page's own host.
const PROTOCOL_RELATIVE_RE = /^\/\//;

/**
 * The SRP url(s) this ProMax page links to, absolute.
 *
 * `base` is the url the html was fetched from (an origin works too — it is
 * only the resolution base). Nothing is seeded from a page that is not
 * ProMax's, and a rooftop that links no search page gets an empty list:
 * nourseezcredit.com and outtencars.com are both ProMax lead-capture sites
 * with no inventory of their own, and returning nothing for them is the
 * right answer, not a failure.
 */
export function proMaxSeeds(html, base) {
  if (!isProMax(html)) return [];
  let baseHost;
  try {
    baseHost = new URL(base).host;
  } catch {
    return [];
  }
  const broad = [];
  const narrow = [];
  const seen = new Set();
  for (const m of html.matchAll(/href=["']([^"'\s>]+)["']/gi)) {
    const raw = m[1];
    if (/^(?:mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    let u;
    try {
      u = new URL(raw, base);
    } catch {
      continue;
    }
    if (u.search || u.hash) continue;
    if (u.host !== baseHost && !PROTOCOL_RELATIVE_RE.test(raw)) continue;
    if (!isSrpPath(u.pathname.toLowerCase())) continue;
    const abs = u.toString();
    if (seen.has(abs)) continue;
    seen.add(abs);
    // Whole-lot slugs ahead of the facet slugs. A crawl that runs out of
    // budget should have spent it on /inventory or /used-vehicles-garner,
    // not on /new-chevy-trax.
    (/inventory|vehicles/.test(u.pathname.toLowerCase()) ? broad : narrow).push(abs);
  }
  return [...broad, ...narrow].slice(0, 24);
}

/**
 * There is no next-page url on this platform. Measured on
 * www.bradleyautofinance.com/inventory, 2026-08-31: 44 results, 10 rendered.
 *
 * The SRP prints a "Load Next Page" control (#cx5_inventory_loadmore) and an
 * infinite-scroll trigger, and both call one function in
 * /ScriptLib/CX5Front/CX5_inventory_search.js:
 *
 *     $.ajax({ url: 'index.php', type: 'POST',
 *              data: { fromAjax:'y', sid:…, doWhat:'inventorySearch',
 *                      func:'getNextPage' } })
 *
 * — no page number anywhere. The server holds the cursor in the PHP session
 * (DMS_DataKey), so the request is not expressible as a url at all, and the
 * host answers 405 to POST from outside a browser besides. Control test, same
 * page, VIN sets compared: ?page=2, ?pg=2, ?p=2, ?start=10, ?offset=10,
 * ?last=10 and ?sort=2 every one returned byte-identical page one. There is
 * no pager link in the markup to copy — the seeds above are deliberately
 * broad because this is the hole they fill.
 *
 * (The one query the server does honour is the facet the filter UI writes
 * into the url bar — ?year=2020 returned 4 of bradley's 44. It is a filter,
 * not a pager, and it is not needed: every rooftop's sitemap.xml lists every
 * VDP — 44/44 bradley, 34/34 ollenburg, 47/47 tecforce — and crawl.mjs's
 * discoverSitemapUrls already ranks /VehicleDetails/ in via INV_PATH_RE. The
 * complete walk is the sitemap; the SRP is the fast path to it.)
 *
 * Kept as an export so a rooftop that ever does print a pager has one place
 * to grow, and so this negative is a regression test rather than a memory.
 */
export function proMaxNextPageUrl(html, pageUrl) {
  if (!isProMax(html)) return null;
  void pageUrl;
  return null;
}

/** The SRP's own results counter — `<span id="countarea" data-count="44">`.
 *  It is the whole lot the search matched, not the ten rendered, so it is
 *  also the only honest truncation signal this platform gives: a page whose
 *  count exceeds the vehicle nodes it printed is a partial answer, and the
 *  caller should say so rather than let a short read read as a small lot. */
export function proMaxLotCount(html) {
  if (typeof html !== "string") return null;
  const n = Number(html.match(/id=["']countarea["'][^>]*\bdata-count=["'](\d+)["']/i)?.[1]);
  return Number.isInteger(n) ? n : null;
}

// The year facet the SRP prints for its own filter menu, one checkbox per
// model year in the lot: <input type="checkbox" id="check_year_2024" …>.
const YEAR_FACET_RE = /id=["']check_year_(\d{4})["']/gi;

/**
 * The rest of the lot, as the platform's own filter urls.
 *
 * There is no pager (see proMaxNextPageUrl), but the filter menu DOES write
 * itself into the url bar — CX5_inventory_search.js's searchPageURLUpdate()
 * pushState's `?year=2020` — and the server honours it on a plain GET. That
 * makes the year facet the only url-shaped way past the ten-car page-one cap,
 * and it is the platform's own url, not one invented here.
 *
 * Measured 2026-08-31 on www.tecforceautomotive.com/inventory, the one
 * rooftop the homepage seeds could not finish: its nine SRP slugs reach 22 of
 * 47 cars, and 16 of the 47 have a VDP whose JSON-LD will not parse, leaving
 * 9 cars unreachable by any other route. The eleven ?year= urls return
 * 1+2+8+8+5+7+6+2+5+2+1 = 47 — the whole lot, with no facet page truncated.
 * (Bradley and ollenburg already reach 44/44 and 34/34 without this.)
 *
 * Returned only when there is something to reach: a page that rendered its
 * whole result set gets an empty list rather than eleven redundant fetches.
 * A page that is ALREADY a year facet returns nothing, so this cannot loop.
 * A facet that overflows ten cars is still truncated — proMaxLotCount() is
 * how the caller sees that and reports it.
 */
export function proMaxFacetSeeds(html, pageUrl) {
  if (!isProMax(html)) return [];
  let base;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  if (base.searchParams.has("year")) return [];
  const total = proMaxLotCount(html);
  if (total == null) return [];
  const rendered = proMaxVehicles(html, pageUrl).length;
  if (!rendered || total <= rendered) return [];
  const out = [];
  const seen = new Set();
  YEAR_FACET_RE.lastIndex = 0;
  for (const m of html.matchAll(YEAR_FACET_RE)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const u = new URL(base);
    u.searchParams.set("year", m[1]);
    out.push(u.toString());
  }
  return out.slice(0, 40);
}

// The VDP anchor a tile wraps its photo, title and "View Details" button in:
//   //www.bradleyautofinance.com/VehicleDetails/7438/146370/Hudson-NH-2023-…-USED
//        dealer id ──────────────┘        stock # ──┘
// The stock number is the `sku` the tile's JSON-LD node carries, and it is
// unique per car, so the pairing needs no positional guessing about which
// script tag belongs to which div.
const VDP_HREF_RE = /href=["']([^"'\s>]*\/VehicleDetails\/\d+\/([A-Za-z0-9._-]{1,32})\/[^"'?#\s>]*)["']/gi;

const SKU_RE = /^[A-Za-z0-9._-]{1,32}$/;

const decode = (s) =>
  String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function vdpUrlsBySku(html, pageUrl) {
  const bySku = new Map();
  VDP_HREF_RE.lastIndex = 0;
  for (const m of html.matchAll(VDP_HREF_RE)) {
    const sku = m[2];
    if (bySku.has(sku)) continue;
    try {
      bySku.set(sku, new URL(m[1], pageUrl).toString());
    } catch {}
  }
  return bySku;
}

const nodeSku = (node) =>
  typeof node?.sku === "string" || typeof node?.sku === "number" ? String(node.sku) : "";

const VEHICLE_TYPE = /^(?:vehicle|car)$/i;
const isVehicleNode = (node) =>
  (Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]]).some((t) => VEHICLE_TYPE.test(String(t)));

/**
 * The page's vehicle nodes with ProMax's two non-standard fields repaired, to
 * be used INSTEAD OF the generic extractVehicles on a ProMax page — the way
 * dealr.cloud's and Auto Dealers Digital's readers replace it — not beside it,
 * or every car comes back twice, once with a url and once without.
 *
 * The repairs are the whole function, and they are only these:
 *
 *   offers.url ← the tile's own /VehicleDetails/{did}/{sku}/… anchor, paired
 *     on the `sku` the node already carries. Only set when the node has no url
 *     of its own; a node the platform did give a url keeps it.
 *   vehicleModelDate ← `releaseDate`, and only when it is a bare four-digit
 *     year and vehicleModelDate is absent. schema.org's releaseDate is a date,
 *     not a model year, so nothing else may read it — but ProMax puts the
 *     model year there and nowhere else on an SRP tile, and a listing with no
 *     year is a listing that cannot be matched to anything.
 *
 * Price, condition, odometer, engine and images are passed through untouched:
 * they are the page's own JSON-LD and the generic path already reads them
 * right, including the platform's "0" no-price state, which normalize() drops
 * because a zero is not an asking price.
 *
 * A VDP is handled by the same code with nothing to do: its node already
 * states vehicleModelDate, and if the page carries no anchor for its own sku
 * the node passes through unchanged with normalize()'s page-url fallback —
 * which on a VDP is the right url anyway.
 *
 * A node with no readable VIN is dropped rather than passed on — every ProMax
 * node measured across the three stocked rooftops carries one (91/91), and a
 * VIN-less twin of a car this same walk already has would survive the byVin
 * dedupe as a second, url-keyed listing of one car.
 */
export function proMaxVehicles(html, pageUrl) {
  if (!isProMax(html)) return [];
  const bySku = vdpUrlsBySku(html, pageUrl);
  const out = [];
  const seen = new Set();
  for (const node of extractNodes(html)) {
    if (!isVehicleNode(node)) continue;
    const vin = String(node.vehicleIdentificationNumber ?? "").toUpperCase();
    if (!VIN_RE.test(vin) || seen.has(vin)) continue;
    seen.add(vin);
    const sku = nodeSku(node);
    const url = SKU_RE.test(sku) ? bySku.get(sku) : undefined;
    const year =
      node.vehicleModelDate == null && /^\d{4}$/.test(String(node.releaseDate ?? ""))
        ? String(node.releaseDate)
        : node.vehicleModelDate;
    const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
    // A car with a link and no offer block still needs somewhere to carry the
    // link. The minted Offer holds a url and nothing else — no price, no
    // availability, nothing that could read as a claim the page did not make.
    const withUrl = offers.length
      ? offers.map((o) => (o && typeof o === "object" && !o.url ? { ...o, url } : o))
      : [{ "@type": "Offer", url }];
    out.push({ ...node, vehicleModelDate: year, offers: url ? withUrl : node.offers });
  }
  return out;
}

/**
 * SRP tiles → VDP urls, for crawl.mjs's ItemList bridge.
 *
 * Returns {url, name, vin} the same shape motorcarEntries does. The name is
 * the tile's own JSON-LD name plus its vehicleEngine string, because that is
 * what evishEntry() reads to decide whether a car earns its VDP fetch — the
 * engine field is where a ProMax record says what the car burns, and a
 * nameplate alone ("2019 Kia Niro") does not always say it.
 *
 * A node with no sku, or a sku with no anchor on the page, yields nothing: a
 * car we cannot reach is not a link we can offer.
 */
export function proMaxEntries(html, pageUrl) {
  if (!isProMax(html)) return [];
  const bySku = vdpUrlsBySku(html, pageUrl);
  if (!bySku.size) return [];

  const out = [];
  const seen = new Set();
  // The page's own JSON-LD, read through lib/jsonld.mjs so this module parses
  // it exactly the way the generic extractor that reads the cars does.
  for (const node of extractNodes(html)) {
    const sku = typeof node.sku === "string" || typeof node.sku === "number" ? String(node.sku) : "";
    if (!SKU_RE.test(sku) || !bySku.has(sku)) continue;
    const url = bySku.get(sku);
    if (seen.has(url)) continue;
    seen.add(url);
    const vin = String(node.vehicleIdentificationNumber ?? "").toUpperCase();
    // vehicleEngine is a plain string on the SRP node ("5.3L ECOTEC3 V8") and
    // an EngineSpecification object on the VDP's; read both, claim neither.
    const engine =
      typeof node.vehicleEngine === "string"
        ? node.vehicleEngine
        : typeof node.vehicleEngine?.name === "string"
          ? node.vehicleEngine.name
          : "";
    const name = decode([node.name ?? "", engine].filter(Boolean).join(" ")).slice(0, 200);
    out.push({ url, name: name || undefined, vin: VIN_RE.test(vin) ? vin : undefined });
  }
  return out;
}
