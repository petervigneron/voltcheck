// Volvo's national used inventory ("Certified by Volvo", cpo.volvocars.us).
//
// What this lane is: every Volvo rooftop's used stock, certified and not, in
// one national index — 8,215 cars of which 707 come back on the electric
// facet. Unlike vw.com's used search (certified only), this store carries
// both: 412 franchise-approved and 295 plain used on the first full sweep.
// It is the only public, structured route to used EX30/EX40/EX90/EC40/C40
// Recharge/XC40 Recharge stock, and 171 distinct dealer domains are behind
// it, most of which the dealer crawl cannot reach.
//
// WHY volvocars.com ITSELF IS NOT THE LANE, and don't re-probe it. The memory
// note said Volvo was "Next.js RSC, 0 VINs". That was half right and the
// wrong half mattered: www.volvocars.com/us/inventory/ now server-renders its
// whole 167-page catalogue into the RSC flight payload, complete with dealer
// name, dealerId, MSRP, colours, range, trim and a schema.org Product block
// carrying fuelType "Fully electric". It renders NO VIN — not one, anywhere
// in 1.17 MB, and its per-car page (/us/shop/{model}/{key}/) redirects
// straight back to the list for a plain client. Those cars are keyed by an
// 8-character configuration id, because they are allocated factory stock, not
// titled vehicles. VoltCheck keys and dedupes on the 17-character VIN, so
// that catalogue is not ingestable at any effort — the same wall Polestar's
// preconfigured-cars API hit. New Volvos are therefore out of reach; the used
// side below is not, and used is what this site is for.
//
// Discovery, for the next person. cpo.volvocars.us is linked from the
// volvocars.com inventory page footer and runs a Codeweavers storefront
// (Angular, no SSR, so grep the bundle not the HTML). Its store page publishes
// three things in plain <meta> tags: the API host (services.codeweavers.net),
// the application name, and a base64+urlencoded configuration blob holding the
// public storefront ApiKey and the organisation reference 55574 ("Certified by
// Volvo"). The endpoint path and the exact request shape came out of
// main.*.js — `searchVehicles()` posts to /api/vehicles/search-with-facets and
// `buildSearchRequest()` spells out every field. Everything after that was the
// VW trick: the endpoint answers 400 naming the first field it is missing
// (Filters -> Filters.Vehicle -> ResultsPerPage minimum -> SortBy enum), so
// feed them back one at a time until it answers 200.
//
// Fair game, and the controls. services.codeweavers.net/robots.txt disallows
// only /forms/ and /navigator/ — /api/ is permitted, and politeGetJson's
// robots check is left to enforce that rather than assumed. cpo.volvocars.us's
// own robots explicitly Allows /*/vehicles*. The X-CW-ApiKey is a public
// storefront key printed in the page's HTML for any visitor, in the same class
// as VW's oneapiKey and Hyundai's Referer requirement: it identifies the
// storefront, it is not a credential we were not given. No challenge solved,
// no proxy, no bot detection worked around. CONTROL: the same client still
// gets Akamai 403 from Tesla's inventory API, so this is not a general wall
// bypass. NOTE for whoever reads volvocars.com's robots.txt and panics: it
// does carry `Disallow: /api/*`, but only inside the group addressed to named
// AI-training and AI-search crawlers (GPTBot, ClaudeBot, CCBot, PerplexityBot
// and so on). The `User-agent: *` group disallows nothing of the sort. This
// lane does not touch volvocars.com anyway; it is recorded here so nobody
// mistakes that rule for one aimed at inventory aggregators, and so the owner
// can overrule this reading if he wants to treat the AI-crawler group as
// binding on us in spirit.
//
// THE CLAIMS TRAP, and the second signal that closes it. Volvo's electric
// facet is not proof of a BEV, exactly as Audi's fuel=E was not: the first
// full sweep returned two XC60s, three XC90s and a V60 Polestar under
// Fuel "Electric" — a B5 mild hybrid, three T8 plug-ins and a petrol
// performance wagon. All six are caught by a structured second field the
// record carries anyway: EngineSize is 0 on every one of the 701 real BEVs
// and 1969 or 2000 on every one of the six impostors, with no overlap. So the
// gate here is Fuel==="Electric" AND EngineSize===0, not the facet alone.
// Beyond that the usual rule applies — BEV-high only when the WMI is EV-only
// or the nameplate matches EV_MODEL_RE, otherwise name_match for vpic-enrich
// to promote or refute. That leaves ~265 rows at name_match, and deliberately:
// 256 of them are XC40 Recharge BEVs that Volvo's feed badges as a plain
// "XC40", a nameplate that also ships with a petrol engine, and EX40/EC40 are
// BEV-only names the shared classifier does not know yet. ingest.mjs holds
// name_match rows until vPIC confirms them, which is the correct outcome.
//
// Model year is Specification.ModelYear and it is trustworthy: cross-checked
// against the VIN's own model-year character it agreed on 704 of 707, the
// three exceptions being 2025-stamped EX30s the store lists as 2026. Do NOT
// use DateOfManufacture for this — that is a build date and disagrees with
// both on a third of the stock.
//
// Price is OnTheRoadPrice, floored. One car in 707 came back at $899 (a
// 4,175-mile XC40 Recharge whose dealer page is a wholesale listing), which
// is a data error, not a bargain, and a false bargain is the most expensive
// mistake this site can make. Below the floor the row still ships — it just
// ships without a price rather than with a fictional one.
//
// Completeness: does NOT certify, same call as audi.mjs and for the same two
// reasons, not from doubt about the walk. The walk itself is clean (707 rows,
// 707 distinct VINs, reaching the advertised total in 8 pages of 100 with
// zero repeats). But every row carries a real per-VIN dealer VDP, and a
// control test showed those retire cleanly: a live VIN returns 200 with the
// VIN on the page, while a fabricated one lands on the dealer's own
// "?redirectFromMissingVDP=true" search page with no VIN — which is exactly
// recheck's soft-gone rule, firing on direct per-car evidence. And the rows
// sit under a synthetic domain spanning 171 real dealer domains, several of
// which the dealer crawl also covers; certifying a domain that is not a site
// is the kind of claim that goes wrong quietly. So: truncated always, and
// volvo-cpo is deliberately NOT in recheck's OEM_LOCATOR_DOMAINS skip set.
//
// Single-manufacturer, checked rather than assumed (the memory's rule after
// Audi): the Manufacturer facet has exactly one value, Volvo, at 8,215 of
// 8,215. There are no other makes' trade-ins to harvest here, the same
// negative VW returned.
import { politePostJson } from "../http.mjs";
import { EV_MODEL_RE, EV_ONLY_WMIS } from "../ev.mjs";

