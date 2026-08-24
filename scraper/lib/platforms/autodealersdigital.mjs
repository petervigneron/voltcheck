// Auto Dealers Digital (autodealersdigital.com) — a WordPress website product
// for small independents, found 2026-08-24 in the residue of the
// nothing-to-walk census: four of the fifty rows the census filed under
// "client-rendered" carried its CDN hosts, which made it the only real vendor
// cluster in that bucket.
//
// It is NOT client-rendered. Everything is server-rendered PHP; the probe
// scored these rooftops "0 VIN vehicles in 12 fetches" purely because it never
// tried the vendor's paths:
//
//   SRP   /all-inventory/            25 cars a page, WordPress /page/N/
//   VDP   /vehicles/{id}-{Year}-{Make}-{Model}/
//
// ── THE SRP IS READ FOR LINKS ONLY ─────────────────────────────────────────
// The rooftop picks a template and the tile markup changes completely. Two are
// already in the four rooftops measured: `template5` wraps each car in
// `<div class="listing-vehicles-card …">` (autogroupofplano.com,
// wildaboutcarsgarage.com), `template2` uses a Tailwind-class wrapper with no
// such hook at all (globalautomotorsco.com) — a `listing-vehicles-card` split
// returns 25 cars on the first two and ZERO on the third, which is the
// silent-empty failure the registry is already full of. So this module takes
// nothing off the SRP but the link, the sold badge and the printed price, all
// of which are keyed on markers that survived both templates, and every fact
// comes from the VDP. Same rule, same reason, as ./motorcarsites.mjs.
//
// The tile boundary is the car's OWN LINK, `/vehicles/{id}-…`, taken at its
// first occurrence and running to the next car's. The obvious alternative —
// the per-car "Request VIN" popup, `wt_form_request_vin{id}` — was tried and
// is wrong, and wrong in the quiet way: on template5 the card markup sits
// ABOVE its popup and on template2 BELOW it, so a popup-delimited slice reads
// the RIGHT number of cards on both and hands template2 every card's title and
// price shifted one place. It was caught only because globalautomotorsco.com's
// first car came back with an empty name and its second came back named
// "2009 Dodge Sprinter". The link is the one per-car token that both templates
// put with the card it belongs to.
//
// ── THE SRP IS NOT THE LIVE LOT ────────────────────────────────────────────
// The platform ships a whole /sold-inventory/ page and its sort menu offers
// "Sold Inventory First", so leaving sold cars in the main list is the product
// working as designed. Across all 30 rooftops (1,070 cards, 2026-08-24) 162
// are sold — 15% — but the rate is nothing like uniform, and that is the point:
// on the three rooftops this module was written against it is 50 of 87, and
// wildaboutcarsgarage.com's first page is 18 sold out of 25. A classics dealer
// keeps its sold gallery forever. A sold car is not a listing, so it is
// dropped: the same hard filter waynereaves.mjs applies to its `soldOn`
// records, for the same reason.
//
// TWO markers, and both are load-bearing:
//
//   schema.org `availability: OutOfStock` in the VDP's own JSON-LD
//   `<span class="status-badge">SOLD</span>`, on the card AND on the VDP
//
// Where availability is present the two agree exactly — 33 InStock with no
// badge, 45 OutOfStock with one, no disagreement in 78 cars. The badge is not
// redundant: 9 of the 87 carry NO availability at all, and 5 of those 9 are
// sold. Reading only the JSON-LD would have published those five.
//
// ── itemCondition SAYS "NEW", ON ALMOST EVERYTHING ─────────────────────────
// This is the trap on this platform. Every VDP publishes JSON-LD, and 85 of
// the 87 say
//
//   "itemCondition": "https://schema.org/NewCondition"
//
// 83 of those 85 are model year 2023 or older: a 2011 Ford F-250 with 257,091
// miles, a 2013 Chevrolet Tahoe with 164,520, a 1941 Chevrolet Super Deluxe.
// The two rows that say UsedCondition are both malformed records on the
// classics rooftop (one has "We find cars Daily Drivers or Classics" in the
// model field), so not one legible used car on three used lots got the field
// right. It is the platform's default, not a reading.
//
// That matters beyond this module, because lib/normalize.mjs takes condition
// straight off `vehicle.itemCondition` for any page with JSON-LD. Left to the
// generic path, promoting these rooftops would publish every used car on them
// as NEW — the 2026-08-22 "Nuevo" incident inverted, and worse, because a new
// badge on a 164k-mile truck is a claim a shopper can act on. So this module
// REPLACES the generic reading rather than adding to it (see crawl.mjs), and
// emits no condition at all: an absent condition is a state ingest.mjs has
// always handled, and there is no evidence here for either answer.
// See ../condition.mjs, and ../vpic-constant-fields' lesson about cohorting on
// a field that never varies.
//
// ── PRICE: THE RENDERED NUMBER GATES THE JSON-LD ONE ───────────────────────
// The JSON-LD carries a price even when the dealer chose not to publish one.
// 11 of the 87 cars measured have a JSON-LD price while the page prints no
// number at all:
//
//   "price": 359000  rendered "POR"
//   "price": 83000   rendered "Live on Bring a Trailer Now go…"
//   "price": 47500   rendered "Up for Auction on BringaTraile…"
//
// Publishing 83000 for a car whose own page says it is live at auction
// elsewhere is a false claim about what it costs, and a false bargain is the
// most expensive error this site can make.
//
// So the price is taken from the JSON-LD only when the page's own
// `display-price` renders a dollar amount, and only when the two agree
// exactly. They do on 66 of the 67 cars where both are numbers; the one that
// does not renders "$1 Cash" against a JSON-LD 120000, which is precisely the
// row an either-or rule would have got wrong. This is the same shape as
// automanager.mjs's CarGurus-badge rule: where a machine field and the
// rendered number disagree, a disagreement we cannot resolve is an abstention
// rather than a pick.
//
// ── fuelType IS TRUNCATED, SO IT IS NOT LOAD-BEARING ───────────────────────
// The platform cuts the dealer's engine text to ten characters and calls the
// result a fuel type. The values across the 87: "Premium un" 28, "Regular un"
// 17 (from "…unleaded"), "Other" 18, "Gasoline" 15, and the same two strings
// again in different case. It is passed through untouched because classifyEv
// owns that decision and reaches the right answer from the car's NAME on this
// platform — "Electric" survives the cut at 8 characters, and a Bolt or a
// RAV4 Prime is named as one. Nothing here should ever be cohorted on this
// field: it is the dealer's prose with a ruler run through it, which is the
// lesson vPIC's constant BatteryKWh taught at more expense.
//
// ── MILEAGE 0 IS THE PLATFORM'S EMPTY, NOT A READING ───────────────────────
// The record for globalautomotorsco.com's 2012 LEAF carries
// `mileageFromOdometer: {value: 0}`. A 2012 car with no miles on it is a field
// the dealer never filled in, so a zero abstains rather than publishing.
//
// ── EV YIELD, AND THE "I4" TRAP IN READING IT ──────────────────────────────
// Across the 30 rooftops: 908 live cars, of which FIVE are electrified — a
// 2012 Nissan LEAF and a 2014 Chevrolet Volt, a 2014 Ford C-Max Energi, and
// two 2024 Jeep Wrangler 4xe. That is the number.
//
// classifyEv flags eighteen. The other thirteen are Altimas, Versas, Camrys,
// Sentras, Accords, Tacomas and an NV200 whose names carry the engine
// designation "I4", which the BMW i4 anchor in lib/ev.mjs matches. Every one
// comes back BEV?/name_match, which never publishes — ingest gates on
// evConfidence === "high" and vPIC refutes them — so the cost is a decode
// each, the same accepted trade the iX-versus-Matrix comment in that file
// describes. It is written down here because 13 in 908 is a high enough rate
// that anyone reading a raw classifyEv count off this platform would badly
// overstate what it holds.
import { stabilizeImages } from "../images.mjs";
import { ADD_DISPLAY_PRICE } from "../price-provenance.mjs";

