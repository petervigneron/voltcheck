// AutoRevo — a website vendor for small independents, serving each rooftop on
// its own apex (heisermotors.com, bayshoreautomotive.com, …) off the vendor's
// asset and image hosts. Measured across the 16-rooftop cohort on 2026-08-31:
// 12 rooftops live and 1,112 cars in their own counts. 43 electrified cars
// found in the pages this module was validated against — bayshoreautomotive's
// 22 (five Escalade IQ, four HUMMER EV, four LYRIQ, Cybertruck, EX90,
// Polestar 2, Fisker Ocean, Macan, Charger Daytona, C40, Model Y, i8),
// thejeepdepot's 20 Wrangler 4xe, abwautos' Blazer EV.
//
// ── WHAT THE PLATFORM SERVES ───────────────────────────────────────────────
//   SRP   /vehicles                  server-rendered tiles, ~25/page, ?page=N
//   VDP   /{url-encoded-slug}/{id}   root-relative, id is 7 digits
//
// Every tile is a `<section class="inventory_item used_vehicle">` whose facts
// are dt/dd pairs with classed values — vin_value, mileage_value, engine_value,
// drivetrain_value, transmission_value, exterior_value, interior_value,
// stock_value, mpg_value, warranty_value — and whose price is
// `<h3 class="website_price">Our Price<span>$11,500</span></h3>`. The VDP
// prints the SAME dt/dd shape inside `<section id="topline">` and the same
// price heading (with a `<label>` around the words) inside `#pricing`.
//
// ── THE SRP IS WHERE THIS EARNS ITS KEEP; THE VDP IS WHERE IT DEFENDS ──────
// The recon note said "no JSON-LD anywhere". Half right, and the half that is
// wrong is the important half: the SRP carries an AutoDealer node with no cars
// in it (lib/jsonld.mjs's extractVehicles finds 0 on all five SRPs sampled),
// but every VDP carries `makesOffer.itemOffered` — a full schema.org Car — and
// the generic reader DOES find it (1 vehicle on ar-vdp.html, heisermotors
// 2026-08-31). So on a VDP this module and the generic path both fire.
//
// Which means an AutoRevo page must REPLACE the generic reading, the way
// autodealersdigital.mjs's does in crawl.mjs, and for the same two reasons:
//
//  1. The generic node has NO PRICE. The car's price lives on the enclosing
//     `makesOffer` Offer, not on the Car, so lib/normalize.mjs reads
//     offers.price off a node that has no offers and publishes the car
//     price-less. lib/normalize.mjs's richness() does not score price, so a
//     price-less VDP record can out-rank the priced tile record for the same
//     VIN.
//  2. The generic node's `itemCondition` IS FALSIFIED ON THIS PLATFORM — see
//     the condition section below. Letting it through publishes used cars as
//     new.
//
// ── PRICE: THE DESIGNATED SLOT, NEVER THE LADDER ───────────────────────────
// `window.site_settings` on every page names the rooftop's price labels:
//
//   {"primaryPriceLabel":"Our Price","displayPrimaryPrice":true,
//    "secondaryPriceLabel":"Retail Value","displaySecondaryPrice":true,
//    "strikeThroughSecondaryPrice":true, …}
//
// So the platform itself designates one rung as the ask and one as a
// struck-through book value, and prints them in two different elements:
// `h3.website_price` and `p.secondary_price`. This reads the first and only
// the first — the motorcarsites rule ("a designated slot that does not hold
// exactly one readable amount abstains where it stands rather than falling
// back"), not a count of the dollar signs in the tile.
//
// That distinction is load-bearing and it is worth saying why, because the
// blunter rule was the starting point: certifiedautoplaza.com prints
// `Our Price $28,995` beside `Retail Value <strike>$35,225</strike>` on its
// tiles, and forwaymotors.com does the same. "Two distinct amounts in a tile
// abstains" would have thrown away every price on both rooftops (58 cars) for
// a rung the vendor labels, strikes through, and flags in its own settings
// object. What DOES abstain is a website_price slot holding two amounts, or
// none: "Call for Price" is nine of johnbrothersauto's fifteen cars and is the
// platform saying it has no number, not an invitation to look elsewhere.
// `srp_estimated_payment` / `srp_down_payment` / `vdp_rebate` sit outside the
// slot and are never read at all — the refusal lib/price-floor.mjs exists for.
//
// ── CONDITION: A PER-CAR TOKEN THAT IS NOT A CONDITION CLAIM ───────────────
// The token exists and it varies per car: tiles are classed `used_vehicle` or
// `new_vehicle`, and the VDP's own JSON-LD prints `"itemCondition":"used"` /
// `"new"`. That is exactly the shape lib/condition.mjs asks for, and it is
// still not emitted here, because a control test falsified it outright.
//
// certifiedautoplaza.com/new-vehicles (2026-08-31) serves 8 cars, all classed
// `new_vehicle`, all with `"itemCondition":"new"` on their VDPs. Their own
// odometers: 97,520 · 74,098 · 79,974 · 125,683 · 131,731 · 102,742 · 38,498
// miles (the eighth is a boat). 7 of 7 measurable "new" cars are contradicted
// by the tile beside the flag. The field is a merchandising bucket the dealer
// typed, not a condition. So this module emits no itemCondition at all — the
// automanager.mjs answer, reached from evidence rather than from absence.
//
// Two consequences worth knowing when wiring this up:
//   · Never seed /new-vehicles or /certified-vehicles. lib/condition.mjs's
//     publishedCondition() reads `/new-` and `certified` straight out of the
//     source URL, so a car reached through one of those paths would publish as
//     new or certified from the path alone. (Every node this module emits
//     carries offers.url = the car's own VDP, and normalize.mjs prefers that
//     as sourceUrl, so an SRP-sourced record is not exposed — but a seed is.)
//   · /certified-vehicles is a marketing slice, not a flag: on
//     certifiedautoplaza it mixes `used_vehicle` and `new_vehicle` tiles, and
//     on autoramaauto it lists 36 cars whose tiles all say `used_vehicle`.
//     Nothing per-car on this platform says "certified", so nothing here does.
//
// And one defect found on the way past, which is NOT this platform's and not
// this module's to fix: publishedCondition() tests /certified/ against the
// condition string and the source URL merged, and the source URL includes the
// HOST. So every car sold by certifiedautoplaza.com publishes as certified
// because of the dealer's name. 25 registry domains carry the word
// (certifiedpreowned.com, haleycertified.com, 112certified.com, …), and a
// certification is a warranty claim. test/autorevo.test.mjs pins it as a
// KNOWN LEAK so a fix shows up as a failing expectation rather than silence.
//
// ── PLACEHOLDER VINs ───────────────────────────────────────────────────────
// johnbrothersauto.com prints `11111111111111111` in the vin_value slot of 9
// of its 15 cars — the ones its own title field marks "X Sold …" or
// "A *Inbound* …". That string passes a 17-character VIN gate, and admitting
// it would collapse nine cars onto one row and hand ingest a VIN that decodes
// to nothing. Across the 450 real VINs read off this cohort the smallest
// distinct-character count is 8; the placeholder's is 1. See plausibleVin().
//
// ── ROBOTS: THE PAGER IS CLOSED ON 14 OF 16 ROOFTOPS ───────────────────────
// The vendor ships a default robots.txt disallowing `/paymentcalculator/`,
// `/map/show/` and — the one that matters — `/*?*`. Fetched 2026-08-31: 14 of
// the 16 cohort rooftops serve exactly that (premierautosource has an empty
// disallow list, us1auto has no robots.txt at all). Pagination is `?page=N`,
// so on nearly every rooftop the pager is closed by the site's stated intent
// and page one is all we may read: 25 of heisermotors' 88, 50 of abwautos'
// 530.
//
// Two things about that are NOT true today and have to be said out loud,
// because the design that assumes them certifies a walk it never made:
//
//  1. **fetchPage does not refuse it.** lib/http.mjs's robotsAllows() matches
//     `u.pathname` only, so `/vehicles?page=2` is tested as `/vehicles` and
//     `/*?*` never matches. (robotsRulesAllow's own doc comment says the
//     target may be "pathname plus query string where the site's rules reach
//     into the query" — this is that case, and its caller does not pass it.)
//     Verified: robotsRulesAllow(rules,"/vehicles") true,
//     robotsRulesAllow(rules,"/vehicles?page=2") false, on all 14.
//  2. **A robots refusal would not read as truncation anyway.** crawl.mjs's
//     `robots_disallowed` branch `continue`s without setting stoppedEarly, and
//     the URL has already been shift()ed off the queue — so the queue drains,
//     `report.truncated` comes out false, and a page-one-only visit certifies
//     completeness to db-sync. That is a delisting instruction for the 63 cars
//     on heisermotors' pages 2-4.
//
// Neither is fixable from this file, so this file does two things instead.
// autoRevoNextPageUrl() emits the pager URL truthfully — reading the page's
// own pagination is its job, and gating it on a policy decision belongs where
// the fetch happens, not here. And autoRevoTruncated() publishes the number
// the platform itself prints ("88 matches out of 88 vehicles.") minus the
// tiles this page carried, so the walk can say how many cars it did not reach
// instead of implying it reached them all — the oneAudiTruncated() precedent
// crawl.mjs already follows. The sitemap is no help here: it lists all 88 VDPs
// but their URLs are bare `{slug}/{id}` with none of the words
// lib/sitemap.mjs's INV_PATH_RE looks for, so discoverSitemapUrls drops every
// one of them.
import { stabilizeImages } from "../images.mjs";
import { isKnownMake } from "../makes.mjs";
import { AUTOREVO_PRICE } from "../price-provenance.mjs";

