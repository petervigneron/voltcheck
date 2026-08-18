// Lucid national inventory (buynow.lucidmotors.com).
//
// Lucid sells direct, so there are no franchised rooftops: one central pool,
// one API. lucidmotors.com/available-vehicles is an Astro island that reads
//   GET https://buynow.lucidmotors.com/api/v4/en_us/store/inventory/vehicles
//   GET https://buynow.lucidmotors.com/api/v4/en_us/store/inventory/vehicles/gravity
// with no auth token — open to plain Node. Control run from the same process on
// 2026-08-18: tesla.com's and ford.com's inventory APIs both answer the
// identical client with an Akamai 403 "Access Denied" while Lucid returns 200
// JSON, so this is an open endpoint, not a wall we slipped past. The host is an
// AWS API Gateway whose /robots.txt is 403 "Missing Authentication Token" (no route, therefore
// no stated policy); lucidmotors.com's own robots.txt allows /available-vehicles
// and /inventory-vehicle (it disallows *available-cars-1, a different page).
//
// THE PARAM THAT COST A PREVIOUS SESSION THE LANE: `sortType`. A 2026-08-16
// probe read the endpoint and its whole param vocabulary out of the island
// bundle, sent every plausible combination, and got `{"data":[]}` from all of
// them — and concluded the fetch must be gated behind a browser interaction.
// It is not. The service answers 200 with an EMPTY ARRAY when `sortType` is
// absent, and returns rows the moment you add `sortType=price&sortOrder=asc`.
// Nothing signals this: `lat`/`long` missing 422s by name, an unknown param
// 422s by name, an out-of-range `distance` 422s by name — but the one param
// that gates the whole result set fails silently. The working query was
// recovered by loading the live page and reading its own outbound request off
// `performance.getEntriesByType("resource")`, then replaying it verbatim from
// Node and bisecting it param by param. `zipState`/`zipCountry` are decoration;
// only sortType matters.
//
// Params that do matter, all read off the island bundle or the service's own
// Joi errors: lat/long (required), type (new|used|demo), distance (miles, max
// 10000 — more than enough to span the country from any US origin),
// requestedVehiclesNum (max 1000; the site asks for 72), sortType+sortOrder.
// Gravity lives on its own /gravity path, Air on the bare path — so, as with
// Genesis, querying the model paths IS the BEV filter. Both cars are BEV-only
// and vPIC confirms it per-VIN (Air WMI 50E, Gravity WMI 7UU, both decode
// FuelTypePrimary "Electric" / ElectrificationLevel "BEV").
//
// TWO LANES, because the endpoint answers two structurally different questions:
//
//   pullLucid()     used + demo, real domain lucidmotors.com, CERTIFIES COMPLETE
//   pullLucidNew()  new stock, synthetic domain "lucid-new", truncated ALWAYS
//
// The split is forced by a property of the service worth writing down: for NEW
// stock it is a CONFIGURATION CATALOGUE, not a vehicle list. It returns exactly
// one car per distinct build configuration — the one nearest the query point.
// Measured: a national Air/new sweep returns 129 rows from every US origin, and
// those 129 rows carry 129 distinct configurations (group-size histogram is
// {1: 129}); the sets from Dallas and Los Angeles differ by 5 VINs each way,
// and every swapped pair is the same trim with a nearer storage yard (LA sees
// San Diego cars, Dallas sees Houston cars). So the true new fleet is bigger
// than any one answer, and a 24-metro union grows Air 129 -> 145 and Gravity
// 973 -> 1432. That can never be certified exhaustive: truncated:true, synthetic
// domain, no delisting authority — the same contract as ford-blue-advantage.
//
// USED is the opposite, and it is the half we actually want. The same sweep
// returns 105 used rows from all 24 metros with ZERO union growth, and those
// 105 rows carry only 68 distinct configurations — i.e. duplicate configs are
// returned, so the collapse that shadows new stock is not applied to used. One
// call at distance=10000 is the whole national used+demo set, well under the
// 1000-row cap. That certifies COMPLETE, so db-sync retires sold Lucids. The
// lane re-proves it at runtime (see CHECK_ORIGIN) rather than trusting today's
// measurement: two far-apart origins must return identical VIN sets or the
// report goes truncated and nothing is delisted.
//
// PRICE — the trap that would have printed a false bargain. Every row carries a
// top-level `price.value` / `price.afterDiscountPrice`. For NEW those are the
// real thing and the site prints afterDiscountPrice (verified against the live
// cards: 69950 / 71200 / 73900 / 75650 / 80200 all match afterDiscountPrice
// exactly, and value is 5000 or 7500 higher). For USED they are the car's
// ORIGINAL sticker and have nothing to do with what it sells for: a 2024 Air
// Pure with 10,941 miles carries price.value 73950 and price.afterDiscountPrice
// 73950, while the page — and `listing.currentSalePrice` — say $40,298. Taking
// the top-level price on a used row would have overstated that car by $33,652.
// So used/demo price comes from listing.currentSalePrice and mileage from
// listing.odometer (both present on 105/105 rows), and nothing else is used.
//
// RECHECK MUST SKIP THIS LANE — control-tested, and it is the vw.com trap
// exactly. lucidmotors.com/inventory-vehicle?UUID=..&shortCode=.. is a
// client-rendered shell: a real new car, a real used car, a fabricated UUID and
// no query string at all all return 200 with the same 789,415 bytes and zero
// VINs anywhere in the HTML. recheck's "200 but no VIN" soft-gone rule would
// strike every Lucid row and delist the whole lane, so both domains are in
// OEM_LOCATOR_DOMAINS. (A per-VIN liveness oracle does exist for a future lane:
// GET buynow.lucidmotors.com/api/v4/en_us/store/inventory/vehicles/isSaleable
// ?id={uuid} returns isSaleable/titleStatus for a real uuid and
// {"statusCode":404,"errorCode":"VEHICLE_NOT_FOUND"} for a fabricated one.)
import { readFileSync } from "node:fs";
import { politeGetJson } from "../http.mjs";
import { stateFromZip } from "./zip-state.mjs";

