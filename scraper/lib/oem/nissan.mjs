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
const CELL_RADIUS_MI = 100; // client-side radius bounding each grid cell
const SUBDIVIDE_SPAN_MI = 50; // first sub-centre distance (½ the radius, well inside the cell)
const MAX_DEPTH = 4; // subdivision depth cap (a pathologically dense metro)
const EXTRA_ZIPS = ["96813", "99501"]; // Honolulu, Anchorage (off the CONUS grid)
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

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

// Fetch one grid cell: page offset 0..120, keeping only cars within
// CELL_RADIUS_MI (results are distance-sorted, so stop as soon as a whole page
// falls outside). Returns { records, dense } — dense means we paged to the
// ceiling with every car still inside the radius, i.e. the cell holds more
// within-radius cars than the cap can return, so it should be subdivided.
async function fetchCell(cfg, loc, report) {
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
      if (miles != null && miles > CELL_RADIUS_MI) { sawBeyond = true; continue; }
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

// Walk one cell, recursing into four closer sub-centres when it is dense. `span`
// is the sub-centre offset in miles, halved each level so a dense metro
// converges instead of re-querying the same point.
async function gridCell(cfg, zip, zips, byVin, report, seen, depth, span) {
  if (seen.has(zip)) return;
  seen.add(zip);
  const c = zips[zip];
  if (!c) return;
  const loc = { latitude: c[0], longitude: c[1], postalCode: zip };
  const { records, dense } = await fetchCell(cfg, loc, report);
  for (const rec of records) byVin.set(rec.vin, rec);
  if (dense && depth < MAX_DEPTH) {
    const sub = Math.max(20, Math.round(span / 2));
    for (const sz of subdivideZips(zips, c[0], c[1], span)) {
      if (!seen.has(sz)) await gridCell(cfg, sz, zips, byVin, report, seen, depth + 1, sub);
    }
  } else if (dense) {
    report.notes.push(`UNRESOLVED dense cell ${zip} depth ${depth}`);
  }
}

// Sweep the national covering grid for one config (new or cpo). Shared by both
// pullers below.
async function sweep(cfg, report, log) {
  const byVin = new Map();
  const grid = coveringGrid();
  if (!grid) {
    report.errors.push("web/data/zips.json unavailable — cannot build covering grid");
    report.truncated = true;
    return report;
  }
  const { cells, zips } = grid;
  const seen = new Set();
  let done = 0;
  // NISSAN_MAX_CELLS caps the base-grid cells swept — a smoke-test / ops throttle
  // only; unset in the nightly, so the full national grid runs.
  const maxCells = Number(process.env.NISSAN_MAX_CELLS) || Infinity;
  for (const [, cell] of cells) {
    if (done >= maxCells) { report.notes.push(`NISSAN_MAX_CELLS=${maxCells} — partial sweep`); break; }
    await gridCell(cfg, cell.zip, zips, byVin, report, seen, 0, SUBDIVIDE_SPAN_MI);
    if (++done % 100 === 0) log(`${cfg.op}: ${done}/${cells.size} cells, ${byVin.size} VINs`);
  }
  for (const zip of EXTRA_ZIPS) {
    if (zips[zip]) await gridCell(cfg, zip, zips, byVin, report, seen, 0, SUBDIVIDE_SPAN_MI);
  }
  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`covering grid r${CELL_RADIUS_MI}mi: ${cells.size} cells, ${byVin.size} BEVs`);
  // Never certify complete: a distance-capped grid is a snapshot, so it must
  // not drive delisting (see header).
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
