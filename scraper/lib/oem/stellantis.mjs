// Stellantis national inventory locator (Jeep / Dodge / Fiat).
//
// Every Stellantis US brand site drives its "Search New Inventory" tool off one
// shared public REST endpoint that needs no auth token (just a normal browser
// identity) — verified open from a plain Node fetch 2026-08-16 (control:
// tesla.com/ford.com Akamai-403 the same request; these return 200):
//   GET https://www.{brand}.com/hostd/inventory/getinventoryresults.json
//       ?ccode=I…&llp=…&zip=…&radius=99999&expandRadius=N&pageSize=…&pageNumber=…
// robots.txt broadly Disallows /hostd/ but EXPLICITLY Allows
// /hostd/inventory/getinventoryresults.json (and …filters.json) — so this exact
// path is opened by the site owner. (http.mjs now honours Allow precedence; it
// used to over-block this path by reading Disallow alone.)
//
// COVERAGE is a clean nationwide sweep: radius=99999 + expandRadius=N returns
// the complete national set for a query, stable across origin ZIPs (a query
// from 90210, 66101, 10001, 30301 all return the same 174 Wagoneer S). One call
// per configuration (paginated by pageNumber, pageSize 500) covers the country,
// so this certifies COMPLETE on the real per-brand domain (jeep.com/dodge.com/
// fiatusa.com) — nightly delisting retires sold VINs (see gm.mjs). Each brand is
// its own domain/report so a Jeep pull can never delist a Dodge car.
//
// The BEV GATE is structural, never a nameplate match: the site's own vehicle
// catalog (the /services vehicleData feed) tags each configuration with
// power_source, and every returned vehicle carries a "Power Source" attribute
// (typeId 1001). We keep only power_source === "All Electric". This is essential
// because a modelYearCode is coarse — the 2026 Charger code returns ~10k GAS
// Charger Sixpacks alongside the electric Daytona — so we query the electric
// CONFIGURATIONS (ccode+llp) directly and still gate every record on 1001.
// PHEVs (Wrangler/Grand Cherokee 4xe, Pacifica Hybrid) read "Gas/Diesel" and
// are dropped; the Ramcharger EREV likewise never reads All Electric.
//
// DISCOVERY differs by what robots allows on each host:
//   jeep, dodge — /services/ is allowed, so we read the vehicleData catalog and
//     pull every All-Electric configuration (ccode + llp + clean model/trim).
//     This auto-picks up new nameplates: it already finds the just-launched
//     Jeep Recon EV (322 units) that a hardcoded model list would have missed.
//   fiat — fiatusa.com Disallows /services/ entirely, so we cannot read its
//     catalog. Fiat's only BEV line is the 500e (pure-electric, no gas twin), so
//     we query it by modelYearCode over a rolling model-year window instead
//     (template IUX{year}04, the 500e line code) — no /services hit, robots-clean.
//
// EXCLUDED, structurally not by name: the Fiat Topolino — a 48V low-speed
// quadricycle (top speed ~25mph, not a highway car), which passes the All
// Electric filter but is not a comparable EV. Its records carry a "48V …"
// engine descriptor (every real US BEV here is 400V-class), so we drop on that.
// The Fiat 500e template ("04" line) already skips the Topolino's "00" line;
// the 48V guard is belt-and-suspenders for the vehicleData brands too.
//
// DEALER NAME/CITY/STATE come from the brand's own "Find a Dealer" directory,
// /bdlws/MDLSDealerLocator (robots-clean; Disallow only covers /hostd|/hostc).
// One call per brand — brandCode {J,D,X} for Jeep/Dodge/Fiat, radius 5000 from a
// central ZIP, resultsPerPage 5000 (the exact params the SRP itself uses) —
// returns the entire national roster keyed by dealerCode with dealerName/City/
// State/ZipCode (verified 100% coverage of the inventory's dealerCodes
// 2026-08-16). Fetched once, cached for the run; a directory failure just leaves
// geo blank (state still falls back to the ZIP-derived value). The results row's
// dealerZipCode/lat/lon still ride along as before.
//
// IMAGES come from the FCA "iris" studio renderer: every results row carries an
// `extImage` param string (client/market/brand/vehicle/paint/fabric/sa) — the
// exact query the brand SRP feeds to /mediaserver/iris. Appending the site's own
// &pov=fronthero&width=860&height=484&bkgnd=transparent&resp=png yields the same
// config-exact front-3/4 PNG the site shows (spot-checked: renders the correct
// paint/trim). imageUrl + images[] are populated from it.
// The per-VIN sourceUrl is the real brand VDP (/new-inventory/vehicle-details…),
// a client-rendered shell that echoes the VIN from its own URL — so recheck
// skips these domains (fake-alive, same rule as GM) and relies on the complete
// nightly sweep's delisting.
//
// NOT YET TAPPED: the CPO/used lot (robots Allows /hostc/cpov/vehicleSearch.do,
// and fcacertified.com) is a legacy form-POST tool returning HTML, needing its
// own reverse-engineering; current used BEV volume is negligible (all three
// nameplates are 2024+ model years). Ram's only BEV today is the ProMaster EV
// commercial cargo/step van (out of scope for a consumer used-EV site);
// Chrysler has no BEV. Revisit if a consumer Ram BEV (Ram REV) ships.
import { politeGetJson } from "../http.mjs";

