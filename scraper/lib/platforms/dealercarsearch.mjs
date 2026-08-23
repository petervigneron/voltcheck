// Dealer Car Search (DCS) platform extractor.
//
// DCS is the platform of the independent used-car lot: 189 of our registry's
// sites run it and every one of them yielded zero cars, because DCS emits no
// schema.org JSON-LD anywhere — not on the SRP, not on the VDP — and its VDP
// URLs are keyed by an internal inventory id (/vdp/24050996/…) rather than the
// VIN, so neither the JSON-LD extractor nor the sitemap VIN prefilter has a
// hook into it. That is a discovery gap, not a bug (probe note on
// eleasereturns.com, 2026-08-13).
//
// What it does emit, on every SRP regardless of which of its several page
// templates the dealer picked, is a Tealium data layer inside
// <div id="TealiumProductListTags"> reassigning init_utag_data with parallel
// arrays — product_list_vins / _ids / _names / _years / _makes. That is the
// DDC.dataLayer equivalent: one blob, server-rendered, carrying the VIN and
// identity of every car on the page. The visible tiles carry what the blob
// does not (price, odometer, trim, colours, the VDP link), and both are keyed
// by the same inventory id, so the two join cleanly.
//
// Templates seen in the wild differ in every class name — i01r/i19r
// (.vehicle-trim, .vehicle-mileage, no VIN in the tile at all), i03r
// (.optVin, .optMileage), i05r (.i05r_optVin) — so tile fields are read by
// their visible <label> text ("Mileage:", "Vin:", "Drive Train:"), which has
// been stable across all of them, with the class names as a fallback. When a
// future template defeats the tile parse the utag blob still stands on its
// own: VIN, year, make, model and the VDP link survive, odometer and trim go
// missing, and the record degrades instead of going wrong.

// One page-level fingerprint, carried by the data layer on every page the
// platform serves — homepage, SRP and VDP alike. Deliberately not the
// imagescdn.dealercarsearch.com asset host, which a third-party inventory
// widget on somebody else's site could also load: this answer decides whether
// a crawl gets to certify that it saw a dealer's whole lot.
import { DCS_TILE } from "../price-provenance.mjs";

const DCS_MARK = /"site_platform":\s*"dcs"/;

export function isDealerCarSearch(html) {
  return typeof html === "string" && DCS_MARK.test(html);
}

// SRP seeds. `clearall=1` drops any sticky filter state; `pagesize=100` is the
// largest page size the templates offer (some offer 96 and clamp — either way
// the pager below walks the rest).
export const DCS_SRP_PATH = "/newandusedcars?clearall=1&pagesize=100";
// The fuel-type facet is the dealer's own declaration and it is exact: on
// randsauto.com (180 cars) `fueltype=Electric` returned 34 vehicles, every one
// a BEV — the Q5 e, the Sportage Plug In Hybrid and the RAV4 Prime in the same
// inventory were all excluded. One request, all of a lot's EVs, including any
// whose model name our EV_MODEL_RE doesn't know.
export const DCS_EV_SRP_PATH = "/newandusedcars?clearall=1&pagesize=100&fueltype=Electric";

export function dcsSeeds(origin) {
  return [origin + DCS_EV_SRP_PATH, origin + DCS_SRP_PATH];
}

