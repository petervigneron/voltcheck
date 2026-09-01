// Dealer Spike (dealerspike.com) — the website vendor behind powersports, RV,
// marine and commercial-truck rooftops; ~43 of them in the registry pile. The
// lane matters here because the electrified units it carries are ones no
// franchise-car crawler reaches: LiveWire, Zero, electric UTVs and vans sit on
// these rooftops and nowhere else in our corpus.
//
// Everything below was measured 2026-08-31 against 28 cohort rooftops, one
// page each. robots.txt on every rooftop reached is `User-agent: *` / `Allow:
// /` with named disallows only for AI-training crawlers; voltcheckbot is not
// among them.
//
// ── THE DOOR IS NOT UNIVERSAL ──────────────────────────────────────────────
// The rooftop's own SRP slug is theme-generated —
// /motorcycles-for-sale-beaverton-portland-or--inventory — but the bare
// /--inventory answers the same full SRP wherever the rooftop runs the V7
// list. It does on 11 of the 28 tested: beavertonmotorcycles, clickitrvspokane,
// eastsideharley, jmhondamiami, dallashonda, thompsonsmotorsports,
// powersportsnorthwest, portlandairstream, desertvalleypowersports,
// dennisdilloncanyonhonda (→ dilloncanyonhonda.com) and kitsaptractor.
//
// The other 17 are not themed differently — they are a different generation of
// the product. robertstruck, villageimportauto, silverlakemarine,
// truckcentersinc, westrux, rwcgroup, delandtruckcenter, brotherspowersports,
// loubachrodt, fydafreightliner, rwcidealease, hudsonbussales, cascadetrader,
// gabriellitruck and easternharley all redirect /--inventory to
// /src/xInventory404.asp; their homepages link /--xAllInventory or
// /default.asp?page=xAllInventory instead, and those doors serve a client-side
// template (`vin=${unitvin}`) with no server-rendered units at all. mands.org
// answers 404 and runs /search/inventory. catsexotics serves the V7 shell —
// its own slug /exotic-cars-for-sale--inventory included — with the result
// count marked `hidden` and zero tiles, i.e. its 10 units render in the
// browser. None of those are reachable with a plain fetch, so this extractor
// returns nothing for them rather than half a lot. dealerSpikeSrpLinks() below
// covers the case /--inventory misses for a theming reason instead.
//
// ── PRICE: THE PLATFORM NAMES THE ASK ITSELF ───────────────────────────────
// A tile's price block is a stack of sibling spans, each carrying the
// platform's own modifier class. Observed vocabulary across the cohort:
//
//   vehicle-price--current   the asking price       ← the only one we read
//   vehicle-price--old       "MSRP" / "Retail Price" / "Was", struck through
//   vehicle-price--savings   the difference between the two — not a price
//   vehicle-price--docfee    "Doc Fee" $215         (portlandairstream)
//   vehicle-price--elecfee   "Electronic Fee" $35   (portlandairstream)
//
// That is a ladder on 6 of the 11 live rooftops, and reading the tile's
// figures as an undifferentiated set would have been wrong on every one of
// them. portlandairstream is the case that decides the design: its Airstream
// Atlas 25MS tile prints MSRP $354,600 struck through, a --current slot
// holding the words "Click for a Quote" and no figure, then a $215 doc fee and
// a $35 electronic fee. A tile-wide price scan publishes $354,600 — a number
// the dealer struck out — or $215, a fee. The honest answer there is no price,
// which is what scoping to --current returns.
//
// eastsideharley is the other half of the same rule and costs us all 20 of its
// units: its --current span carries no vehicle-price__price element, only a
// label reading "Starting at $22,599" or "MSRP $24,999". "Starting at" is a
// model's from-price, not this VIN's ask, and an MSRP is not an ask either, so
// only vehicle-price__price is read and free text in the label is ignored.
// This is the same call automanager.mjs made about the CarGurus badge: no
// price is a state ingest.mjs already handles, a wrong one costs a shopper.
//
// More than one distinct --current figure in a tile abstains. Nothing in the
// corpus does that (exactly one --current span in 220/220 tiles across 11
// rooftops), so there is no observed ladder-within-the-ask to resolve and
// inventing a precedence for one is how the dealer.com internetPrice rule
// overstated 1,256 live listings.
//
// Two third-party numbers sit in the same tiles and are deliberately not read:
// beavertonmotorcycles carries a price-drop widget's data-psm-unitprice, and
// the SRP's ItemList JSON-LD carries an offers.price per position. The
// ItemList is the more tempting of the two — it is the platform's own
// structured data and it agreed with the rendered price on all 20 tiles
// checked — but its Vehicle nodes carry no VIN and no url, so the only way to
// attach one to a car is by position in the list. Positions 1 and 2 of
// beavertonmotorcycles' page one are byte-identical Beta 300 RR X-Pro nodes
// belonging to two different VINs; a positional join that slips by one is
// undetectable and prices the wrong car. VIN and price have to come out of the
// same tile chunk or neither comes out.
//
// ── PAGINATION: DO NOT READ "Page 1 of N" ──────────────────────────────────
// Two pagers ship on every V7 page. The visible one is JS-driven
// (ds-next-page attribute, no hrefs) and prints "Page 1 of 33". Beside it,
// commented out, is a template that prints "Page 1 of 100" — on every rooftop,
// regardless of lot size. Reading the page-of-N text takes the max of the two
// and walks 100 pages at every rooftop; the overshoot is invisible because a
// pg= beyond the end clamps to the last page and re-serves it (verified:
// /--inventory?pg=34 returns page 33's nine cars, 200 OK). The crawlable pager
// is <ol class="v7list-seo-paging">, present on all 11 live rooftops, which
// lists next, next+1 and the true last page. That block only, nothing wider.
//
// ── VIN-LESS UNITS ARE THE NORM HERE, NOT AN EDGE CASE ─────────────────────
// kitsaptractor.net serves 20 tiles and 0 VINs (tractors), and
// desertvalleypowersports 20 tiles and 6 VINs. Those tiles are skipped, not
// keyed by URL: crawl.mjs keys a VIN-less record by its source URL and every
// tile on a page shares one, so emitting them collapses the page to one car.
import { DEALERSPIKE_PRICE, DEALERSPIKE_CACHE_PRICE } from "../price-provenance.mjs";
import { stabilizeImages } from "../images.mjs";
import { conditionToken } from "../condition.mjs";
import { decodeEntities } from "../normalize.mjs";