// The vendor's own hosts, and its theme directory as a path. Anchored on a
// host or a path, never on the bare brand words: a dealer is free to be named
// "Auto Dealers Digital" and must not fingerprint as the platform for it.
const VENDOR_RE =
  /\b(?:cdn-(?:thumbor|websites|chat)\.)?autodealersdigital\.com\/|\/wp-content\/themes\/website-theme-wp-v2\b|\bwp-theme-website-theme-wp-v2\b/i;

export function isAutoDealersDigital(html) {
  return typeof html === "string" && VENDOR_RE.test(html);
}

export const ADD_SRP_PATH = "/all-inventory/";

// /all-inventory/ is the common path and NOT a universal one. Across the 30
// rooftops the sweep found, four use something else — smartbuymalden.com and
// mjlmotorcars.com "/active-inventory/", davidfamilyauto.com
// "/used-inventory/", carsmartmn.com "/inventory" — and a seed hardcoded to
// the one path reads them as empty lots. So the rooftop's OWN link is read off
// the homepage we already have, the way overfuelSeeds does for a vendor whose
// SRP slug is per-rooftop. Same-origin only: dfatampabay.com's inventory link
// points at davidfamilyauto.com, and following a rooftop's link onto another
// domain would file one dealer's cars under another's dealer_domain.
const SRP_HREF_RE = /href="([^"?#]*\/(?:all-|active-|used-|new-)?inventory\/?)"/gi;