const decode = (s) =>
  String(s ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const clean = (s) => {
  const t = decode(s);
  return t && t !== "-" && !/^n\/?a$/i.test(t) ? t : undefined;
};

// Values read out of an HTML attribute are encoded twice — the compare
// checkbox's JS argument for a Sprinter's trim is written
// `170&amp;quot; RWD` inside onchange="…", and one decode pass leaves the
// shopper looking at `170&quot; RWD`.
const cleanAttr = (s) => clean(decode(s));

const money = (s) => {
  const m = String(s ?? "").match(/\$\s*([\d,]+(?:\.\d+)?)/);
  const n = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const digits = (s) => {
  const m = String(s ?? "").match(/[\d,]+/);
  const n = m ? Number(m[0].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

// Pull a "key": value pair out of a Tealium blob without JSON.parse — the
// object is JS, not JSON (page_title: pageTitle is a bare identifier), so it
// cannot be parsed whole.
function utagString(blob, key) {
  const m = blob.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  return m ? decode(m[1]) : undefined;
}

function utagArray(blob, key) {
  const m = blob.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => decode(x[1])) : [];
}

// The dealer's own identity block, present on every DCS page.
export function extractDcsSite(html) {
  if (!DCS_MARK.test(html)) return null;
  return {
    name: utagString(html, "site_company_name"),
    city: utagString(html, "site_company_city"),
    state: utagString(html, "site_company_state"),
    zip: utagString(html, "site_company_zip_code"),
    dealerId: utagString(html, "site_internal_id"),
  };
}

// Read a labelled field out of a fragment: <label>Mileage:</label> 41,053,
// <label>Vin:</label><span>7SAY…</span>, and the i19r variant that wraps the
// value in a span. Anchored on the whole label text so the trade-in form's
// "Trade-In VIN" / "Trade-In Color" inputs (which sit further down every VDP
// and are always empty) cannot answer for the car.
function labelled(frag, label) {
  const re = new RegExp(
    `<label[^>]*>\\s*${label}\\s*:?\\s*<\\/label>\\s*(?:<span[^>]*>)?\\s*([^<]*)`,
    "i"
  );
  const m = frag.match(re);
  return m ? clean(m[1]) : undefined;
}

// Fallback for templates that drop the <label> (i19r's tiles render
// "• 28,594 miles" in a .vehicle-mileage span). The class names are listed
// rather than pattern-matched: a loose /drive/ would let .btnTestDrive
// ("Schedule Test Drive") answer for the drivetrain.
const CLASSES = {
  mileage: "optMileage|vehicle-mileage|detailOptMPG",
  trim: "optTrim|vehicleTrim|vehicle-trim|TrimLevel|detailOptTrim",
  color: "optColor|vehicle-color|detailOptColor",
  interiorColor: "optInteriorColor|detailOptInteriorColor",
  drive: "optDrive|vehicle-drive|detailOptDrive",
  stock: "optStock|detailOptStock",
  engine: "optEngine|detailOptEngine",
  fuel: "optFuel|detailOptFuel",
};

function byClass(frag, key) {
  const re = new RegExp(
    `class=["'][^"']*(?:${CLASSES[key]})[^"']*["'][^>]*>\\s*(?:<(?:span|label)[^>]*>[^<]*<\\/(?:span|label)>)?\\s*(?:<span[^>]*>)?\\s*([^<]*)`,
    "i"
  );
  const m = frag.match(re);
  return m ? clean(m[1].replace(/^[•·\-\s]+/, "")) : undefined;
}

const field = (frag, label, key) => labelled(frag, label) ?? (key ? byClass(frag, key) : undefined);

const DRIVES = { FWD: "FWD", RWD: "RWD", AWD: "AWD", "4WD": "4WD", "4X4": "4WD" };
const driveLine = (s) => (s ? DRIVES[s.toUpperCase().replace(/[^A-Z0-9]/g, "")] : undefined);

const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/;

// "2024 Hyundai Ioniq 5" + make "Hyundai" + year 2024 -> "Ioniq 5". The make
// is given by the blob rather than guessed, so no make vocabulary is needed
// and two-word makes ("Land Rover") fall out for free.
function modelFromName(name, year, make) {
  if (!name) return undefined;
  let rest = name.trim();
  if (year) rest = rest.replace(new RegExp(`^${year}\\s+`), "");
  if (make) rest = rest.replace(new RegExp(`^${make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  return clean(rest);
}

// Every DCS tile links its car as /vdp/{inventoryId}/{slug}. The slug's first
// word is the condition the dealer assigned it ("Used-2022-Tesla-Model-Y…").
const VDP_HREF_RE = /href=["'](\/vdp\/(\d+)\/([^"'?#]*))/gi;
// The compare checkbox is the one per-tile call every template emits:
// compareChecked(this, id, '$27,999', 'image', '', '2022 Infiniti Q50', '3.0t LUXE AWD')
const COMPARE_RE =
  /compareChecked\(\s*this\s*,\s*'(\d+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g;

// Slice the page into one fragment per inventory id: from where an id is first
// linked to where the next distinct id is first linked. Tiles are contiguous,
// so this holds across templates without knowing any container class.
function tileFragments(html) {
  const firstAt = new Map();
  const meta = new Map();
  for (const m of html.matchAll(VDP_HREF_RE)) {
    const id = m[2];
    if (!firstAt.has(id)) {
      firstAt.set(id, m.index);
      meta.set(id, { id, href: decode(m[1]), slug: m[3] });
    }
  }
  const order = [...firstAt.entries()].sort((a, b) => a[1] - b[1]);
  const out = new Map();
  for (let i = 0; i < order.length; i++) {
    const [id, start] = order[i];
    const end = i + 1 < order.length ? order[i + 1][1] : html.length;
    out.set(id, { ...meta.get(id), frag: html.slice(start, end) });
  }
  return out;
}

function tileFields(frag) {
  const img = frag.match(/(?:data-)?src=["'](https:\/\/imagescdn\.dealercarsearch\.com\/Media\/[^"']+)["']/i);
  const engine = field(frag, "Engine", "engine");
  return {
    vin: labelled(frag, "Vin")?.match(VIN_RE)?.[0] ?? frag.match(/data-(?:cg-)?vin=["']([A-HJ-NPR-Z0-9]{17})["']/i)?.[1],
    mileage: digits(field(frag, "Mileage", "mileage")),
    trim: field(frag, "Trim", "trim"),
    exteriorColor: field(frag, "Color", "color"),
    interiorColor: field(frag, "Interior Color", "interiorColor"),
    driveLine: driveLine(field(frag, "Drive Train", "drive") ?? labelled(frag, "Drive")),
    stockNumber: field(frag, "Stock #", "stock"),
    engine,
    // The i19r VDP carries the facet value itself ("Fuel: Hybrid"); nothing
    // else does, so the engine text stands in where it doesn't. classifyEv
    // reads both and already refuses "Gas/Electric Hybrid".
    fuelType: field(frag, "Fuel", "fuel") ?? engine,
    price: money(frag.match(/class=["'][^"']*(?:lblPrice|vehicle-price|price-price)[^"']*["'][^>]*>([^<]*)/i)?.[1]),
    image: img ? decode(img[1]) : undefined,
  };
}

function buildOffer(price, url, site) {
  return {
    "@type": "Offer",
    price,
    // DCS publishes no JSON-LD at all; this is its own tile/data-layer figure
    // and is tagged as such. recheck.mjs reads the same field and matches.
    priceProvenance: DCS_TILE,
    priceCurrency: "USD",
    url,
    seller: site
      ? {
          "@type": "AutoDealer",
          name: site.name,
          address: {
            "@type": "PostalAddress",
            addressLocality: site.city,
            addressRegion: site.state,
            postalCode: site.zip,
          },
        }
      : undefined,
  };
}

// Is this page the result of the platform applying ?fueltype=Electric? Asked
// of the page rather than of the URL: the facet select re-renders with the
// applied value selected, which proves the filter ran. A DCS variant that
// ignored the parameter would return the whole lot with the select untouched,
// and mislabelling a lot of petrol cars as electric is exactly the failure
// this guard exists to prevent.
function electricFacetApplied(html) {
  const sel = html.match(/name=['"]fueltype['"][\s\S]*?<\/select>/i)?.[0];
  return Boolean(sel && /<option[^>]*value=['"]Electric['"][^>]*\bselected\b/i.test(sel));
}

function vehicleNode({ vin, year, make, model, name, tile, url, condition, site, declaredElectric }) {
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: year,
    brand: make,
    model,
    name,
    vehicleConfiguration: tile?.trim,
    mileageFromOdometer: tile?.mileage != null ? { "@type": "QuantitativeValue", value: tile.mileage } : undefined,
    color: tile?.exteriorColor,
    vehicleInteriorColor: tile?.interiorColor,
    driveWheelConfiguration: tile?.driveLine,
    sku: tile?.stockNumber,
    image: tile?.image ? [tile.image] : undefined,
    itemCondition: condition,
    vehicleEngine: { "@type": "EngineSpecification", fuelType: declaredElectric ? "Electric" : tile?.fuelType },
    offers: buildOffer(tile?.price, url, site),
  };
}

const conditionFromSlug = (slug) => {
  const w = String(slug ?? "").split("-")[0].toLowerCase();
  return w === "used" || w === "new" || w === "certified" ? w : undefined;
};

// VDPs announce themselves in the data layer and carry the full record:
// product_* for identity and price, the labelled detail list for the rest.
function extractVdp(html, pageUrl, site) {
  const vin = labelled(html, "Vin")?.match(VIN_RE)?.[0] ?? html.match(/data-(?:cg-)?vin=["']([A-HJ-NPR-Z0-9]{17})["']/i)?.[1];
  if (!vin) return [];
  const tile = tileFields(html);
  const uri = utagString(html, "product_uri");
  const price = Number(utagString(html, "product_price"));
  return [
    vehicleNode({
      vin,
      year: utagString(html, "product_year"),
      make: utagString(html, "product_make"),
      model: utagString(html, "product_model"),
      name: utagString(html, "product_name"),
      tile: { ...tile, price: (Number.isFinite(price) && price > 0 ? price : undefined) ?? tile.price },
      url: uri ? new URL(uri, pageUrl).toString() : pageUrl,
      condition: utagString(html, "product_condition")?.toLowerCase() ?? conditionFromSlug(new URL(pageUrl).pathname.split("/")[3]),
      site,
      declaredElectric: false,
    }),
  ];
}

function extractSrp(html, pageUrl, site) {
  const vins = utagArray(html, "product_list_vins");
  const ids = utagArray(html, "product_list_ids");
  if (!vins.length || vins.length !== ids.length) return [];
  const names = utagArray(html, "product_list_names");
  const years = utagArray(html, "product_list_years");
  const makes = utagArray(html, "product_list_makes");
  const tiles = tileFragments(html);
  const compare = new Map();
  for (const m of html.matchAll(COMPARE_RE)) compare.set(m[1], { price: money(m[2]), name: cleanAttr(m[5]), trim: cleanAttr(m[6]) });
  const declaredElectric = electricFacetApplied(html);

  const out = [];
  for (let i = 0; i < vins.length; i++) {
    const vin = vins[i]?.toUpperCase();
    if (!VIN_RE.test(vin ?? "")) continue;
    const id = ids[i];
    const t = tiles.get(id);
    const c = compare.get(id);
    const year = years[i];
    const make = makes[i];
    const name = names[i] || c?.name;
    const tile = { ...(t ? tileFields(t.frag) : {}) };
    tile.price ??= c?.price;
    tile.trim ??= c?.trim;
    out.push(
      vehicleNode({
        vin,
        year,
        make,
        model: modelFromName(name, year, make),
        // Year/make/model only, matching what the VDP's own data layer calls
        // the product name. The trim stays in vehicleConfiguration: folding it
        // in here put "I4 Diesel" in front of classifyEv's BMW i4 pattern and
        // shipped a Sprinter van as a name-matched EV.
        name,
        tile,
        url: t ? new URL(t.href, pageUrl).toString() : new URL(`/vdp/${id}/`, pageUrl).toString(),
        condition: conditionFromSlug(t?.slug),
        site,
        declaredElectric,
      })
    );
  }
  return out;
}

// Vehicles on a DCS page, shaped as schema.org Vehicle nodes so they flow
// through the same classifyEv/normalize path as every JSON-LD site.
export function extractDcsVehicles(html, pageUrl) {
  if (typeof html !== "string" || !DCS_MARK.test(html)) return [];
  const site = extractDcsSite(html);
  const isVdp = /"tealium_event":\s*"product_detail_view"/.test(html) || /"product_uri":/.test(html);
  try {
    return isVdp ? extractVdp(html, pageUrl, site) : extractSrp(html, pageUrl, site);
  } catch {
    return [];
  }
}

// How many vehicles this search matched in total. The Make facet re-renders
// against the current result set with a count beside every option, so the sum
// is the result count — including when a fuel-type filter is applied. Read
// from the facet rather than from the "N Vehicles Found" line, which only
// some of the templates print.
function facetTotal(html) {
  const sel = html.match(/name=['"]makename['"][\s\S]*?<\/select>/i)?.[0];
  if (!sel) return null;
  const counts = [...sel.matchAll(/\((\d[\d,]*)\)\s*<\/option>/g)].map((m) => Number(m[1].replace(/,/g, "")));
  return counts.length ? counts.reduce((a, b) => a + b, 0) : null;
}

// No independent lot runs to 3,000 cars; this only exists so that a site which
// ignores ?page= and re-serves page 1 cannot page forever.
const MAX_PAGES = 30;

// Next SRP page, if there is one. DCS paginates with ?page=N but renders the
// control as <button onClick="changePage(this)" value="2"> rather than a link,
// so the crawler's generic rel=next / href-page scan never sees it.
export function dcsNextPageUrl(html, pageUrl) {
  if (typeof html !== "string" || !DCS_MARK.test(html)) return null;
  const onThisPage = utagArray(html, "product_list_ids").length;
  if (!onThisPage) return null;
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const page = Number(u.searchParams.get("page")) || 1;
  if (page >= MAX_PAGES) return null;
  // Count what has been served rather than trusting ?pagesize: the older
  // templates offer 24/48/72/96 and clamp a request for 100, and treating the
  // clamped page as short would stop the walk one page in.
  const total = facetTotal(html);
  if (total != null && page * onThisPage >= total) return null;
  u.searchParams.set("page", String(page + 1));
  return u.toString();
}
