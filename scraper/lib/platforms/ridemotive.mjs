// Motive (app.ridemotive.com) — a Next.js dealer-website platform whose
// rooftops render NO inventory in HTML. Every car on the site comes from one
// public Algolia index, and the client config that reaches it is inline in
// every page:
//
//   POST https://{APP_ID}-dsn.algolia.net/1/indexes/{INDEX}/query
//        ?x-algolia-api-key={SEARCH_KEY}&x-algolia-application-id={APP_ID}
//   {"query":"","filters":"is_active:true AND dealer_ids:\"2766\"",
//    "page":0,"hitsPerPage":1000}
//
// captured off the rooftop's own SRP in a real browser (2026-08-23,
// rustydrewingpreowned.com) — a static probe cannot see it, which is why 14
// Motive rooftops sat in needs-investigation with "0 VIN vehicles in 12
// fetches" while their inventory was one request away.
//
// The index is GLOBAL: `production-inventory-global_make_year_desc` holds
// 322,961 active vehicles across every Motive dealer, and a rooftop is one
// `dealer_ids` value inside it. So the filter is load-bearing in a way the
// Overfuel/DealerVenom lanes' per-dealer endpoints are not — an unfiltered
// pull would attribute the whole platform's inventory to one dealer's domain.
// The filter is built ONLY from the dealer id this site published about
// itself, and the id is checked to be a plain integer before it goes anywhere
// near the query.
//
// WHY dealer.id ALONE, not the group's child_ids. A Motive group rooftop
// carries `"is_group":true,"child_ids":[2970]` beside its own id, and the
// union of parent+children returns MORE cars than the site shows (350 vs
// 244 on rustydrewingpreowned.com). The rooftop's own SRP queries
// dealer_ids:"2766" and nothing else — captured from the page, then checked
// against what the page prints: "Search 244 results on this page" against
// nbHits 244 for that exact filter. Pulling the children too would publish
// cars under a domain that does not list them. (Cars the child dealer shares
// UP to the parent already carry the parent's id in their own `dealer_ids`
// array, which is why 244 is bigger than the 94 cars unique to 2766.)
//
// Robots: the rooftops' robots.txt allows /inventory/ (it disallows only
// /inventory/*/start-deal, window-sticker, brochure and friends); the Algolia
// host is reached through politePostJson, which checks its robots.txt like any
// other host.
//
// WHAT THIS LANE DOES NOT DO, and it is the bigger number. The index is
// national: 322,961 active vehicles, of which 9,254 are electric by the
// platform's own fuel roll-up, spread over more than 1,000 distinct
// `dealership` values (the facet caps at 1,000, so that is a floor, not a
// count). The 14 rooftops the registry knows account for 7,440 of those
// vehicles and 65 of the EVs, walked one by one — the 6,380/56 quoted in this
// lane's commit message was the first eleven, before the three rooftops that
// needed a second, serial probe were measured. Reaching the rest needs a
// dealer id → public
// domain mapping, and the record does not carry one: it has `dealership` (a
// name) and `dealer_ids`, and the config's `dealer.domain` is sometimes a
// platform-internal host (rustydrewingmb.app.ridemotive.com). The platform's
// own /dealers/{id} endpoint answers 401 to our declared identity, so that
// door is closed and stays closed. The open path is the one the project
// already has — resolve-dealers.mjs turns dealer NAMES into domains, and
// probe.mjs validates them — which is a discovery-lane job, not this file's.
import { politePostJson } from "../http.mjs";
import { stabilizeImages } from "../images.mjs";
import { conditionToken } from "../condition.mjs";
import { MOTIVE_PRICE } from "../price-provenance.mjs";

// Specific platform hosts, not a brand substring: several of these rooftops
// also fingerprint as dealerinspire/dealer.com/dealeron on a loose match
// (their pages carry those vendors' widgets), and finding #4 of api-leads.mjs
// is that a cohort must be fingerprinted on the host that actually serves it.
const ASSET_RE = /(?:api|assets|images|echo|bronco)\.app\.ridemotive\.com/i;

