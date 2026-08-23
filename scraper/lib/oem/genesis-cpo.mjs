// Genesis Certified (certified pre-owned) national inventory — genesis.com.
//
// The separate lane lib/oem/genesis.mjs promised: its header says "Genesis
// Certified/used is a separate endpoint, a future lane". This is it, and it is
// a different service on the same host, not a parameter on the new-car one.
// Captured live 2026-08-23 by loading genesis.com/us/en/certified/inventory in
// a real browser and watching what it fetched — the CPO results page is an
// Angular widget whose paging is entirely client-side (clicking "next" fires
// no request at all), so the whole national set arrives up front, one call per
// model file:
//
//   GET https://www.genesis.com/us/en/cpo/services/certifiedinventory.js
//       ?model={slug}&type=inventory&refreshtoken={YYYY-MM-DD}.js
//   → { status: "SUCCESS", data: { Vehicles: [ { Veh: {...} } ] } }
//
// There is NO zip, radius or paging parameter: the model file IS the national
// set. That is the completeness construction here — not count arithmetic, and
// not a short last page, because there are no pages. A model file either
// answers SUCCESS with its whole array or it errors, and an error flips
// truncated so nothing gets delisted on a half pull (see gm.mjs).
// Corroborated against the site's own number: the results page reports 1,415
// vehicles within radius 5000 of a central ZIP, and the nine model files sum
// to 1,423 — the small excess being the dealers outside even that radius.
//
// WHICH MODELS: read, not hard-coded. The same page publishes the retailer's
// authoritative model list at
//   GET /us/en/cpo/services/componentdata.js?pageType=results&filterName=inventorysearch_filt
// whose `modelList` gives the slugs (spaces, not hyphens: "electrified gv70").
// Reading it means a nameplate Genesis adds — the electrified GV90 whenever it
// lands — is swept the night it appears rather than the day someone notices.
// MODEL_FALLBACK below is only for the case where that call fails; using it
// records a note, because a stale list is exactly how a new BEV goes missing.
//
// THE BEV GATE IS STRUCTURAL, AND IT IS ALSO THE NIGHTLY CONTROL. Every model
// file is fetched, including the petrol ones, and a record is kept only when
// EngineDesc is exactly "Electric" AND Cylinders is 0. Measured 2026-08-23
// across all nine files: gv60 24/24, electrified-gv70 21/21, electrified-g80
// 5/5 all pass both tests; gv70 (512), g80 (92), g70 (364), g90 (12), gv80
// (371) and gv80-coupe (22) contribute zero, every one of them carrying 4 or 6
// cylinders and a gasoline engine string. So the petrol files are a control
// that runs every night: if one of them ever starts contributing, either
// Genesis electrified that nameplate (good, and we get it automatically) or
// the feed's engine fields changed meaning (and the yield jump says so).
//
// The Genesis mild hybrids do NOT sneak through, and the check was done by
// VIN, not by reading the label: g90 and gv80-coupe both list an engine
// "Turbo/supercharger Gas/electric V-6 3.5 L/212", which is a hybrid-shaped
// string on a car that is not electrified in our sense. They fail the
// Cylinders===0 test, and vPIC agrees for the right reason —
// KMTFB4SD6PU028479 (G90) and KMUJAESC3SU220280 (GV80 Coupe) both decode
// ElectrificationLevel "" / FuelTypePrimary "Gasoline", while the three cars
// this lane keeps decode "BEV (Battery Electric Vehicle)" /
// FuelTypePrimary "Electric" (KMUKCDTC1PU014633 GV60, 5NMMCET10PH000696
// Electrified GV70, KMTGE4S14PU005896 Electrified G80). Genesis sells no
// plug-in hybrid in the US, so this lane has no PHEV leg to build; if one
// appears it will arrive in its own model file and land on the electric gate,
// which it will fail — revisit here rather than assuming.
//
// The Electrified G80 is present here even though genesis.mjs correctly
// records it as GONE from the new-car locator: Genesis stopped building it,
// but the ones it built are now certified used. That is the whole point of a
// used lane.
//
// Domain is the synthetic "genesis-cpo", not genesis.com, for the same reason
// hyundai-cpo and nissan-cpo are synthetic: genesis.com already belongs to the
// new-car lane, and db-sync retires by whole domain. Two reports sharing one
// domain would let a failed pull on either side delist the other's cars (the
// hazard kia.mjs writes up at length).
//
// Photos come from DealerImage[], never MainImage: MainImage is the SAME
// broken URL on every record in the feed
// (hyundaicpo.images.dmotorworks.com/MA057/5NPDH4AE6EH491518/1.jpg — a Sonata
// VIN), so publishing it would put one wrong car's photo on all of them.
import { politeGetJson } from "../http.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { stateFromZip } from "./zip-state.mjs";

