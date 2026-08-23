// Volkswagen national inventory (vw.com, via the Group Stock Locator BFF).
//
// VW is the #2 used-EV make in the WA title data (7.2% of used BEV sales) and
// we have been carrying roughly half that share, so this lane exists to close
// a known gap rather than to add bulk: 513 used BEVs nationally, 405 of which
// (79%) were absent from our listings table when it was built.
//
// PHEV check (2026-08-23): nothing to add. VW sells no plug-in hybrid in
// the US market — the US lineup's only electrified cars are the ID.4 and
// ID. Buzz, both BEVs; the Tiguan/Touareg eHybrid variants are Europe-only
// and the GSL store is single-manufacturer VW (no trade-ins). A US VW PHEV
// would have to appear in VW's own catalogue first; revisit if one ships.
//
// What this lane is NOT: every used VW EV on a dealer lot. All 513 rows come
// back labelled "Certified Pre-Owned" and the t_cartype-U and t_preus-R facets
// agree at 6,448 across all fuels, so vw.com's used search exposes only VW's
// certified stock. Uncertified used VWs sit on dealer sites and reach us, if at
// all, through the dealer crawl. Treat this as a CPO lane like hyundai-cpo and
// the Kia CPO half, not as VW's whole used inventory.
//
// Discovery, because this one did not yield to the usual pass and the notes
// are worth keeping. vw.com/en/inventory.html renders no VINs and its only
// preloaded feature apps are the filter widgets. The real search lives behind
// the Group Stock Locator ("GSL") BFF on v3-120-1.gsl.feature-app.io, which is
// open to plain Node but answers 500 with the name of the first parameter it
// is missing — feed those back one at a time and it walks you to the full set
// (market, country, language, oneapiKey, endpoint). The one that cannot be
// guessed is market: it is NOT a country code (every one of usa/us/vwus/vwusb
// and even the German vwdeb is rejected as "Wrong market") but the vehicle
// class, market=passenger. That came out of watching the page's own requests;
// oneapiKey and the signed endpoint blob are both in the inventory page HTML.
// The results path came out of the results app bundle (apps/pages/pages.umd.js
// → `/car/search?...`), which resolves to /bff/car/search on the same host.
//
// Fair game: vw.com/robots.txt disallows /app/ and some DAM image paths, not
// inventory; the BFF host is a different origin whose robots is unreachable,
// which politePostJson/robotsAllows already treats as "no rules stated", the
// same as everywhere else. CONTROL: the identical client still gets 403 from
// Tesla's inventory API, so this is not a general wall-bypass.
//
// Unlike audi.mjs, this locator is single-manufacturer: the t_manuf facet has
// exactly one value (BQ = Volkswagen) at every filter combination, so there
// are no other makes' trade-ins to harvest here. What you see is VW's own.
//
// Completeness: certifies, and this is the opposite call from audi.mjs — made
// by a control test, not by preference. VW's per-car page is a client-rendered
// SPA shell: a real car key and a fabricated one both return 200 with byte-
// identical HTML and neither contains the VIN. So recheck cannot confirm these
// cars, and worse, its "200 but no VIN" soft-gone rule would fire on every one
// and delist the whole lane. vw.com therefore belongs in OEM_LOCATOR_DOMAINS
// (recheck skips it) and delisting rides on this pull being exhaustive, which
// it is: paging walks to meta.resultNumber exactly (43 pages of 12 + a 9-car
// tail = 513). Audi went the other way because its rows carry real dealer VDPs
// that 404 when the car is gone; the mechanism follows the evidence.
//
// USED ONLY, and that is a measurement, not a preference. The new-car sweep
// cannot be enumerated safely: VW's new BEV stock is 1,562 cars sharing only
// ~390 distinct prices (47 of them at $50,972 alone), and the backend's paging
// is not stable across requests under those ties. Walking all 131 pages
// returned 1,558 rows holding just 1,361 distinct VINs — ~13% duplicates — and
// duplicates on a shifting window mean skips of the same order. Re-sorting does
// not fix it: DATE_OFFER (a second-precision timestamp) still returned 169
// duplicates, so the instability is in the backend's paging, not in the tie
// order of one key. Certifying a walk that silently missed ~13% of the cars
// would delist real inventory every night, which is the expensive direction of
// this site's asymmetry.
//
// The used sweep has none of that problem and was confirmed twice: 513 rows,
// 513 distinct VINs, 513 advertised, zero duplicates. 513 cars over 43 pages
// with distinct prices and mileages orders deterministically. So this lane
// takes the half it can prove and leaves the half it cannot — VW's used EVs
// are the point anyway (VW is the #2 used-EV make in the WA data). Nothing is
// ever ingested under vw.com from the new side, so certifying the domain on
// the used pull cannot delist new rows that were never claimed.
//
// If the new half is ever wanted, it needs a different enumeration, not a
// bigger page budget: repeated passes unioned until the union reaches
// meta.resultNumber, certifying only on that proof, or a partition whose every
// slice fits inside one 12-row page.
import { politeGetJson } from "../http.mjs";
import { EV_MODEL_RE, EV_ONLY_WMIS } from "../ev.mjs";
import { stateFromZip } from "./zip-state.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const VW = {
  key: "vw",
  domain: "vw.com",
  make: "Volkswagen",
  api: "https://v3-120-1.gsl.feature-app.io/bff/car/search",
  // Floor for the used sweep. Observed 513; this trips only if the fuel facet
  // or the market identifier stops resolving, not on normal stock swings.
  minExpected: 200,
};

