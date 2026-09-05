// AutoCorner — a website vendor for small independents (~24 rooftops in the
// 2026-08-31 dark-tail scan). Server-rendered .html pages behind an ASP-era
// CGI back office, no JSON-LD anywhere on any template sampled.
//
// ── THE DOOR WE DO NOT USE ─────────────────────────────────────────────────
// The platform's inventory JSON is a POST to /cgi-bin/srp_vehicles.cgi, and
// every rooftop's robots.txt says:
//
//     User-agent: *
//     Disallow: /cgi-bin/
//     Sitemap: https://www.<rooftop>/sitemap.xml
//
// (verified on madisonmotors.com and justcruizen.com, 2026-08-31; the same two
// lines, byte for byte). That endpoint is CLOSED to us permanently — lib/http.mjs
// obeys robots as a hard rule and the owner ruled out working around it. No
// path under /cgi-bin/ is ever constructed in this file, and none should be
// added: the SRP's own vehicle_price / vehicle_sale_price fields are richer
// than what we read below and that is not a reason to reach for them.
//
// ── THE DOOR WE DO USE ─────────────────────────────────────────────────────
// robots.txt names /sitemap.xml, and the sitemap lists EVERY VDP:
//
//   https://www.madisonmotors.com/vehicles/
//     1ftex1epxgfb94914-2016-ford-f-150/C14AC492-A32E-11F1-B82A-12A0F78B64F0
//
// The 17-char VIN leads the slug, lowercased, then the model year, then the
// make and model as hyphenated words, then a UUID path segment. One request
// per rooftop yields the whole lot, which is why this lane can afford to be
// complete.
//
// Whole-lot rather than assumed: madisonmotors.com's sitemap lists 62 VDP URLs
// against the SRP's own reported total of 65 (2026-08-31). The gap is not
// missing cars — it is records with no VIN in the slug, and the sitemap carries
// those too:
//
//   /vehicles/discount-camper-shells/A978A37A-…          (not a vehicle)
//   /vehicles/drb15872-1973-bentley-cornish/…            (stock no. for a VIN)
//   /vehicles/2007-chevrolet-silverado-lt/30F0328D…      (year-first, no VIN)
//   /vehicles/zff76zfa2f02117-2015-ferrari-la-ferrari/…  (15-char pre-1981 VIN)
//   /vehicles/2gnnaldek4c1126598-2012-chevrolet-equinox/… (18 chars, mistyped)
//
// all measured live across the cohort. Every one of them is refused: this
// project is VIN-keyed and a 17-char gate is the whole gate. `found` counts
// what passed it, so a rooftop's `found` is legitimately below its own
// advertised total and that is the honest number rather than a padded one.
//
// ── THE VDP ────────────────────────────────────────────────────────────────
// A labelled details table, and nothing else machine-readable:
//
//   <div class="details_item"><span class="details_item_span1">Price</span>
//     <span class="details_item_span2">$23,850</span></div>
//
// Rows observed: Price, VIN, Year, Make, Model, Stock #, Odometer
// ("61,890 Miles"), Exterior Color, Interior Color, Engine, Transmission,
// Drive Train, Body, Doors, MPG City, MPG Highway, Title. Which rows appear
// varies per car — sandiegocarforsale.com's 2018 Leaf renders no Transmission,
// no Drive Train and no MPG rows at all — so nothing here treats an absent row
// as a value.
//
// The SRP at /docs/vehicle_search.html is an Alpine.js shell that fetches the
// disallowed CGI endpoint client-side. It is not fetched and cannot be walked.
//
// ── PRICE ──────────────────────────────────────────────────────────────────
// The "Price" row, and only when it prints exactly one dollar amount. Live
// counter-examples this abstains on:
//
//   "Call For Price"  (palmbeachexotic.com's 2015 LaFerrari, 2026-08-31) —
//     no dollar sign, no number, no claim.
//
// and, defensively, a row carrying a period word ("/mo", "per month") or two
// different amounts. Neither has been seen on this platform, but the AutoFunds
// build measured a monthly payment sitting beside the ask on EVERY priced car
// of that vendor's inventory, and lib/price-floor.mjs's header lists the four
// live cars a "read the number" rule published a false bargain for. A shape
// nobody has characterised gets no price rather than a guessed one.
//
// Abstain is priceUsd 0, not null — the dealer.com convention AutoFunds also
// follows: ingest.mjs drops a null price and keeps a 0, so the car stays listed
// with no price claim attached to it instead of vanishing.
//
// ── CONDITION ──────────────────────────────────────────────────────────────
// None is emitted, ever. The one row that looks like condition is
//
//   Title = clean
//
// and a title brand is not a condition — "clean" says the car was never
// salvaged, not that it is new or used. These are used-car independents and
// every car on them is almost certainly used, but "almost certainly" is not
// evidence and lib/condition.mjs exists because an else-branch that ended in
// "used" published a 678-car new lot as used. The VDP path (/vehicles/) states
// nothing either, so publishedCondition() returns undefined and the row carries
// no condition — a state every consumer already handles.
//
// Certification is never claimed: no template sampled carries a CPO flag, and a
// used car is not certified for want of evidence.
//
// ── FUEL ───────────────────────────────────────────────────────────────────
// There is NO fuel row on any page seen. The Engine row's text is passed
// through as vehicleEngine.name and nothing infers a fuel type from it.
//
// Read this before wiring: classifyEv() reads vehicleEngine.FUELTYPE, not
// .name, so the Engine row does not participate in classification as written —
// sandiegocarforsale.com's Leaf renders "Electric 147hp 236ft. lbs." and is
// admitted on its NAMEPLATE ("LEAF" via EV_MODEL_RE, confidence name_match,
// vPIC to confirm), not on that string. That is the conservative reading and it
// is deliberate here; AutoFunds routes its equivalent addItem:engine field to
// fuelType instead, with its rationale written out in that file. If this lane
// ever needs the stronger reading, the change is one line in
// applyAutoCornerVdp — and it is a change to what this platform CLAIMS, so it
// wants the same measurement AutoFunds's did, not a quiet edit.
import { AUTOCORNER_PRICE } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";
import { stabilizeImages } from "../images.mjs";
import { fetchPage } from "../http.mjs";
import { LOC_RE, decodeEntities, evish } from "../sitemap.mjs";
import { EV_ONLY_WMIS } from "../ev.mjs";
import { KNOWN_MAKES } from "../makes.mjs";

