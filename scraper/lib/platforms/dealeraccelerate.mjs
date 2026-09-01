// DealerAccelerate (Speed Digital) — the website platform behind the
// classic/specialty/consignment houses: Gateway Classic Cars, Streetside
// Classics, Classic Auto Mall, Motorcar Studio and ~13 more rooftops. Gateway
// alone is 1,755 cars.
//
// ── WHY THIS LANE IS THIN ──────────────────────────────────────────────────
// The VDP is the platform's strong side: it publishes a complete schema.org
// Vehicle node (VIN, mileageFromOdometer, offers{price, availability,
// itemCondition}, model, vehicleModelDate) that lib/jsonld.mjs's
// extractVehicles already reads. So this module contributes no facts and no
// price — it is detection, an SRP seed, a pager, and the sold guard.
//
// ── THE SRP's JSON-LD IS NOT THE SRP ───────────────────────────────────────
// Two measured reasons this lane cannot lean on the generic ItemList bridge
// (both gatewayclassiccars.com/vehicles, 2026-08-31):
//
//   1. extractItemListEntries() returns ZERO here. The platform's ListItem
//      nodes carry no `url` of their own — the url is one level down, in
//      `item.url` — and the bridge reads `node.url`. Control-checked by
//      running the live page through it.
//   2. Even read correctly, the ItemList publishes 20 of the 26 cars the page
//      renders. Six tiles per page are in the HTML and not in the JSON-LD, a
//      23% hole on every page of the largest rooftop in the cohort.
//
// So the discovery bridge here is dealerAccelerateEntries(), which reads the
// tile LINKS — never the tile's facts, which are four different themes' worth
// of markup (see below) and are already on the VDP.
//
// ── FOUR THEMES, ONE LINK SHAPE ────────────────────────────────────────────
// Every rooftop picks a theme and the tile markup changes completely:
//
//   gateway        <article class='vehicle-grid__item'> … <a class='vehicle-grid__link'>
//   streetside     <a class='inventory-item' itemtype='https://schema.org/Car'>  (no JSON-LD at all)
//   classicautomall <a href><div class='cam-vehicle-block'>  (per-tile Car JSON-LD, VIN and price included)
//   motorcarstudio <a class='motorcar-inventory-link'><div class='inventory-list-view'>
//
// What all four share is the vendor's image CDN, the `<ul class="pagination">`
// pager, and a VDP path ending in the platform's numeric id and its own
// year-led slug. Everything ABOVE that pair varies — the branch code moves
// around (/vehicles/san/1300/…, /vehicles/5450-nsh/…, /vehicles/8718/…) and
// craftsportsjdm.com does not mount its cars under /vehicles at all — so
// `{id}/{year}-slug` is what a car link is recognised by. See the rule below.
//
// ── SOLD CARS ARE ON THE FOR-SALE PAGE ─────────────────────────────────────
// These are consignment houses; they keep sold cars up. Measured 2026-08-31:
//
//   · streetsideclassics.com/vehicles — the LIVE list — page 1 carried 2 sold
//     cars in 40, each still printing its full asking price ($62,995 on a sold
//     1973 F-100). Nothing in the page says sold except the markup.
//   · /vehicles/sold is a second SRP with the SAME pager and the SAME tiles.
//     On gateway it is robots-ALLOWED and linked from the nav of every page,
//     and its ItemList carries prices with no availability field at all — so a
//     crawl that wanders into it publishes 68 pages of sold cars at their old
//     asking prices. A false bargain is the most expensive error here.
//
// The generic path does not save us. normalize.mjs's isAvailable() only drops
// an out-of-stock offer when the vehicle ALSO carries a lease offer (see the
// motorenvy.com note there), and these pages carry none — so a sold VDP's
// `availability: https://schema.org/SoldOut` normalizes into a live record
// with a price. Hence isDealerAccelerateSold(), which the orchestrator must
// gate the VDP on, and the `sold` flag on every entry.
//
// Each theme words its sold marker differently — `vehicle-grid__link-sold` /
// `vlp-ribbon sold` (gateway), `inventory-price sold` (streetside),
// `cam-sold-banner` (classicautomall) — so the tile test is "a class
// attribute carrying a `sold` token", which is the one thing they share and
// which the nav's href="/vehicles/sold" cannot trip.
//
// ── SHORT VINs ─────────────────────────────────────────────────────────────
// A pre-1981 car's VIN is not 17 characters (the sold 1966 Charger on gateway
// publishes "XP29E61188575", 13). Nothing here emits a VIN it has not checked
// against the 17-char gate, so a short one arrives as `undefined` — an entry
// with no VIN, which the crawl already handles — rather than as a VIN the rest
// of the pipeline would reject downstream or, worse, half-accept.

// Byte-compatible with the `dealeraccelerate` entry in ../fingerprint.mjs.
// Anchored on the vendor's image CDN, never on the words "dealer accelerate":
// a rooftop is free to write the vendor's name in its footer, and a page that
// merely names the platform is not running on it.
const ASSET_RE = /\bcdn(?:-dev)?\.dealeraccelerate\.(?:com|net)/i;

