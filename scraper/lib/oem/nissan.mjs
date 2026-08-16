// Nissan national inventory locator (nissanusa.com).
//
// Nissan's find-inventory tools post to a public GraphQL endpoint that needs no
// auth token (only an Origin/Referer) — verified from a plain Node fetch
// 2026-08-15 (control: tesla.com and ford.com/inventory both Akamai-403 the
// identical request; graphql.nissanusa.com returns 200 for both operations).
//   POST https://graphql.nissanusa.com/graphql
//   new: operation getInventory  — modelCodes filter, engine.fuelType "Electric"
//   cpo: operation getCpoInventory — queryFilters fuelType "E" (BEV), used stock
// The endpoint accepts arbitrary trimmed queries (not persisted-only), so we
// send a compact query selecting just the fields we normalize.
//
// The hard part is COVERAGE. Results are distance-sorted from the query point
// and the server caps paging at offset 120 / pageSize 12 (≈132 nearest per
// location) with no way past it, and radius is not a usable knob (radius:null
// = nationwide; any integer radius returns an empty result). So one call only
// ever yields the ~132 cars nearest a point. We sweep a national covering grid
// (lib/oem/grid.mjs) and, because every point "sees" the whole country in the
// distance-sorted list, bound each cell CLIENT-side by dealer.distance.miles —
// keeping only cars within CELL_RADIUS_MI and subdividing a cell only when it
// is genuinely dense (paged to the ceiling with every car still inside the
// radius). This reproduces Hyundai CPO's radius+subdivision behaviour on an
// endpoint that has no radius.
//
// Coverage is therefore a best-effort snapshot with a hard per-cell cap, never
// provably complete — so BOTH pulls are truncated:true ALWAYS, on their own
// synthetic domains ("nissan-new" / "nissan-cpo") isolated from any complete
// pull (a covering grid must never drive delisting; see gm.mjs completeness
// contract and HYUNDAI_CPO). And the per-VIN Nissan VDP echoes the VIN from its
// URL even for a bogus VIN (a client-rendered shell → "alive" forever), so both
// domains join the recheck-skip set. Net effect: additive coverage of every
// franchised Nissan rooftop (incl. bot-walled dealer domains), refreshed
// nightly; sold cars are pruned when they drop out of the nightly grid on the
// merge side rather than by per-VIN recheck.
//
// US EV lineup (2026-08): new BEV = LEAF only (~1.2k; Ariya is discontinued as
// new, 0 units — its code is kept so a restock shows up). Rogue Plug-in Hybrid
// is excluded (PHEV) so the per-cell cap tracks LEAF density, not hybrids.
// Used/CPO BEV = LEAF + ARIYA (~530), the higher-value half for this site.
import { politePostJson } from "../http.mjs";
import { coveringGrid, subdivideZips } from "./grid.mjs";

export const NISSAN = {
  key: "nissan",
  domain: "nissan-new", // synthetic: grid pull, truncated always (see header)
  make: "Nissan",
  api: "https://graphql.nissanusa.com/graphql",
  // BEV new model codes. 30274 = 2026 LEAF, 30002 = prior LEAF, 29852 = ARIYA
  // (0 today). PHEV Rogue (30348) is deliberately absent. The per-record
  // engine.fuelType === "Electric" guard backs this up regardless.
  modelCodes: ["30274", "30002", "29852"],
};

export const NISSAN_CPO = {
  key: "nissan-cpo",
  domain: "nissan-cpo", // synthetic, truncated always
  make: "Nissan",
  api: "https://graphql.nissanusa.com/graphql",
};

// recheck.mjs must skip these: coverage is a truncated grid (so db-sync never
// delists them) AND the per-VIN VDP echoes the VIN from its URL, which would
// read as "alive" forever (same fake-alive shell caveat as the GM locators).
export const OEM_LOCATOR_DOMAINS = new Set([NISSAN.domain, NISSAN_CPO.domain]);