export const VOLVO = {
  key: "volvo",
  // Synthetic: these cars sit on 171 different dealer domains and the set is
  // not any one site's inventory. Never certifies (see header).
  domain: "volvo-cpo",
  make: "Volvo",
  api: "https://services.codeweavers.net/api/vehicles/search-with-facets",
  // Floor well under the 707 observed: trips if the fuel facet or the
  // organisation reference stops resolving, not on normal stock swings.
  minExpected: 250,
};

// Deliberately empty: recheck must NOT skip this domain. The rows carry real
// dealer VDPs that drop the VIN when the car is gone (see header).
export const OEM_LOCATOR_DOMAINS = new Set();

const API = VOLVO.api;
const PAGE = 100; // server's own maximum; 250 is refused by name
const MAX_PAGES = 40; // runaway guard; 707 cars is 8 pages
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// All three are public storefront configuration, lifted from the <meta> tags
// of cpo.volvocars.us/en-US/store/. The key identifies the storefront to
// Codeweavers; it is not a credential for anything but this public catalogue.
const CW_API_KEY = "85JGQ65uzgkcG23sWs";
const ORG_REFERENCE = "55574"; // "Certified by Volvo" — the national store
const STORE_SLUG = "all"; // the store's own all-models landing page

const HEADERS = {
  origin: "https://cpo.volvocars.us",
  referer: "https://cpo.volvocars.us/",
  "X-CW-ApiKey": CW_API_KEY,
  "X-CW-ApplicationName": "storefront",
  "X-CW-Accept-Language": "en-US",
};

