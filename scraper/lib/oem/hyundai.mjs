// Hyundai national inventory locator (hyundaiusa.com).
//
// Hyundai's find-inventory page (Search Inventory) is powered by a public
// JSON search API with no auth token — verified from a plain Node fetch
// 2026-08-15 (control: tesla.com and ford.com/inventory both Akamai-403 the
// identical request; Hyundai returns 200). One POST covers the whole country:
//   POST https://papp-bsi-api.hyundaiusa.com/inventory/item/v2/search
//   body: { zipCode, distance:-1 (nationwide), page, pageSize, sort,
//           filterTag:"fuelType", fuelType:["Electric"], ... }
// The "Electric" fuel-type facet is pure BEV, and the separate "Plug-in
// Hybrid" facet is pure PHEV — both are swept (probed 2026-08-23: Electric
// 2,923 / Plug-in Hybrid 907 nationwide, every Plug-in Hybrid hit a Tucson
// Plug-in Hybrid whose own aem.fuelType restates ["Plug-in Hybrid"];
// conventional hybrids sit under a third "Hybrid" facet, 36,016 strong, which
// is not queried). Every hit is a car with VIN, MSRP/dealer price, trim,
// drivetrain, colors, dealer name and a VDP link. Like the GM lane this
// covers every franchised Hyundai rooftop including any behind a dealer-site
// bot wall.
//
// Quirks that shape the code below:
//   - pageSize is capped at 30 whatever you ask for; paginate to totalPages
//   - deep pages work (page 170+ returns rows) — no ~10k result-window cap
//     like GM's, and the EV count is well under it regardless
//   - records carry dealerCode (state-prefixed, e.g. "KS022") and dealerName
//     but no dealer zip; state is taken from the code prefix, precise
//     distance is left to a future dealerCode→zip map
import { readFileSync } from "node:fs";
import { politePostJson, politeGetJson } from "../http.mjs";
import { oemField } from "../price-provenance.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const HYUNDAI = {
  key: "hyundai",
  domain: "hyundaiusa.com",
  make: "Hyundai",
  api: "https://papp-bsi-api.hyundaiusa.com/inventory/item/v2/search",
  minExpected: 1000,
};

const PAGE_SIZE = 30; // server cap
const NATIONAL_ZIP = "66952"; // ~geographic center of the US; distance:-1 = nationwide
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The two electrified facets of the new-inventory search, each swept fully.
// `facet` is Hyundai's exact facet string (case-sensitive: "Plug-In" returns
// zero); each record's aem.fuelType restates it, and toRecord() requires
// that echo so a facet drift can't relabel cars.
const FUEL_SWEEPS = [
  { facet: "Electric", evKind: "BEV" },
  { facet: "Plug-in Hybrid", evKind: "PHEV" },
];