export const GENESIS_CPO = {
  key: "genesis-cpo",
  domain: "genesis-cpo",
  make: "Genesis",
  base: "https://www.genesis.com/us/en/cpo/services",
  referer: "https://www.genesis.com/us/en/certified/inventory",
  // Only used when the live model list can't be read; see header.
  modelFallback: ["g70", "g80", "electrified g80", "g90", "gv60", "gv70", "electrified gv70", "gv80", "gv80 coupe"],
  minExpected: 25, // 50 BEVs on the capture day; alert well below that
};

// recheck.mjs skips this: the per-model sweep is the complete national set
// nightly, so db-sync's truncated:false already retires gone VINs (same rule
// as GM/BMW/genesis.mjs).
export const OEM_LOCATOR_DOMAINS = new Set([GENESIS_CPO.domain]);

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

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

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (s.startsWith("https://")) return s;
  if (s.startsWith("http://")) return "https://" + s.slice(8);
  return undefined;
};

const titleCase = (s) => String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

// "electrified gv70" → "Electrified GV70"; "gv80 coupe" → "GV80 Coupe".
function displayModel(slug) {
  return String(slug)
    .split(/[\s-]+/)
    .map((w) => (/^g\d0$|^gv\d0$/i.test(w) ? w.toUpperCase() : titleCase(w)))
    .join(" ");
}

// Drop a leading "Electrified " so the trim isn't just echoing the model's
// electric badge — same rule genesis.mjs uses on the new-car side.
function trimOf(trimDesc) {
  const t = String(trimDesc ?? "").trim();
  if (!t) return undefined;
  const stripped = t.replace(/^electrified\s+/i, "").trim();
  return stripped || t || undefined;
}

// The structural BEV gate. Both halves are required: EngineDesc alone would
// admit the "Gas/electric" mild hybrids, and Cylinders alone would admit a
// record whose engine fields were simply blank.
function isBev(v) {
  return String(v.EngineDesc ?? "").trim().toLowerCase() === "electric" && Number(v.Cylinders) === 0;
}