export const STELLANTIS_BRANDS = [
  {
    key: "jeep", host: "www.jeep.com", domain: "jeep.com", make: "Jeep", brandToken: "Jeep", dealerBrandCode: "J",
    discovery: "vehicleData", vehicleDataFile: "vehicleData.getVehicle.prod.jeep.js", minExpected: 100,
  },
  {
    key: "dodge", host: "www.dodge.com", domain: "dodge.com", make: "Dodge", brandToken: "Dodge", dealerBrandCode: "D",
    discovery: "vehicleData", vehicleDataFile: "vehicleData.getVehicle.prod.dodge.js", minExpected: 40,
  },
  {
    key: "fiat", host: "www.fiatusa.com", domain: "fiatusa.com", make: "Fiat", brandToken: "Fiat", dealerBrandCode: "X",
    discovery: "modelYearTemplate", mycTemplate: (y) => `IUX${y}04`, fixedModel: "500e", minExpected: 5,
  },
];

// recheck.mjs skips these: coverage is complete nightly (truncated:false already
// retires gone VINs via db-sync), and the per-VIN VDP is a client-rendered shell
// that echoes the VIN from its URL — it would read "alive" forever (GM's rule).
export const OEM_LOCATOR_DOMAINS = new Set(STELLANTIS_BRANDS.map((b) => b.domain));

const NATIONAL_ZIP = "66101"; // any populated ZIP; radius spans the country
const RADIUS = 99999; // fixed national radius (expandRadius=N locks the set)
const PAGE_SIZE = 500; // server returns at most this per page → paginate
const MAX_PAGES = 60; // safety ceiling; an electric config is a single page today
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const POWER_SOURCE_ID = 1001; // "Power Source" attribute typeId
const DRIVE_ID = 1; // "Drive" attribute typeId
const TRIM_ID = 5; // "Real Trim" attribute typeId

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const decodeEntities = (s) =>
  String(s ?? "")
    .replace(/&reg;|&trade;/gi, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[®™]/g, "");

const titleCaseIfShouty = (s) => {
  const str = String(s ?? "");
  if (!str || str !== str.toUpperCase()) return str;
  return str.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
};

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "Jeep® Recon" → "Recon"; "Wagoneer S" → "Wagoneer S"; "Charger" → "Charger".
function cleanNameplate(display, brandToken) {
  let s = decodeEntities(display).replace(/\s+/g, " ").trim();
  s = s.replace(new RegExp("^" + escapeRe(brandToken) + "\\s+", "i"), "").trim();
  return titleCaseIfShouty(s);
}

// Trim off a leading brand/model echo, then de-shout. "FIAT 500e Giorgio Armani
// …" (model 500e) → "Giorgio Armani …"; "DAYTONA SCAT PACK" → "Daytona Scat Pack".
function cleanTrim(raw, brandToken, model) {
  let t = decodeEntities(raw).replace(/\s+/g, " ").trim();
  t = t.replace(new RegExp("^(?:" + escapeRe(brandToken) + "\\s+)?(?:" + escapeRe(model) + "\\s+)?", "i"), "").trim();
  if (t && t === t.toUpperCase()) t = titleCaseIfShouty(t);
  return t || undefined;
}

