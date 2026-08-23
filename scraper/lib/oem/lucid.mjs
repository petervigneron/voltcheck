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
// than any one answer, and moving the query point is the only lever that
// surfaces more of it. That can never be certified exhaustive: truncated:true,
// synthetic domain, no delisting authority — the contract ford-blue-advantage
// has.
//
// HOW THE NEW SWEEP MOVES THAT POINT, and the version of it that was thrown
// away. The obvious construction — the shared CONUS covering grid, 121 anchors,
// each asking the national question at distance=10000 — was built, run, and
// deleted. It collected 1,218 VINs in 281 requests over 12m42s and moved 1.17
// GB, because a Gravity answer at full radius is 973 rows of ~10 KB each (9.66
// MB, measured) and every anchor re-downloads substantially the same catalogue:
// at national radius most configs resolve to the same big hubs whatever you ask
// from. It also failed 39 of 121 Gravity calls with transport TypeErrors, which
// is what repeatedly pulling 10 MB over one connection looks like.
//
// The replacement asks LOCAL questions at the places the cars actually are. Two
// facts make it work. First, radius is what changes the answer: six metros at
// distance=150 lifted the Gravity union 973 -> 1,755 for 35 MB, where a seventh
// pass at distance=400 over the same six added 27 VINs — the radius axis
// saturates almost immediately, the location axis does not. Second, the
// national baseline names every place Lucid keeps cars: across both models it
// returns just 35 distinct location ZIPs (Port Hueneme, the Philadelphia CSX
// railyard, Pier 80, Tampa...), so there is no need to guess at geography. The
// sweep is therefore: one national call per model for the baseline catalogue,
// then the hub list read out of that answer, thinned so no two query points sit
// within THIN_MILES of each other (the Bay Area alone lists six hubs whose
// 150-mile circles are nearly the same circle), then one local call per hub per
// model. Self-adapting: when Lucid opens or closes a yard the sweep follows it
// without an edit.
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
import { oemField } from "../price-provenance.mjs";

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
const LOCAL_RADIUS = 150; // miles; the hub sweep's radius — see the header note
const THIN_MILES = 60; // minimum spacing between hub query points
// A full-radius Gravity answer is ~10 MB, and the default 20s budget is what
// turned 39 of those into transport TypeErrors on the first build.
const TIMEOUT_MS = 60000;

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
  // Not a fallback ladder: which field applies is decided by the listing type,
  // so a car cannot move between them without ceasing to be the same listing.
  // Tagged separately all the same — the two numbers mean different things.
  const priceProvenance = oemField("lucid", used ? "currentSalePrice" : "afterDiscountPrice");
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
    priceProvenance,
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

// One GET with a short retry ladder. Multi-megabyte answers drop connections
// often enough that a single retry is not enough — 39 of 121 Gravity calls
// failed that way on the first build of this lane. Returns the rows array, or
// null on an error the caller must record.
async function apiGet({ path, type, lat, long, distance = RADIUS }, report, label) {
  const url = `${BASE}${path}?long=${long}&lat=${lat}&type=${type}` +
    `&sortType=price&sortOrder=asc&distance=${distance}&requestedVehiclesNum=${PAGE}`;
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, { headers: HEADERS, timeoutMs: TIMEOUT_MS });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push(`robots disallows ${path || "/vehicles"}`); return null; }
    if (res.status === 200 && Array.isArray(res.json?.data)) return res.json.data;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt < 2 && transient) { await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); continue; }
    report.errors.push(`${res.status} ${label}`);
    return null;
  }
}