function toRecord(v, model) {
  const vin = String(v.VIN ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  if (!isBev(v)) return null;
  const year = Number(v.ModelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const zip = /^\d{5}/.test(String(v.DlrZipCode ?? "")) ? String(v.DlrZipCode).slice(0, 5) : undefined;
  const images = (Array.isArray(v.DealerImage) ? v.DealerImage : [])
    .map((i) => httpsUrl(i?.URL))
    .filter(Boolean)
    .slice(0, 12);
  return {
    vin,
    year,
    make: GENESIS_CPO.make,
    model,
    trim: trimOf(v.TrimDesc),
    ...pickTaggedPrice("genesis-cpo", [
      ["SortablePrice", num(v.SortablePrice)],
      ["FormattedPrice", num(v.FormattedPrice)],
    ]),
    // SortableMileage is a number; Mileage is its formatted twin ("17,157").
    // A certified car with no odometer reading keeps none rather than 0.
    mileage: Number.isFinite(v.SortableMileage) && v.SortableMileage > 0 ? Math.round(v.SortableMileage) : num(v.Mileage),
    driveLine: drive(v.Drivetrain || v.DrivetrainDesc),
    exteriorColor: v.ExtColorDesc && v.ExtColorDesc !== "N/A" ? titleCase(v.ExtColorDesc) : v.ExtColor ? titleCase(v.ExtColor) : undefined,
    interiorColor: v.IntColorCd && v.IntColorCd !== "N/A" ? titleCase(v.IntColorCd) : v.IntColor ? titleCase(v.IntColor) : undefined,
    dealerName: v.DlrName ? titleCase(v.DlrName) : undefined,
    state: stateFromZip(zip),
    zip,
    certified: true,
    // Every car in this feed is Genesis Certified — that is what the endpoint
    // is. The claim rides on the source, not on a marketing string.
    condition: "certified",
    imageUrl: images[0],
    images,
    // Each record carries its selling retailer's own VDP; the brand CPO search
    // is the fallback when it is missing or malformed.
    sourceUrl: httpsUrl(v.DealerVINUrl) ?? "https://www.genesis.com/us/en/certified/inventory",
    dealerDomain: GENESIS_CPO.domain,
    evKind: "BEV",
    evConfidence: "high", // EngineDesc "Electric" AND Cylinders 0, both structural
    platform: "genesis-cpo-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

async function getJson(url, report, what) {
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, { headers: { origin: "https://www.genesis.com", referer: GENESIS_CPO.referer } });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push(`robots disallows ${what}`); return null; }
    if (res.status === 200 && res.json) return res.json;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} ${what}`);
    return null;
  }
}

// The retailer's own model list, or the fallback with a note saying so.
async function modelSlugs(report, log) {
  const url = `${GENESIS_CPO.base}/componentdata.js?pageType=results&filterName=inventorysearch_filt`;
  const j = await getJson(url, report, "componentdata");
  const list = Object.values(j?.modelList ?? {})
    .map((m) => String(m?.modelvalue ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (list.length) {
    report.notes.push(`model list from componentdata: ${list.join(", ")}`);
    return list;
  }
  // Not an error that should stop the pull, but it IS the state in which a new
  // nameplate goes unseen, so say it out loud in the report.
  report.notes.push("componentdata model list unreadable — using the pinned fallback list");
  log("genesis-cpo: model list unreadable, using fallback");
  return GENESIS_CPO.modelFallback;
}

/** Pull every Genesis Certified BEV in the country (one call per model file).
 *  crawl.mjs-shaped report; see gm.mjs for the completeness contract that
 *  truncated:false certifies. */
export async function pullGenesisCpo({ log = () => {} } = {}) {
  const report = { domain: GENESIS_CPO.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();
  const token = new Date().toISOString().slice(0, 10); // the page's own cache-buster

  for (const slug of await modelSlugs(report, log)) {
    const url = `${GENESIS_CPO.base}/certifiedinventory.js?model=${encodeURIComponent(slug.replace(/\s+/g, "-"))}&type=inventory&refreshtoken=${token}.js`;
    const j = await getJson(url, report, `model=${slug}`);
    if (!j) continue; // error recorded; flips truncated below
    if (String(j.status ?? "").toUpperCase() !== "SUCCESS") {
      // A model with no certified stock still answers SUCCESS with an empty
      // array; anything else means the model param stopped resolving.
      report.errors.push(`${j.status} for model=${slug}`);
      continue;
    }
    const vehicles = j.data?.Vehicles ?? [];
    const display = displayModel(slug);
    let kept = 0;
    for (const w of vehicles) {
      const rec = toRecord(w?.Veh ?? w, display);
      if (rec) { byVin.set(rec.vin, rec); kept++; }
    }
    report.notes.push(`${display}: ${vehicles.length} certified, ${kept} BEV`);
    log(`genesis-cpo/${display}: ${vehicles.length} certified, ${kept} BEV, ${byVin.size} cumulative`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  // Completeness (see gm.mjs): every model file answered SUCCESS and the yield
  // cleared the floor. There is no paging to fall short of — a model file is
  // whole or it failed — so any error at all means truncated, no delisting.
  report.truncated = report.errors.length > 0 || byVin.size < GENESIS_CPO.minExpected;
  return report;
}