const HOST = "https://buynow.lucidmotors.com";
const BASE = `${HOST}/api/v4/en_us/store/inventory/vehicles`;
const SITE = "https://lucidmotors.com";
const HEADERS = { origin: SITE, referer: `${SITE}/available-vehicles` };

// Air is the bare path, Gravity its own; `model` is the display name we write.
const MODELS = [
  { path: "", model: "Air" },
  { path: "/gravity", model: "Gravity" },
];

const PAGE = 1000; // service ceiling ("requestedVehiclesNum must be <= 1000")
const RADIUS = 10000; // miles; service ceiling, spans the country from anywhere

// Used/demo lane: one national sweep, plus a second origin whose VIN set must
// match it exactly before the lane certifies completeness.
const HOME_ORIGIN = { lat: 39.8283, long: -98.5795 }; // geographic centre of the US
const CHECK_ORIGIN = { lat: 40.7128, long: -74.006 }; // NYC — as far from centre as the set gets

export const LUCID = {
  key: "lucid",
  domain: "lucidmotors.com", // real domain: the used sweep is complete, so it delists
  make: "Lucid",
  types: ["used", "demo"],
  minExpected: 40,
};

export const LUCID_NEW = {
  key: "lucid-new",
  // Synthetic domain, isolated from the used lane: new stock is a per-config
  // sample and must never certify completeness or drive delisting.
  domain: "lucid-new",
  make: "Lucid",
  types: ["new"],
  minExpected: 300,
};

// recheck.mjs skips BOTH: the per-VIN page is an SPA shell that 200s with no
// VIN for a fabricated id (see the header control test).
export const OEM_LOCATOR_DOMAINS = new Set([LUCID.domain, LUCID_NEW.domain]);

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const CODE_BY_STATE = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC")
    .split(" ")
);

// The address.state field is free text and inconsistent even within one sweep:
// "CA" and "California" both appear, and Massachusetts arrives misspelled
// ("Massachussets"). Map what we recognise; anything else falls through to the
// ZIP, and a row that resolves to neither is withheld rather than mislocated.
const STATE_BY_NAME = new Map(Object.entries({
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", massachussets: "MA", massachusets: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC",
}));