// The vendor's own script host. Byte-identical to the signature already in
// lib/fingerprint.mjs — the test asserts the two agree, because a drift
// between them would mean crawl.mjs routes a rooftop this file cannot read (or
// the reverse). Deliberately the asset host and not the bare word: "autocorner"
// appears in at least one rooftop's own domain (kingautocorner.com, which is
// not on this platform).
const ASSET_RE = /js-include\.autocorner\.com/i;

export const AUTOCORNER_SITEMAP_PATH = "/sitemap.xml";

export function isAutoCorner(html) {
  return typeof html === "string" && ASSET_RE.test(html);
}

export function autoCornerSitemapUrl(origin) {
  return String(origin).replace(/\/+$/, "") + AUTOCORNER_SITEMAP_PATH;
}

// A sitemap, identified by its own root element rather than by "did something
// answer 200" — a rooftop whose /sitemap.xml is missing serves an HTML page.
export function isSitemap(xml) {
  return typeof xml === "string" && /<(?:urlset|sitemapindex)\b/i.test(xml);
}

export function sitemapLocs(xml) {
  if (typeof xml !== "string") return [];
  return [...xml.matchAll(LOC_RE)].map((m) => decodeEntities(m[1]));
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
// The VIN must END at a hyphen or at the end of the slug. Without that anchor
// the 18-character "2gnnaldek4c1126598" on dandnautosales.com parses as a
// 17-char VIN with a stray digit after it — a mistyped VIN read as a real one,
// which is the one error class this project cannot afford.
const SLUG_VIN_RE = /^([A-HJ-NPR-Z0-9]{17})(?:-|$)/i;
const SLUG_YEAR_RE = /^((?:19|20)\d{2})(?:-|$)/;

// KNOWN_MAKES in slug spelling, so "mercedes-benz-e-class" and
// "land-rover-range-rover" surrender the right make instead of "Mercedes" and
// "Land". Longest first: no two-word make is a prefix of a one-word one today,
// but the ordering is what makes that true rather than lucky.
const MAKE_SLUGS = [...KNOWN_MAKES]
  .map((m) => [m.toLowerCase().replace(/[^a-z0-9]+/g, "-"), m])
  .sort((a, b) => b[0].length - a[0].length);

const titleCase = (s) =>
  String(s).replace(/[a-z0-9]+/gi, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

const spaced = (s) => String(s).replace(/-+/g, " ").replace(/\s{2,}/g, " ").trim();

/**
 * One sitemap URL → the car its slug names, or undefined when the slug carries
 * no 17-character VIN (see the header for the five live shapes that hit this).
 *
 * make/model are SLUG TEXT, not curated fields: the slug erases the difference
 * between a hyphen inside a model name and a hyphen between words, so "f-150"
 * comes back "F 150" and westsidecars.com's
 * "rav4-limited-i4-4wd-4-speed-automatic" keeps its whole tail in the model.
 * That is good enough for what it is used for — screening a car for a VDP
 * fetch, and giving classifyEv a nameplate to match — and every car that earns
 * a VDP has its make and model replaced by the page's own Make and Model rows
 * before anything is classified or published.
 */
export function parseAutoCornerSlug(url) {
  let slug;
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\/vehicles\/([^/?#]+)/i);
    if (!m) return undefined;
    slug = decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return undefined;
  }
  const vm = slug.match(SLUG_VIN_RE);
  if (!vm) return undefined;
  const vin = vm[1].toUpperCase();
  if (!VIN_RE.test(vin)) return undefined;

  let rest = slug.slice(vm[1].length).replace(/^-/, "");
  const ym = rest.match(SLUG_YEAR_RE);
  const year = ym?.[1];
  if (ym) rest = rest.slice(ym[1].length).replace(/^-/, "");

  let make;
  let model;
  for (const [key, canonical] of MAKE_SLUGS) {
    if (rest === key || rest.startsWith(`${key}-`)) {
      // The catalogue spelling, not the slug's: lib/makes.mjs's allowlist
      // compares uppercase-exact, so "Mercedes Benz" is an unrecognised make
      // and "Mercedes-Benz" is not. titleCase leaves the hyphen alone.
      make = titleCase(canonical);
      model = spaced(rest.slice(key.length).replace(/^-/, ""));
      break;
    }
  }
  if (make === undefined) {
    // Not a make this project recognises (MG, Sterling, a coachbuilder). The
    // slug grammar still puts the make first, so the first word is read as one
    // and lib/makes.mjs's allowlist decides downstream — vpic-enrich repairs it
    // from the VIN, and ingest drops what is still unrecognised. Inventing a
    // make here would be worse than handing over what the URL said.
    const [first, ...tail] = rest.split("-");
    make = first ? titleCase(first) : undefined;
    model = spaced(tail.join("-"));
  }
  model = model ? titleCase(model) : undefined;
  const name = [year, make, model].filter(Boolean).join(" ") || undefined;
  return { vin, year, make, model, name, slug };
}

/**
 * Every VIN'd VDP in one rooftop's sitemap, as schema.org-shaped nodes. No
 * price, no odometer, no colours: the sitemap carries a URL and nothing else,
 * and a node that claimed more would be inventing it.
 *
 * `scopeUrl` is any URL on the rooftop (pullAutoCorner passes the sitemap's
 * own final URL): entries on another host are skipped, because a sitemap
 * listing someone else's cars is not this dealer's lot and following one would
 * attribute another dealer's inventory to this domain. Omit it and every
 * /vehicles/ entry is read, which is what the unit tests want.
 */
export function autoCornerVehicles(xml, scopeUrl) {
  const out = [];
  const seen = new Set();
  const home = apexOf(scopeUrl);
  for (const loc of sitemapLocs(xml)) {
    if (!/\/vehicles\//i.test(loc)) continue;
    if (home && apexOf(loc) !== home) continue;
    const slug = parseAutoCornerSlug(loc);
    if (!slug || seen.has(slug.vin)) continue;
    seen.add(slug.vin);
    out.push({
      "@type": "Vehicle",
      vehicleIdentificationNumber: slug.vin,
      vehicleModelDate: slug.year,
      brand: slug.make,
      model: slug.model,
      name: slug.name,
      // Not schema.org. The raw hyphenated slug, kept on the node so the
      // candidate test below can read nameplates the spaced `name` destroys:
      // EVISH_RE knows "e-tron", "mach-e" and "id-4", and "E Tron" matches
      // none of them. normalize() ignores properties it does not name.
      slug: slug.slug,
      offers: { "@type": "Offer", priceCurrency: "USD", url: loc },
    });
  }
  return out;
}

function apexOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return undefined;
  }
}

// Same rule as autofunds.mjs's ELECTRIFIED_TEXT_RE, kept here rather than
// imported because that module does not export it. The slug is the only text
// this lane has before a VDP is fetched, so the candidate net is deliberately
// wide: EVISH_RE (lib/sitemap.mjs's URL-shaped nameplate list, which is what
// knows the hyphenated spellings) OR any electrification word at all.
const ELECTRIFIED_TEXT_RE = /electric|\bev\b|\bphev\b|plug[\s-]?in|hybrid|\bkwh\b|\bbev\b/i;

/**
 * Does this car earn one VDP request? Mirrors autoFundsNeedsVdp: classifyEv's
 * verdict, or an EV-only WMI, or any electrified hint in the car's own text.
 *
 * Wide on purpose and measured: EVISH_RE's `i[45x]\b` matches the engine label
 * in westsidecars.com's "…-rav4-limited-i4-4wd-…" slugs, so 6 of that
 * rooftop's 153 cars are fetched for nothing. A wasted fetch is the cheap
 * error here; the expensive one is never opening the page of a Focus Electric
 * whose slug this project's nameplate list does not know.
 */
export function autoCornerNeedsVdp(v, isEv) {
  if (isEv) return true;
  const vin = String(v?.vehicleIdentificationNumber ?? "").toUpperCase();
  if (vin.length === 17 && EV_ONLY_WMIS.has(vin.slice(0, 3))) return true;
  const hay = [v?.name, v?.model, v?.slug, v?.description, v?.vehicleEngine?.name]
    .filter(Boolean)
    .join(" ");
  return evish(hay) || ELECTRIFIED_TEXT_RE.test(hay);
}

const stripTags = (s) => String(s ?? "").replace(/<[^>]*>/g, " ");

const clean = (s) =>
  // decodeEntities (lib/sitemap.mjs) does not know &nbsp; by name, and this
  // platform prints it inside details values — untreated it survives into an
  // exterior colour and into the price row.
  decodeEntities(stripTags(s).replace(/&nbsp;/gi, " "))
    .replace(/ /g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

// The two spans are adjacent siblings on every template sampled. Tolerant of
// whitespace, attribute order and extra classes; deliberately NOT tolerant of
// anything between them, because a span2 that is not this span1's partner is a
// different row's value.
const DETAILS_ROW_RE =
  /<span[^>]*\bdetails_item_span1\b[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*\bdetails_item_span2\b[^>]*>([\s\S]*?)<\/span>/gi;

/**
 * The VDP's labelled details table as {label → value}, labels normalised to
 * lowercase words ("Stock #" → "stock", "MPG City" → "mpg city").
 *
 * A label that appears twice keeps the FIRST value and records nothing about
 * the second: two answers to one question is not an answer, and every consumer
 * below either abstains on a mismatch or reads a field where a repeat has never
 * been seen. (autoCornerPrice does its own multi-amount check on the row text.)
 */
export function autoCornerDetails(html) {
  const out = {};
  if (typeof html !== "string") return out;
  for (const m of html.matchAll(DETAILS_ROW_RE)) {
    const label = clean(m[1]).toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s{2,}/g, " ").trim();
    if (!label) continue;
    const value = clean(m[2]);
    if (!(label in out)) out[label] = value;
  }
  return out;
}

// A number beside a period word is a payment, not an ask — never seen on this
// platform, and the reason it is checked anyway is written out in the header.
const PERIOD_RE = /\/\s*(?:mo|wk|week|month)|\bper\s+(?:month|week|mo)\b|\bmonthly\b|\bweekly\b|\bbi-?weekly\b|\bo\.?a\.?c\.?\b/i;

/**
 * The advertised asking price off the "Price" row, or undefined for an
 * abstain. Requires a dollar sign: "Call For Price" is a live value on this
 * platform and it is not a number we may invent one from.
 */
export function autoCornerPrice(html) {
  const row = autoCornerDetails(html).price;
  if (!row) return undefined;
  if (PERIOD_RE.test(row)) return undefined;
  const amounts = [...row.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const distinct = [...new Set(amounts)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

const num = (v) => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// "61,890 Miles". A row denominated in kilometres would be a different number
// in the same field, so it is refused rather than converted.
const odometer = (raw) => (raw && !/\bkms?\b|kilomet/i.test(raw) ? num(raw) : undefined);

const meta = (html, prop) =>
  html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ??
  html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${prop}["']`, "i"))?.[1];

/**
 * What one VDP adds to its sitemap row: the advertised price (or an abstain),
 * the details table's own make/model/odometer/colours, and the hero photo.
 *
 * `year` is the slug's model year, used only for the price floor. No condition
 * is returned — see the header.
 */
export function autoCornerVdpFacts(html, { year } = {}) {
  if (typeof html !== "string") return {};
  const d = autoCornerDetails(html);
  const vin = String(d.vin ?? "").toUpperCase();
  const rowYear = num(d.year);
  // The page's own model year outranks the slug's for the floor: the slug is a
  // URL a back office generated, the row is the record.
  const floor = priceFloor({ isNew: false, year: rowYear ?? year });
  const priced = autoCornerPrice(html);
  const ok = priced != null && priced >= floor;
  const hero = meta(html, "og:image");
  const desc = meta(html, "og:description");
  return {
    // Not the slug's VIN — this is what the page says it is, so pullAutoCorner
    // can refuse to merge a page that is a different car.
    vin: VIN_RE.test(vin) ? vin : undefined,
    // 0 is an abstain: keep the car, make no price claim.
    priceUsd: ok ? priced : 0,
    priceProvenance: ok ? AUTOCORNER_PRICE : undefined,
    make: d.make || undefined,
    model: d.model || undefined,
    year: rowYear,
    stockNumber: d.stock || undefined,
    mileage: odometer(d.odometer),
    exteriorColor: d["exterior color"] || undefined,
    interiorColor: d["interior color"] || undefined,
    driveLine: d["drive train"] || undefined,
    transmission: d.transmission || undefined,
    bodyStyle: d.body || undefined,
    engine: d.engine || undefined,
    images: stabilizeImages([hero].filter(Boolean)),
    description: desc ? decodeEntities(desc) : undefined,
  };
}

/** Merge one car's VDP facts into the schema.org node, BEFORE classification. */
export function applyAutoCornerVdp(vehicle, facts) {
  if (!facts) return vehicle;
  const v = { ...vehicle };
  // The page's Make and Model rows are the record; the slug was a URL. "F 150"
  // becomes "F-150", and westsidecars.com's "Rav4 Limited I4 4wd 4 Speed
  // Automatic" becomes "RAV4".
  if (facts.make) v.brand = facts.make;
  if (facts.model) v.model = facts.model;
  if (facts.year != null) v.vehicleModelDate = String(facts.year);
  if (facts.make || facts.model) {
    v.name = [v.vehicleModelDate, v.brand, v.model].filter(Boolean).join(" ");
  }
  if (facts.mileage != null) v.mileageFromOdometer = { "@type": "QuantitativeValue", value: facts.mileage };
  if (facts.exteriorColor) v.color = facts.exteriorColor;
  if (facts.interiorColor) v.vehicleInteriorColor = facts.interiorColor;
  if (facts.driveLine) v.driveWheelConfiguration = facts.driveLine;
  if (facts.transmission) v.vehicleTransmission = facts.transmission;
  if (facts.bodyStyle) v.bodyType = facts.bodyStyle;
  if (facts.stockNumber) v.sku = facts.stockNumber;
  if (facts.description) v.description = facts.description;
  if (facts.images?.length) v.image = facts.images;
  // name only. NOT fuelType — the header says why, and says what changing it
  // would cost.
  if (facts.engine) v.vehicleEngine = { "@type": "EngineSpecification", name: facts.engine };
  return v;
}

/** Merge the VDP's facts into the normalized record. Price is set here rather
 *  than on the Offer node because an abstain is 0 and normalize() drops a
 *  non-positive price — the same reason enrichFromAutoFunds does it here. */
export function enrichFromAutoCorner(rec, facts) {
  if (!facts) return rec;
  return {
    ...rec,
    priceUsd: facts.priceUsd,
    priceProvenance: facts.priceProvenance,
    stockNumber: facts.stockNumber ?? rec.stockNumber,
    exteriorColor: facts.exteriorColor ?? rec.exteriorColor,
    interiorColor: facts.interiorColor ?? rec.interiorColor,
    platform: "autocorner",
  };
}

const MAX_CHILD_SITEMAPS = 5;

/**
 * The rooftop's sitemap, in one request on the common path.
 *
 * /sitemap.xml is what robots.txt names on every rooftop checked, so it is
 * tried first and answers 200 for 23 of the 24 in the cohort. Only when it is
 * not a sitemap is robots.txt read for a `Sitemap:` line — an extra request
 * spent on a rooftop that would otherwise be a silent zero.
 *
 * A <sitemapindex> is followed one level (capped): none has been seen on this
 * platform, and the alternative to handling one is reporting `found: 0` on a
 * lot that is really there.
 */
async function readSitemap(origin) {
  const tried = new Set();
  let requests = 0;
  const get = async (url) => {
    if (tried.has(url)) return undefined;
    tried.add(url);
    requests++;
    return fetchPage(url);
  };

  let res = await get(autoCornerSitemapUrl(origin));
  if (!(res?.status === 200 && isSitemap(res.body))) {
    const robots = await get(String(origin).replace(/\/+$/, "") + "/robots.txt");
    const declared = (robots?.body ?? "")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*sitemap:\s*(\S+)/i)?.[1])
      .filter(Boolean);
    res = undefined;
    for (const url of declared) {
      const r = await get(url);
      if (r?.status === 200 && isSitemap(r.body)) {
        res = r;
        break;
      }
    }
  }
  if (!res) return { ok: false, xml: undefined, scope: undefined, requests };

  // Scope the VDP URLs to the host that SERVED the sitemap, not the one asked
  // for. commonwealthmotorcars.com redirects the whole site to
  // commonwealthmotorcarsva.com (2026-08-31), and scoping to the requested
  // origin would throw that rooftop's entire lot away as "another dealer's".
  const scope = res.finalUrl ?? autoCornerSitemapUrl(origin);
  let xml = res.body;
  if (!/\/vehicles\//i.test(xml) && /<sitemapindex\b/i.test(xml)) {
    const children = sitemapLocs(xml)
      .filter((u) => /\.xml(\.gz)?$/i.test(u))
      .slice(0, MAX_CHILD_SITEMAPS);
    const parts = [];
    for (const child of children) {
      const r = await get(child);
      if (r?.status === 200 && isSitemap(r.body)) parts.push(r.body);
    }
    if (parts.length) xml = parts.join("\n");
  }
  return { ok: true, xml, scope, requests };
}

/**
 * One rooftop's whole lot from its sitemap, plus a VDP for each car that could
 * be electrified.
 *
 * `keep` decides which cars earn a VDP fetch; crawl.mjs passes classifyEv's
 * verdict through autoCornerNeedsVdp, and a caller that passes nothing gets the
 * same rule applied to the slug alone.
 *
 * COMPLETENESS SEMANTICS, matched to pullAutoFunds exactly:
 *   `complete` says the WHOLE-LOT DOOR answered and parsed — that is what
 *   licenses db-sync to retire this rooftop's missing VINs, and the VIN set is
 *   the sitemap's. A VDP that fails costs THAT CAR its price, not the run its
 *   completeness, so `complete` stays true and the failure is reported
 *   separately as `vdpFailures`. The caller must turn a non-zero vdpFailures
 *   into report.stoppedEarly, exactly as crawl.mjs's autofunds branch does —
 *   a car with no price is dropped by ingest, which puts a hole in the VIN set
 *   this run certifies, and db-sync must not read that hole as "sold".
 */
export async function pullAutoCorner(origin, { keep } = {}) {
  const sm = await readSitemap(origin);
  let requests = sm.requests;
  if (!sm.ok) {
    // Same shape either way, so a caller destructuring vdpFailures does not
    // read undefined off a failed pull and conclude nothing went wrong.
    return {
      ok: false, complete: false, found: 0, vehicles: [],
      factsByVin: new Map(), requests, vdpFailures: 0, candidates: 0,
    };
  }

  const all = autoCornerVehicles(sm.xml, sm.scope);
  const wanted = keep ?? ((v) => autoCornerNeedsVdp(v, false));
  const factsByVin = new Map();
  const vehicles = [];
  let vdpFailures = 0;
  let candidates = 0;
  for (const v of all) {
    if (!wanted(v)) {
      vehicles.push(v);
      continue;
    }
    candidates++;
    const url = v.offers?.url;
    if (!url) {
      vehicles.push(v);
      continue;
    }
    const vdp = await fetchPage(url);
    requests++;
    if (vdp.status !== 200 || !vdp.body) {
      vdpFailures++;
      vehicles.push(v);
      continue;
    }
    const facts = autoCornerVdpFacts(vdp.body, { year: v.vehicleModelDate });
    // The page states its own VIN. A page whose VIN is not the one the sitemap
    // slug promised is a different car (or a redirect to a replacement), and
    // merging its price onto this VIN would publish one car's ask under
    // another's. Treated as an unread VDP, not as data.
    if (facts.vin && facts.vin !== v.vehicleIdentificationNumber) {
      vdpFailures++;
      vehicles.push(v);
      continue;
    }
    factsByVin.set(v.vehicleIdentificationNumber, facts);
    vehicles.push(applyAutoCornerVdp(v, facts));
  }
  return { ok: true, complete: true, found: all.length, vehicles, factsByVin, requests, vdpFailures, candidates };
}

/** Probe helper: does this rooftop's sitemap carry VIN'd inventory? One
 *  request when /sitemap.xml is the door, which it is on every rooftop
 *  checked; up to three when it is not. */
export async function countAutoCorner(origin) {
  const sm = await readSitemap(origin);
  if (!sm.ok) return { ok: false, found: 0, hasVin: false };
  const vehicles = autoCornerVehicles(sm.xml, sm.scope);
  return { ok: true, found: vehicles.length, hasVin: vehicles.length > 0 };
}