// recheck skips vw.com — its VDP cannot distinguish a live car from a gone one
// (see header). Delisting comes from this lane certifying complete instead.
export const OEM_LOCATOR_DOMAINS = new Set([VW.domain]);

const BFF = "https://v3-120-1.gsl.feature-app.io/bff/car/search";
const PAGE = 12; // server hard-caps at 12 whatever pageitems asks for
const MAX_PAGES = 200; // runaway guard; 513 used cars is 43 pages
// Used stock only — the new sweep is not safely enumerable (see header).
const CARTYPE_USED = "U";
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const MANUF_VW = "BQ";
const FUEL_ELECTRIC = "E";

// Both are public page config, lifted from www.vw.com/en/inventory.html: the
// GSL feature app's api key and the signed CMS endpoint descriptor it passes
// through. Neither is a credential for anything but this public catalogue.
const ONEAPI_KEY = "nOqkwPxxu8ViK9aaHvTkglzVZAlX4yIx";
const ENDPOINT =
  '{"endpoint":{"type":"publish","country":"us","language":"en","content":"onehub_pkw","envName":"prod","testScenarioId":null},"signature":"VehBWLTr2hxx8TJ85NJrpgRXoPfAyNcz2K8KuyXQTNI="}';

const HEADERS = {
  origin: "https://www.vw.com",
  referer: "https://www.vw.com/en/inventory/results.html",
};

function searchUrl({ cartype, page }) {
  const p = new URLSearchParams({
    country: "US",
    language: "en",
    market: "passenger", // vehicle class, not a country — see header
    oneapiKey: ONEAPI_KEY,
    endpoint: ENDPOINT,
    t_manuf: MANUF_VW,
    t_petr: FUEL_ELECTRIC,
    t_cartype: cartype,
    pageitems: String(PAGE),
    page: String(page),
    sort: "PRICE_SALE",
    sortdirection: "ASC",
  });
  return `${BFF}?${p.toString()}`;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/ALL.?WHEEL|AWD|4MOTION/.test(s)) return "AWD";
  if (/REAR.?WHEEL|RWD/.test(s)) return "RWD";
  if (/FRONT.?WHEEL|FWD/.test(s)) return "FWD";
  return undefined;
};

// See audi.mjs for why a maker's electric facet is not taken as proof on its
// own: the shared VTP backend files plug-in hybrids and fuel-cell cars under
// the same "E" code. A second signal (EV-only WMI, or a nameplate the shared
// classifier knows) is required for a BEV-high claim; otherwise the row ships
// as name_match for vpic-enrich to promote or refute before ingest sees it.
function evClaim(vin, make, model) {
  if (EV_ONLY_WMIS.has(vin.slice(0, 3))) return { evKind: "BEV", evConfidence: "high" };
  if (EV_MODEL_RE.test(`${make ?? ""} ${model ?? ""}`)) return { evKind: "BEV", evConfidence: "high" };
  return { evKind: "BEV?", evConfidence: "name_match" };
}

// title is "2021 Volkswagen ID.4 Pro S" and modelKtText is the model alone
// ("ID.4"), so what follows the model in the title is the trim. Returns
// undefined rather than a guess when the title doesn't contain the model.
function trimOf(title, model) {
  const t = String(title ?? "").trim();
  if (!t || !model) return undefined;
  const i = t.toLowerCase().indexOf(String(model).toLowerCase());
  if (i < 0) return undefined;
  return t.slice(i + String(model).length).trim() || undefined;
}

// cartype "N" is new stock. Everything else is used, and VW labels the
// warranted subset "Certified Pre-Owned" — map that to certified so the site
// can tell the two apart, rather than flattening both to "used".
function conditionOf(car) {
  if (String(car.cartype?.code ?? "").toUpperCase() === "N") return "new";
  const label = `${car.carTypeLabel ?? ""} ${car.cartype?.value ?? ""}`;
  return /certified|cpo/i.test(label) ? "certified" : "used";
}

// The car's page on vw.com. Human-facing only: it is a client-rendered shell,
// which is exactly why recheck skips this domain (see header).
const vdpUrl = (key) =>
  `https://www.vw.com/en/inventory/results.html/__app/search/car/${encodeURIComponent(String(key))}.app`;