// Byte-compatible with the entry lib/fingerprint.mjs already carries. Anchored
// on hosts the vendor owns — the words "dealer spike" in a page's prose are
// not evidence of the platform.
const ASSET_RE = /\b(?:cdn|www)\.dealerspike\.com|\.dealerspike\.net|dealerspikeparts\.com/i;

export function isDealerSpike(html) {
  return typeof html === "string" && ASSET_RE.test(html);
}

export const DEALERSPIKE_SRP_PATH = "/--inventory";

// The older generation's SRP shell rides along: it 404s harmlessly on a V7
// rooftop, and on the 15+ older ones it is the page that names the VehInv
// cache file (the whole lot — see the cache section at the bottom).
export const DEALERSPIKE_OLD_SRP_PATH = "/--xAllInventory";

export function dealerSpikeSeeds(origin) {
  return [origin + DEALERSPIKE_SRP_PATH, origin + DEALERSPIKE_OLD_SRP_PATH];
}

/** SRP slugs a rooftop links from its own homepage, for the case where
 *  /--inventory misses because the rooftop themed its path rather than because
 *  it is running the older generation. Bare paths only: the query-string
 *  variants are pre-filtered facets (?condition=new, ?price=0-5000) and
 *  seeding one crawls a subset of the lot while looking like the whole thing.
 *  Measured caveat: on the 28 rooftops sampled this rescued nothing — the ones
 *  /--inventory misses have no --inventory link on their homepage either, and
 *  catsexotics' own slug serves the same empty V7 shell. It is here for the 15
 *  cohort rooftops not sampled. */
export function dealerSpikeSrpLinks(html, pageUrl) {
  if (typeof html !== "string") return [];
  const out = new Set();
  for (const m of html.matchAll(/href="([^"]*--inventory)"/g)) {
    try {
      const u = new URL(decodeEntities(m[1]), pageUrl);
      if (u.origin === new URL(pageUrl).origin) out.add(u.toString());
    } catch {}
  }
  return [...out];
}