// Shape copied from the storefront's own buildSearchRequest(); every field it
// sends that the validator insists on is here, and nothing it does not.
const searchBody = (page) => ({
  SortBy: "PriceAscending",
  Page: page,
  ResultsPerPage: PAGE,
  IncludeNoFinanceOption: true,
  Filters: {
    Vehicle: { Query: null, IncludeReservedVehicles: true, SelectedFacets: { Fuel: ["Electric"] } },
    DigitalRetailStore: { Page: { Slug: STORE_SLUG } },
  },
  OrganisationIdentifier: { Type: "CodeweaversReference", Value: ORG_REFERENCE },
});

// Under this, the number is a feed error rather than an asking price — the
// same threshold recheck.mjs applies to dealer feeds, and for the same
// reason. Printing $899 on a 4,000-mile XC40 would be a false bargain.
const PRICE_FLOOR = 3000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/ALL.?WHEEL|AWD/.test(s)) return "AWD";
  if (/REAR.?WHEEL|RWD/.test(s)) return "RWD";
  if (/FRONT.?WHEEL|FWD/.test(s)) return "FWD";
  return undefined;
};

// See audi.mjs and vw.mjs: a maker's own electric facet is not proof on its
// own. A second signal — an EV-only WMI, or a nameplate the shared classifier
// knows — is required for a BEV-high claim; otherwise the row ships as
// name_match and ingest.mjs holds it until vPIC promotes or refutes it.
function evClaim(vin, make, model) {
  if (EV_ONLY_WMIS.has(vin.slice(0, 3))) return { evKind: "BEV", evConfidence: "high" };
  if (EV_MODEL_RE.test(`${make ?? ""} ${model ?? ""}`)) return { evKind: "BEV", evConfidence: "high" };
  return { evKind: "BEV?", evConfidence: "name_match" };
}

// Variant is Volvo's own trim string. It usually repeats the model first
// ("XC40 Recharge Ultimate, Twin Motor, Electric") and sometimes doesn't
// ("Ultimate"); strip the repeat when it is there so the trim reads as a trim,
// and return undefined rather than an empty string when nothing is left.
function trimOf(variant, model) {
  let t = String(variant ?? "").trim();
  if (!t) return undefined;
  const m = String(model ?? "").trim();
  if (m && t.toLowerCase().startsWith(m.toLowerCase())) t = t.slice(m.length).replace(/^[\s,]+/, "");
  return t || undefined;
}