// Motive's edge answers a rate challenge with HTTP 200 and a ~20 KB
// "Checking your browser - reCAPTCHA" page in place of ANY page on ANY of its
// hundreds of rooftop hostnames — it meters the aggregate rate against the one
// origin behind them all, which a per-host limiter cannot see (measured
// 2026-08-24 building the dealer-graph lane: 83% of fetches challenged at
// concurrency 10, 29% at 2; the same URL answered in full seconds later). To
// a crawl this page is indistinguishable from a rooftop that publishes
// nothing: isRideMotive() never fires, the walk certifies a complete 0-car
// visit, and db-sync would DELIST the rooftop's live cars. The crawl re-asks
// with backoff (same identity, same URL — a slower ask is not evasion) and
// refuses to certify the visit if the edge still won't answer.
export const MOTIVE_CHALLENGE_RE = /recaptcha\/challengepage|Checking your browser - reCAPTCHA/i;
export function isMotiveChallenge(html) {
  return typeof html === "string" && html.length < 200000 && MOTIVE_CHALLENGE_RE.test(html);
}

export function isRideMotive(html) {
  return typeof html === "string" && ASSET_RE.test(html);
}

// The page's own JSON is served twice — once as real JSON in a <script>, once
// escaped inside the RSC flight payload — so every key here is matched with
// an optional backslash before each quote.
const q = (name) => String.raw`\\?"${name}\\?"`;
const strVal = String.raw`\\?"([^"\\]{1,120})\\?"`;

const grab = (html, name, valuePattern) => html.match(new RegExp(`${q(name)}\\s*:\\s*${valuePattern}`))?.[1];

// The Algolia client config + the dealer this site is. Returns null unless
// EVERY part is present and well-formed: the app id becomes a hostname and the
// key and index become URL path/query, so each is validated against a strict
// charset rather than trusted because it came off the page.
//
// The index name is the env prefix ("production-inventory-") plus the segment
// the client appends. Only the sorted replicas exist — a query against the
// bare `production-inventory-global` 404s ("Index does not exist") — so the
// replica the site itself queries is the one we ask for.
const INDEX_SUFFIX = "global_make_year_desc";

export function rideMotiveConfig(html) {
  if (!isRideMotive(html)) return null;
  const appId = grab(html, "ALGOLIA_APP_ID", strVal);
  const apiKey = grab(html, "ALGOLIA_API_KEY", strVal);
  const prefix = grab(html, "ALGOLIA_INVENTORY_INDEX", strVal);
  // `"dealer":{"id":N` — the rooftop's own identity block, which also carries
  // its canonical domain. Deliberately anchored on the `dealer` key: bare
  // "dealer_id" appears on dozens of unrelated objects in the same payload
  // (analytics tags, banners, child dealers), and any of those could be a
  // sibling rooftop's id.
  const dealerId = html.match(new RegExp(`${q("dealer")}\\s*:\\s*\\{${q("id")}\\s*:\\s*(\\d{1,9})\\b`))?.[1];
  if (!appId || !apiKey || !prefix || !dealerId) return null;
  if (!/^[A-Z0-9]{6,24}$/.test(appId)) return null;
  if (!/^[a-f0-9]{16,64}$/i.test(apiKey)) return null;
  const index = `${prefix}${INDEX_SUFFIX}`;
  if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(index)) return null;
  return {
    appId,
    apiKey,
    index,
    dealerId: Number(dealerId),
    // Reported, never used to build a request: it is how a caller can tell
    // that the domain in the registry redirects to the rooftop's canonical one
    // (subaruoftwinfalls.com serves twinfalls-subaru.com).
    dealerDomain: grab(html, "domain", strVal),
    imageBase: grab(html, "IMAGE_BASE_URL", strVal),
  };
}

const IMAGE_BASE_DEFAULT = "https://images.app.ridemotive.com";
const IMAGE_HOST_RE = /^https:\/\/[a-z0-9-]+\.app\.ridemotive\.com$/i;
const API_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const numOrU = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// The VDP path. The site slugs its own canonical URL as
// "{Condition}-{Year}-{Make}-{Model}-{Trim}-{VIN}", joined by hyphens, with
// every character inside a component that is not a letter, digit or hyphen
// replaced by an underscore.
//
// That rule was not guessed: /inventory/{VIN} answers 308 with the canonical
// slug in its Location header, so the site itself was asked. A first pass
// substituting only whitespace matched 9 of 12 sampled cars on
// twinfalls-subaru.com and missed the ones with a decimal in the trim
// ("3.6L V6 SEL Premium" → `3_6L_V6_SEL_Premium`, not `3.6L…`); asking for
// the noisiest trim in the lot settled the general rule
// ("SEL 2.5L *Ltd Avail*" → `SEL_2_5L__Ltd_Avail_`). A hyphen inside a make
// survives ("Mercedes-Benz"), which is why hyphen is excluded from the
// substitution.
//
// A component that is empty, or that holds a character outside printable
// ASCII (never observed, therefore never checked against the site), falls
// back to /inventory/{VIN} — a real permanent redirect to the canonical page
// rather than a guess at it.
const SLUG_CHECKED = /^[\x20-\x7E]+$/;