function toRecord(car, drops) {
  const bad = (reason) => {
    drops[reason] = (drops[reason] ?? 0) + 1;
    return null;
  };
  const vin = String(car.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return bad("bad vin");
  // Structural gate on the record's own fuel code, not just the query facet.
  const fuel = String(car.motor?.fuel?.code ?? "").toUpperCase();
  if (fuel && fuel !== FUEL_ELECTRIC) return bad("non-electric fuel code");
  const year = Number(car.modelyear?.value ?? car.salesModelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return bad("implausible year");
  const model = String(car.modelKtText ?? "").trim() ||
    String(car.model?.value ?? "").replace(/^volkswagen\s+/i, "").trim();
  if (!model) return bad("no model name");
  const make = String(car.manuf?.value ?? VW.make).trim() || VW.make;
  const d = car.dealer ?? {};
  const zip = /^\d{5}/.test(String(d.zip?.value ?? "")) ? String(d.zip.value).slice(0, 5) : undefined;
  // dealer.region is the state code directly; fall back to the ZIP3 table when
  // it is missing or malformed rather than leaving the car unplaceable.
  const region = String(d.region?.value ?? "").toUpperCase();
  const state = /^[A-Z]{2}$/.test(region) ? region : stateFromZip(zip);
  const images = (car.images ?? [])
    .filter((i) => i?.type === "photo" || !i?.type)
    .map((i) => i?.href)
    .filter((u) => typeof u === "string")
    .slice(0, 12);
  const title = car.title ?? car.localCarTitle?.value;
  return {
    vin,
    year,
    make,
    model,
    trim: trimOf(title, model),
    ...pickTaggedPrice("vw", [
      ["parsedPrice", num(car.parsedPrice?.value)],
      ["configurationPrice", num(car.configurationPrice)],
    ]),
    mileage: num(car.mileage?.raw_value),
    driveLine: drive(car.drive?.value),
    exteriorColor: car.color?.out?.value || undefined,
    interiorColor: car.color?.in?.[0]?.value || undefined,
    dealerName: d.name?.value || undefined,
    city: d.city?.value || undefined,
    state,
    zip,
    condition: conditionOf(car),
    imageUrl: images[0],
    images,
    sourceUrl: vdpUrl(car.key ?? car.carid),
    dealerDomain: VW.domain,
    ...evClaim(vin, make, model),
    platform: "vw-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// One page, with a single retry on a transient failure.
async function fetchPage(cartype, page, report) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await politeGetJson(searchUrl({ cartype, page }), { headers: HEADERS });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows the GSL search endpoint");
      return null;
    }
    if (res.status === 200 && res.json?.cars) return res.json;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    report.errors.push(`${cartype} page ${page}: HTTP ${res.status}`);
    return null;
  }
  return null;
}

// Walk one stock type to exhaustion. Returns false if it could not be walked
// in full — the caller must then refuse to certify the whole domain.
async function sweep(cartype, byVin, report, log) {
  const drops = {};
  let kept = 0;
  let seen = 0;
  let dupes = 0;
  let total = null;
  let complete = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchPage(cartype, page, report);
    if (!data) break;
    total ??= data.meta?.resultNumber ?? null;
    const cars = data.cars ?? [];
    if (!cars.length) {
      complete = true;
      break;
    }
    seen += cars.length;
    for (const car of cars) {
      const rec = toRecord(car, drops);
      if (!rec) continue;
      if (byVin.has(rec.vin)) dupes++;
      else {
        byVin.set(rec.vin, rec);
        kept++;
      }
    }
    if (total != null && seen >= total) {
      complete = true;
      break;
    }
  }
  const dropped = Object.entries(drops).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
  if (!complete) report.errors.push(`${cartype}: walked ${seen} of ${total ?? "?"} — incomplete, cannot certify`);
  // A repeated VIN means the result window shifted under the walk, and a walk
  // that repeats cars is also a walk that skips them. That is exactly the
  // condition that makes the new-car sweep unusable (see header), so treat any
  // repeat as proof this pull is not exhaustive rather than assuming the used
  // side stays well-behaved forever.
  if (dupes > 0) {
    complete = false;
    report.errors.push(`${cartype}: ${dupes} repeated VINs — paging shifted mid-walk, cannot certify`);
  }
  report.notes.push(`cartype ${cartype}: ${seen}/${total ?? "?"} rows, ${kept} kept, ${dupes} repeats, dropped ${dropped}`);
  log(`vw/${cartype}: ${kept} EVs (${seen} of ${total ?? "?"} rows; ${dupes} repeats; dropped ${dropped})`);
  return complete;
}

// Pull VW's national used BEV inventory. crawl.mjs-shaped report on the real
// vw.com domain; certifies complete (and so drives delisting, since recheck
// skips this domain) only when the walk reached the advertised result count
// with no repeated VINs and no errors — see header.
export async function pullVw({ log = () => {} } = {}) {
  const report = { domain: VW.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();

  const complete = await sweep(CARTYPE_USED, byVin, report, log);
  report.notes.push("used stock only — VW's new-car paging is not safely enumerable (see module header)");

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const used = report.evs.filter((r) => r.condition !== "new").length;
  report.notes.push(`${report.evs.length} BEVs (${used} used/certified) across ${new Set(report.evs.map((r) => r.dealerName)).size} dealers`);
  if (byVin.size < VW.minExpected) {
    report.errors.push(`collected ${byVin.size} < floor ${VW.minExpected} — the fuel facet or market identifier may have moved`);
  }
  report.truncated = !complete || report.errors.length > 0 || byVin.size < VW.minExpected;
  return report;
}