// The seo pager's own block, and only it — see the "Page 1 of 100" note above.
const SEO_PAGER_RE = /<ol class="[^"]*\bv7list-seo-paging\b[^"]*"[^>]*>([\s\S]{0,4000}?)<\/ol>/;

export function dealerSpikeNextPageUrl(html, pageUrl) {
  if (typeof html !== "string") return null;
  const block = html.match(SEO_PAGER_RE)?.[1];
  if (!block) return null;
  const pages = [...block.matchAll(/[?&]pg=(\d{1,4})\b/g)].map((m) => Number(m[1]));
  if (!pages.length) return null;
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const cur = Number(u.searchParams.get("pg") ?? 1);
  // On the last page the pager lists only the pages behind it, so its max
  // falls below the current page and the walk stops. That is also what stops a
  // clamped overshoot: pg=34 on a 33-page lot re-serves page 33, whose pager
  // maxes at 32.
  if (!Number.isFinite(cur) || cur >= Math.max(...pages)) return null;
  u.searchParams.set("pg", String(cur + 1));
  return u.toString();
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const TILE_RE = /<li class="[^"]*\bv7list-results__item\b[^"]*"[^>]*>/g;
const RESULTS_LIST_RE = /<ul class="[^"]*\bv7list-results__list\b[^"]*"[^>]*>/;
const CURRENT_PRICE_RE = /<span class="[^"]*\bvehicle-price--current\b[^"]*"[^>]*>/g;

const strip = (s) => decodeEntities(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** A currency figure, or nothing. "Call", "Click for a Quote" and an empty
 *  element are all nothing — a price element that prints no number is not a
 *  price of zero. */
const money = (raw) => {
  const s = strip(raw ?? "");
  const m = s.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  const n = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const int = (raw) => {
  const s = strip(raw ?? "").replace(/[^0-9]/g, "");
  const n = Number(s);
  return s && Number.isFinite(n) && n > 0 ? n : undefined;
};

const attr = (chunk, name) => {
  const v = chunk.match(new RegExp(`\\bdata-${name}="([^"]*)"`))?.[1];
  const s = v == null ? "" : decodeEntities(v).trim();
  return s || undefined;
};

/** The span opened at `from`, up to its own close. Nested spans are the point:
 *  a --current block wraps a label span and a price span, and a naive
 *  lastIndexOf("</span>") would swallow the sibling --old block behind it. */
function spanBody(html, from) {
  let depth = 0;
  for (const t of html.slice(from).matchAll(/<span\b|<\/span>/g)) {
    if (t[0] === "</span>") {
      if (depth === 0) return html.slice(from, from + t.index);
      depth--;
    } else depth++;
  }
  return html.slice(from);
}

/** Every distinct figure this tile prints in an ASKING-price slot. More than
 *  one means the rooftop advertises a ladder we cannot resolve; none means it
 *  advertises no price. Both are abstentions. */
export function tileAskingPrices(chunk) {
  if (typeof chunk !== "string") return [];
  const seen = new Set();
  for (const m of chunk.matchAll(CURRENT_PRICE_RE)) {
    const body = spanBody(chunk, m.index + m[0].length);
    for (const p of body.matchAll(/class="vehicle-price__price[^"]*"[^>]*>([\s\S]{0,200}?)<\/span>/g)) {
      const n = money(p[1]);
      if (n != null) seen.add(n);
    }
  }
  return [...seen];
}

/** The tile's spec table as label → value. The rooftop chooses which rows it
 *  prints (Odometer, Color, Length, Sleeps Up To, Family all appear on some
 *  and not others), so this reads the labels rather than assuming a shape. */
function specs(chunk) {
  const out = {};
  for (const m of chunk.matchAll(
    /vehicle-specs__label"[^>]*>([\s\S]{0,80}?)<\/h5>\s*<span class="vehicle-specs__value[^"]*"[^>]*>([\s\S]{0,200}?)<\/span>/g,
  )) {
    const k = strip(m[1]).toLowerCase();
    const v = strip(m[2]);
    if (k && v && out[k] == null) out[k] = v;
  }
  return out;
}

// Photo identity is the path after the size segment; the size itself is a
// resizer directive. The hero's data-src ships two renditions of one photo
// pipe-separated ("…/300x225/…|…/640x480/…") and the gallery thumbs ship at
// 160x120, so raw URLs would publish the same photo twice and the rest at
// thumbnail size. Normalising the segment to 640x480 — the size the platform's
// own ItemList JSON-LD publishes for the hero — makes the dedupe work and
// serves a usable image: verified 2026-08-31 that a thumb's UUID requested at
// 640x480 returns a real 34KB JPEG, so this is the CDN's documented path, not
// a URL we invented.
const CDN_SIZE_RE = /(\/imglib\/v\d+\/)\d{2,4}x\d{2,4}\//;

function tileImages(chunk) {
  const urls = [];
  for (const m of chunk.matchAll(/\bdata-src="([^"]*)"/g)) {
    for (const part of decodeEntities(m[1]).split("|")) {
      const raw = part.trim();
      if (!raw) continue;
      const abs = raw.startsWith("//") ? `https:${raw}` : raw;
      if (!/^https?:\/\//.test(abs)) continue;
      urls.push(abs.replace(CDN_SIZE_RE, "$1640x480/"));
    }
  }
  return stabilizeImages(urls);
}

// A unit the rooftop has marked gone is not a listing. Nothing in the sampled
// corpus prints one — the Availability vocabulary observed is "In Stock", "In
// Transit" and "Unknown", all live states, and every ItemList offer is InStock
// or PreOrder — so this cannot false-drop anything measured. It is here
// because an SRP that can print an availability can print a sold one.
const GONE_RE = /\bsold\b|\bno longer available\b/i;

function tileVehicle(chunk, pageUrl) {
  const s = specs(chunk);
  const vin = (s.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const availability = s.availability ?? s.status;
  if (availability && GONE_RE.test(availability)) return null;

  // The VDP link, not the quote/contact modal links that share the tile. Those
  // carry the VIN too, and taking one as the car's page would send a shopper
  // to a lead form instead of the listing.
  const href = chunk.match(/href="((?:[^"]*?)\/(?:NEW|USED|[A-Z-]+)-Inventory-[^"#]+)"/)?.[1];
  let url;
  try {
    if (href) {
      const u = new URL(decodeEntities(href), pageUrl);
      // ?ref=list is where the shopper came from, not part of the car's
      // address. The platform prints the clean path itself on the same tile,
      // in the Details button's external-href, so this is its own canonical
      // form — and dropping it makes an SRP-found url equal to the one a VDP
      // lane would find, instead of two spellings of one page.
      u.searchParams.delete("ref");
      url = u.toString();
    }
  } catch {}

  const prices = tileAskingPrices(chunk);
  const price = prices.length === 1 ? prices[0] : undefined;

  // The <li>'s own data-unit-condition is the platform's routing token — NEW
  // and USED are the only values observed, and they agree with both the
  // /NEW-Inventory-…/USED-Inventory- VDP path segment and the condition= param
  // on the tile's quote link. The path is the fallback for a theme that drops
  // the attribute. Absent → undefined; see ../condition.mjs for the 150 new
  // cars an else-branch published as used.
  //
  // Certification is not claimed. The price block carries a commented-out slot
  // for a "Harley Certified Pre-Owned" badge, so the platform can render one,
  // but a certification is a warranty claim and nothing here states its terms.
  // conditionToken reads a CERTIFIED token as used, which is what a certified
  // car is.
  const itemCondition =
    conditionToken(attr(chunk, "unit-condition")) ??
    conditionToken(href?.match(/\/(NEW|USED)-Inventory-/i)?.[1]);

  const year = attr(chunk, "unit-year");
  const make = attr(chunk, "unit-make");
  const model = attr(chunk, "unit-model");
  const images = tileImages(chunk);
  // The heading link's title attribute is the platform's own assembled name
  // ("2027 Beta 300 RR X-Pro"); composing one from the data-unit-* attributes
  // is the fallback.
  const name =
    strip(chunk.match(/class="vehicle-heading__link"[^>]*\btitle="([^"]*)"/)?.[1] ?? "") ||
    [year, make, model].filter(Boolean).join(" ") ||
    undefined;

  const mileage = int(s.odometer ?? s.mileage ?? s.miles);
  // Whatever fuel string the rooftop chose to print, untouched — no rooftop in
  // the sample prints one, and none is inferred from the category. classifyEv
  // decides downstream.
  const fuel = s["fuel type"] ?? s.fuel ?? s["engine type"];

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: year,
    brand: make,
    model,
    name,
    // data-unit-category is the platform's vehicle-type taxonomy ("Motorcycle
    // / Scooter", "Trailer", "Motorhome"), which is what bodyType means here.
    bodyType: attr(chunk, "unit-category"),
    mileageFromOdometer: mileage != null ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: s.color,
    sku: s["stock number"],
    image: images.length ? images : undefined,
    fuelType: fuel,
    ...(itemCondition ? { itemCondition } : {}),
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? DEALERSPIKE_PRICE : undefined,
      priceCurrency: "USD",
      url,
    },
  };
}

/** The results list's own region, bounded by its closing </ul> rather than by
 *  the end of the document. Slicing the last tile to end-of-html would fold
 *  every trailing page script into it, and two rooftops put price markup
 *  there: dallashonda ships a jQuery block holding
 *  `<span class="vehicle-price__price">${listDiscount}</span>` templates and a
 *  selector naming vehicle-price--current, which is exactly the shape this
 *  extractor reads. */
function resultsRegion(html) {
  const m = html.match(RESULTS_LIST_RE);
  if (!m) return null;
  const from = m.index + m[0].length;
  let depth = 0;
  for (const t of html.slice(from).matchAll(/<ul\b|<\/ul>/g)) {
    if (t[0] === "</ul>") {
      if (depth === 0) return html.slice(from, from + t.index);
      depth--;
    } else depth++;
  }
  return null;
}

/** Every car on a Dealer Spike V7 SRP page. */
export function dealerSpikeVehicles(html, pageUrl) {
  if (!isDealerSpike(html)) return [];
  const region = resultsRegion(html);
  if (!region) return [];
  const starts = [...region.matchAll(TILE_RE)].map((m) => m.index);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < starts.length; i++) {
    const chunk = region.slice(starts[i], starts[i + 1] ?? region.length);
    const v = tileVehicle(chunk, pageUrl);
    if (!v || seen.has(v.vehicleIdentificationNumber)) continue;
    seen.add(v.vehicleIdentificationNumber);
    out.push(v);
  }
  return out;
}

// ── THE OLDER GENERATION: THE LOT IS ONE CACHED JS FILE ─────────────────────
// The 15+ rooftops whose /--inventory redirects to /src/xInventory404.asp
// (robertstruck, fydafreightliner, gabriellitruck, …) render their SRP
// client-side from a single static file the shell page names in a script src:
//
//   /imglib/Inventory/cache/{dealerId}/VehInv.js   →   var Vehicles=[ … ]
//
// Verified on robertstruck.com (2026-08-31): the file is a plain fetch (200,
// robots `Allow: /`), holds the WHOLE lot — 120 records, 120 distinct 17-char
// VINs — and each record carries vin, price, miles, manuf/model/bike_year,
// color, stockno, location, a machine condition token (`type`: "N"×101 /
// "U"×19), and a fuel LETTER (`ft`: "D"×112, ""×8) whose meaning the vendor
// publishes itself in /src/js/UnitFuelTypeMap.js. Only that vendor-published
// map is used here, and only its electrified letters matter downstream:
// E=Electric, T=Battery, L=Lithium, H=Hybrid. An unmapped letter emits no
// fuel at all rather than a guess.
//
// Price: the record's `price` field, and nothing else. The same record
// carries retail_price, sale_price and discount_price — all empty or "0" on
// every one of the 120 records seen — and "when in doubt, split" says an
// unobserved ladder is not resolved, it is abstained from: if sale_price or
// discount_price ever carries a different positive figure, the record
// abstains. `price` of 0 is the platform's no-price state (20 of 120), kept
// as no claim. Its own provenance tag, separate from the V7 tile's: nothing
// has verified the two fields equal on any rooftop, and no rooftop runs both
// generations at once.
//
// The per-car page — what recheck asks — is /default.asp?page=xInventoryDetail
// &id={id}, which serves the VIN in static HTML (verified, 2 occurrences).
// The shell writes the tag with SINGLE quotes (src='/imglib/…'), which cost
// the first version of this regex the whole lane — both styles accepted.
const VEHINV_SRC_RE = /(?:src|href)=["']([^"']*imglib\/Inventory\/cache\/(\d+)\/VehInv\.js[^"']*)["']/i;

const FUEL_LETTERS = {
  N: "None", G: "Gas", M: "Gas/Oil Mix", D: "Diesel", B: "BioDiesel", E: "Electric",
  P: "Propane", H: "Hybrid", F: "Flex Fuel", C: "Compressed Natural Gas",
  A: "Dual Fuel", T: "Battery", L: "Lithium", O: "Other",
};

/** The cached-lot file the shell page names, or null. */
export function dealerSpikeVehInvUrl(html, pageUrl) {
  if (typeof html !== "string") return null;
  const m = html.match(VEHINV_SRC_RE);
  if (!m) return null;
  try {
    return new URL(decodeEntities(m[1]), pageUrl).toString();
  } catch {
    return null;
  }
}

/** `var Vehicles=[…]` → the array, or null on anything malformed. */
export function parseVehInv(js) {
  if (typeof js !== "string" || !/var\s+Vehicles\s*=/.test(js)) return null;
  const start = js.indexOf("[");
  const end = js.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(js.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

const numish = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function dealerSpikeCacheVehicle(rec, origin) {
  const vin = String(rec?.vin ?? "").toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;
  const price = numish(rec?.price);
  // The unobserved-ladder abstention: a sale/discount figure that exists and
  // differs from `price` means the ask is not known to be either.
  const sale = numish(rec?.sale_price);
  const discount = numish(rec?.discount_price);
  const ladderDisagrees = (sale != null && sale !== price) || (discount != null && discount !== price);
  const fuel = FUEL_LETTERS[String(rec?.ft ?? "").trim().toUpperCase()] ?? undefined;
  const itemCondition = rec?.type === "N" ? "new" : rec?.type === "U" ? "used" : undefined;
  const miles = numish(rec?.miles);
  const manuf = String(rec?.manuf ?? "").replace(/®|®/g, "").trim() || undefined;
  const img =
    typeof rec?.bike_image === "string" && /^[0-9A-F-]{36}\.(?:jpe?g|png|webp)$/i.test(rec.bike_image)
      ? `https://cdn.dealerspike.com/imglib/v1/640x480/imglib/Assets/Inventory/${rec.bike_image.slice(0, 2)}/${rec.bike_image.slice(2, 4)}/${rec.bike_image}`
      : undefined;
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: rec?.bike_year != null && String(rec.bike_year) !== "0" ? String(rec.bike_year) : undefined,
    brand: manuf,
    model: rec?.model || undefined,
    name: [rec?.bike_year, manuf, rec?.model].filter((x) => x && String(x) !== "0").join(" ") || undefined,
    ...(itemCondition ? { itemCondition } : {}),
    mileageFromOdometer: miles != null ? { "@type": "QuantitativeValue", value: miles } : undefined,
    color: rec?.color || undefined,
    sku: rec?.stockno ? String(rec.stockno) : undefined,
    image: img ? stabilizeImages([img]) : undefined,
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", name: rec?.engine || undefined, fuelType: fuel },
    offers: {
      "@type": "Offer",
      price: ladderDisagrees ? undefined : price,
      priceProvenance: !ladderDisagrees && price != null ? DEALERSPIKE_CACHE_PRICE : undefined,
      priceCurrency: "USD",
      url: rec?.id ? `${origin.replace(/\/$/, "")}/default.asp?page=xInventoryDetail&id=${encodeURIComponent(rec.id)}` : undefined,
    },
  };
}

/** The older generation's whole lot, one request past the shell page.
 *  `complete` is honest: the file IS the lot (120 records / 120 distinct VINs
 *  on robertstruck), so a parsed file certifies and anything else does not. */
export async function pullDealerSpikeCache(origin, shellHtml, shellUrl) {
  const url = dealerSpikeVehInvUrl(shellHtml, shellUrl ?? origin);
  if (!url) return { ok: false, complete: false, found: 0, vehicles: [], requests: 0 };
  const { fetchPage } = await import("../http.mjs");
  const res = await fetchPage(url);
  if (res.status !== 200 || !res.body) return { ok: false, complete: false, found: 0, vehicles: [], requests: 1 };
  const recs = parseVehInv(res.body);
  if (!recs) return { ok: false, complete: false, found: 0, vehicles: [], requests: 1 };
  const out = [];
  const seen = new Set();
  for (const rec of recs) {
    const v = dealerSpikeCacheVehicle(rec, origin);
    if (v && !seen.has(v.vehicleIdentificationNumber)) {
      seen.add(v.vehicleIdentificationNumber);
      out.push(v);
    }
  }
  return { ok: true, complete: true, found: recs.length, vehicles: out, requests: 1 };
}

/** The probe's settle for the older generation: one shell fetch names the
 *  cache file, one more is the lot. Declines cleanly on a V7 rooftop (the
 *  shell 404s or names no cache), so the ordinary SRP walk still runs there. */
export async function countDealerSpikeCache(origin) {
  const { fetchPage } = await import("../http.mjs");
  const shell = await fetchPage(origin.replace(/\/$/, "") + DEALERSPIKE_OLD_SRP_PATH);
  if (shell.status !== 200 || !shell.body) return { ok: false, found: 0, hasVin: false };
  const r = await pullDealerSpikeCache(origin, shell.body, shell.finalUrl);
  return { ok: r.ok, found: r.found, hasVin: r.vehicles.length > 0 };
}