// The vendor's own hosts, byte-identical to lib/fingerprint.mjs's entry.
//
// The bare word must never be the signal. Wix serializes an internal
// "excludeFromAutoRevoke" flag into every page it renders, and a loose
// /autorevo/i matched 136 Wix sites in the 2026-08-31 vendor scan. Every
// alternative below is anchored on a host: the powersites apex the templates,
// logos and no-photo placeholders come from, and the three subdomains of
// autorevo.com that serve images (x-img, cf-img) and the ebrochure/credit-app
// endpoints (vms).
const VENDOR_RE = /autorevo-powersites\.com|(?:x-img|cf-img|vms)\.autorevo\.com/i;

export function isAutoRevo(html) {
  return typeof html === "string" && VENDOR_RE.test(html);
}

export const AUTOREVO_SRP_PATH = "/vehicles";

/** The lot, and only the lot. /new-vehicles and /certified-vehicles are
 *  reachable and deliberately not seeded — see the condition section above. */
export function autoRevoSeeds(origin) {
  return [origin + AUTOREVO_SRP_PATH];
}

const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, " ");
const stripTags = (s) => s.replace(/<[^>]+>/g, " ");
const collapse = (s) =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const num = (v) => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const VIN_SHAPE_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * A 17-character string that is actually a VIN, not the platform's filler.
 *
 * johnbrothersauto.com fills the slot with `11111111111111111` — which is
 * shape-legal and even carries a valid ISO check digit, so neither a regex nor
 * a checksum rejects it. What separates it from a VIN is entropy: across the
 * 450 VINs this cohort printed, the fewest distinct characters in one was 8
 * (1C3CCCBB2FN661212). Five is well below every real reading and well above
 * the single-character filler, so the gate does not have to be tuned.
 */