function stateOf(addr) {
  const raw = String(addr?.state ?? "").trim();
  const up = raw.toUpperCase();
  if (CODE_BY_STATE.has(up)) return up;
  const named = STATE_BY_NAME.get(raw.toLowerCase());
  if (named) return named;
  return stateFromZip(addr?.zipcode);
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);

function driveOf(motorDrive) {
  const s = String(motorDrive?.technicalName ?? "").toLowerCase();
  if (s.includes("all-wheel") || s.includes("all wheel")) return "AWD";
  if (s.includes("rear-wheel") || s.includes("rear wheel")) return "RWD";
  if (s.includes("front-wheel") || s.includes("front wheel")) return "FWD";
  return undefined;
}

// Real photographs of the actual car, exteriors first. Used/demo only — new
// rows carry no photograph (see imageOf).
function photosOf(listing) {
  const imgs = Array.isArray(listing?.images) ? listing.images : [];
  const url = (i) => (typeof i?.url === "string" && i.url.startsWith("https://") ? i.url : null);
  const ext = imgs.filter((i) => i?.category === "Exterior").map(url).filter(Boolean);
  const rest = imgs.filter((i) => i?.category !== "Exterior").map(url).filter(Boolean);
  return [...ext, ...rest].slice(0, 8);
}

// New cars have no photograph, only a configurator render — and Lucid's own
// render URL is broken for one of the two models: it hard-codes
// `car=lucid%20air%202020` and then passes Gravity option codes, which the
// renderer answers 400 for on every Gravity row (the Air ones return 200 AVIF).
// Ship the render only where the maker's own URL actually resolves.
function renderOf(v, model) {
  const u = v.imageURL;
  if (model !== "Air" || typeof u !== "string" || !u.startsWith("https://")) return undefined;
  return u;
}

// condition, from the payload's own titleStatus + isCPO:
//   "New"                -> new
//   "Used" + isCPO       -> certified
//   "Used"               -> used
//   "New - Demonstrator" -> used. Titled new, but every demo row carries real
//     odometer (500-6,449 miles measured) and a used-style currentSalePrice
//     ($62,598 against a $92,800 sticker). Calling that "new" would put it
//     under the new-car price floor and into the "new" filter, which is the
//     false claim; "used" with its real mileage is what it is.
function conditionOf(v, type) {
  if (type === "new") return "new";
  if (v.isCPO === true || v.listing?.isCPO === true) return "certified";
  return "used";
}