export function isDealerAccelerate(html) {
  return typeof html === "string" && ASSET_RE.test(html);
}

export const DEALERACCELERATE_SRP_PATH = "/vehicles";

export function dealerAccelerateSeeds(origin) {
  return [origin + DEALERACCELERATE_SRP_PATH];
}

// The platform's sold archive. Same SRP, same pager, same tiles, every car
// already gone — the one route on this platform that must never be walked or
// published from.
const SOLD_ROUTE_RE = /^\/vehicles\/sold(?:\/|$)/i;

function pathOf(pageUrl) {
  try {
    return new URL(pageUrl).pathname;
  } catch {
    return null;
  }
}

/** Is this URL the rooftop's sold archive rather than its inventory? */
export function isSoldRoute(pageUrl) {
  const p = pathOf(pageUrl);
  return p != null && SOLD_ROUTE_RE.test(p);
}

// The pager, on all four themes: <ul class="pagination"> … <a href="/vehicles?page=2">.
// It lists the first few pages, an ellipsis, and THE LAST PAGE — so the
// highest number in the block is the walk's end, the same rule AutoManager's
// pager follows.
const PAGINATION_RE = /<ul[^>]*class=["'][^"']*\bpagination\b[^"']*["'][^>]*>([\s\S]{0,8000}?)<\/ul>/i;
const PAGE_PARAM_RE = /[?&]page=(\d{1,4})\b/g;
// A rooftop with more pages than this is not a rooftop; it is a pager that has
// been misread. Gateway, the biggest in the cohort, is 68.
const MAX_PAGES = 1000;

/**
 * The next `?page=N` URL, or null.
 *
 * Two rules that are not AutoManager's, both for robots reasons specific to
 * this cohort:
 *
 *  · The next URL is built from origin + pathname + `?page=N` and carries NO
 *    other query parameter. Every rooftop's robots.txt here disallows the
 *    query string broadly and re-allows exactly one key — gateway's is a
 *    literal `Disallow: /*?` with `Allow: /*?page=` above it, and Classic Auto
 *    Mall's blocks each facet by name. Carrying a stray param forward would
 *    walk us straight into a disallowed URL.
 *  · The sold archive does not paginate. It pages identically and there is
 *    nothing on it we may publish, so walking it would spend the budget
 *    enumerating cars that must be dropped.
 *
 * Page numbers are read from the pagination block when the page has one, so a
 * `?page=` in a footer or a sort link cannot inflate the count; a theme with
 * no such block falls back to the whole document rather than refusing to walk.
 */
export function dealerAccelerateNextPageUrl(html, pageUrl) {
  if (typeof html !== "string") return null;
  if (isSoldRoute(pageUrl)) return null;
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const block = html.match(PAGINATION_RE)?.[1] ?? html;
  PAGE_PARAM_RE.lastIndex = 0;
  const pages = [...block.matchAll(PAGE_PARAM_RE)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= MAX_PAGES);
  if (!pages.length) return null;
  const last = Math.max(...pages);
  const cur = Number(u.searchParams.get("page") ?? 1);
  if (!Number.isFinite(cur) || cur < 1 || cur >= last) return null;
  return `${u.origin}${u.pathname}?page=${cur + 1}`;
}

// A car's link is `…/{id}/{year}-{make}-{model}-{trim}` — the platform's
// numeric id, then its own year-led slug:
//
//   /vehicles/san/1300/1983-mercedes-benz-380-sl        gateway
//   /vehicles/5450-nsh/1961-chevrolet-corvette          streetside (id-branch)
//   /vehicles/8718/2017-mercedes-benz-slc-43            classicautomall
//   /inventory/476/1995-nissan-skyline-gt-r-r33         craftsportsjdm
//
// The MOUNT is not part of the rule, and that is measured rather than assumed:
// craftsportsjdm.com mounts its cars at /inventory, and a rule anchored on
// "/vehicles/" saw zero of its 128 cars while its /vehicles page served them
// all. Dropping the mount and keeping the id changed nothing on the other 12
// live rooftops in the cohort — same links, no additions — so the id segment
// is what was carrying the precision all along. It is also what keeps a blog
// post out: /vehicles/sold, /vehicles/featured, /vehicles/new_arrivals and
// /vehicles/coming-soon are linked from the nav of every page on every
// rooftop, and none of them is an id followed by a year-led slug.
const ANCHOR_HREF_RE = /<a\b[^>]*\bhref=["']([^"'\s]+)["'][^>]*>/gi;
const VDP_PATH_RE = /^(?:\/[^/]+)+\/\d{1,9}(?:-[A-Za-z]{2,6})?\/(?:1[89]\d{2}|20\d{2})-[^/]+$/;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
// The sold marker, in the only form all four themes share: a `sold` token
// inside a class attribute. `href="/vehicles/sold"` is not a class attribute,
// which is what keeps the nav from marking the tile beside it.
const SOLD_CLASS_RE = /class=["'][^"']*\bsold\b[^"']*["']/i;
// How far past a tile's opening <a> the sold marker is looked for. Every theme
// prints it within ~800 characters (it is the ribbon or the price slot); the
// cap is what stops the LAST tile on a page — whose slice would otherwise run
// to end-of-document — from inheriting a `sold` class out of the footer or the
// mobile nav.
const TILE_WINDOW = 4000;

const collapse = (s) => s.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();

/** "…/1984-pontiac-fiero-se-indy-pace-car" → "1984 pontiac fiero se indy pace
 *  car". The platform writes this slug itself and it is the one identity
 *  string every theme's link carries — year, make, model AND trim, which is
 *  where the badge that makes a car a plug-in lives. */
export function slugName(url) {
  const slug = String(url ?? "").match(/\/((?:1[89]\d{2}|20\d{2})-[^/?#]+)$/)?.[1];
  return slug ? collapse(slug.replace(/-/g, " ")) || undefined : undefined;
}

/**
 * The cars linked from an SRP page, as ItemList-shaped entries —
 * `{url, name, vin, sold}`.
 *
 * This replaces extractItemListEntries on this platform rather than
 * supplementing it: the generic bridge returns nothing here (the ListItem
 * nodes have no `url` of their own), and the ItemList it would read publishes
 * only 20 of the 26 cars a gateway page renders.
 *
 * `vin` is filled only where a tile prints a full 17-character one — Classic
 * Auto Mall's per-tile Car JSON-LD does; the other three themes do not, and a
 * pre-1981 car has no 17-character VIN to print. Absent is the honest answer;
 * the VDP has it either way.
 *
 * Every entry on the sold archive is `sold`, whether or not its tile says so.
 */
export function dealerAccelerateEntries(html, pageUrl) {
  if (!isDealerAccelerate(html)) return [];
  const soldPage = isSoldRoute(pageUrl);
  let origin;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  ANCHOR_HREF_RE.lastIndex = 0;
  // Every anchor on the page, then the ones whose resolved path is a car on
  // this rooftop. Off-origin links are dropped outright: several rooftops link
  // their own stock on a marketplace (buy.motorious.com), and a listing we
  // publish has to be one we crawled here.
  const hits = [];
  for (const m of html.matchAll(ANCHOR_HREF_RE)) {
    let u;
    try {
      u = new URL(m[1], pageUrl);
    } catch {
      continue;
    }
    if (u.origin !== origin || !VDP_PATH_RE.test(u.pathname)) continue;
    hits.push({ url: u.toString(), index: m.index });
  }
  const byUrl = new Map();
  for (let i = 0; i < hits.length; i++) {
    const url = hits[i].url;
    const start = hits[i].index;
    const end = Math.min(hits[i + 1]?.index ?? html.length, start + TILE_WINDOW);
    const tile = html.slice(start, end);
    const vin = tile.match(/\b[A-HJ-NPR-Z0-9]{17}\b/)?.[0];
    const entry = byUrl.get(url) ?? { url, name: slugName(url), vin: undefined, sold: soldPage };
    // A car listed twice on one page (a desktop grid and a mobile one) is one
    // car, and if either copy is marked sold then it is sold.
    entry.sold = entry.sold || SOLD_CLASS_RE.test(tile);
    if (!entry.vin && vin && VIN_RE.test(vin)) entry.vin = vin;
    byUrl.set(url, entry);
  }
  return [...byUrl.values()];
}

// The VDP's own answer, in the Vehicle node's offer. Only gateway publishes
// it on a sold car: Classic Auto Mall and Streetside DROP the structured data
// entirely once a car sells ("Structured data for this vehicle is skipped
// because the following required fields are missing: offers", in the page's
// own comment), so on those two the theme's class marker is all there is —
// `price sold`, `cam-sold-vdp`.
const SOLD_AVAILABILITY_RE = /"availability"\s*:\s*"[^"]*\bSoldOut\b/i;
const IN_STOCK_RE = /"availability"\s*:\s*"[^"]*\bInStock\b/i;

/**
 * Is this VDP a car that has already sold?
 *
 * The orchestrator has to ask this before letting extractVehicles read a
 * DealerAccelerate VDP. normalize.mjs will not: its isAvailable() gate only
 * applies to a vehicle that also carries a lease offer, and these pages carry
 * none — so a `SoldOut` VDP otherwise normalizes into a live listing holding
 * the price the car sold at.
 *
 * The platform's own availability decides where the page states one, and it
 * decides BOTH ways: an InStock VDP is not sold, whatever a class further down
 * the page says. That ordering is the guard against a related-vehicles
 * carousel — the same markup as an SRP tile, sold ribbon and all — retiring
 * the live car it sits under. The class marker answers only for the pages that
 * state no availability at all.
 *
 * This is a VDP predicate. On an SRP the answer is per car, and the answer is
 * dealerAccelerateEntries()'s `sold` flag: streetsideclassics.com's live
 * /vehicles page carries sold cars alongside for-sale ones.
 */
export function isDealerAccelerateSold(html, pageUrl) {
  if (isSoldRoute(pageUrl)) return true;
  if (typeof html !== "string") return false;
  if (SOLD_AVAILABILITY_RE.test(html)) return true;
  if (IN_STOCK_RE.test(html)) return false;
  return SOLD_CLASS_RE.test(html);
}
