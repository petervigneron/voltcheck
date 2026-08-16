// Honda national inventory locator (automobiles.honda.com).
//
// Honda's Search Inventory tool (a React app) reads a public REST endpoint that
// needs no auth token (just an Origin/Referer) — verified open from a plain Node
// fetch 2026-08-16 (control: tesla.com/ford.com Akamai-403 the identical
// request; automobiles.honda.com returns 200, and answers with only a browser
// Origin). The endpoint URL + params were read out of the app's JS bundle
// (/areas/search-inventory/static/js/main.*.chunk.js), not guessed:
//   GET /platform/api/v3/inventoryAndDealers
//       ?productDivisionCode=A&modelYear={yr}&modelGroup=prologue
//       &zipCode={zip}&maxDealers={n}&preferredDealerId=&showOnlineRetailingURL=true
// productDivisionCode "A" is Honda (Acura is "B", same endpoint). Honda's ONLY
// battery-electric is the Prologue (2024+, on GM's Ultium platform); the CR-V
// e:FCEV is a hydrogen fuel-cell car, not a BEV, and never appears here because
// we scope the query to modelGroup=prologue. Every record carries Transmission
// "ELE" (a structured electric-drivetrain field), which we assert before
// admitting a row — so evConfidence is 'high'.
//
// Coverage quirk that shapes the code: unlike BMW's nationwide locatorRange,
// this endpoint is inherently LOCAL. Each call returns the nearest `maxDealers`
// dealers to the ZIP (within a server radius that tops out ~238mi in sparse
// country) and EVERY Prologue VIN those dealers hold — so a single call is a
// per-radius sample, and in a dense metro the maxDealers cap drops the farther
// dealers. We therefore sweep a national covering grid (cells sized well inside
// the radius) and, when a cell returns exactly `maxDealers` dealers (the cap
// bit — more sit just beyond), subdivide it into four closer sub-centres to
// reach them (same idea as Nissan's grid, on an endpoint whose knob is
// maxDealers instead of offset). Because a covering grid can never be proven
// exhaustive, this is truncated:true ALWAYS, on a synthetic domain
// "honda-prologue" isolated from any complete pull (a grid must never drive
// db-sync delisting; see gm.mjs completeness contract and nissan.mjs).
//
// Delisting instead rides recheck: unlike Nissan's fake-alive SPA shell, each
// record's sourceUrl is the REAL dealer VDP the API hands us
// (VehicleDetailPageURL, e.g. a dealer.com page), which recheck can fetch and
// verify the VIN on — so this domain is deliberately NOT in the recheck-skip
// set. Sold cars are pruned per-VIN by recheck against the dealer's own page.
import { politeGetJson } from "../http.mjs";
import { subdivideZips } from "./grid.mjs";
import { readFileSync } from "node:fs";

export const HONDA = {
  key: "honda",
  domain: "honda-prologue", // synthetic: covering-grid pull, truncated always
  make: "Honda",
  base: "https://automobiles.honda.com/platform/api/v3/inventoryAndDealers",
  productDivisionCode: "A",
  modelGroup: "prologue",
  // modelYear is a REQUIRED param (a bare query 400s). The current new-Prologue
  // stock is essentially all 2026: 2024 sold out (returns 0 nationwide) and 2025
  // is a negligible clearing tail. We query 2026 only — the covering-grid +
  // subdivision budget is far better spent on 2026 dealer density than on a
  // ~dozens-of-cars prior-year tail. `years` is a list so a 2027 Prologue (or a
  // restocked prior year) just gets appended here; extra years run after the
  // primary at productive anchors only, within the same request budget.
  years: [2026],
  minExpected: 400,
};

// recheck.mjs must NOT skip this domain: the per-VIN sourceUrl is a real dealer
// VDP recheck can verify, which is exactly how sold Prologues get delisted (the
// grid is truncated, so db-sync never delists it). Hence honda-prologue is
// absent from OEM_LOCATOR_DOMAINS on purpose — see recheck.mjs's filter.
export const OEM_LOCATOR_DOMAINS = new Set();

const HOST = "https://automobiles.honda.com";
const MAX_DEALERS = 40; // per call; ~400KB/2.7s at this size. ==this ⇒ cap bit ⇒ subdivide.
const REQUEST_BUDGET = 180; // hard ceiling — single-host serial lane at ~3s/req stays under ~10 min
const CELL_LAT = 4.2, CELL_LNG = 4.5; // ~290x250mi cells; the ~238mi server radius covers the gaps
const SUB_SPAN_MI = 120; // depth-1 sub-centre offset (inside the cell, reaches capped-out dealers)
const MAX_DEPTH = 1; // one subdivision level; deeper rarely adds dealers and burns budget
const TIMEOUT_MS = 40000; // payloads are large (dealers + full inventory + photo maps)
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const HI_AK_ZIPS = ["96813", "99501"]; // Honolulu + Anchorage (outside the CONUS grid bbox)

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// Prologue is FWD ("2WD") or AWD; Elite is AWD-only (no prefix). ModelMarketing
// name is e.g. "2WD EX" / "AWD Touring" / "Elite".
const drive = (marketing, trim) => {
  const s = String(marketing ?? "").toUpperCase();
  if (/\bAWD\b|ALL.?WHEEL/.test(s)) return "AWD";
  if (/\b2WD\b|\bFWD\b|FRONT/.test(s)) return "FWD";
  if (/ELITE/i.test(String(trim ?? ""))) return "AWD"; // Elite ships AWD-only
  return undefined;
};

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (!s) return undefined;
  if (s.startsWith("/")) return HOST + s;
  return s.startsWith("https://") ? s : s.startsWith("http://") ? "https://" + s.slice(7) : undefined;
};

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC")
    .split(" ")
);