export function vdpPath(r) {
  const vin = String(r?.vin ?? "").toUpperCase();
  if (!API_VIN_RE.test(vin)) return null;
  const raw = [r.car_condition, r.make_year, r.make, r.model, r.car_trim].map((p) =>
    p == null ? "" : String(p).trim(),
  );
  if (raw.every((p) => p && SLUG_CHECKED.test(p))) {
    return `/inventory/${raw.map((p) => p.replace(/[^A-Za-z0-9-]/g, "_")).join("-")}-${vin}`;
  }
  return `/inventory/${vin}`;
}

// One Algolia record → a schema.org Vehicle node, shaped like the Overfuel /
// DealerOn / dealer.com producers so it flows through the same
// classifyEv → normalize path. Field names are from live documents.
export function apiVehicleNode(r, origin, imageBase = IMAGE_BASE_DEFAULT) {
  const vin = String(r?.vin ?? "").toUpperCase();
  if (!API_VIN_RE.test(vin)) return null;

  // `price` is the FINAL price the VDP prints, not a teaser. Measured on
  // rustydrewingpreowned.com 2026-08-23: the rendered ladder reads
  // "Our Price $54,987 · Admin Fee +$299 · Final Price $55,286" and the
  // record's `price` is 55286 — the top of the ladder, the unconditional
  // number. `feed_price` is the 54,987 rung and is NOT used: the house rule's
  // asymmetry says never publish the lower, fee-excluding figure as the ask.
  // `msrp`, `discount_price`, `rebate_price`, `book_value` and `cost` are
  // likewise left alone — none of them is what the shopper is asked to pay.
  const price = numOrU(r.price);

  // The machine token, not a display string: the whole index carries exactly
  // two values, "New" and "Used" (facet count over 322,961 active records,
  // 2026-08-23). conditionToken still mediates, so an unrecognised value
  // becomes undefined instead of a "used" claim — see ../condition.mjs.
  const cond = conditionToken(r.car_condition);

  const base = IMAGE_HOST_RE.test(String(imageBase ?? "")) ? imageBase : IMAGE_BASE_DEFAULT;
  const images = stabilizeImages(
    (Array.isArray(r.images) ? r.images : [])
      .filter((k) => typeof k === "string" && /^[a-z0-9]{8,64}$/i.test(k))
      .map((k) => `${base}/${k}`),
  );

  const path = vdpPath(r);
  let url = origin;
  try {
    url = new URL(path, origin).toString();
  } catch {}

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: r.make_year != null ? String(r.make_year) : undefined,
    brand: r.make || undefined,
    model: r.model || undefined,
    vehicleConfiguration: r.car_trim || undefined,
    // The site's own vehicle title is year + make + model + trim, so that is
    // what the name is. It costs a few decodes: `car_trim` is a raw feed
    // passthrough that often carries engine text, and "4dr Sdn I4 CVT LX"
    // hands classifyEv the token "I4" — 4 petrol cars of 471 on
    // twinfalls-subaru.com arrive name-matched as a BMW i4 that way. Dropping
    // the trim from the name would silence them, and it would also silence
    // the cars whose ONLY electric signal is in the trim (an XC40 whose model
    // is "XC40" and whose trim is "Recharge"), while their dealer's fuel
    // string says something else. Over-capture is the cheap direction here —
    // vpic-enrich refutes a name_match and ingest holds it until then, the
    // same trade ev.mjs documents for the XC40/Matrix false matches.
    name: [r.make_year, r.make, r.model, r.car_trim].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer:
      numOrU(r.odometer) != null ? { "@type": "QuantitativeValue", value: Number(r.odometer) } : undefined,
    color: r.exterior_color || undefined,
    vehicleInteriorColor: r.interior_color || undefined,
    driveWheelConfiguration: r.drivetrain || undefined,
    sku: r.stock_number ? String(r.stock_number) : undefined,
    image: images.length ? images : undefined,
    ...(cond ? { itemCondition: cond } : {}),
    // Certification is a warranty claim, so it comes only from the platform's
    // own CPO flags — never from the slug, which says "Used" on a CPO car.
    ...(r.cpo === true || r.oem_certified === true ? { certified: true } : {}),
    // The dealer's OWN fuel string, passed through untouched: classifyEv
    // decides what is electric, nothing here pre-judges it. The platform also
    // publishes a rolled-up `standardized_fuel_type`, and it is deliberately
    // NOT used — its "Electric" bucket contains 64 records whose dealer-stated
    // fuel is "HEV" and 256 whose is "Electric / Premium Unleaded" (measured
    // over the live index, 2026-08-23), so feeding it in would hand classifyEv
    // the word "electric" for cars their own dealers call hybrids.
    fuelType: r.fuel_type || undefined,
    vehicleEngine: { "@type": "EngineSpecification", fuelType: r.fuel_type || undefined },
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: MOTIVE_PRICE,
      priceCurrency: "USD",
      url,
      // The record's own selling dealer, which on a group rooftop is the
      // child store the car physically sits at ("Mercedes-Benz of Columbia"
      // on a car listed by Rusty Drewing Pre-Owned). No address: the record
      // carries none, and the site config's address belongs to the parent.
      seller: r.dealership ? { "@type": "AutoDealer", name: String(r.dealership) } : undefined,
    },
  };
}