// Structured "Drive" attribute → normalized driveLine.
function driveLineOf(v) {
  const raw = String(v.attributes?.attributes?.find((a) => a.typeId === DRIVE_ID)?.value ?? "").toUpperCase();
  if (/4X4|4WD/.test(raw)) return "4WD";
  if (/AWD|ALL.?WHEEL/.test(raw)) return "AWD";
  if (/RWD|REAR/.test(raw)) return "RWD";
  if (/FWD|FRONT/.test(raw)) return "FWD";
  return undefined;
}

const attrVal = (v, id) => v.attributes?.attributes?.find((a) => a.typeId === id)?.value;

const cleanColor = (s) =>
  decodeEntities(s)
    .replace(/\b(exterior|interior|paint|color)\b/gi, "")
    .replace(/\s*(pearl|clear|metallic)?-?coat\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || undefined;

// First three ZIP digits → USPS state (SCF prefix table). Deterministic and
// exact for the dealer ZIPs the results carry (the API gives no state field).
const ZIP3_STATE = [
  [5, 5, "NY"], [6, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"],
  [50, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"],
  [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"],
  [300, 319, "GA"], [320, 339, "FL"], [340, 342, "FL"], [346, 347, "FL"], [349, 349, "FL"], [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"],
  [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [569, 569, "DC"], [570, 577, "SD"],
  [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"],
  [700, 715, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"],
  [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [889, 898, "NV"], [900, 961, "CA"],
  [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];
function stateFromZip(zip) {
  const z = String(zip ?? "");
  if (!/^\d{5}/.test(z)) return undefined;
  const p = Number(z.slice(0, 3));
  for (const [lo, hi, st] of ZIP3_STATE) if (p >= lo && p <= hi) return st;
  return undefined;
}

// Build the real per-VIN brand VDP (the site's own "View Details" target):
//   {brand}.com/new-inventory/vehicle-details.{family}.{year}[.html]?vin=…&…
// Fiat omits the .html suffix (per the site's own URL builder).
function vdpUrl(brand, v) {
  const family = v.mackevisionData?.consumerFamily;
  const year = v.modelYear;
  const seg = family && year ? `.${family}.${year}` : "";
  const suffix = brand.key === "fiat" ? "" : ".html";
  const params = [
    `vin=${encodeURIComponent(v.vin)}`,
    `dealerCode=${encodeURIComponent(v.dealerCode ?? "")}`,
    `ccode=${encodeURIComponent(v.ccode ?? "")}`,
    `llp=${encodeURIComponent(v.llp ?? "")}`,
    "radius=200",
    `zipCode=${encodeURIComponent(v.dealerZipCode ?? "")}`,
  ];
  return `https://${brand.host}/new-inventory/vehicle-details${seg}${suffix}?${params.join("&")}`;
}

// FCA "iris" studio render for this exact configuration. `extImage` already
// carries the full config query (client=fcaus&market=U&brand=…&vehicle=…&paint=…
// &fabric=…&sa=…); we append the render params the brand SRP itself uses. Guard
// on a well-formed extImage (must name the client + the option string) so a
// blank/garbled value yields undefined rather than a broken URL.
function irisImageUrl(brand, v) {
  const ext = String(v.extImage ?? "").trim().replace(/^[?&]+/, "");
  if (!/client=/.test(ext) || !/(?:^|&)sa=/.test(ext)) return undefined;
  return `https://${brand.host}/mediaserver/iris?${ext}&pov=fronthero&width=860&height=484&bkgnd=transparent&resp=png`;
}

// One results row → normalized BEV listing, or null if it fails a gate. `cfg`
// carries the model (and trim, for the vehicleData brands) plus, when known, the
// exact inventory ccode this query targeted so a stray row can't be mislabeled.
function toRecord(v, cfg, brand, dealers) {
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // Structural BEV gate: the vehicle's own "Power Source" attribute.
  if (String(attrVal(v, POWER_SOURCE_ID) ?? "").trim().toLowerCase() !== "all electric") return null;
  // Drop 48V low-speed quadricycles (Fiat Topolino) — not highway BEVs.
  if (/\b48V\b/i.test(String(v.engineDesc ?? ""))) return null;
  // If we queried a specific configuration, the row must belong to it.
  if (cfg.expectedCcode && String(v.ccode ?? "").toUpperCase() !== cfg.expectedCcode) return null;
  const year = Number(v.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = cfg.model;
  if (!model) return null;
  const trim = cfg.trim ?? cleanTrim(attrVal(v, TRIM_ID), brand.brandToken, model);
  // Dealer geo from the MDLSDealerLocator directory (keyed by dealerCode); its
  // own dealerZip is authoritative, else fall back to the row's dealerZipCode.
  const dealer = dealers?.get(String(v.dealerCode ?? ""));
  const dealerZip = /^\d{5}/.test(String(dealer?.dealerZipCode ?? "")) ? String(dealer.dealerZipCode).slice(0, 5) : undefined;
  const zip = dealerZip ?? (/^\d{5}/.test(String(v.dealerZipCode ?? "")) ? String(v.dealerZipCode).slice(0, 5) : undefined);
  const state = (/^[A-Z]{2}$/.test(String(dealer?.dealerState ?? "")) ? dealer.dealerState : undefined) ?? stateFromZip(zip);
  const img = irisImageUrl(brand, v);
  // Honest ask: net advertised price (MSRP + destination + any dealer
  // adjustment), NOT the discountedPrice that bakes in conditional EV bonus cash.
  const priceUsd = num(v.price?.netPrice) ?? (num(v.price?.msrp) && num(v.price?.destination) ? num(v.price.msrp) + num(v.price.destination) : num(v.price?.msrp));
  return {
    vin,
    year,
    make: brand.make,
    model,
    trim,
    priceUsd,
    driveLine: driveLineOf(v),
    exteriorColor: cleanColor(v.exteriorColorDesc),
    interiorColor: cleanColor(v.interiorColorDesc),
    dealerName: dealer?.dealerName ? decodeEntities(dealer.dealerName).replace(/\s+/g, " ").trim() : undefined,
    city: dealer?.dealerCity ? decodeEntities(dealer.dealerCity).replace(/\s+/g, " ").trim() : undefined,
    zip,
    state,
    condition: "new",
    imageUrl: img,
    images: img ? [img] : [],
    sourceUrl: vdpUrl(brand, v),
    dealerDomain: brand.domain,
    evKind: "BEV",
    evConfidence: "high", // structured Power Source attribute, not a name match
    platform: "stellantis-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// Discover the All-Electric configurations for a vehicleData brand (jeep/dodge).
// Returns [{ expectedCcode, llp, model, trim }] or null if the catalog is
// unreachable (robots block / network) — a null forces the brand truncated.
async function discoverVehicleData(brand, report) {
  const url = `https://${brand.host}/services/${brand.vehicleDataFile}`;
  const res = await politeGetJson(url, { headers: { referer: `https://${brand.host}/new-inventory` } });
  report.fetched++;
  if (res.status === "robots_disallowed") { report.errors.push(`robots disallows the vehicleData catalog (${brand.key})`); return null; }
  const text = res.text ?? "";
  let data;
  try {
    data = JSON.parse(text.slice(text.indexOf("{")).replace(/;?\s*$/, ""));
  } catch {
    report.errors.push(`vehicleData catalog unparseable (${brand.key}, status ${res.status})`);
    return null;
  }
  const configs = [];
  for (const models of Object.values(data.model_years ?? {})) {
    for (const mnode of Object.values(models ?? {})) {
      for (const variant of Object.values(mnode?.models ?? {})) {
        if (variant?.power_source !== "All Electric" || !variant.ccode) continue;
        let model = cleanNameplate(mnode.display, brand.brandToken);
        let trim = cleanTrim(variant.trim_display, brand.brandToken, model);
        // Dodge markets the electric Charger as "Charger Daytona"; fold the
        // Daytona token out of the trim and into the model.
        if (trim && /^daytona\b/i.test(trim)) {
          model = `${model} Daytona`;
          trim = trim.replace(/^daytona\b\s*/i, "").trim() || undefined;
        }
        configs.push({ expectedCcode: `I${String(variant.ccode).slice(1)}`.toUpperCase(), llp: variant.llp, model, trim });
      }
    }
  }
  return configs;
}

// Fiat's configs from the modelYearCode template (no /services access). One
// config per candidate model year; empty years simply return nothing.
function fiatConfigs(brand) {
  const now = new Date().getFullYear();
  const out = [];
  for (let y = now - 2; y <= now + 1; y++) out.push({ modelYearCode: brand.mycTemplate(y), model: brand.fixedModel });
  return out;
}

// One results page with a single retry on transient failure (gm.mjs rationale).
async function getResults(brand, qs, page, report) {
  const url = `https://${brand.host}/hostd/inventory/getinventoryresults.json?${qs}&zip=${NATIONAL_ZIP}&radius=${RADIUS}&expandRadius=N&pageSize=${PAGE_SIZE}&pageNumber=${page}`;
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, { headers: { referer: `https://${brand.host}/new-inventory` } });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push(`robots disallows results (${brand.key})`); return null; }
    if (res.status === 200 && res.json?.result?.data) {
      if (res.json.result.errors?.length) { report.errors.push(`api: ${res.json.result.errors[0]?.errorDesc?.slice(0, 80)}`); return null; }
      return res.json.result.data;
    }
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} ${brand.key} p${page} ${qs.slice(0, 40)}`);
    return null;
  }
}

// The brand's national dealer roster from its own "Find a Dealer" directory,
// keyed by dealerCode → {dealerName, dealerCity, dealerState, dealerZipCode}.
// One call (resultsPerPage 5000 spans the country); robots-clean. Returns an
// empty map on any failure — geo then simply stays blank (never fails the pull).
async function fetchDealerDirectory(brand, report) {
  const url = `https://${brand.host}/bdlws/MDLSDealerLocator?brandCode=${brand.dealerBrandCode}&func=SALES&radius=5000&zipCode=${NATIONAL_ZIP}&resultsPerPage=5000`;
  const res = await politeGetJson(url, { headers: { referer: `https://${brand.host}/new-inventory` } });
  report.fetched++;
  const rows = res.json?.dealer;
  if (res.status !== 200 || !Array.isArray(rows)) {
    report.notes.push(`dealer directory unavailable (${brand.key}) — dealer name/city left blank`);
    return new Map();
  }
  const map = new Map();
  for (const d of rows) if (d?.dealerCode) map.set(String(d.dealerCode), d);
  report.notes.push(`dealer directory: ${map.size} ${brand.key} rooftops`);
  return map;
}

// Pull one configuration to exhaustion, folding records into byVin. Returns
// false if a page failed or paging fell short of the reported national count.
async function pullConfig(brand, cfg, byVin, report, dealers) {
  const qs = cfg.expectedCcode
    ? `ccode=${cfg.expectedCcode}&llp=${encodeURIComponent(cfg.llp ?? "")}`
    : `modelYearCode=${encodeURIComponent(cfg.modelYearCode)}`;
  let total = null;
  let raw = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getResults(brand, qs, page, report);
    if (!data) return false; // error recorded; flips truncated
    total = data.metadata?.totalcount ?? 0;
    const rows = data.vehicles ?? [];
    for (const v of rows) {
      const rec = toRecord(v, cfg, brand, dealers);
      if (rec) byVin.set(rec.vin, rec);
    }
    raw += rows.length;
    if (raw >= total || rows.length < PAGE_SIZE) break;
  }
  if (total != null && raw < total) { report.errors.push(`${brand.key} ${qs.slice(0, 40)}: paged ${raw}/${total}`); return false; }
  return true;
}

// Pull one brand's complete national new BEV inventory. crawl.mjs-shaped report
// on the real brand domain; see gm.mjs for the completeness/delisting contract.
export async function pullStellantisBrand(brand, { log = () => {} } = {}) {
  const report = { domain: brand.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  let configs;
  if (brand.discovery === "vehicleData") {
    configs = await discoverVehicleData(brand, report);
    if (!configs) { report.truncated = true; return report; } // catalog unreachable
  } else {
    configs = fiatConfigs(brand);
  }
  report.notes.push(`${configs.length} candidate BEV configs`);
  log(`${brand.key}: ${configs.length} candidate configs`);

  const dealers = await fetchDealerDirectory(brand, report);

  const byVin = new Map();
  for (const cfg of configs) {
    const ok = await pullConfig(brand, cfg, byVin, report, dealers);
    if (!ok) log(`${brand.key}: config ${cfg.expectedCcode ?? cfg.modelYearCode} failed`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`${byVin.size} BEVs across ${configs.length} configs, ${report.fetched} requests`);
  log(`${brand.key}: ${byVin.size} BEVs, ${report.fetched} requests, ${report.errors.length} errors`);
  // Completeness (see gm.mjs): every config fetched + fully paged AND yield over
  // the floor. The floor guards against the API returning empty (which must not
  // delist the whole brand); a clean, non-empty, fully-paged sweep certifies.
  report.truncated = report.errors.length > 0 || byVin.size < brand.minExpected;
  return report;
}