// Fold one API answer into byVin. Rows the record rules reject are counted by
// VIN, not by occurrence: the same un-placeable car comes back from every query
// point it is in range of, and counting hits instead of cars reported 16,919
// "withheld rows" for what were really a few hundred distinct vehicles.
function collect(rows, ctx, byVin, withheld) {
  for (const v of rows) {
    const rec = toRecord(v, ctx);
    if (rec) { rec.dealerDomain = ctx.domain; byVin.set(rec.vin, rec); }
    else {
      const vin = String(v.VIN ?? "").toUpperCase();
      if (VIN_RE.test(vin)) withheld.add(vin);
    }
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
  const withheld = new Set();
  let proven = true;

  for (const m of MODELS) {
    for (const type of LUCID.types) {
      const label = `${m.model}/${type}`;
      const home = await apiGet({ path: m.path, type, ...HOME_ORIGIN }, report, label);
      if (home === null) { proven = false; continue; }
      collect(home, { ...m, type, domain: LUCID.domain }, byVin, withheld);

      // The completeness claim is "this answer is the whole national set", so
      // prove it every night instead of trusting the 2026-08-18 measurement:
      // a second origin on the far side of the country must return the same
      // VINs. An empty answer needs no second look (nothing to miss).
      if (!home.length) { report.notes.push(`${label}: 0`); continue; }
      const check = await apiGet({ path: m.path, type, ...CHECK_ORIGIN }, report, `${label} (check)`);
      if (check === null) { proven = false; continue; }
      collect(check, { ...m, type, domain: LUCID.domain }, byVin, withheld);
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
  if (withheld.size) report.notes.push(`${withheld.size} cars withheld (no resolvable state, no stated price, or an unusable year)`);
  // Certify complete only if every call succeeded, both origins agreed, and the
  // yield cleared the floor. Anything else and db-sync must not delist.
  report.truncated = !proven || report.errors.length > 0 || byVin.size < LUCID.minExpected;
  return report;
}

// ── Lane 2: new stock. Per-config sample, never complete. ────────────────────

// ZIP -> [lat, lng]. The payload gives a location ZIP but no coordinates, and
// the sweep needs coordinates to query around a hub. Read once, lazily; if the
// table is unavailable the lane degrades to its national baseline rather than
// guessing at where a ZIP is.
let zipTable;
function zipCoords(zip) {
  if (zipTable === undefined) {
    try {
      zipTable = JSON.parse(readFileSync(new URL("../../../web/data/zips.json", import.meta.url), "utf-8"));
    } catch {
      zipTable = null;
    }
  }
  const v = zipTable?.[String(zip)];
  return Array.isArray(v) && v.length === 2 ? v : null;
}

const MI_PER_DEG_LAT = 69;
function milesApart(a, b) {
  const dLat = (a[0] - b[0]) * MI_PER_DEG_LAT;
  const dLng = (a[1] - b[1]) * MI_PER_DEG_LAT * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLng);
}

// The distinct storage yards named by the baseline answers, thinned so no two
// query points are closer than THIN_MILES. Busiest hubs first, so when two sit
// close together the one holding more cars is the one kept.
function hubOrigins(rowsByModel) {
  const count = new Map();
  for (const rows of rowsByModel) {
    for (const v of rows) {
      const z = String(v.address?.zipcode ?? "");
      if (/^\d{5}$/.test(z)) count.set(z, (count.get(z) ?? 0) + 1);
    }
  }
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]);
  const kept = [];
  for (const [zip] of ranked) {
    const c = zipCoords(zip);
    if (!c) continue;
    if (kept.every((k) => milesApart(k, c) >= THIN_MILES)) kept.push(c);
  }
  return kept;
}

export async function pullLucidNew({ log = () => {} } = {}) {
  const report = blankReport(LUCID_NEW.domain);
  const byVin = new Map();
  const withheld = new Set();
  const ctx = (m) => ({ ...m, type: "new", domain: LUCID_NEW.domain });

  // Pass 1 — the national baseline per model: every configuration exactly once,
  // and the list of places Lucid is holding cars.
  const baselines = [];
  for (const m of MODELS) {
    const rows = await apiGet({ path: m.path, type: "new", ...HOME_ORIGIN }, report, `${m.model}/new national`);
    if (rows === null) continue;
    baselines.push(rows);
    collect(rows, ctx(m), byVin, withheld);
    report.notes.push(`${m.model}/new national baseline: ${rows.length} configurations`);
    // A baseline sitting on the row ceiling would mean a real cap rather than
    // the per-config collapse, and the baseline would no longer be a full
    // catalogue — worth seeing in the report.
    if (rows.length >= PAGE) report.notes.push(`${m.model}/new baseline hit the ${PAGE}-row ceiling — answers may be cut, not just deduped`);
  }
  log(`lucid-new: baselines give ${byVin.size} VINs`);

  // Pass 2 — one local query per hub per model. Each returns the nearest car
  // per configuration *within LOCAL_RADIUS*, which is a genuinely different car
  // from the national answer wherever a config has stock near that hub.
  const hubs = hubOrigins(baselines);
  if (!hubs.length) {
    report.notes.push("no hub coordinates resolved — national baseline only");
  } else {
    for (const m of MODELS) {
      const before = byVin.size;
      for (const [lat, long] of hubs) {
        const rows = await apiGet({ path: m.path, type: "new", lat, long, distance: LOCAL_RADIUS }, report, `${m.model}/new @${lat},${long}`);
        if (rows === null) continue; // error recorded; lane is truncated anyway
        collect(rows, ctx(m), byVin, withheld);
      }
      report.notes.push(`${m.model}/new hub sweep: ${hubs.length} hubs at ${LOCAL_RADIUS}mi, +${byVin.size - before} VINs`);
      log(`lucid-new/${m.model}: +${byVin.size - before} from ${hubs.length} hubs, ${byVin.size} cumulative VINs`);
    }
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  if (withheld.size) report.notes.push(`${withheld.size} cars withheld (no resolvable state, no stated price, or an unusable year)`);
  if (byVin.size < LUCID_NEW.minExpected) report.errors.push(`collected ${byVin.size} < floor ${LUCID_NEW.minExpected} — endpoint may have moved`);
  report.truncated = true; // per-config sample: never certifies, never delists
  return report;
}
