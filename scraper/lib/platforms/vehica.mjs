// Vehica — a commercial WordPress car-dealership theme (wp-content/themes/
// vehica + wp-content/plugins/vehica-core). Found on getusedtesla.com, a
// Fresno CA Tesla-only retailer.
//
// WHY THE CRAWL SEES NOTHING
//
// Its VDPs carry no JSON-LD at all: the car is a label/value table
// ("VIN:" / "5YJ…", "Mileage:" / "69,442 miles") rendered by an Elementor
// layout, so lib/jsonld.mjs extracts zero from a page that is plainly a
// vehicle detail page.
//
// THE DOOR
//
// The theme stores cars as a WordPress custom post type, and WordPress exposes
// custom post types through its own REST API — which robots.txt leaves open
// here (its only rule is Disallow: /wp-admin/, with admin-ajax.php explicitly
// allowed). One paged request per hundred cars:
//
//   GET /wp-json/wp/v2/cars?per_page=100&page=N
//
// 413 records came out of getusedtesla.com in five requests (2026-08-24), each
// with a VIN, a price, a mileage and the taxonomy term ids for make, model,
// year, colour, condition and offer type.
//
// THE FIELD NAMES ARE PER-INSTALL, SO NOTHING HERE IS PINNED TO ONE
//
// Vehica numbers its custom fields and taxonomies when the site is built —
// `vehica_6671` happens to be VIN on this rooftop and `vehica_6664` mileage —
// so an extractor keyed on those ids would work on exactly one site and fail
// silently on the next. Everything below is resolved by SHAPE or by the
// platform's own published names instead:
//
//   * taxonomies: /wp-json/wp/v2/taxonomies gives each one a human `name`
//     ("Make", "Model", "Year", "Condition", "Offer Type"), and its terms
//     resolve id → name through /wp-json/wp/v2/{taxonomy}.
//   * VIN: the one scalar field whose value is a 17-character VIN.
//   * price: the one field that is an object holding a `vehica_currency_*` key.
//   * mileage: the one remaining scalar field that is a plain integer string.
//
// Each of those is required to be UNIQUE on the record, and a record with two
// candidates abstains on that field rather than pick one. Measured on
// getusedtesla.com's whole catalogue: 413 of 413 records have exactly one of
// each, and the mileage so identified matched the number the SRP prints on all
// ten cards of page one (69,442 / 7,245 / 7,728 / 11,403 / 22,576 / 25,605 /
// 2,845 / 8,767 / 43,378 / 35,763).
//
// SOLD CARS ARE IN THE FEED AND ON THE SITE
//
// This matters more here than anywhere else this project has met it. 398 of
// the 413 records are marked SOLD by the theme's own "Offer Type" taxonomy —
// and the site's listing page still counts them, printing "413 Results" over a
// grid that puts the 15 live ones first and then keeps going. Publishing what
// the site publishes would put 398 unbuyable cars on Voltcheck. The taxonomy
// has exactly three terms (ACTIVE, PENDING, SOLD), so the rule is positive
// rather than "not sold": a car is live when its Offer Type is empty or
// ACTIVE. PENDING and anything a later rooftop invents stay out.
//
// PRICE is the single value inside the currency object — $26,900 on
// 5YJYGDEE1MF087036, the number both the card and the VDP print.
//
// CONDITION is abstained. The theme HAS a Condition taxonomy, but on this
// rooftop its value is "Excellent" on all 413 cars: that is a quality grade,
// not a new/used token, and ../condition.mjs returns undefined for it by
// design. It is passed through so that a rooftop using the field for
// "New"/"Used" reaches the right answer, and so that "Excellent" reaches none.
import { VEHICA_PRICE } from "../price-provenance.mjs";
import { stabilizeImages } from "../images.mjs";
import { conditionToken } from "../condition.mjs";
import { politeGetJson } from "../http.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The theme's and its plugin's own asset paths. Never the bare word "vehica",
// which a dealer could put in its own copy.
const VEHICA_RE = /wp-content\/(?:themes|plugins)\/vehica/i;

export function isVehica(html) {
  return typeof html === "string" && VEHICA_RE.test(html);
}

// The custom post type's REST base on every Vehica install seen. Confirmed off
// /wp-json/wp/v2/types, where post type `vehica_car` reports rest_base "cars".
export const VEHICA_REST_PATH = "/wp-json/wp/v2/cars";

const FIELD_RE = /^vehica_\d+$/;

/** The one field on this record whose value is a VIN, or undefined if there is
 *  not exactly one. */