// Hyundai Certified Used Vehicles (CPO) — a separate, simpler endpoint than
// the new-inventory API: GET /var/hyundai/services/inventory/hcuvInventory
// Models.json?brand=hyundai&zip=&model=&inspectionType=all&radius=. Returns
// full used records (VIN, price, real mileage, dealer address, a dealer VDP).
//
// Coverage is the tricky part. The endpoint hard-caps every response at 120
// vehicles and offers no pagination, so a single national call misses cars.
// The fix is a covering grid: query from many centers at a radius small
// enough that no one cell can hit the cap, and dedupe by VIN. Empirically the
// densest market (LA) returns 99 Ioniq 5 within radius 100 — under the 120
// cap — so radius 100 with grid centers ~60mi apart (finer than the ~150mi
// radius at which even LA fills the cap) guarantees every car is within the
// 120-nearest of some cell. The grid is generated from the Census ZCTA
// centroids (web/data/zips.json), one representative ZIP per ~1.4x1.6-degree
// cell over the CONUS, so it follows where people (and dealers) actually are.
export const HYUNDAI_CPO = {
  key: "hyundai-cpo",
  // Its own completeness domain, isolated from the new pull on hyundaiusa.com:
  // even a covering grid must never certify national completeness under a
  // domain the new pull marks complete (that would delist CPO cars the new
  // pull never saw). Marked truncated always; recheck verifies liveness
  // through each car's real dealer VDP instead.
  domain: "hyundai-cpo",
  api: "https://www.hyundaiusa.com/var/hyundai/services/inventory/hcuvInventoryModels.json",
  // The current BEV nameplates. The discontinued "ioniq-electric" (2017–21)
  // is deliberately omitted — a full-grid sweep returned zero of it, so
  // querying it is pure wasted calls; re-add it if CPO stock ever appears.
  //
  // PHEV slugs added 2026-08-23. The endpoint's model param is the gate — a
  // slug names exactly one nameplate — and the spelling is Hyundai's own,
  // discovered by probing: "tucson-plugin-hybrid" answers (Model "Tucson
  // Plugin Hybrid", 4 cars within 500mi of LA), while the display-name
  // spelling "tucson-plug-in-hybrid" returns 200 with zero rows. The
  // record's FuelType reads "Hybrid Fuel" for plug-in AND conventional
  // hybrids alike, so it CANNOT be the gate — the slug plus the record's own
  // Model string (toCpoRecord requires /plug/i for PHEV slugs) is what
  // separates a Tucson Plugin Hybrid from a Tucson Hybrid.
  models: [
    { slug: "ioniq-5", evKind: "BEV" },
    { slug: "ioniq-6", evKind: "BEV" },
    { slug: "kona-electric", evKind: "BEV" },
    { slug: "tucson-plugin-hybrid", evKind: "PHEV" },
    { slug: "santa-fe-plugin-hybrid", evKind: "PHEV" },
  ],
};

const CPO_RADIUS = 100; // keeps the densest metro (LA=99) under the 120 cap
const CPO_CAP = 120; // server's hard per-response cap (no pagination)
// A couple of off-CONUS metros the lat/lon grid below deliberately excludes.
const CPO_EXTRA_ZIPS = ["96813", "99501"]; // Honolulu, Anchorage

// Covering grid of representative ZIPs, one per ~1.4x1.6-degree CONUS cell,
// each cell's rep chosen closest to the cell centre. Returns { cells, zips }:
// cells is a Map keyed by "cx_cy" grid coordinate (so callers can walk a
// cell's 8 neighbours), zips is the full ZCTA table (for subdivision).
function coveringGrid() {
  let zips;
  try {
    zips = JSON.parse(readFileSync(new URL("../../../web/data/zips.json", import.meta.url), "utf-8"));
  } catch {
    return null; // fall back to a metro grid if the ZCTA table is unavailable
  }
  const LAT = 1.4, LNG = 1.6;
  const cells = new Map();
  for (const [zip, v] of Object.entries(zips)) {
    const [la, ln] = v;
    if (!(la >= 24 && la <= 49.5 && ln >= -125 && ln <= -66.5)) continue; // CONUS
    const cx = Math.floor(la / LAT), cy = Math.floor(ln / LNG), key = `${cx}_${cy}`;
    const d = (la - (cx + 0.5) * LAT) ** 2 + (ln - (cy + 0.5) * LNG) ** 2;
    const ex = cells.get(key);
    if (!ex || d < ex.d) cells.set(key, { zip, cx, cy, d });
  }
  return { cells, zips };
}

// Small hand-kept metro grid — the fallback when zips.json can't be read.
const CPO_FALLBACK_ZIPS = [
  "90001", "94102", "92101", "95814", "98101", "97201", "85001", "89101", "87102",
  "75201", "77001", "78701", "78201", "80202", "84101", "60601", "55401", "63101",
  "64101", "44101", "48201", "33101", "30301", "28201", "37201", "70112", "10001",
  "02101", "19101", "20001", "15201", "32801", "33601",
];