// Algolia's own paging cap on this index is 20 pages (nbPages is 20 at
// hitsPerPage 1000, on 322,961 hits) = 20,000 records, far past any rooftop.
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

function queryUrl(config) {
  return (
    `https://${config.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${encodeURIComponent(config.index)}/query` +
    `?x-algolia-api-key=${encodeURIComponent(config.apiKey)}&x-algolia-application-id=${encodeURIComponent(config.appId)}`
  );
}

// The one filter this lane ever sends. `dealerId` is a Number by construction
// (rideMotiveConfig parses \d{1,9}), so nothing from the page can reach the
// filter string as text.
const dealerFilter = (dealerId) => `is_active:true AND dealer_ids:"${Number(dealerId)}"`;

async function search(config, page, hitsPerPage) {
  return politePostJson(queryUrl(config), {
    body: { query: "", filters: dealerFilter(config.dealerId), page, hitsPerPage },
  });
}

/** Page a rooftop's inventory to completion, as schema.org Vehicle nodes.
 *
 *  `complete` is true only when the walk REACHED THE LAST PAGE — a page
 *  shorter than the page size, which includes a clean empty lot — never count
 *  arithmetic against nbHits. A per-rooftop query does answer
 *  `exhaustive.nbHits: true` (the unfiltered whole-index one answers false),
 *  but the counts still do not line up with what we emit: twinfalls-subaru's
 *  477 hits include 6 UTVs whose "VIN" is a 11-character serial, so 471 nodes
 *  is the correct, complete answer there and an nbHits test would have called
 *  it a short read forever. A mid-stream error or the paging cap leaves
 *  complete=false, so crawl.mjs reports truncated and db-sync never delists a
 *  lot we merely failed to finish reading. */
// `deadlineAt` is the crawl's per-domain clock, checked between pages: each
// page is a 20-second-timeout request and a lot can be 30 pages, so on a
// slow Algolia night one rooftop is a ten-minute tail — the two stragglers
// that pushed rolling-crawl slices past their job timeout on 2026-09-03 and
// 2026-09-04 were both this pull. Past the deadline the pull returns what it
// has, complete=false, and recheck retires per VIN.
export async function pullRideMotiveApi(config, origin, { deadlineAt = 0 } = {}) {
  const out = [];
  let found = 0;
  let ok = false;
  let reachedEnd = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (deadlineAt && Date.now() > deadlineAt) break;
    const { status, json } = await search(config, page, PAGE_SIZE);
    if (status !== 200 || !json || !Array.isArray(json.hits)) break;
    ok = true;
    if (Number.isFinite(json.nbHits)) found = json.nbHits;
    for (const r of json.hits) {
      const node = apiVehicleNode(r, origin, config.imageBase);
      if (node) out.push(node);
    }
    if (json.hits.length < PAGE_SIZE) {
      reachedEnd = true;
      break;
    }
  }

  return { vehicles: out, complete: ok && reachedEnd, found: found || out.length, ok };
}

/** Cheap liveness check for probe.mjs: one request, does this rooftop hold
 *  VIN'd inventory? The full paged pull happens later, in the nightly crawl. */
export async function countRideMotiveApi(config) {
  const { status, json } = await search(config, 0, 3);
  if (status !== 200 || !json || !Array.isArray(json.hits)) return { ok: false, found: 0, hasVin: false };
  const hasVin = json.hits.some((r) => API_VIN_RE.test(String(r?.vin ?? "").toUpperCase()));
  return { ok: true, found: Number.isFinite(json.nbHits) ? json.nbHits : json.hits.length, hasVin };
}
