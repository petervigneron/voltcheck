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
//
// PHEVs (2026-08-23): the same Power Source attribute has a distinct
// "Plug-In Hybrid" value — the vocabulary observed live is "All Electric" /
// "Gas/Diesel" / "ICE (or Gas/Diesel)" / "Hybrid" (the 2026 Cherokee, a
// conventional hybrid) / "Plug-In Hybrid" / sometimes absent — so the record
// gate for a plug-in is the exact string "Plug-In Hybrid", never "Hybrid".
// But DISCOVERY cannot come from the vehicleData catalog: Jeep's catalog
// lists NO 4xe at all (the 4xe lines are out of production and off the
// current-lineup file), while the inventory API still holds hundreds of new
// ones under their own modelYearCode LINES — measured: Wrangler 4xe is line
// 17 (IUJ202417: 26, IUJ202517: 59), Grand Cherokee 4xe line 19 (IUJ202419:
// 289, IUJ202519: 10), Pacifica Plug-In Hybrid line 10 (IUC202510), and the
// plain Wrangler/Grand Cherokee lines (10/20) contain ZERO 4xe across 4,200+
// sampled rows, so the plug-in stock is invisible without sweeping the line
// space. discoverPhevLines() therefore probes every modelYearCode
// IU{B}{year}{00..39} over a rolling 4-year window (one 25-row page each;
// every observed line is powertrain-pure, so page one settles it) and fully
// pages the lines whose rows read Plug-In Hybrid, with the per-record 1001
// gate still applied. Dodge was swept the same way and holds no PHEV at all
// (the Hornet R/T is gone from the locator along with the nameplate), but
// keeps phevSweep on so a returning plug-in shows up as yield, not silence.
// The Ramcharger EREV, when it ships, will surface in a sweep of Ram's site
// if one is added — ramtrucks.com codes were probed (IUR2024–2026 00-30, all
// empty) and the Ram code prefix is evidently different; revisit then.
// Alfa Romeo (Tonale PHEV) is NOT reachable: alfaromeousa.com's robots.txt
// disallows /hostd/ with no Allow for the inventory paths — policy, respected.
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
// GAPS (like BMW's coded dealer): the results carry dealerCode + dealerZipCode +
// lat/lon but no dealer NAME or CITY, so we derive state from the ZIP and leave
// name/city blank. Images require a separate mackevision render call (the
// results row carries only a param string), so imageUrl is left empty for now.
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
import { stateFromZip } from "./zip-state.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const STELLANTIS_BRANDS = [
  {
    key: "jeep", host: "www.jeep.com", domain: "jeep.com", make: "Jeep", brandToken: "Jeep",
    discovery: "vehicleData", vehicleDataFile: "vehicleData.getVehicle.prod.jeep.js", minExpected: 100,
    phevSweep: "IUJ", // Wrangler 4xe (line 17) + Grand Cherokee 4xe (line 19)
  },
  {
    key: "dodge", host: "www.dodge.com", domain: "dodge.com", make: "Dodge", brandToken: "Dodge",
    discovery: "vehicleData", vehicleDataFile: "vehicleData.getVehicle.prod.dodge.js", minExpected: 40,
    phevSweep: "IUD", // 0 today (Hornet R/T left the locator with the nameplate); kept so a return shows up
  },
  {
    // Chrysler sells no BEV at all — its catalog is all Gas/Diesel — so this
    // entry exists purely for the Pacifica Plug-In Hybrid's inventory line
    // (IUC…10). minExpected 0: the honest floor for a nameplate whose leftover
    // stock was 2 cars on 2026-08-23; breakage protection comes from sweep
    // errors flipping truncated, not from a count that small.
    key: "chrysler", host: "www.chrysler.com", domain: "chrysler.com", make: "Chrysler", brandToken: "Chrysler",
    discovery: "vehicleData", vehicleDataFile: "vehicleData.getVehicle.prod.chrysler.js", minExpected: 0,
    phevSweep: "IUC",
  },
  {
    key: "fiat", host: "www.fiatusa.com", domain: "fiatusa.com", make: "Fiat", brandToken: "Fiat",
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

// First three ZIP digits → USPS state (SCF prefix table): deterministic and
// exact for the dealer ZIPs the results carry (the API gives no state field).
// Lives in zip-state.mjs since audi.mjs needs the same table — see the note
// there on why this one was shared rather than copied.

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

// A discovered plug-in line's rows name themselves: vehicleDesc "WRANGLER
// 4-DOOR SAHARA 4xe" with Real Trim "Sahara 4xe" → model "Wrangler 4xe",
// trim "Sahara"; "GRAND CHEROKEE OVERLAND 4xe"/"Overland 4xe" → "Grand
// Cherokee 4xe"/"Overland"; "PACIFICA PLUG-IN HYBRID S APPEARANCE" with trim
// "PLUG-IN HYBRID S APPEARANCE" → "Pacifica Plug-In Hybrid"/"S Appearance".
// The powertrain word rides on the MODEL (that is both Stellantis's own
// naming and how the enrichment corpus keys these cars); the trim keeps the
// rest. There is no catalog row to read a clean name from — these lines are
// exactly the ones the catalog dropped — so this is derived from the two
// fields every inventory row carries.
function phevModelAndTrim(v) {
  const desc = decodeEntities(String(v.vehicleDesc ?? "")).replace(/\s+/g, " ").trim();
  const rawTrim = decodeEntities(String(attrVal(v, TRIM_ID) ?? "")).replace(/\s+/g, " ").trim();
  let base = desc;
  if (rawTrim && base.toUpperCase().endsWith(rawTrim.toUpperCase())) base = base.slice(0, base.length - rawTrim.length).trim();
  base = base.replace(/\b[24][- ]DOOR\b/gi, "").replace(/\s+/g, " ").trim();
  base = titleCaseIfShouty(base);
  const is4xe = /4xe/i.test(desc) || /4xe/i.test(rawTrim);
  const isPih = /plug-?in\s+hybrid/i.test(desc) || /plug-?in\s+hybrid/i.test(rawTrim);
  let model = base;
  let trim = rawTrim;
  if (is4xe) {
    if (!/4xe$/i.test(model)) model = `${model} 4xe`;
    trim = trim.replace(/\s*4xe\s*$/i, "").trim();
  } else if (isPih) {
    model = model.replace(/\s*plug-?in\s+hybrid\s*$/i, "").trim();
    model = `${model} Plug-In Hybrid`;
    trim = trim.replace(/^plug-?in\s+hybrid\s*/i, "").trim();
  }
  if (trim && trim === trim.toUpperCase()) trim = titleCaseIfShouty(trim);
  return { model: model || undefined, trim: trim || undefined };
}

// One results row → normalized BEV/PHEV listing, or null if it fails a gate.
// `cfg` carries the model (and trim, for the vehicleData brands) plus, when
// known, the exact inventory ccode this query targeted so a stray row can't
// be mislabeled; a PHEV line config carries `phev: true` instead, and its
// rows are gated on the "Plug-In Hybrid" Power Source value and named from
// their own fields (phevModelAndTrim above).
function toRecord(v, cfg, brand) {
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // Structural powertrain gate: the vehicle's own "Power Source" attribute.
  // "Plug-In Hybrid" exactly for a plug-in line — "Hybrid" (the conventional
  // 2026 Cherokee) and every Gas/Diesel spelling fail it.
  const powerSource = String(attrVal(v, POWER_SOURCE_ID) ?? "").trim().toLowerCase();
  if (powerSource !== (cfg.phev ? "plug-in hybrid" : "all electric")) return null;
  // Drop 48V low-speed quadricycles (Fiat Topolino) — not highway BEVs.
  if (/\b48V\b/i.test(String(v.engineDesc ?? ""))) return null;
  // If we queried a specific configuration, the row must belong to it.
  if (cfg.expectedCcode && String(v.ccode ?? "").toUpperCase() !== cfg.expectedCcode) return null;
  const year = Number(v.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const phevNames = cfg.phev ? phevModelAndTrim(v) : null;
  const model = cfg.phev ? phevNames.model : cfg.model;
  if (!model) return null;
  const trim = cfg.phev ? phevNames.trim : cfg.trim ?? cleanTrim(attrVal(v, TRIM_ID), brand.brandToken, model);
  const zip = /^\d{5}/.test(String(v.dealerZipCode ?? "")) ? String(v.dealerZipCode).slice(0, 5) : undefined;
  // Honest ask: net advertised price (MSRP + destination + any dealer
  // adjustment), NOT the discountedPrice that bakes in conditional EV bonus cash.
  const { priceUsd, priceProvenance } = pickTaggedPrice("stellantis", [
    ["netPrice", num(v.price?.netPrice)],
    [
      "msrpPlusDestination",
      num(v.price?.msrp) && num(v.price?.destination) ? num(v.price.msrp) + num(v.price.destination) : undefined,
    ],
    ["msrp", num(v.price?.msrp)],
  ]);
  return {
    vin,
    year,
    make: brand.make,
    model,
    trim,
    priceUsd,
    priceProvenance,
    driveLine: driveLineOf(v),
    exteriorColor: cleanColor(v.exteriorColorDesc),
    interiorColor: cleanColor(v.interiorColorDesc),
    zip,
    state: stateFromZip(zip),
    condition: "new",
    imageUrl: undefined,
    images: [],
    sourceUrl: vdpUrl(brand, v),
    dealerDomain: brand.domain,
    evKind: cfg.phev ? "PHEV" : "BEV",
    // Stellantis's own Power Source attribute value, verbatim — what
    // downstream verification reads alongside the model name.
    fuelType: cfg.phev ? "Plug-In Hybrid" : "All Electric",
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
  let res = await politeGetJson(url, { headers: { referer: `https://${brand.host}/new-inventory` } });
  report.fetched++;
  if (String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500) {
    // One retry: a single connect blip here used to cost the whole brand's
    // night (observed on chrysler.com 2026-08-23).
    await new Promise((r) => setTimeout(r, 5000));
    res = await politeGetJson(url, { headers: { referer: `https://${brand.host}/new-inventory` } });
    report.fetched++;
  }
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

// Discover the brand's plug-in hybrid inventory LINES by sweeping the
// modelYearCode space — {prefix}{year}{00..39} over a rolling 4-year window —
// because the vehicleData catalog omits out-of-production lines entirely (the
// header's Jeep 4xe measurement). One 25-row page decides a line: every line
// observed is powertrain-pure (4,200+ rows sampled across the Wrangler/Grand
// Cherokee gas lines held zero 4xe; the 4xe lines held nothing else), so a
// first-page Plug-In Hybrid row marks the line and pullConfig then pages it
// fully with the per-record gate still deciding each row. A probe FAILURE is
// recorded as an error (flipping truncated) — an unswept line space cannot
// certify the brand complete, exactly like an unreachable catalog.
const PHEV_LINE_MAX = 39; // highest line code observed anywhere is 21
async function discoverPhevLines(brand, report) {
  const now = new Date().getFullYear();
  const configs = [];
  for (let y = now - 2; y <= now + 1; y++) {
    for (let line = 0; line <= PHEV_LINE_MAX; line++) {
      const myc = `${brand.phevSweep}${y}${String(line).padStart(2, "0")}`;
      const url = `https://${brand.host}/hostd/inventory/getinventoryresults.json?modelYearCode=${myc}&zip=${NATIONAL_ZIP}&radius=${RADIUS}&expandRadius=N&pageSize=25&pageNumber=1`;
      const res = await politeGetJson(url, { headers: { referer: `https://${brand.host}/new-inventory` } });
      report.fetched++;
      if (res.status === "robots_disallowed") {
        report.errors.push(`robots disallows results (${brand.key} phev sweep)`);
        return configs; // policy stop — no point probing 159 more paths
      }
      const data = res.json?.result?.data;
      if (!data) {
        // One retry for a transient blip; a repeat is an error (certification
        // needs the whole line space swept).
        const retry = await politeGetJson(url, { headers: { referer: `https://${brand.host}/new-inventory` } });
        report.fetched++;
        if (!retry.json?.result?.data) {
          report.errors.push(`phev sweep ${myc}: ${res.status}/${retry.status}`);
          continue;
        }
        if (hasPhevRow(retry.json.result.data)) configs.push({ modelYearCode: myc, phev: true });
        continue;
      }
      if (hasPhevRow(data)) configs.push({ modelYearCode: myc, phev: true });
    }
  }
  return configs;
}

const hasPhevRow = (data) =>
  (data.vehicles ?? []).some(
    (v) => String(attrVal(v, POWER_SOURCE_ID) ?? "").trim().toLowerCase() === "plug-in hybrid"
  );

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

// Pull one configuration to exhaustion, folding records into byVin. Returns
// false if a page failed or paging fell short of the reported national count.
async function pullConfig(brand, cfg, byVin, report) {
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
      const rec = toRecord(v, cfg, brand);
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
    if (!configs) {
      // Catalog unreachable: the error is recorded, so the brand cannot
      // certify tonight — but the PHEV line sweep below reads the inventory
      // API directly and doesn't need the catalog, so a brand whose BEV
      // discovery is down still reports its plug-ins (additive; delisting
      // stays off because truncated ends up true either way).
      if (!brand.phevSweep) { report.truncated = true; return report; }
      configs = [];
    }
  } else {
    configs = fiatConfigs(brand);
  }
  report.notes.push(`${configs.length} candidate BEV configs`);

  // Plug-in hybrid lines live outside the catalog (header) — discovered by
  // sweeping the line-code space, then paged like any other config.
  let phevConfigs = [];
  if (brand.phevSweep) {
    phevConfigs = await discoverPhevLines(brand, report);
    report.notes.push(`phev line sweep: ${phevConfigs.map((c) => c.modelYearCode).join(", ") || "none"}`);
  }
  log(`${brand.key}: ${configs.length} candidate BEV configs + ${phevConfigs.length} PHEV lines`);

  const byVin = new Map();
  for (const cfg of [...configs, ...phevConfigs]) {
    const ok = await pullConfig(brand, cfg, byVin, report);
    if (!ok) log(`${brand.key}: config ${cfg.expectedCcode ?? cfg.modelYearCode} failed`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const phevN = report.evs.filter((r) => r.evKind === "PHEV").length;
  report.notes.push(`${byVin.size - phevN} BEVs + ${phevN} PHEVs across ${configs.length + phevConfigs.length} configs, ${report.fetched} requests`);
  log(`${brand.key}: ${byVin.size - phevN} BEVs + ${phevN} PHEVs, ${report.fetched} requests, ${report.errors.length} errors`);
  // Completeness (see gm.mjs): every config fetched + fully paged AND yield over
  // the floor. The floor guards against the API returning empty (which must not
  // delist the whole brand); a clean, non-empty, fully-paged sweep certifies.
  report.truncated = report.errors.length > 0 || byVin.size < brand.minExpected;
  return report;
}