function toRecord(row, drops) {
  const bad = (reason) => {
    drops[reason] = (drops[reason] ?? 0) + 1;
    return null;
  };
  const v = row?.Vehicle;
  const spec = v?.Specification ?? {};
  const phys = v?.Physical ?? {};
  const vin = String(phys.Vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return bad("bad vin");

  // The structural gate. Fuel alone carried a mild hybrid, three plug-ins and
  // a petrol wagon on the first sweep; EngineSize separates them cleanly.
  const fuel = String(spec.FuelType ?? "");
  if (!/^electric$/i.test(fuel)) return bad("non-electric fuel");
  if (Number(spec.EngineSize) !== 0) return bad("combustion engine under an electric label");

  const year = Number(spec.ModelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return bad("implausible year");
  const model = String(spec.Model ?? "").trim();
  if (!model) return bad("no model name");
  const make = String(spec.Manufacturer ?? VOLVO.make).trim() || VOLVO.make;

  // Owner's rule: never list a car without a location. The retailer address
  // is complete on every row observed; a row that loses it is dropped, not
  // guessed at.
  const addr = row?.Retailer?.Address ?? {};
  const state = /^[A-Z]{2}$/.test(String(addr.County ?? "").toUpperCase())
    ? String(addr.County).toUpperCase()
    : undefined;
  if (!state) return bad("no dealer state");
  const zip = /^\d{5}/.test(String(addr.Postcode ?? "")) ? String(addr.Postcode).slice(0, 5) : undefined;

  const price = num(phys.OnTheRoadPrice);
  const images = (v.Images ?? []).map((i) => i?.Url).filter((u) => typeof u === "string").slice(0, 12);

  // Volvo's store labels the warranted subset franchise-approved; keep that
  // distinct from plain used rather than flattening both.
  const condition =
    String(phys.Status ?? "").toLowerCase() === "new" ? "new" : phys.IsFranchiseApproved ? "certified" : "used";

  return {
    vin,
    year,
    make,
    model,
    trim: trimOf(spec.Variant, model),
    // Below the floor the number is a feed error; ship the car without a
    // price rather than with a fictional one (see header).
    priceUsd: price != null && price >= PRICE_FLOOR ? Math.round(price) : undefined,
    mileage: /^miles$/i.test(String(phys.MileageUnit ?? "Miles")) ? num(phys.Mileage) : undefined,
    driveLine: drive(spec.Drive),
    exteriorColor: phys.ExteriorColour?.Description || undefined,
    interiorColor: phys.InteriorColour?.Description || undefined,
    dealerName: row?.Retailer?.Name || undefined,
    city: addr.TownCity || undefined,
    state,
    zip,
    condition,
    imageUrl: images[0],
    images,
    // The dealer's own page for this car — human-facing AND the evidence
    // recheck retires the row on (see header).
    sourceUrl: phys.ExternalVehicleLink || undefined,
    dealerDomain: VOLVO.domain,
    ...evClaim(vin, make, model),
    platform: "volvo-cpo-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// One page, with a single retry on a transient failure.
async function fetchPageOfCars(page, report) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await politePostJson(API, { headers: HEADERS, body: searchBody(page) });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows the Codeweavers vehicle search endpoint");
      return null;
    }
    if (res.status === 200 && Array.isArray(res.json?.Results)) return res.json;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    report.errors.push(`page ${page}: HTTP ${res.status}`);
    return null;
  }
  return null;
}

// Pull Volvo's national used BEV inventory. crawl.mjs-shaped report, on the
// synthetic volvo-cpo domain, always truncated (see header).
export async function pullVolvo({ log = () => {} } = {}) {
  const report = {
    domain: VOLVO.domain, kind: "oem-locator", budget: null, fetched: 0,
    vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [],
  };
  const byVin = new Map();
  const drops = {};
  let seen = 0;
  let dupes = 0;
  let advertised = null;
  let walkedOut = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchPageOfCars(page, report);
    if (!data) break;
    // Stock churns under a multi-page walk, so the advertised total moves by
    // a car or two between pages; keep the first as the yardstick.
    advertised ??= Number(data.TotalResults) || null;
    const rows = data.Results ?? [];
    if (!rows.length) {
      walkedOut = true;
      break;
    }
    seen += rows.length;
    for (const row of rows) {
      const rec = toRecord(row, drops);
      if (!rec) continue;
      if (byVin.has(rec.vin)) dupes++;
      else byVin.set(rec.vin, rec);
    }
    if (page >= (Number(data.TotalPages) || MAX_PAGES)) {
      walkedOut = true;
      break;
    }
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const dropped = Object.entries(drops).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
  report.notes.push(`walked ${seen} of ${advertised ?? "?"} advertised electric rows, ${byVin.size} kept, ${dupes} repeats, dropped ${dropped}`);
  const certified = report.evs.filter((r) => r.condition === "certified").length;
  report.notes.push(`${report.evs.length} BEVs (${certified} franchise-approved) across ${new Set(report.evs.map((r) => r.dealerName)).size} retailers in ${new Set(report.evs.map((r) => r.state)).size} states`);
  const named = report.evs.filter((r) => r.evConfidence === "name_match").length;
  if (named) report.notes.push(`${named} rows ship as name_match (XC40/EX40/EC40 nameplates the shared classifier does not settle) — vpic-enrich promotes or refutes them`);
  if (!walkedOut) report.errors.push(`stopped after ${seen} rows without reaching the last page`);
  if (byVin.size < VOLVO.minExpected) {
    report.errors.push(`collected ${byVin.size} < floor ${VOLVO.minExpected} — the electric facet or the organisation reference may have moved`);
  }
  log(`volvo-cpo: ${byVin.size} BEVs (${seen} of ${advertised ?? "?"} rows; ${dupes} repeats; dropped ${dropped})`);
  // Never certifies — recheck retires these per VIN instead (see header).
  report.truncated = true;
  return report;
}