const titleCase = (s) => String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

// Dealer facet → normalized location. ZipCode arrives 9-digit ("900451504").
function dealerLoc(d) {
  const state = US_STATES.has(String(d?.State ?? "").toUpperCase()) ? String(d.State).toUpperCase() : undefined;
  const zip = /^\d{5}/.test(String(d?.ZipCode ?? "")) ? String(d.ZipCode).slice(0, 5) : undefined;
  const city = d?.City ? titleCase(d.City) : undefined;
  return { name: d?.Name || undefined, city, state, zip };
}

// Best model-render image for this record's colour combo. VehiclePhotos is
// keyed [ExteriorColorMfgCode][InteriorColorCode] → [".../02", ".../04"] (04 is
// the larger view). Falls back to building the image-API URL from ModelId.
function imageFor(rec) {
  const ec = rec.ExteriorColorMfgCode, ic = rec.InteriorColorCode;
  const arr = rec.VehiclePhotos?.[ec]?.[ic];
  if (Array.isArray(arr) && arr.length) return httpsUrl(arr[arr.length - 1]);
  if (rec.ModelId && ec && ic) return `${HOST}/platform/api/v4/images/Exterior/04?config=M:${rec.ModelId}$EC:${ec}$IC:${ic}`;
  return undefined;
}