export function vehicaVin(rec) {
  const hits = Object.entries(rec ?? {})
    .filter(([k, v]) => FIELD_RE.test(k) && typeof v === "string" && VIN_RE.test(v.toUpperCase()))
    .map(([, v]) => v.toUpperCase());
  return hits.length === 1 ? hits[0] : undefined;
}

/** The one currency field's value, or undefined if there is not exactly one
 *  price on the record — see the header on abstaining rather than picking. */
export function vehicaPrice(rec) {
  const values = [];
  for (const [k, v] of Object.entries(rec ?? {})) {
    if (!FIELD_RE.test(k) || !v || typeof v !== "object" || Array.isArray(v)) continue;
    for (const [ck, cv] of Object.entries(v)) {
      if (!ck.startsWith("vehica_currency_")) continue;
      const n = Number(cv);
      if (Number.isFinite(n) && n > 0) values.push(n);
    }
  }
  return values.length === 1 ? values[0] : undefined;
}

/** The one plain-integer scalar field that is not the VIN: the odometer. */
export function vehicaMileage(rec) {
  const hits = Object.entries(rec ?? {})
    .filter(([k, v]) => FIELD_RE.test(k) && typeof v === "string" && /^\d{1,7}$/.test(v))
    .map(([, v]) => Number(v));
  return hits.length === 1 ? hits[0] : undefined;
}

/** The photo gallery: the one field that is an array of http(s) urls. Pinned
 *  to the rooftop's own origin, so a record that ever carried an off-site url
 *  cannot put a stranger's photo on a listing. */
export function vehicaImages(rec, origin) {
  let host;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return [];
  }
  const arrays = Object.entries(rec ?? {})
    .filter(([k, v]) => FIELD_RE.test(k) && Array.isArray(v) && v.length && v.every((u) => typeof u === "string" && /^https?:\/\//i.test(u)))
    .map(([, v]) => v);
  if (arrays.length !== 1) return [];
  return stabilizeImages(
    arrays[0].filter((u) => {
      try {
        return new URL(u).host.toLowerCase() === host;
      } catch {
        return false;
      }
    }),
  );
}

/** Taxonomy slug → human name, from the site's own /wp-json/wp/v2/taxonomies.
 *  Only the taxonomies attached to the car post type are kept. */
export function vehicaTaxonomyNames(json) {
  const out = new Map();
  for (const [slug, t] of Object.entries(json ?? {})) {
    if (!Array.isArray(t?.types) || !t.types.includes("vehica_car")) continue;
    if (typeof t?.name === "string" && t.name.trim()) out.set(slug, t.name.trim());
  }
  return out;
}

/** The term names a record carries for one taxonomy, joined. `terms` is that
 *  taxonomy's id → name map. */
function termNames(rec, slug, terms) {
  const ids = rec?.[slug];
  if (!Array.isArray(ids)) return undefined;
  const names = ids.map((i) => terms?.get(i)).filter((s) => typeof s === "string" && s.trim());
  return names.length ? names.join(" ") : undefined;
}

// Which taxonomy answers which question, by the platform's own published name.
const TAX = { make: /^make$/i, model: /^model$/i, year: /^year$/i, condition: /^condition$/i, offer: /^offer type$/i, color: /^colou?r$/i, battery: /^battery$/i };

/** Build a lookup from the taxonomy-name map: role → {slug, terms}. */
export function vehicaTaxonomyRoles(names, termsBySlug) {
  const roles = {};
  for (const [role, re] of Object.entries(TAX)) {
    for (const [slug, name] of names) {
      if (re.test(name)) {
        roles[role] = { slug, terms: termsBySlug?.get(slug) };
        break;
      }
    }
  }
  return roles;
}

// The one live-vs-sold rule, positive by construction — see the header.
const LIVE_OFFER = /^(?:|active)$/i;

export function vehicaIsLive(rec, roles) {
  if (rec?.status !== "publish") return false;
  const slug = roles?.offer?.slug;
  // A rooftop with no Offer Type taxonomy at all publishes only live cars as
  // far as anything here can tell; one that HAS the taxonomy must say ACTIVE
  // or nothing.
  if (!slug) return true;
  return LIVE_OFFER.test(termNames(rec, slug, roles.offer.terms) ?? "");
}

export function vehicaVehicle(rec, origin, roles = {}) {
  const vin = vehicaVin(rec);
  if (!vin) return null;
  const price = vehicaPrice(rec);
  const mileage = vehicaMileage(rec);
  const make = termNames(rec, roles.make?.slug, roles.make?.terms);
  const model = termNames(rec, roles.model?.slug, roles.model?.terms);
  const year = termNames(rec, roles.year?.slug, roles.year?.terms);
  // The theme's trim-ish taxonomy on this rooftop is "Battery"
  // ("Long Range AWD", "Plaid", "Foundation"), which is what its cards print
  // where a trim would go.
  const trim = termNames(rec, roles.battery?.slug, roles.battery?.terms);
  const cond = conditionToken(termNames(rec, roles.condition?.slug, roles.condition?.terms));
  const images = vehicaImages(rec, origin);
  const title = typeof rec?.title?.rendered === "string" ? rec.title.rendered.trim() : undefined;
  const url = typeof rec?.link === "string" ? rec.link : undefined;
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: year,
    brand: make,
    model,
    vehicleConfiguration: trim,
    // The post title is the car's own name on the site ("2021 Tesla Model Y
    // Long Range AWD"), and it is the fallback when a rooftop's taxonomies do
    // not resolve.
    name: title || [year, make, model, trim].filter(Boolean).join(" ") || undefined,
    ...(cond ? { itemCondition: cond } : {}),
    mileageFromOdometer:
      mileage != null ? { "@type": "QuantitativeValue", value: mileage, unitCode: "SMI" } : undefined,
    color: termNames(rec, roles.color?.slug, roles.color?.terms),
    image: images.length ? images : undefined,
    // No fuel field on this platform: classifyEv reads the nameplate, and
    // vpic-enrich confirms it. "The rooftop only sells Teslas" is a fact about
    // the rooftop, not about the record.
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? VEHICA_PRICE : undefined,
      priceCurrency: "USD",
      url,
    },
  };
}