const MARKET = { lang: "en", region: "us", brand: "nissan", application: "inventory" };
const LIMIT = 12; // server page-size cap
const OFFSET_MAX = 120; // server offset cap (offset+limit ≈ 132 max per point)
const CELL_RADIUS_MI = 100; // client-side radius bounding a metro cell; halves each subdivision
const MAX_DEPTH = 2; // subdivision depth cap (≤21 cells/metro: radius 100→50→25mi)
const REQUEST_BUDGET = 300; // hard per-lot request ceiling — keeps this single-host
// serial lane polite (~5-6 min/lot). Coverage is truncated best-effort anyway,
// and the densest metros (swept first) are where the subdivision spend matters.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// Anchor the sweep on metros, not a full national ZCTA grid. This endpoint
// takes no radius (radius:null = nationwide distance-sorted, capped at ~132 per
// point), so a full ~450-cell national grid means ~450 requests PER lot just to
// discover that most cells are empty — and it is all one host at 1.1s/request,
// which made the nightly run 40+ minutes. LEAF/ARIYA cluster in metros, so a
// curated metro list + adaptive subdivision captures the overwhelming majority
// at ~1/5 the cost. Coverage is a best-effort sample either way (truncated:true
// always — see header), so trading the long rural tail for a practical runtime
// is the right call. One representative ZIP per metro (must exist in
// web/data/zips.json for its lat/lng); Honolulu + Anchorage included.
const METRO_ZIPS = [
  // California
  "90001", "90015", "91101", "92801", "92101", "92660", "93301", "93720", "95814", "95112", "94102", "94538", "94596", "95376",
  // Pacific NW + Mountain
  "98101", "98402", "99201", "97201", "97401", "83702", "89101", "89501", "84101", "85001", "85701", "80202", "80904", "87102",
  // Southwest + Texas
  "79901", "75201", "76101", "77001", "78201", "78701", "73102", "74101",
  // Midwest
  "60601", "53202", "55401", "50309", "68102", "66101", "64101", "63101", "46201", "43215", "44101", "45201", "48201", "49503", "53703",
  // Southeast
  "70112", "39201", "36601", "35203", "72201", "37201", "38103", "40202", "30301", "29201", "29601", "28201", "27601", "32201", "32801", "33101", "33601", "33901",
  // Mid-Atlantic + Northeast
  "20001", "23219", "21201", "19101", "15201", "10001", "11201", "12207", "13202", "14604", "06103", "02101", "03101", "04101",
  // Off-CONUS
  "96813", "99501",
];

const NEW_QUERY = `query getInventory($market: Market!, $location: Geolocation!, $queryFilters: [InventoryFilterQuery!]!, $modelCodes: [String], $pagination: PaginationInput, $radius: Int, $sortMode: InventorySortModeEnum) {
  Inventory { getInventory(market:$market, location:$location, queryFilters:$queryFilters, modelCodes:$modelCodes, pagination:$pagination, radius:$radius, sortMode:$sortMode) {
    models {
      vin modelYear modelName gradeName price priceWithoutFeesLevies
      engine { driveTrain fuelType }
      fullColour { label } upholstery { label }
      fallbackExteriorImage { srcSet { medium large } }
      dealer { name distance { miles } address { addressLine1 postalCode city stateCode state } }
    }
  } }
}`;

const CPO_QUERY = `query getCpoInventory($market: Market!, $location: Geolocation!, $queryFilters: [CpoInventoryFilterQuery!], $pagination: PaginationInput, $radius: Int, $sortMode: CpoInventorySortMode) {
  Inventory { getCpoInventory(market:$market, location:$location, queryFilters:$queryFilters, pagination:$pagination, radius:$radius, sortMode:$sortMode) {
    models {
      vin modelYear modelName gradeName mileage stockType certification fuelType price
      displayImage
      fullColour { label } upholstery { label }
      dealer { name distance { miles } address { addressLine1 postalCode city stateCode state } }
    }
  } }
}`;

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC")
    .split(" ")
);

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/AWD|E-4ORCE|ALL.?WHEEL/.test(s)) return "AWD";
  if (/RWD|REAR/.test(s)) return "RWD";
  if (/FWD|FRONT/.test(s)) return "FWD";
  return undefined;
};

