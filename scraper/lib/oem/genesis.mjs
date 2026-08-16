// Genesis national inventory locator (genesis.com).
//
// Genesis runs Hyundai's platform (unsurprising — same parent), and its
// find-inventory page reads a public JSON API with no auth token, just an
// Origin/Referer — verified open from a plain Node fetch 2026-08-15 (control:
// tesla.com/ford.com Akamai-403 the identical request; genesis.com returns 200
// JSON). The endpoint is per-MODEL:
//   GET https://www.genesis.com/bin/api/v2/inventory/search
//       ?model={model}&zip={zip}&radius={radius}&maxdealers={maxdealers}
// There is no fuelType facet, but Genesis's BEVs each have their OWN model file
// (GV60 is BEV-only; "Electrified-GV70" is the electric GV70), so querying just
// those model files IS the structured BEV filter — every returned car is
// battery-electric (evConfidence high), and a Cylinders===0 guard backs it up.
//
// Coverage is a single nationwide sweep, like BMW: radius spans the country and
// maxdealers past the dealer count returns every rooftop's stock. Proven
// complete — the GV70 VIN set from a LA origin and a NYC origin were byte-for-
// byte identical (121 VINs, 0 disjoint), and the geographic-center zip 66952 at
// radius 8000 / maxdealers 5000 returns the same national set. So this
// certifies COMPLETE — real domain genesis.com, so db-sync's nightly delisting
// retires sold VINs (see gm.mjs). New inventory only (every record is
// Mileage:"New", SortableMileage:0); Genesis Certified/used is a separate
// endpoint, a future lane.
//
// The "Electrified G80" is intentionally absent: Genesis retired it, there is no
// electrified-g80 model file (FILE_NOT_FOUND), and a full national G80 sweep
// (1329 cars) contained zero electrified units. Re-add a model entry if it
// returns. The API exposes a real dealer name + address per car but no VDP URL
// (the site is a SPA with no per-VIN route), so sourceUrl is the brand
// inventory page and dealer geo is populated from the record.
import { politeGetJson } from "../http.mjs";

export const GENESIS = {
  key: "genesis",
  domain: "genesis.com",
  make: "Genesis",
  base: "https://www.genesis.com/bin/api/v2/inventory/search",
  // BEV-only model files. `query` is the API's model param; `model` is the
  // display name written to the record.
  models: [
    { query: "GV60", model: "GV60" },
    { query: "Electrified-GV70", model: "Electrified GV70" },
  ],
  zip: "66952", // ~geographic center of the US; radius does the rest
  radius: 8000, // miles — spans the country from any origin
  maxdealers: 5000, // past the Genesis dealer count → every rooftop's stock
  minExpected: 120,
};

// recheck.mjs skips this: the per-model sweep is complete national coverage
// nightly, so db-sync's truncated:false already retires gone VINs — and the API
// carries no per-VIN VDP to recheck anyway (same rule as GM/BMW).
export const OEM_LOCATOR_DOMAINS = new Set([GENESIS.domain]);

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
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

const titleCase = (s) => String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

// "Electrified Prestige" for GV70; leave GV60 trims as given. Drop a leading
// "Electrified " so the trim isn't just echoing the model's electric badge.
function trimOf(trimDesc) {
  const t = String(trimDesc ?? "").trim();
  if (!t) return undefined;
  const stripped = t.replace(/^electrified\s+/i, "").trim();
  return (stripped || t) || undefined;
}

function toRecord(v, displayModel) {
  const vin = String(v.VIN ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // BEV guard: we only query BEV-only model files, and their cars carry no
  // cylinders / empty engine. A non-zero cylinder count would mean the model
  // file started mixing in a combustion variant — drop it rather than mislabel.
  if (Number(v.Cylinders) > 0) return null;
  const year = Number(v.ModelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const state = US_STATES.has(String(v.State ?? "").toUpperCase()) ? v.State.toUpperCase() : undefined;
  const zip = /^\d{5}/.test(String(v.DlrZipCode ?? "")) ? String(v.DlrZipCode).slice(0, 5) : undefined;
  return {
    vin,
    year,
    make: GENESIS.make,
    model: displayModel,
    trim: trimOf(v.TrimDesc),
    priceUsd: num(v.SortablePrice) ?? num(v.FormattedPrice),
    driveLine: drive(v.Drivetrain || v.DrivetrainDesc),
    exteriorColor: v.ExtColorDesc ? titleCase(v.ExtColorDesc) : v.ExtColor ? titleCase(v.ExtColor) : undefined,
    interiorColor: v.IntColor ? titleCase(v.IntColor) : undefined,
    dealerName: v.DlrName ? titleCase(v.DlrName) : undefined,
    city: v.City ? titleCase(v.City) : undefined,
    state,
    zip,
    condition: "new", // every record is Mileage:"New", SortableMileage:0
    imageUrl: undefined, // API carries no photo (known gap)
    images: [],
    // No per-VIN VDP on the SPA; the brand inventory page is the click-through.
    sourceUrl: "https://www.genesis.com/us/en/inventory",
    dealerDomain: GENESIS.domain,
    evKind: "BEV",
    evConfidence: "high", // queried a BEV-only model file, not a name match
    platform: "genesis-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

async function searchModel(m, report) {
  const url = `${GENESIS.base}?model=${encodeURIComponent(m.query)}&zip=${GENESIS.zip}&radius=${GENESIS.radius}&maxdealers=${GENESIS.maxdealers}`;
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, { headers: { origin: "https://www.genesis.com", referer: "https://www.genesis.com/us/en/inventory" } });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push(`robots disallows ${m.query}`); return null; }
    if (res.status === 200 && res.json?.result) {
      const rstatus = res.json.result.status;
      // "No records found" is a valid empty answer (a model with no stock);
      // FILE_NOT_FOUND means the model param stopped resolving — that IS an error.
      if (rstatus === "SUCCESS") return res.json.result.vehicles ?? [];
      if (/no records/i.test(String(rstatus))) return [];
      report.errors.push(`${rstatus} for model=${m.query}`);
      return null;
    }
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} model=${m.query}`);
    return null;
  }
}

// Pull Genesis's complete national new BEV inventory (one call per BEV model
// file). crawl.mjs-shaped report; see gm.mjs for the completeness contract that
// truncated:false certifies (genesis.com fully covered → nightly delisting).
export async function pullGenesis({ log = () => {} } = {}) {
  const report = { domain: GENESIS.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();

  for (const m of GENESIS.models) {
    const vehicles = await searchModel(m, report);
    if (vehicles === null) continue; // error recorded; flips truncated below
    let kept = 0;
    for (const v of vehicles) {
      const rec = toRecord(v, m.model);
      if (rec) { byVin.set(rec.vin, rec); kept++; }
    }
    report.notes.push(`${m.model}: ${vehicles.length} returned, ${kept} kept`);
    log(`genesis/${m.model}: ${vehicles.length} returned, ${byVin.size} cumulative VINs`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  // Completeness (see gm.mjs): every model file fetched cleanly AND yield over
  // floor. A single wide sweep reconstructs the whole national set (LA≡NYC VIN
  // sets), so any error means a model call failed → truncated, no delisting.
  report.truncated = report.errors.length > 0 || byVin.size < GENESIS.minExpected;
  return report;
}