// One inventory record holds a VINs[] array (each entry = one physical car with
// its own real dealer VDP). Emit one normalized listing per VIN. `dealer` is the
// matched dealer facet (may be undefined on a subdivided cell — geo left blank).
function toRecords(rec, dealer) {
  if (!/^ELE/i.test(String(rec.Transmission ?? ""))) return []; // structured electric-drivetrain guard
  const year = Number(rec.ModelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return [];
  const model = String(rec.ModelGroupName ?? "").trim() || "Prologue";
  const loc = dealer ? dealerLoc(dealer) : {};
  const img = imageFor(rec);
  const out = [];
  for (const vEntry of rec.VINs ?? []) {
    const vin = String(vEntry?.VIN ?? "").toUpperCase();
    if (!VIN_RE.test(vin)) continue;
    const vdp = httpsUrl(vEntry.VehicleDetailPageURL);
    if (!vdp) continue; // no real click-through / nothing recheck can verify — skip
    out.push({
      vin,
      year,
      make: HONDA.make,
      model,
      trim: rec.ModelTrim || undefined,
      priceUsd: num(rec.ModelMSRP),
      driveLine: drive(rec.ModelMarketingName, rec.ModelTrim),
      exteriorColor: rec.ExteriorColor || undefined,
      interiorColor: rec.InteriorColor || undefined,
      dealerName: loc.name,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      condition: "new",
      imageUrl: img,
      images: img ? [img] : [],
      sourceUrl: vdp, // real dealer VDP — recheck verifies the VIN here
      dealerDomain: HONDA.domain,
      evKind: "BEV",
      evConfidence: "high", // Prologue is Honda's only BEV + Transmission "ELE"
      platform: "honda-locator",
      fromVdp: false,
      scrapedAt: new Date().toISOString(),
    });
  }
  return out;
}

// One GET with a single retry on transient failure (a ~150-call sweep hits the
// odd blip / large-payload timeout). Returns the parsed body or null.
async function apiGet(year, zip, report) {
  const url = `${HONDA.base}?productDivisionCode=${HONDA.productDivisionCode}&modelYear=${year}` +
    `&modelGroup=${HONDA.modelGroup}&zipCode=${zip}&maxDealers=${MAX_DEALERS}` +
    `&preferredDealerId=&showOnlineRetailingURL=true`;
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, {
      headers: { origin: HOST, referer: `${HOST}/tools/search-inventory/` },
      timeoutMs: TIMEOUT_MS,
    });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push("robots disallows inventoryAndDealers"); return null; }
    if (res.status === 200 && res.json?.inventory) return res.json;
    if (res.status === 422 || res.status === 400) return { inventory: [], dealers: [] }; // valid empty (e.g. a year with no stock near here)
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} y=${year} z=${zip}`);
    return null;
  }
}

// Query one point for one model year. Folds VINs into byVin, dealer facts into
// dealerMap. Returns { dealers, capped } (capped = the maxDealers ceiling bit).
async function queryPoint(year, zip, byVin, dealerMap, report) {
  const j = await apiGet(year, zip, report);
  if (!j) return { dealers: 0, capped: false };
  for (const d of j.dealers ?? []) if (d?.DealerNumber != null) dealerMap.set(String(d.DealerNumber), d);
  for (const rec of j.inventory ?? []) {
    const dealer = dealerMap.get(String(rec.DealerNumber));
    for (const r of toRecords(rec, dealer)) byVin.set(r.vin, r);
  }
  const dealers = (j.dealers ?? []).length;
  return { dealers, capped: dealers >= MAX_DEALERS };
}

// Coarse national covering grid: one representative CONUS ZIP per CELL_LAT x
// CELL_LNG cell, chosen nearest the cell centre (follows where dealers are).
// Cells are sized to sit inside the endpoint's ~238mi radius, so the union
// covers the country; density is handled by subdivision, not grid fineness.
function coarseAnchors() {
  let zips;
  try {
    zips = JSON.parse(readFileSync(new URL("../../../web/data/zips.json", import.meta.url), "utf-8"));
  } catch {
    return null;
  }
  const cells = new Map();
  for (const [zip, v] of Object.entries(zips)) {
    const [la, ln] = v;
    if (!(la >= 24 && la <= 49.5 && ln >= -125 && ln <= -66.5)) continue; // CONUS
    const cx = Math.floor(la / CELL_LAT), cy = Math.floor(ln / CELL_LNG), key = `${cx}_${cy}`;
    const d = (la - (cx + 0.5) * CELL_LAT) ** 2 + (ln - (cy + 0.5) * CELL_LNG) ** 2;
    const ex = cells.get(key);
    if (!ex || d < ex.d) cells.set(key, { zip, d });
  }
  const anchors = [...cells.values()].map((c) => c.zip);
  for (const z of HI_AK_ZIPS) if (zips[z]) anchors.push(z);
  return { anchors, zips };
}

// Pull Honda's national new Prologue inventory. crawl.mjs-shaped report on the
// synthetic "honda-prologue" domain, always truncated (see header).
export async function pullHonda({ log = () => {} } = {}) {
  const report = { domain: HONDA.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const grid = coarseAnchors();
  if (!grid) {
    report.errors.push("web/data/zips.json unavailable — cannot build the covering grid");
    report.truncated = true;
    return report;
  }
  const { anchors, zips } = grid;
  const byVin = new Map();
  const dealerMap = new Map();
  const seenDealers = () => dealerMap.size;
  // Ops throttle / smoke test: cap the anchors swept.
  const maxCells = Number(process.env.HONDA_MAX_CELLS) || Infinity;
  const cells = anchors.slice(0, maxCells);

  // Pass 1: primary year (2026) over every cell — guarantees national coverage
  // before any subdivision budget is spent. Collect the dense cells to refine.
  const [primaryYear, ...otherYears] = HONDA.years;
  const denseCells = [];
  const productive = new Set(); // anchors that returned any dealers (worth a 2nd-year query)
  for (const zip of cells) {
    const { dealers, capped } = await queryPoint(primaryYear, zip, byVin, dealerMap, report);
    if (dealers > 0) productive.add(zip);
    if (capped) denseCells.push(zip);
  }
  log(`honda: pass1 ${cells.length} cells → ${byVin.size} VINs, ${seenDealers()} dealers (${denseCells.length} dense), ${report.fetched} reqs`);

  // Pass 2: subdivide dense cells — four closer sub-centres each reach the
  // dealers the cap dropped. Stop a branch that adds no new dealers.
  for (const zip of denseCells) {
    if (report.fetched >= REQUEST_BUDGET) { report.notes.push(`request budget ${REQUEST_BUDGET} hit — ${denseCells.indexOf(zip)}/${denseCells.length} dense cells subdivided`); break; }
    const c = zips[zip];
    if (!c) continue;
    const before = seenDealers();
    for (const sz of subdivideZips(zips, c[0], c[1], SUB_SPAN_MI)) {
      if (report.fetched >= REQUEST_BUDGET) break;
      const { dealers } = await queryPoint(primaryYear, sz, byVin, dealerMap, report);
      if (dealers > 0) productive.add(sz);
    }
    if (seenDealers() === before) report.notes.push(`dense cell ${zip}: subdivision added no dealers`);
  }
  log(`honda: after subdivide → ${byVin.size} VINs, ${seenDealers()} dealers, ${report.fetched} reqs`);

  // Other years (2025 tail): query only productive anchors — leftover-new units
  // sit at Prologue dealers we already found, and the payloads are tiny.
  for (const year of otherYears) {
    const before = byVin.size;
    for (const zip of productive) {
      if (report.fetched >= REQUEST_BUDGET) { report.notes.push(`request budget hit before finishing MY${year}`); break; }
      await queryPoint(year, zip, byVin, dealerMap, report);
    }
    log(`honda: MY${year} +${byVin.size - before} VINs`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`covering grid ${CELL_LAT}x${CELL_LNG}deg: ${cells.length} anchors, ${denseCells.length} dense, ${seenDealers()} dealers, ${byVin.size} Prologue VINs, ${report.fetched} requests`);
  // Never certify complete: a per-radius covering-grid sample is not provably
  // exhaustive, so it must not drive delisting (recheck does, per VDP — header).
  report.truncated = true;
  return report;
}