const titleCase = (s) => String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

// "Nissan LEAF" → "Leaf", "ARIYA" → "Ariya".
const cleanModel = (s) => {
  const m = String(s ?? "").replace(/^nissan\s+/i, "").trim();
  return m ? titleCase(m) : "";
};

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (!s) return undefined;
  return s.startsWith("//") ? `https:${s}` : s.startsWith("http://") ? "https://" + s.slice(7) : s.startsWith("https://") ? s : undefined;
};

const dealerLoc = (addr) => {
  const state = US_STATES.has(String(addr?.stateCode ?? "").toUpperCase()) ? String(addr.stateCode).toUpperCase() : undefined;
  const zip = /^\d{5}/.test(String(addr?.postalCode ?? "")) ? String(addr.postalCode).slice(0, 5) : undefined;
  const city = addr?.city ? titleCase(addr.city) : undefined;
  return { state, zip, city };
};

// getInventory model → normalized new BEV listing (engine.fuelType gates BEV).
function toRecord(m) {
  const vin = String(m.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  if (String(m.engine?.fuelType ?? "") !== "Electric") return null; // structured BEV guard
  const year = Number(m.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = cleanModel(m.modelName);
  if (!model) return null;
  const img = httpsUrl(m.fallbackExteriorImage?.srcSet?.large || m.fallbackExteriorImage?.srcSet?.medium);
  const { state, zip, city } = dealerLoc(m.dealer?.address);
  return {
    vin,
    year,
    make: NISSAN.make,
    model,
    trim: m.gradeName || undefined,
    priceUsd: num(m.priceWithoutFeesLevies) ?? num(m.price),
    driveLine: drive(m.engine?.driveTrain),
    exteriorColor: m.fullColour?.label || undefined,
    interiorColor: m.upholstery?.label || undefined,
    dealerName: m.dealer?.name || undefined,
    city,
    state,
    zip,
    condition: "new",
    imageUrl: img,
    images: img ? [img] : [],
    sourceUrl: `https://www.nissanusa.com/shopping-tools/search-inventory/vehicle-details/${vin}`,
    dealerDomain: NISSAN.domain,
    evKind: "BEV",
    evConfidence: "high", // engine.fuelType === "Electric", a structured fuel field
    platform: "nissan-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// getCpoInventory model → normalized used/certified BEV listing (fuelType "E").
function toCpoRecord(m) {
  const vin = String(m.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  if (String(m.fuelType ?? "").toUpperCase() !== "E") return null; // BEV guard (server already filters)
  const year = Number(m.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = cleanModel(m.modelName);
  if (!model) return null;
  const img = httpsUrl(m.displayImage);
  const { state, zip, city } = dealerLoc(m.dealer?.address);
  const certified = Boolean(m.certification && String(m.certification).trim());
  return {
    vin,
    year,
    make: NISSAN.make,
    model,
    trim: m.gradeName || undefined,
    priceUsd: num(m.price),
    mileage: Number.isFinite(m.mileage) ? Math.round(m.mileage) : num(m.mileage),
    exteriorColor: m.fullColour?.label || undefined,
    interiorColor: m.upholstery?.label || undefined,
    dealerName: m.dealer?.name || undefined,
    city,
    state,
    zip,
    certified: certified || undefined,
    condition: certified ? "certified" : "used",
    imageUrl: img,
    images: img ? [img] : [],
    sourceUrl: `https://www.nissanusa.com/shopping-tools/search-inventory/certified-pre-owned/vehicle-details/${vin}`,
    dealerDomain: NISSAN_CPO.domain,
    evKind: "BEV",
    evConfidence: "high", // server-side fuelType=E facet, not a name match
    platform: "nissan-cpo-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// One GraphQL POST with a single retry on transient failure (same rationale as
// gm.mjs: a ~500-call sweep will hit the odd blip). Returns the inventory
// object ({ models: [...] }) or null.
async function gql(api, op, query, variables, report) {
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(api, {
      headers: { origin: "https://www.nissanusa.com", referer: "https://www.nissanusa.com/" },
      body: { operationName: op, variables, query },
    });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows the graphql endpoint");
      return null;
    }
    if (res.status === 200 && res.json?.data?.Inventory?.[op]) return res.json.data.Inventory[op];
    if (res.status === 200 && res.json?.errors) {
      report.errors.push(`gql ${op}: ${res.json.errors[0]?.message?.slice(0, 100)}`);
      return null;
    }
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} ${op} @ ${variables.location.postalCode} off=${variables.pagination.offset}`);
    return null;
  }
}

// Fetch one grid cell: page offset 0..120, keeping only cars within `radius`
// (results are distance-sorted, so stop as soon as a whole page falls outside).
// Returns { records, dense } — dense means we paged to the ceiling with every
// car still inside the radius, i.e. the cell holds more within-radius cars than
// the cap can return, so it should be subdivided (at a smaller radius).
async function fetchCell(cfg, loc, radius, report) {
  const records = [];
  let hitCeiling = false;
  let sawBeyond = false;
  for (let offset = 0; offset <= OFFSET_MAX; offset += LIMIT) {
    const variables = cfg.variables(loc, offset);
    const inv = await gql(cfg.api, cfg.op, cfg.query, variables, report);
    if (!inv) break;
    const models = inv.models ?? [];
    if (!models.length) break;
    let pageAllBeyond = true;
    for (const m of models) {
      const miles = m.dealer?.distance?.miles;
      if (miles != null && miles > radius) { sawBeyond = true; continue; }
      pageAllBeyond = false;
      const rec = cfg.toRecord(m);
      if (rec) records.push(rec);
    }
    if (pageAllBeyond) break; // whole page beyond the radius — nothing nearer left
    if (models.length < LIMIT) break; // last page
    if (offset === OFFSET_MAX) hitCeiling = true;
  }
  return { records, dense: hitCeiling && !sawBeyond };
}

// Walk one cell, recursing into four closer sub-centres when it is dense. The
// radius HALVES each level (100→50→25mi): a dense metro's sub-centres each cover
// a tighter disc, so they stop reading "dense" and the recursion converges
// instead of the 4^depth blow-up you get when every overlapping sub-centre still
// sees the whole metro. The sub-centres are placed one radius apart so their
// discs tile the parent's.
async function gridCell(cfg, zip, zips, byVin, report, seen, depth, radius) {
  if (seen.has(zip) || report.fetched >= REQUEST_BUDGET) return;
  seen.add(zip);
  const c = zips[zip];
  if (!c) return;
  const loc = { latitude: c[0], longitude: c[1], postalCode: zip };
  const { records, dense } = await fetchCell(cfg, loc, radius, report);
  for (const rec of records) byVin.set(rec.vin, rec);
  if (dense && depth < MAX_DEPTH) {
    const sub = Math.max(15, Math.round(radius / 2));
    for (const sz of subdivideZips(zips, c[0], c[1], sub)) {
      if (!seen.has(sz)) await gridCell(cfg, sz, zips, byVin, report, seen, depth + 1, sub);
    }
  } else if (dense) {
    report.notes.push(`UNRESOLVED dense cell ${zip} depth ${depth}`);
  }
}

// Sweep the metro anchors for one config (new or cpo), subdividing dense metros.
// Shared by both pullers below. Uses the ZCTA table only for lat/lng lookups
// (metro centres + subdivided sub-centres); the metro list itself is METRO_ZIPS.
async function sweep(cfg, report, log) {
  const byVin = new Map();
  const grid = coveringGrid();
  if (!grid) {
    report.errors.push("web/data/zips.json unavailable — cannot resolve metro coordinates");
    report.truncated = true;
    return report;
  }
  const { zips } = grid;
  const seen = new Set();
  // NISSAN_MAX_CELLS caps the metros swept — a smoke-test / ops throttle only.
  const maxCells = Number(process.env.NISSAN_MAX_CELLS) || Infinity;
  const anchors = METRO_ZIPS.filter((z) => zips[z]).slice(0, maxCells);

  // Pass 1: one base query per metro — guarantees national metro coverage before
  // any budget can run out (the densest metros come first in the list).
  const dense = [];
  for (const zip of anchors) {
    seen.add(zip);
    const c = zips[zip];
    const r = await fetchCell(cfg, { latitude: c[0], longitude: c[1], postalCode: zip }, CELL_RADIUS_MI, report);
    for (const rec of r.records) byVin.set(rec.vin, rec);
    if (r.dense) dense.push(zip);
  }
  log(`${cfg.op}: pass1 ${anchors.length} metros → ${byVin.size} VINs (${dense.length} dense), ${report.fetched} reqs`);

  // Pass 2: subdivide the dense metros (radius halves each level) until the
  // per-lot budget is spent. gridCell recurses from depth 1.
  for (const zip of dense) {
    if (report.fetched >= REQUEST_BUDGET) { report.notes.push(`request budget ${REQUEST_BUDGET} hit — ${dense.indexOf(zip)}/${dense.length} dense metros subdivided`); break; }
    const c = zips[zip];
    for (const sz of subdivideZips(zips, c[0], c[1], CELL_RADIUS_MI / 2)) {
      await gridCell(cfg, sz, zips, byVin, report, seen, 1, CELL_RADIUS_MI / 2);
    }
  }
  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`metro grid r${CELL_RADIUS_MI}mi: ${anchors.length} anchors, ${dense.length} dense, ${byVin.size} BEVs, ${report.fetched} requests`);
  // Never certify complete: a distance-capped metro sample is not exhaustive, so
  // it must not drive delisting (see header).
  report.truncated = true;
  return report;
}

// Pull Nissan new BEV inventory (LEAF). crawl.mjs-shaped report on the synthetic
// "nissan-new" domain, always truncated.
export async function pullNissan({ log = () => {} } = {}) {
  const report = { domain: NISSAN.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const cfg = {
    api: NISSAN.api,
    op: "getInventory",
    query: NEW_QUERY,
    toRecord,
    variables: (loc, offset) => ({
      market: MARKET,
      location: loc,
      queryFilters: [],
      modelCodes: NISSAN.modelCodes,
      radius: null,
      sortMode: "relevance",
      pagination: { offset, limit: LIMIT },
    }),
  };
  await sweep(cfg, report, log);
  log(`nissan (new): ${report.evs.length} BEVs, ${report.fetched} requests`);
  return report;
}

// Pull Nissan used/certified BEV inventory (LEAF + ARIYA). Synthetic
// "nissan-cpo" domain, always truncated.
export async function pullNissanCpo({ log = () => {} } = {}) {
  const report = { domain: NISSAN_CPO.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const cfg = {
    api: NISSAN_CPO.api,
    op: "getCpoInventory",
    query: CPO_QUERY,
    toRecord: toCpoRecord,
    variables: (loc, offset) => ({
      market: MARKET,
      location: loc,
      queryFilters: [{ type: "fuelType", values: ["E"] }],
      radius: null,
      sortMode: "distance",
      pagination: { offset, limit: LIMIT },
    }),
  };
  await sweep(cfg, report, log);
  log(`nissan-cpo (used): ${report.evs.length} BEVs, ${report.fetched} requests`);
  return report;
}