const PER_PAGE = 100;
const MAX_PAGES = 40;

async function taxonomyRoles(origin) {
  const { status, json } = await politeGetJson(`${origin.replace(/\/$/, "")}/wp-json/wp/v2/taxonomies`);
  if (status !== 200 || !json) return { roles: {}, requests: 1 };
  const names = vehicaTaxonomyNames(json);
  const termsBySlug = new Map();
  let requests = 1;
  for (const slug of names.keys()) {
    const r = await politeGetJson(`${origin.replace(/\/$/, "")}/wp-json/wp/v2/${encodeURIComponent(slug)}?per_page=100`);
    requests++;
    if (r.status === 200 && Array.isArray(r.json)) {
      termsBySlug.set(slug, new Map(r.json.map((t) => [t.id, typeof t.name === "string" ? t.name.trim() : ""])));
    }
  }
  return { roles: vehicaTaxonomyRoles(names, termsBySlug), requests };
}

/** The whole lot, as schema.org Vehicle nodes.
 *
 *  `complete` is true only when the walk reached a short page — the WP REST
 *  API pages by count and answers an out-of-range page with a 400, so a short
 *  page is the end and a mid-walk failure is not. */
export async function pullVehica(origin) {
  const { roles, requests: taxRequests } = await taxonomyRoles(origin);
  const out = [];
  let found = 0;
  let ok = false;
  let reachedEnd = false;
  let requests = taxRequests;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { status, json } = await politeGetJson(
      `${origin.replace(/\/$/, "")}${VEHICA_REST_PATH}?per_page=${PER_PAGE}&page=${page}`,
    );
    requests++;
    if (status !== 200 || !Array.isArray(json)) break;
    ok = true;
    found += json.length;
    for (const rec of json) {
      if (!vehicaIsLive(rec, roles)) continue;
      const v = vehicaVehicle(rec, origin, roles);
      if (v) out.push(v);
    }
    if (json.length < PER_PAGE) {
      reachedEnd = true;
      break;
    }
  }
  return { ok, vehicles: out, found, complete: ok && reachedEnd, requests };
}

/** The probe's one-request settle.
 *
 *  `found` is the size of the FIRST PAGE, which is a floor and not a lot size:
 *  WordPress reports its total only in an X-WP-Total header this project's
 *  JSON helper does not carry, and the live-vs-sold split needs the taxonomy
 *  terms, which is three more requests than a probe should spend. The probe's
 *  note says "first page" out loud for that reason; the crawl's own note
 *  reports the real total and the live count. */
export async function countVehica(origin) {
  const { status, json } = await politeGetJson(`${origin.replace(/\/$/, "")}${VEHICA_REST_PATH}?per_page=${PER_PAGE}`);
  if (status !== 200 || !Array.isArray(json)) return { ok: false, found: 0, hasVin: false };
  return { ok: true, found: json.length, hasVin: json.some((r) => vehicaVin(r) != null) };
}