export function autoDealersDigitalSeeds(origin, html) {
  const base = origin.replace(/\/$/, "");
  const seeds = [base + ADD_SRP_PATH];
  if (typeof html === "string") {
    SRP_HREF_RE.lastIndex = 0;
    for (const m of html.matchAll(SRP_HREF_RE)) {
      let u;
      try {
        u = new URL(m[1], base + "/");
      } catch {
        continue;
      }
      if (u.origin !== new URL(base).origin) continue;
      // WordPress serves these with the trailing slash and builds /page/N/ on
      // it; mjlmotorcars.com's own homepage links a slashless path that 404s.
      const href = u.pathname.replace(/\/?$/, "/");
      const abs = u.origin + href;
      if (!seeds.includes(abs)) seeds.push(abs);
    }
  }
  return seeds;
}

/** WordPress paging: /all-inventory/page/2/. The SRP prints no pager the two
 *  templates share, so this counts the cards it just read instead — a full
 *  page means there is probably another, a short one means the walk is done.
 *  Page size measured at 25 on every rooftop sampled (2026-08-24). */
export const ADD_PAGE_SIZE = 25;

export function autoDealersDigitalNextPageUrl(pageUrl, cardsOnPage) {
  if (cardsOnPage < ADD_PAGE_SIZE) return null;
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  // Any of the rooftop SRP slugs, not just /all-inventory/ — see the seeds.
  const m = u.pathname.match(/^(.*\/(?:all-|active-|used-|new-)?inventory\/)(?:page\/(\d+)\/?)?$/);
  if (!m) return null;
  const next = (Number(m[2]) || 1) + 1;
  if (next > 200) return null; // a lot this size is a bug, not a lot
  u.pathname = `${m[1]}page/${next}/`;
  u.search = "";
  return u.toString();
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
// The car's own link. `{id}-` is required so a bare /vehicles/ index link
// cannot mint a card, and the id is captured for the dedupe.
const CAR_HREF_RE = /href="([^"?#]*\/vehicles\/(\d+)-[^"?#]*)"/gi;
const SOLD_BADGE_RE = /class="status-badge"[^>]*>\s*SOLD/i;

const stripTags = (s) => String(s).replace(/<[^>]*>/g, " ");
const collapse = (s) => String(s).replace(/\s+/g, " ").trim();

/** The dollar amount a `display-price` block renders, or undefined when the
 *  rooftop printed something that is not one ("POR", "Call for Price"). */
export function renderedPrice(html) {
  const raw = html?.match(/class="display-price"[^>]*>([\s\S]{0,120}?)<\/p>/i)?.[1];
  if (raw == null) return undefined;
  const text = collapse(stripTags(raw));
  if (!/\d/.test(text)) return undefined;
  const n = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** One entry per car on an SRP page: where the car is, what it is called, and
 *  whether the rooftop has already sold it. Facts come from the VDP. */
export function autoDealersDigitalEntries(html, pageUrl) {
  if (!isAutoDealersDigital(html)) return [];
  const anchors = [];
  const seenId = new Set();
  CAR_HREF_RE.lastIndex = 0;
  for (const m of html.matchAll(CAR_HREF_RE)) {
    if (seenId.has(m[2])) continue; // a card links its car several times over
    seenId.add(m[2]);
    anchors.push({ href: m[1], index: m.index });
  }
  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const { href, index } = anchors[i];
    // A card runs from its own first link to the next card's.
    const tile = html.slice(index, anchors[i + 1]?.index ?? html.length);
    let url;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    const title = collapse(
      stripTags(tile.match(/class="vehicle-title"[^>]*>([\s\S]{0,200}?)<\/h4>/i)?.[1] ?? ""),
    );
    // The banner line is the decoded build description ("2013 Chevrolet Tahoe
    // 4WD 4dr 1500 LT …"), which carries the trim the dealer's own shouty
    // title often drops. Both go into the name so evishEntry has everything
    // the page said before an EV is filtered out of the walk.
    const banner = collapse(
      stripTags(tile.match(/class="banner-listing-tex"[^>]*>([\s\S]{0,300}?)<\/p>/i)?.[1] ?? ""),
    );
    const vin = tile.match(/class="vin-text vin"[^>]*>[\s\S]{0,160}?<span>\s*([A-HJ-NPR-Z0-9]{17})\s*<\/span>/i)?.[1];
    out.push({
      url,
      name: collapse([title, banner === title ? "" : banner].join(" ")).slice(0, 200),
      vin: vin && VIN_RE.test(vin) ? vin.toUpperCase() : undefined,
      sold: SOLD_BADGE_RE.test(tile),
    });
  }
  return out;
}

/** How many cards an SRP page carried, for the pager above. Counts the same
 *  per-car token entries() splits on, so the two can never disagree. */
export function autoDealersDigitalCardCount(html) {
  if (typeof html !== "string") return 0;
  CAR_HREF_RE.lastIndex = 0;
  return new Set([...html.matchAll(CAR_HREF_RE)].map((m) => m[2])).size;
}

function ldNode(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let o;
    try {
      o = JSON.parse(m[1]);
    } catch {
      continue;
    }
    for (const node of Array.isArray(o) ? o : [o]) {
      if (node && (node["@type"] === "Car" || node["@type"] === "Vehicle")) return node;
    }
  }
  return null;
}