export function plausibleVin(raw) {
  const vin = String(raw ?? "").trim().toUpperCase();
  if (!VIN_SHAPE_RE.test(vin)) return undefined;
  return new Set(vin).size >= 5 ? vin : undefined;
}

// Where the page stops talking about its own cars. Every VDP ends with
// `<section id="similar_vehicles">`, a carousel of the rooftop's OTHER cars
// carrying their links, their photos and their prices — on the Cybertruck VDP
// (bayshoreautomotive, 2026-08-31) that block holds nine more dollar amounts
// than the car has. The id also appears four times in the page's inline CSS
// above the fold, so the cut anchors on the opening tag, never on the word:
// cutting on the word would have truncated that page at byte 8,519 of 109,962
// and returned nothing at all.
const TAIL_RE = /<section[^>]*\bid=["']similar_vehicles["']|<footer\b|<[a-z]+[^>]*\bid=["']footer["']/i;

/** The part of the page that is about the cars it is listing. */
export function autoRevoBody(html) {
  const body = stripComments(String(html ?? ""));
  const cut = body.search(TAIL_RE);
  return cut > 0 ? body.slice(0, cut) : body;
}

const TILE_RE = /<section[^>]*\bclass=["'][^"']*\binventory_item\b[^"']*["'][^>]*>/gi;

/** Each SRP tile's markup, one string per car. */
export function autoRevoTiles(html) {
  const body = autoRevoBody(html);
  const starts = [...body.matchAll(TILE_RE)].map((m) => m.index);
  return starts.map((s, i) => body.slice(s, starts[i + 1] ?? body.length));
}

/** A classed dd value — `<dd class="vin_value">…</dd>`. The class list can
 *  carry more than one name (`location_value parent`, `vdp_title title_value`),
 *  so the match is on a word-bounded class name inside the attribute. */
function ddValue(chunk, name) {
  const re = new RegExp(`<dd[^>]*\\bclass=["'][^"']*\\b${name}\\b[^"']*["'][^>]*>([\\s\\S]{0,300}?)<\\/dd>`, "i");
  const v = chunk.match(re)?.[1];
  if (v == null) return undefined;
  return collapse(stripTags(v)) || undefined;
}

/** A classed span inside the tile's `template_title` — the platform's own
 *  year/make/model/trim split, which is why nothing here has to guess where a
 *  model ends and a trim begins (motorcarsites.mjs's splitIdentity exists
 *  precisely because that vendor prints no such split). Both quote styles: the
 *  SRP writes `class="year"`, the VDP writes `class='year'`. */
function titleSpan(chunk, name) {
  const v = chunk.match(new RegExp(`<span[^>]*\\bclass=["']${name}["'][^>]*>([^<]{0,120})<\\/span>`, "i"))?.[1];
  return v == null ? undefined : collapse(v) || undefined;
}

function identity(chunk) {
  const year = titleSpan(chunk, "year");
  const make = titleSpan(chunk, "make");
  const model = titleSpan(chunk, "model");
  const trim = titleSpan(chunk, "trim");
  return {
    year: /^(19[89]\d|20\d{2})$/.test(year ?? "") ? year : undefined,
    // The make field is free text the dealer types, and it is not always a
    // make: johnbrothersauto files nine cars under "X Sold Chevrolet" and
    // "A *Inbound* Chevrolet". An unrecognised value yields no make rather
    // than a wrong one — ingest.mjs repairs a missing make from the vPIC
    // decode, and has never repaired a wrong one.
    make: make && isKnownMake(make) ? make : undefined,
    model,
    trim,
    name: collapse([year, make, model, trim].filter(Boolean).join(" ")) || undefined,
  };
}

// A car's own page: /{url-encoded-slug}/{7-digit id}. No query string — the
// `?location=` link in every tile's Location row is not a car, and `{5,}`
// keeps a year-shaped path segment out.
const VDP_HREF_RE = /href=["'](\/[^"'?#]*\/\d{5,9})["']/i;
const VDP_PATH_RE = /\/[^/?#]+\/\d{5,9}\/?$/;

function tileUrl(chunk, pageUrl) {
  const href = chunk.match(VDP_HREF_RE)?.[1];
  if (!href) return undefined;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return undefined;
  }
}

// The platform's server-rendered sold marker: an `<img class="sold_overlay">`
// inside the tile's `.thumb` (and inside `.image_wrap` on the VDP). The name
// also appears in the inline CSS of every page whether or not anything is
// sold, so the test requires a real class ATTRIBUTE — `.thumb .sold_overlay{`
// in a stylesheet must not retire a live car.
const SOLD_RE = /\bclass=["'][^"']*\bsold_overlay\b/i;

/**
 * Every distinct amount in the tile's DESIGNATED price slot.
 *
 * Only `h3.website_price` — the element `site_settings.primaryPriceLabel`
 * names. Never `p.secondary_price` (the struck-through "Retail Value"), never
 * the payment paragraphs beside it. Three-digit amounts are not read, for the
 * reason motorcarsites.mjs gives: a car under $1,000 is outside
 * lib/price-floor.mjs anyway, and refusing them keeps a payment shape from
 * ever being mistaken for an ask.
 */
export function autoRevoPrices(chunk) {
  const seen = new Set();
  for (const m of chunk.matchAll(/<h3[^>]*\bclass=["'][^"']*\bwebsite_price\b[^"']*["'][^>]*>([\s\S]{0,400}?)<\/h3>/gi)) {
    for (const p of m[1].matchAll(/\$\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})(?:\.\d{2})?/g)) {
      const n = num(p[1]);
      if (n != null) seen.add(n);
    }
  }
  return [...seen];
}

const priceOf = (chunk) => {
  const p = autoRevoPrices(chunk);
  return p.length === 1 ? p[0] : undefined;
};

/**
 * The powertrain the platform states, read out of its own engine string.
 *
 * The SRP tile has no fuel row — the dl is exterior/interior/engine/
 * transmission/drivetrain/mileage/mpg/vin/warranty/stock — but the VDP's
 * JSON-LD carries a real `fuelType` in a closed vocabulary, and the engine
 * string is that same fact worded for the eye. Control-tested VDP-by-VDP
 * across 5 rooftops on 2026-08-31 (34 pairs, no disagreement), including the
 * mirror negatives:
 *
 *   engine "Electric 593hp 525ft. lbs."          → fuelType "Electric"     14/14
 *   engine "2.0L Plug-in Hybrid Turbo I4 375hp"  → "Plug-in Gas/Electric Hybrid"  8/8
 *   engine "2.0L Mild Hybrid E-Turbo I4 201hp"   → "Unknown"                4/4
 *   engine "1.8L Hybrid I4 134hp"                → "Gas/Electric Hybrid"    1/1
 *   engine "3.6L V6 308hp 265ft. lbs."           → "Gasoline"               7/7
 *
 * (One car printed no engine row at all — a 2024 Macan whose fuelType is
 * "Unknown" — and yields no fuel claim from either side, which is the
 * platform's own silence and not a reading this could have recovered.)
 *
 * Only the two electrified readings are emitted. A mild hybrid is not an
 * electrified car and the platform agrees ("Unknown"); a plain hybrid is not
 * one in this house; a displacement engine says nothing this needs. Anything
 * else yields no fuel claim and lib/ev.mjs falls through to its nameplate and
 * WMI paths exactly as it would with no field at all.
 *
 * "Electric" is anchored to the START of the string on purpose: "Mild Hybrid
 * E-Turbo" and "Gas/Electric" both contain the word, and neither is a BEV.
 */
export function engineFuel(engine) {
  const s = String(engine ?? "").trim();
  if (/^electric\b/i.test(s)) return "Electric";
  if (/\bplug[\s-]?in hybrid\b/i.test(s)) return "Plug-In Hybrid";
  return undefined;
}

/** The VDP's own `fuelType`, out of the single ld+json block the platform
 *  writes. Preferred over the engine reading on a VDP because it IS the
 *  platform's field rather than a reading of its prose; "Unknown" is the
 *  platform abstaining and is passed on as no claim. Only trusted when the
 *  page carries exactly one — an SRP carries none, and more than one would
 *  mean the page describes more than one car. */
export function ldFuelType(html) {
  const all = [...String(html ?? "").matchAll(/"fuelType"\s*:\s*"([^"]{1,60})"/g)].map((m) => m[1]);
  if (all.length !== 1) return undefined;
  const v = collapse(all[0]);
  return v && !/^unknown$/i.test(v) ? v : undefined;
}

// The vendor's image CDNs, and nothing else. A whitelist rather than a
// blocklist because that is what keeps the two "no photo" placeholders out
// without having to name them: heisermotors' empty tiles serve
// mothership.autorevo-powersites.com/content/assets/no-photo_300x225_v2.png
// and its VDPs serve /images/no_photo.png. A picture of nothing is worse than
// no picture — the card already handles a listing with none.
const PHOTO_RE = /https?:\/\/(?:x-img|cf-img)\.autorevo\.com\/[^"'\s]+/gi;

/** The car's photos, from `src` attributes only.
 *
 *  Never from `srcset`: the platform lists the SAME photo at 100x100, 325x325
 *  and 640x640 under three different paths, so a srcset read would publish one
 *  picture as three. The VDP's gallery is likewise skipped — it holds only
 *  100x100 thumbnails whose full-size URL the page's own script builds by
 *  substituting the size segment, and minting URLs we have never seen served
 *  is not a thing this crawl does. One correctly-sized hero beats eight
 *  thumbnails. */
function photos(chunk) {
  const srcs = [...chunk.matchAll(/<img[^>]+\bsrc=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((u) => {
      PHOTO_RE.lastIndex = 0;
      return PHOTO_RE.test(u);
    });
  return stabilizeImages(srcs);
}

/**
 * One tile (or one whole VDP) → a schema.org-shaped Vehicle node, or null.
 *
 * Null when the car carries no usable VIN or when the platform has marked it
 * sold. Both are deliberate: crawl.mjs keys a VIN-less record by its source
 * URL and every tile on an SRP shares one, so emitting them would collapse a
 * page of cars to a single row — and a sold car is not a listing.
 */
function tileVehicle(chunk, pageUrl, { ldFuel, selfUrl, photoChunk } = {}) {
  if (SOLD_RE.test(chunk)) return null;
  const vin = plausibleVin(ddValue(chunk, "vin_value"));
  if (!vin) return null;

  const { year, make, model, trim, name } = identity(chunk);
  const engine = ddValue(chunk, "engine_value");
  const fuel = ldFuel ?? engineFuel(engine);
  const mileage = num(ddValue(chunk, "mileage_value"));
  const price = priceOf(chunk);
  const images = photos(photoChunk ?? chunk);

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: year,
    brand: make,
    model,
    vehicleConfiguration: trim,
    name,
    mileageFromOdometer: mileage != null ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: ddValue(chunk, "exterior_value"),
    vehicleInteriorColor: ddValue(chunk, "interior_value"),
    driveWheelConfiguration: ddValue(chunk, "drivetrain_value"),
    vehicleTransmission: ddValue(chunk, "transmission_value"),
    sku: ddValue(chunk, "stock_value"),
    image: images.length ? images : undefined,
    // The platform's own powertrain word, untouched — classifyEv decides.
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", name: engine, fuelType: fuel },
    // No itemCondition, ever. See the condition section in the header: the
    // token exists, varies per car, and is contradicted by the odometer on 7
    // of 7 measurable cars that carry it.
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? AUTOREVO_PRICE : undefined,
      priceCurrency: "USD",
      // The car's own page. Load-bearing beyond the link itself:
      // normalize.mjs takes `sourceUrl: vdpUrl ?? sourceUrl`, so a tile that
      // knows its VDP keeps the SRP's path — /new-vehicles, /certified-vehicles
      // — out of lib/condition.mjs's URL fallback.
      url: selfUrl ?? tileUrl(chunk, pageUrl),
    },
  };
}

/** True for a page that is one car's own page rather than a list of them. */
function isVdp(html, pageUrl) {
  let path = "";
  try {
    path = new URL(pageUrl).pathname;
  } catch {}
  if (VDP_PATH_RE.test(path)) return true;
  // A rooftop that serves its VDP from somewhere else still says so in the
  // body class the platform writes ("v5 vdp" / "v5 home" / "v5 ilp").
  return /<body[^>]*\bclass=["'][^"']*\bvdp\b/i.test(html);
}

/**
 * The SRP's cars as ItemList-shaped entries — `{url, name, vin, sold}` — for
 * crawl.mjs's VDP bridge.
 *
 * This exists because a tile does not always carry enough to classify its own
 * car: bayshoreautomotive's Fisker Ocean is a BEV that no nameplate pattern
 * knows, and johnbrothersauto's tiles carry a placeholder VIN. The bridge
 * screens these with lib/sitemap.mjs's EVISH_RE and fetches the VDP of
 * anything that could be electrified.
 *
 * `name` is the platform's own year/make/model/trim plus any powertrain word
 * its ENGINE row prints — never the tile's whole text. That restriction is the
 * whole lesson of motorcarsites.mjs: EVISH_RE's BMW branch is `i[45x]\b`, and
 * every four-cylinder car on this platform prints "I4" in engine_value. On the
 * five SRPs sampled, screening raw tile text would have flagged 111 Escapes,
 * Cherokees and Silverados as possible EVs. Harvesting only POWERTRAIN_RE's
 * words out of that same string flags the Fisker ("Electric 275hp") and leaves
 * every I4 alone.
 */
const POWERTRAIN_RE = /electric|plug[\s-]?in|\bphev\b|\bbev\b|\bkwh\b/gi;

export function autoRevoEntries(html, pageUrl) {
  if (!isAutoRevo(html)) return [];
  const out = [];
  const seen = new Set();
  for (const tile of autoRevoTiles(html)) {
    const url = tileUrl(tile, pageUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const { name } = identity(tile);
    const engine = ddValue(tile, "engine_value") ?? "";
    const words = [...new Set((engine.match(POWERTRAIN_RE) ?? []).map((s) => s.toLowerCase()))];
    out.push({
      url,
      name: collapse([name ?? "", ...words].join(" ")).slice(0, 200) || undefined,
      vin: plausibleVin(ddValue(tile, "vin_value")),
      sold: SOLD_RE.test(tile),
    });
  }
  return out;
}

/**
 * Every car this page carries, as Vehicle nodes.
 *
 * An SRP yields one per tile — the tile is a complete record (VIN, odometer,
 * trim, drivetrain, colours, stock, price, photo), so a lot whose pager is
 * robots-closed still publishes its first page in full. A VDP yields the one
 * car it is about, read from the same dt/dd shape plus the page's own JSON-LD
 * fuel field.
 */
export function autoRevoVehicles(html, pageUrl) {
  if (!isAutoRevo(html)) return [];
  const tiles = autoRevoTiles(html);
  const out = [];
  const seen = new Set();
  if (tiles.length) {
    for (const tile of tiles) {
      const v = tileVehicle(tile, pageUrl);
      if (!v || seen.has(v.vehicleIdentificationNumber)) continue;
      seen.add(v.vehicleIdentificationNumber);
      out.push(v);
    }
    return out;
  }
  if (!isVdp(html, pageUrl)) return [];
  const body = autoRevoBody(html);
  // The hero, and only the hero. `#gallery` sits inside the cut on the
  // above_description layout and holds nothing but 100x100 thumbnails — see
  // photos() for why those are not this car's pictures.
  const hero = body.match(/<section[^>]*\bid=["']main_image["'][^>]*>([\s\S]{0,4000}?)<\/section>/i)?.[1];
  const v = tileVehicle(body, pageUrl, {
    ldFuel: ldFuelType(html),
    selfUrl: pageUrl,
    photoChunk: hero ?? "",
  });
  return v ? [v] : [];
}

/**
 * The next `?page=N`, or null.
 *
 * Guarded the way automanager.mjs's is: the pager prints every page number it
 * offers, so walk to the highest one and stop there. The two arrows carry the
 * same markup on this platform (`span.increment.prev` is rendered even when
 * disabled, and both arrows link a page number), so there is nothing to tell
 * "next" from "previous" except the number itself.
 *
 * This returns the URL whether or not the rooftop's robots.txt allows it —
 * see the robots section in the header. Reading the page's own pagination is
 * this function's job; deciding whether that URL may be fetched belongs to the
 * fetch layer, which is the only place that has robots.txt. What this file
 * must not do is pretend the pager is not there: a null here says "this lot
 * ends on page one", and on heisermotors that would be a lie about 63 cars.
 * autoRevoTruncated() is how a caller says the true thing instead.
 */
export function autoRevoNextPageUrl(html, pageUrl) {
  if (typeof html !== "string") return null;
  const pages = [...html.matchAll(/[?&]page=(\d{1,4})\b/g)].map((m) => Number(m[1]));
  if (!pages.length) return null;
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const cur = Number(u.searchParams.get("page") ?? 1);
  if (!Number.isFinite(cur) || cur >= Math.max(...pages)) return null;
  u.searchParams.set("page", String(cur + 1));
  return u.toString();
}

/**
 * How many cars this page did NOT show, from the count the platform prints
 * ("88 matches out of 88 vehicles.") minus the tiles it carried.
 *
 * The point of this is the robots case. On 14 of 16 cohort rooftops the pager
 * is disallowed by the site's own robots.txt, so a polite walk sees page one
 * and stops — and a walk that stops without saying so certifies a complete
 * visit, which is what db-sync delists on. A caller that pushes this number
 * into report.notes (or, better, report.stoppedEarly) turns a silent 25-of-88
 * into a stated one. Same job as oneAudiTruncated(), same reason.
 *
 * The FIRST number is the one used: it is the count under the query the page
 * was asked for, and the second is the whole lot, which on a filtered SRP is
 * not what this page was ever going to show. Returns 0 when the page showed
 * everything, and undefined when the platform printed no count at all.
 */
export function autoRevoTruncated(html) {
  if (typeof html !== "string") return undefined;
  const m = html.match(/id=["']search_results_count["'][^>]*>\s*([\d,]+)\s+match/i);
  if (!m) return undefined;
  const matches = num(m[1]);
  if (matches == null) return 0;
  return Math.max(0, matches - autoRevoTiles(html).length);
}