// dealerCode prefixes are USPS state codes ("KS022" → KS). Validate against the
// real set so a non-state prefix becomes "no state" rather than a fake one.
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
  if (/AWD|ALL.?WHEEL/.test(s)) return "AWD";
  if (/RWD|REAR/.test(s)) return "RWD";
  if (/FWD|FRONT/.test(s)) return "FWD";
  return undefined;
};

// scene7 image URLs arrive protocol-relative ("//s7d1.scene7.com/…").
const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (!s) return undefined;
  return s.startsWith("//") ? `https:${s}` : s.startsWith("http") ? s : undefined;
};

function toRecord(hit, sweep) {
  const vin = String(hit.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // Per-record echo of the queried facet (aem.fuelType, e.g. ["Plug-in
  // Hybrid"]). A row that names a DIFFERENT fuel than its facet is dropped;
  // a row missing the aem block entirely is kept on the facet's word for the
  // BEV sweep (the lane's original behavior) but dropped for the PHEV sweep —
  // a plug-in claim needs the record's own agreement, not just the query's.
  const aemFuel = Array.isArray(hit.aem?.fuelType) ? hit.aem.fuelType.map(String) : null;
  if (aemFuel && !aemFuel.some((f) => f.toLowerCase() === sweep.facet.toLowerCase())) return null;
  if (!aemFuel && sweep.evKind === "PHEV") return null;
  const year = Number(hit.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = String(hit.modelDisplayName || hit.model || "").trim();
  if (!model) return null;
  const { priceUsd, priceProvenance } = pickTaggedPrice("hyundai", [
    ["dealerInternetPrice", num(hit.dealerInternetPrice)],
    ["msrp", num(hit.msrp)],
    ["startingMsrp", num(hit.startingMsrp)],
  ]);
  const state = US_STATES.has(String(hit.dealerCode ?? "").slice(0, 2).toUpperCase())
    ? hit.dealerCode.slice(0, 2).toUpperCase()
    : undefined;
  const img = httpsUrl(hit.exteriorImage || hit.defaultExteriorImage || hit.bsiExteriorImage);
  const vdp = httpsUrl(hit.dealerVDPURL);
  return {
    vin,
    year,
    make: hit.make ? hit.make.charAt(0) + hit.make.slice(1).toLowerCase() : HYUNDAI.make,
    model,
    trim: hit.trimDisplayName || hit.trim || undefined,
    priceUsd,
    priceProvenance,
    driveLine: drive(hit.drivetrainName || hit.drivetrain),
    exteriorColor: hit.exteriorColor ? titleCase(hit.exteriorColor) : undefined,
    interiorColor: hit.interiorColor ? titleCase(hit.interiorColor) : undefined,
    dealerName: hit.dealerName || undefined,
    state,
    condition: "new", // Hyundai search returns dealer new stock (inventoryStatusCode DS)
    imageUrl: img,
    images: img ? [img] : [],
    // Prefer the dealer's own VDP for click-through; else the brand search page.
    sourceUrl: vdp || `https://www.hyundaiusa.com/us/en/inventory-search`,
    dealerDomain: HYUNDAI.domain,
    evKind: sweep.evKind,
    // Hyundai's own facet string, restated by the record's aem.fuelType —
    // what downstream verification reads alongside the model name.
    fuelType: sweep.facet,
    evConfidence: "high", // server-side fuelType facet + per-record aem echo, not a name match
    platform: "hyundai-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

async function searchPage(facet, page, report) {
  const body = {
    zipCode: NATIONAL_ZIP,
    distance: -1,
    page,
    pageSize: PAGE_SIZE,
    sort: { attributeName: "distance", order: "asc" },
    atDealershipOnly: false,
    availableOnline: false,
    filterTag: "fuelType",
    fuelType: [facet],
    personalization: null,
  };
  // One retry on transient failures, same rationale as the GM lane: a ~174-page
  // pull will hit the occasional blip, and aborting mid-pull would forfeit the
  // complete-coverage certification that licenses delisting.
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(HYUNDAI.api, {
      headers: { origin: "https://www.hyundaiusa.com", referer: "https://www.hyundaiusa.com/" },
      body,
    });
    report.fetched++;
    if (res.status === 200 && res.json?.data) return res.json.data;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    report.errors.push(`${res.status} search page=${page}`);
    return null;
  }
}

// Pull Hyundai's complete national BEV inventory. Returns a crawl.mjs-shaped
// report so merge-shards/db-sync treat it exactly like a crawl shard (see
// lib/oem/gm.mjs for the completeness contract).
export async function pullHyundai({ log = () => {} } = {}) {
  const report = { domain: HYUNDAI.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  const byVin = new Map();
  let grandTotal = 0;
  // Both facets share one report on purpose: certifying hyundaiusa.com
  // complete on the BEV sweep alone would delist every PHEV row (kia.mjs's
  // half-pull rule).
  for (const sweep of FUEL_SWEEPS) {
    const first = await searchPage(sweep.facet, 1, report);
    if (!first) {
      report.errors.push(`first ${sweep.facet} page failed — endpoint changed or down`);
      continue;
    }
    const total = first.total ?? 0;
    const totalPages = first.totalPages ?? 1;
    grandTotal += total;
    report.notes.push(`national ${sweep.evKind} count ${total} across ${totalPages} pages`);
    log(`hyundai/${sweep.evKind}: ${total} vehicles, ${totalPages} pages`);

    const collect = (items) => {
      for (const hit of items ?? []) {
        const rec = toRecord(hit, sweep);
        if (rec) byVin.set(rec.vin, rec);
      }
    };
    collect(first.items);

    for (let page = 2; page <= totalPages; page++) {
      const data = await searchPage(sweep.facet, page, report);
      if (!data) break; // error recorded; truncated follows
      collect(data.items);
      if (page % 25 === 0) log(`hyundai/${sweep.evKind}: page ${page}/${totalPages}, ${byVin.size} VINs`);
    }
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  // Completeness (see gm.mjs): every page of every sweep fetched cleanly AND
  // yield over floor.
  const shortfall = grandTotal > 0 && byVin.size < grandTotal * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size} of ${grandTotal} — paging shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < HYUNDAI.minExpected;
  return report;
}

// hcuvInventoryModels Veh record → normalized certified-used listing.
function toCpoRecord(veh, m) {
  const vin = String(veh.VIN ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(veh.ModelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = String(veh.Model ?? "").trim();
  if (!model) return null;
  // A PHEV slug's rows must say so themselves ("Tucson Plugin Hybrid") — the
  // FuelType field can't separate plug-in from conventional (see HYUNDAI_CPO),
  // so a row that lost the word is dropped rather than claimed.
  if (m.evKind === "PHEV" && !/plug/i.test(model)) return null;
  const zip = /^\d{5}/.test(String(veh.DlrZipCode ?? "")) ? String(veh.DlrZipCode).slice(0, 5) : undefined;
  const imgs = [];
  if (veh.MainImage) imgs.push(String(veh.MainImage));
  for (const di of Array.isArray(veh.DealerImage) ? veh.DealerImage : []) {
    if (di?.URL && !imgs.includes(di.URL)) imgs.push(String(di.URL));
  }
  const httpsImgs = imgs.map((u) => u.replace(/^http:\/\//, "https://")).filter((u) => u.startsWith("https://")).slice(0, 8);
  const vdp = typeof veh.DealerVINUrl === "string" && veh.DealerVINUrl.startsWith("http") ? veh.DealerVINUrl : undefined;
  return {
    vin,
    year,
    make: HYUNDAI.make,
    model,
    trim: veh.TrimDesc || undefined,
    // Precedence lives inside num(a ?? b) here and must stay there — hoisting
    // it into a ladder would change which value wins when SortablePrice is
    // present but unparseable, and this change does not move prices. The tag
    // names whichever operand num() was actually handed, and is omitted
    // entirely when no price resolved (a non-observation has no provenance).
    priceUsd: num(veh.SortablePrice ?? veh.FormattedPrice),
    priceProvenance:
      num(veh.SortablePrice ?? veh.FormattedPrice) == null
        ? undefined
        : oemField("hyundai-cpo", veh.SortablePrice != null ? "SortablePrice" : "FormattedPrice"),
    mileage: Number.isFinite(veh.SortableMileage) ? Math.round(veh.SortableMileage) : num(veh.Mileage),
    driveLine: drive(veh.Drivetrain || veh.DrivetrainDesc),
    exteriorColor: veh.ExtColorDesc || undefined,
    interiorColor: veh.IntColor || undefined,
    dealerName: veh.DlrName || undefined,
    zip,
    certified: true,
    condition: "certified",
    imageUrl: httpsImgs[0],
    images: httpsImgs,
    // Real dealer VDP — recheck can verify liveness through it, so CPO rows
    // are NOT added to the locator recheck-skip set.
    sourceUrl: vdp || "https://www.hyundaiusa.com/us/en/find-certified-used-vehicles",
    dealerDomain: HYUNDAI_CPO.domain,
    evKind: m.evKind,
    // Hyundai's own strings: the record's fuel field plus its Model name (the
    // Model is what actually distinguishes plug-in from conventional here).
    fuelType: veh.FuelType || undefined,
    evConfidence: "high", // queried by model slug; PHEV rows also restate "Plugin Hybrid" in Model
    platform: "hyundai-cpo-locator",
    fromVdp: Boolean(vdp),
    scrapedAt: new Date().toISOString(),
  };
}

async function cpoFetch(m, zip, radius, report) {
  const url = `${HYUNDAI_CPO.api}?brand=hyundai&zip=${zip}&model=${m.slug}&inspectionType=all&radius=${radius}`;
  for (let attempt = 0; ; attempt++) {
    // The hcuv endpoint 403s without a Referer, so it needs politeGetJson
    // (custom headers) rather than the plain fetchPage wrapper.
    const res = await politeGetJson(url, { headers: { referer: "https://www.hyundaiusa.com/us/en/find-certified-used-vehicles" } });
    report.fetched++;
    if (res.status === 200 && res.json) return res.json.cpoInventory?.Vehicles ?? [];
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} cpo ${m.slug}/${zip}`);
    return [];
  }
}

// ZIP nearest a target lat/lng, for placing subdivided sub-cell centres.
function nearestZip(zips, la, ln) {
  let best = null, bestD = Infinity;
  for (const [zip, v] of Object.entries(zips)) {
    const d = (v[0] - la) ** 2 + (v[1] - ln) ** 2;
    if (d < bestD) { bestD = d; best = zip; }
  }
  return best;
}

// Fetch one (model, zip) cell at a given radius, folding its cars into byVin.
// If the response hits the hard cap, the cell is holding more than it can
// return, so subdivide into four quadrant sub-centres at half the radius and
// recurse — guaranteeing the overflow is captured rather than trusting grid
// overlap. Bottoms out at a small radius so a pathologically dense ZIP can't
// loop forever. Returns the cell's own (pre-subdivision) count.
async function cpoCell(m, zip, radius, zips, byVin, report, seen = new Set(), depth = 0) {
  if (seen.has(zip)) return 0;
  seen.add(zip);
  const vehicles = await cpoFetch(m, zip, radius, report);
  for (const v of vehicles) {
    const rec = toCpoRecord(v?.Veh ?? v, m);
    if (rec) byVin.set(rec.vin, rec);
  }
  if (vehicles.length >= CPO_CAP && radius > 20 && depth < 4 && zips) {
    const [la, ln] = zips[zip] ?? [];
    if (la != null) {
      const off = radius / 138; // ≈ degrees for a half-radius offset (~69mi/deg)
      const sub = Math.max(20, Math.round(radius / 2));
      for (const [dla, dln] of [[off, off], [off, -off], [-off, off], [-off, -off]]) {
        const sz = nearestZip(zips, la + dla, ln + dln);
        if (sz && !seen.has(sz)) await cpoCell(m, sz, sub, zips, byVin, report, seen, depth + 1);
      }
    }
  }
  // Only warn about a cap we could NOT subdivide away (min radius / max depth
  // reached) — that is the one case where cars could still be missed.
  if (vehicles.length >= CPO_CAP && (radius <= 20 || depth >= 4)) {
    report.notes.push(`UNRESOLVED cap: ${m.slug}@${zip} r${radius} (${vehicles.length})`);
  }
  return vehicles.length;
}

// Sweep Hyundai CPO EVs over a national covering grid. Two passes keep the
// call count down without missing anything: pass 1 runs the densest model
// (Ioniq 5) over every cell to find which cells actually hold cars; pass 2
// runs the remaining EV models only over those hot cells AND their grid
// neighbours (so a model present where Ioniq 5 happens to be absent is still
// caught). Always truncated:true — see HYUNDAI_CPO: coverage completeness
// still must not drive delisting, which recheck handles via dealer VDPs.
export async function pullHyundaiCpo({ log = () => {} } = {}) {
  const report = { domain: HYUNDAI_CPO.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();
  const grid = coveringGrid();
  const [lead, ...rest] = HYUNDAI_CPO.models;
  const R = CPO_RADIUS;

  if (!grid) {
    // Fallback: metro grid at a wide radius, all models (zips.json missing).
    report.notes.push("zips.json unavailable — metro fallback grid");
    for (const model of HYUNDAI_CPO.models) {
      for (const zip of CPO_FALLBACK_ZIPS) await cpoCell(model, zip, 250, null, byVin, report);
      log(`hyundai-cpo/${model.slug}: ${byVin.size} cumulative VINs`);
    }
  } else {
    const { cells, zips } = grid;
    // Pass 1: lead model across every cell (capped cells self-subdivide);
    // remember which cells had cars.
    const hot = new Set();
    for (const [key, cell] of cells) {
      const n = await cpoCell(lead, cell.zip, R, zips, byVin, report);
      if (n > 0) hot.add(key);
    }
    for (const zip of CPO_EXTRA_ZIPS) await cpoCell(lead, zip, R, zips, byVin, report);
    log(`hyundai-cpo/${lead.slug}: ${byVin.size} VINs across ${cells.size} cells (${hot.size} hot)`);

    // Expand hot cells to include 8-neighbours, so a secondary model sitting
    // in a cell whose lead-model count was zero is still swept.
    const sweep = new Set();
    for (const key of hot) {
      const [cx, cy] = key.split("_").map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nk = `${cx + dx}_${cy + dy}`;
        if (cells.has(nk)) sweep.add(nk);
      }
    }

    // Pass 2: remaining models over the hot+neighbour cells (plus extras).
    for (const model of rest) {
      const before = byVin.size;
      for (const key of sweep) await cpoCell(model, cells.get(key).zip, R, zips, byVin, report);
      for (const zip of CPO_EXTRA_ZIPS) await cpoCell(model, zip, R, zips, byVin, report);
      log(`hyundai-cpo/${model.slug}: +${byVin.size - before} over ${sweep.size} cells, ${byVin.size} cumulative`);
    }
    report.notes.push(`covering grid r${R}: ${cells.size} cells, ${hot.size} hot, ${sweep.size} swept for secondary models`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  // Never certify complete: even a covering grid is a snapshot with a hard
  // per-cell cap, so it must not drive delisting.
  report.truncated = true;
  return report;
}