const enumTail = (v) => (typeof v === "string" ? v.replace(/.*\//, "") : undefined);

/** The car on one Auto Dealers Digital VDP, or [] — see the header for why
 *  this REPLACES the generic JSON-LD reading rather than adding to it. */
export function autoDealersDigitalVehicles(html, pageUrl) {
  if (!isAutoDealersDigital(html)) return [];
  const node = ldNode(html);
  if (!node) return [];
  const vin = String(node.vehicleIdentificationNumber ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return [];
  // The platform leaves sold cars in the lot. BOTH markers, because 9 of the
  // 87 cars measured carry no `availability` at all and 5 of those are sold —
  // see the header. The badge is on the VDP as well as the card.
  if (enumTail(node.offers?.availability) === "OutOfStock") return [];
  if (SOLD_BADGE_RE.test(html)) return [];

  // The rendered number gates the machine one: a page printing "POR" carries a
  // JSON-LD price the dealer chose not to publish (see header).
  const shown = renderedPrice(html);
  const ld = Number(node.offers?.price);
  const price = shown != null && Number.isFinite(ld) && ld > 0 && ld === shown ? shown : undefined;

  const mileage = Number(node.mileageFromOdometer?.value ?? node.mileageFromOdometer);
  const fuel = typeof node.vehicleEngine?.fuelType === "string" ? node.vehicleEngine.fuelType : undefined;
  const images = stabilizeImages(
    (Array.isArray(node.image) ? node.image : node.image ? [node.image] : []).filter((u) => typeof u === "string"),
  );
  return [
    {
      "@type": "Vehicle",
      vehicleIdentificationNumber: vin,
      vehicleModelDate: node.vehicleModelDate ? String(node.vehicleModelDate) : undefined,
      brand: node.brand?.name ?? (typeof node.brand === "string" ? node.brand : undefined),
      model: typeof node.model === "string" ? node.model : undefined,
      vehicleConfiguration: typeof node.vehicleConfiguration === "string" ? node.vehicleConfiguration : undefined,
      name: typeof node.name === "string" ? node.name : undefined,
      // No itemCondition, deliberately — it is hardcoded "NewCondition" on
      // every car this platform serves. See the header.
      bodyType: typeof node.bodyType === "string" ? node.bodyType : undefined,
      mileageFromOdometer:
        Number.isFinite(mileage) && mileage > 0
          ? { "@type": "QuantitativeValue", value: mileage, unitCode: "SMI" }
          : undefined,
      color: typeof node.color === "string" ? node.color : undefined,
      vehicleInteriorColor: typeof node.vehicleInteriorColor === "string" ? node.vehicleInteriorColor : undefined,
      driveWheelConfiguration: enumTail(node.driveWheelConfiguration),
      vehicleTransmission: typeof node.vehicleTransmission === "string" ? node.vehicleTransmission : undefined,
      image: images.length ? images : undefined,
      fuelType: fuel,
      vehicleEngine: { "@type": "EngineSpecification", fuelType: fuel },
      offers: {
        "@type": "Offer",
        price,
        priceProvenance: price != null ? ADD_DISPLAY_PRICE : undefined,
        priceCurrency: "USD",
        url: pageUrl,
      },
    },
  ];
}