function toRecord(v, { model, type }) {
  const vin = String(v.VIN ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(v.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 3)) return null;

  const state = stateOf(v.address);
  if (!state) return null; // no location, no listing — counted by the caller

  const used = type !== "new";
  // Used/demo: the asking price and the odometer live in `listing`; the
  // top-level price is the car's original sticker (see the header note).
  const priceUsd = used ? num(v.listing?.currentSalePrice) : num(v.price?.afterDiscountPrice);
  if (!priceUsd) return null; // the source did not state a price — say nothing
  const mileage = used ? num(v.listing?.odometer) ?? (v.listing?.odometer === 0 ? 0 : undefined) : undefined;

  const zip = /^\d{5}/.test(String(v.address?.zipcode ?? "")) ? String(v.address.zipcode).slice(0, 5) : undefined;
  const images = used ? photosOf(v.listing) : [];
  const render = used ? undefined : renderOf(v, model);
  const uuid = String(v.uuid ?? "");
  const shortCode = String(v.shortCode ?? "");
  const deepLink = uuid && shortCode
    ? `${SITE}/inventory-vehicle?UUID=${encodeURIComponent(uuid)}&shortCode=${encodeURIComponent(shortCode)}`
    : `${SITE}/available-vehicles`;

  return {
    vin,
    year,
    make: LUCID.make,
    model, // "Air" / "Gravity" — the API's model.technicalName folds the trim in
    trim: v.modelVariant?.technicalName || undefined,
    priceUsd,
    mileage,
    driveLine: driveOf(v.motorDrive),
    exteriorColor: v.color?.technicalName || undefined,
    interiorColor: v.interior?.technicalName || undefined,
    // Direct sale: there is no dealer, and the seller is Lucid itself. The
    // payload's `locationName` is deliberately NOT used here — it names the
    // yard the car is parked in ("CSX Railyard Philadelphia", "NA-US-NC-Manheim
    // Statesville", "Hickory Ave Storage"), and printing an auction house or a
    // railyard where a shopper reads the seller's name would say something
    // false. The address still carries the car's real city/state/zip.
    dealerName: "Lucid Motors",
    city: v.address?.city || undefined,
    state,
    zip,
    certified: conditionOf(v, type) === "certified" ? true : undefined,
    condition: conditionOf(v, type),
    imageUrl: images[0] ?? render,
    images: images.length ? images : render ? [render] : [],
    sourceUrl: deepLink,
    dealerDomain: undefined, // set by the caller: real domain vs synthetic
    evKind: "BEV",
    // Not a name match: the query is scoped to a BEV-only maker's BEV-only model
    // path, and both WMIs (50E Air, 7UU Gravity) decode BEV in vPIC.
    evConfidence: "high",
    platform: "lucid-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// One GET, with a single retry on transient failure. Returns the rows array, or
// null on an error the caller must record (which flips truncated).
async function apiGet({ path, type, lat, long }, report, label) {
  const url = `${BASE}${path}?long=${long}&lat=${lat}&type=${type}` +
    `&sortType=price&sortOrder=asc&distance=${RADIUS}&requestedVehiclesNum=${PAGE}`;
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, { headers: HEADERS });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push(`robots disallows ${path || "/vehicles"}`); return null; }
    if (res.status === 200 && Array.isArray(res.json?.data)) return res.json.data;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} ${label}`);
    return null;
  }
}

// Fold one API answer into byVin, counting rows the location rule withheld.
function collect(rows, ctx, byVin, stats) {
  for (const v of rows) {
    const rec = toRecord(v, ctx);
    if (rec) { rec.dealerDomain = ctx.domain; byVin.set(rec.vin, rec); }
    else if (VIN_RE.test(String(v.VIN ?? "").toUpperCase())) stats.withheld++;
  }
}

const blankReport = (domain) => ({
  domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0,
  itemListVdps: 0, evs: [], errors: [], notes: [],
});

// ── Lane 1: used + demo. Complete national set, certified at runtime. ────────
export async function pullLucid({ log = () => {} } = {}) {
  const report = blankReport(LUCID.domain);
  const byVin = new Map();
  const stats = { withheld: 0 };
  let proven = true;

  for (const m of MODELS) {
    for (const type of LUCID.types) {
      const label = `${m.model}/${type}`;
      const home = await apiGet({ path: m.path, type, ...HOME_ORIGIN }, report, label);
      if (home === null) { proven = false; continue; }
      collect(home, { ...m, type, domain: LUCID.domain }, byVin, stats);

      // The completeness claim is "this answer is the whole national set", so
      // prove it every night instead of trusting the 2026-08-18 measurement:
      // a second origin on the far side of the country must return the same
      // VINs. An empty answer needs no second look (nothing to miss).
      if (!home.length) { report.notes.push(`${label}: 0`); continue; }
      const check = await apiGet({ path: m.path, type, ...CHECK_ORIGIN }, report, `${label} (check)`);
      if (check === null) { proven = false; continue; }
      collect(check, { ...m, type, domain: LUCID.domain }, byVin, stats);
      const a = new Set(home.map((v) => v.VIN));
      const b = new Set(check.map((v) => v.VIN));
      const drift = [...a].filter((v) => !b.has(v)).length + [...b].filter((v) => !a.has(v)).length;
      if (drift) {
        proven = false;
        report.notes.push(`${label}: origin check DIVERGED by ${drift} VINs — not certifying`);
      }
      report.notes.push(`${label}: ${home.length} rows, ${drift} VIN drift between origins`);
      log(`lucid/${label}: ${home.length} rows, ${byVin.size} cumulative VINs`);
    }
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  if (stats.withheld) report.notes.push(`${stats.withheld} rows withheld (no resolvable state, no stated price, or an unusable year)`);
  // Certify complete only if every call succeeded, both origins agreed, and the
  // yield cleared the floor. Anything else and db-sync must not delist.
  report.truncated = !proven || report.errors.length > 0 || byVin.size < LUCID.minExpected;
  return report;
}

// ── Lane 2: new stock. Per-config sample, never complete. ────────────────────
//
// Because the service returns the nearest car per configuration, moving the
// query point is the only lever that surfaces more VINs. Reuse the shared CONUS
// covering grid as the set of query points and union the answers; growth
// flattens but never provably stops, which is exactly why this lane is
// truncated. Falls back to a metro list if the ZCTA table is unreadable.
const FALLBACK_ORIGINS = [
  [34.05, -118.24], [37.77, -122.42], [47.61, -122.33], [33.45, -112.07],
  [39.74, -104.99], [32.78, -96.8], [29.76, -95.37], [41.88, -87.63],
  [42.33, -83.05], [33.75, -84.39], [25.76, -80.19], [35.23, -80.84],
  [38.91, -77.04], [40.71, -74.01], [42.36, -71.06], [39.95, -75.17],
  [44.98, -93.27], [38.63, -90.2], [40.76, -111.89], [45.52, -122.68],
];

function gridOrigins() {
  try {
    const zips = JSON.parse(readFileSync(new URL("../../../web/data/zips.json", import.meta.url), "utf-8"));
    const LAT = 2.8, LNG = 3.2; // coarser than grid.mjs: the query is national, the point only picks the tie-break
    const cells = new Map();
    for (const [, v] of Object.entries(zips)) {
      const [la, ln] = v;
      if (!(la >= 24 && la <= 49.5 && ln >= -125 && ln <= -66.5)) continue; // CONUS
      const cx = Math.floor(la / LAT), cy = Math.floor(ln / LNG), key = `${cx}_${cy}`;
      const d = (la - (cx + 0.5) * LAT) ** 2 + (ln - (cy + 0.5) * LNG) ** 2;
      const ex = cells.get(key);
      if (!ex || d < ex.d) cells.set(key, { la, ln, d });
    }
    const out = [...cells.values()].map((c) => [c.la, c.ln]);
    return out.length >= 20 ? out : FALLBACK_ORIGINS;
  } catch {
    return FALLBACK_ORIGINS;
  }
}

export async function pullLucidNew({ log = () => {} } = {}) {
  const report = blankReport(LUCID_NEW.domain);
  const byVin = new Map();
  const stats = { withheld: 0 };
  const origins = gridOrigins();

  for (const m of MODELS) {
    let perCall = 0;
    for (const [lat, long] of origins) {
      const rows = await apiGet({ path: m.path, type: "new", lat, long }, report, `${m.model}/new @${lat},${long}`);
      if (rows === null) continue; // error recorded; lane is truncated anyway
      perCall = Math.max(perCall, rows.length);
      collect(rows, { ...m, type: "new", domain: LUCID_NEW.domain }, byVin, stats);
    }
    report.notes.push(`${m.model}/new: largest single answer ${perCall}, ${byVin.size} cumulative VINs over ${origins.length} origins`);
    log(`lucid-new/${m.model}: largest answer ${perCall}, ${byVin.size} cumulative VINs`);
    // The per-config collapse means a single answer sitting on the row ceiling
    // would be a different failure (a real cap), worth seeing in the report.
    if (perCall >= PAGE) report.notes.push(`${m.model}/new hit the ${PAGE}-row ceiling — answers may be cut, not just deduped`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  if (stats.withheld) report.notes.push(`${stats.withheld} rows withheld (no resolvable state, no stated price, or an unusable year)`);
  if (byVin.size < LUCID_NEW.minExpected) report.errors.push(`collected ${byVin.size} < floor ${LUCID_NEW.minExpected} — endpoint may have moved`);
  report.truncated = true; // per-config sample: never certifies, never delists
  return report;
}
