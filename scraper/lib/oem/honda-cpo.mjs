// Honda's certified-and-used programme (hondacertified.com) — the used half of
// Honda, which lib/oem/honda.mjs's new-Prologue grid never sees.
//
// Two endpoints, both read out of the site's own JavaScript rather than
// guessed, both open to a plain Node fetch with a Referer (robots.txt on
// www.hondacertified.com disallows only /diagnostics/ and /platform/admin/):
//
//   1. ENUMERATION — POST /cpo/api/v1/inventory/getbyfilter
//      body {radius, programs, yearRange:{from,to}, bodyStyles, sortBy, models,
//            quantity, zipcode}
//      The endpoint validates its own input and says so, which is how the
//      limits below are known rather than assumed: asking for quantity 500
//      answers 400 with "Quantity greater than 100 (value received: 500)" and
//      asking for radius 500 answers "radius invalid (Value received: 500).
//      Use 50." `models` is a REAL server-side filter over Honda's model-group
//      names (models:["Prologue"] returns Prologues only), and an unknown name
//      returns an empty list rather than an error — which is the trap this
//      lane is built around, see DISCOVERY below.
//
//   2. THE RECORD — GET /handlers/get-vehicle-details.ashx?vin=…&zip=…
//      getbyfilter's rows are thin (no VIN field of their own — it is in the
//      inventoryUrl — no certified flag, no colours, no dealer address). The
//      details handler answers the full Honda inventory record for one VIN:
//      VehicleType C/U, CPOTier, DSRP, real mileage, colours, the selling
//      dealer with city/state/ZIP, the dealer's own VDP, and ModelAttributes.
//
// THE EV GATE IS STRUCTURAL and comes from that second call. Every record
// carries a FUEL_TYP_CD / FUEL_TYP_NAME attribute pair, and the three cases
// measured live 2026-08-23 settle it:
//     Prologue           FUEL_TYP_CD E  "Electric Vehicle"
//     Clarity Plug-In    FUEL_TYP_CD B  "Plug-In Hybrid Vehicle Electricity-Gasoline"
//     CR-V Hybrid        FUEL_TYP_CD G  "Gasoline Vehicle"
// so E ⇒ BEV, B ⇒ PHEV, and a conventional hybrid cannot pass either. Nothing
// ships on the strength of the nameplate we queried; the row has to say it.
// (ModelTransmission "ELE" also marks the BEVs, but it reads "CVT" on the
// Clarity plug-in, so it cannot be the gate for both.)
//
// DISCOVERY, and the check that keeps it honest. The enumeration has to name
// models, and a name that stops being right returns zero silently. So the lane
// also reads Honda's own model library — /model-library links every certified
// nameplate as vehicle-search?modelgroupname=… — and compares that vocabulary
// against KNOWN below. A nameplate Honda lists that we have never classified
// raises a note in the report, which is the only way a future Honda BEV can
// fail to be MISSING rather than merely unqueried. (Two names in KNOWN return
// nothing today and are kept anyway because their stock can come back: the
// Clarity Electric and the Accord Plug-In Hybrid.)
//
// COVERAGE is a national covering grid, because the endpoint is inherently
// local: radius tops out at 250 miles and each answer is the 100 nearest cars.
// Cells are honda.mjs's (4.2° x 4.5°, ~290 x 238 mi), whose half-diagonal is
// ~187 mi and so sits inside the 250-mile radius with ~60 miles of slack for
// the anchor not being exactly at the cell centre. A cell that comes back at
// the 100 cap is holding more than it can return and is subdivided; one that
// still caps after subdivision is recorded as UNRESOLVED rather than assumed
// clean. Honda's electrified used stock is nowhere near that dense today
// (Los Angeles at the full 250-mile radius returns 12 Prologues and 5 Clarity
// plug-ins), so the subdivision path is insurance, not the normal case.
//
// Because a covering grid can never be proven exhaustive, this is
// truncated:true ALWAYS, on a synthetic domain isolated from honda-prologue
// (which certifies nothing either, but for NEW cars — a used sweep's absence
// must not be able to delist a new Prologue). Delisting rides recheck: every
// row's sourceUrl is the selling dealer's own VDP, taken from the record's
// BuyOnline VehicleDetailPageURL, so honda-cpo is deliberately NOT in the
// recheck-skip set.
//
// NOT USED, and worth recording so nobody re-walks it: /handlers/
// get-inventory-data.ashx?zip=&radius= is the search page's own feed and is
// far richer — it returns whole model records, a dealer directory with
// per-dealer CPO/used counts, and Total{Record,CPO,Used}Count. It is also
// hard-capped at 1,000 vehicles and 50 dealers per response regardless of
// radius (Los Angeles at radius 25 and at radius 250 both return exactly
// 1,000), and each response is ~3.8 MB. Covering the country through it would
// mean several hundred multi-megabyte responses a night to find a hundred-odd
// electrified cars. It is the right tool for a control test — see the report —
// and the wrong one for the nightly.
import { politePostJson, politeGetJson, fetchRaw } from "../http.mjs";
import { subdivideZips } from "./grid.mjs";
import { readFileSync } from "node:fs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";

export const HONDA_CPO = {
  key: "honda-cpo",
  // Synthetic, and separate from honda-prologue on purpose (see header).
  domain: "honda-cpo",
  make: "Honda",
  host: "https://www.hondacertified.com",
  search: "https://www.hondacertified.com/cpo/api/v1/inventory/getbyfilter",
  details: "https://www.hondacertified.com/handlers/get-vehicle-details.ashx",
  library: "https://www.hondacertified.com/model-library",
  minExpected: 20,
};

// recheck.mjs must NOT skip this domain: every row carries the selling
// dealer's own VDP, which is how sold cars leave the feed (the grid is
// truncated, so db-sync never delists here). Empty on purpose.
export const OEM_LOCATOR_DOMAINS = new Set();

// Honda's certified model-group vocabulary, classified. `ev` names are the
// ones queried; the rest are listed so the model-library check can tell "we
// know this is petrol" from "we have never seen this name".
//
// Honda's US electrified passenger cars, all of them: the Prologue (BEV,
// 2024+), the Clarity Plug-In Hybrid (2018–21), the Clarity Electric (BEV,
// 2017–19, lease-only), the Fit EV (BEV, 2013–14, lease-only) and the Accord
// Plug-In Hybrid (2014–15). The CR-V e:FCEV and Clarity Fuel Cell are
// hydrogen and are not in scope. Everything else Honda has certified —
// Insight, CR-Z, Accord Hybrid, CR-V (incl. its hybrid trims) — is a
// conventional hybrid or petrol car, and the FUEL_TYP_CD gate would refuse
// them even if a name slipped through.
const EV_MODELS = [
  "Prologue",
  "Clarity Plug-In Hybrid",
  "Clarity Electric",
  "Accord Plug-In Hybrid",
  "Fit EV",
];
const NON_EV_MODELS = [
  "Accord Coupe", "Accord Hybrid", "Accord Sedan", "Civic Coupe", "Civic Hatchback",
  "Civic Sedan", "Civic Si Coupe", "Civic Si Sedan", "Civic Type R", "CR-V", "CR-Z",
  "Fit", "HR-V", "Insight", "Odyssey", "Passport", "Pilot", "Ridgeline", "Prelude",
  "Accord", "Civic", "Element", "Crosstour", "Clarity",
];
const KNOWN = new Set([...EV_MODELS, ...NON_EV_MODELS].map((s) => s.toLowerCase()));

const RADIUS = "250"; // server maximum; anything larger 400s with "Use 50."
const QUANTITY = "100"; // server maximum; a full response means the cell is capped
const CAP = 100;
const CELL_LAT = 4.2, CELL_LNG = 4.5; // honda.mjs's cells; ~187mi half-diagonal
const SUB_SPAN_MI = 120;
const REQUEST_BUDGET = 600;
const TIMEOUT_MS = 60000;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const HI_AK_ZIPS = ["96813", "99501"]; // Honolulu + Anchorage, outside the CONUS grid
const YEAR_FROM = "2010"; // earliest Honda plug-in (Fit EV 2013) with margin

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC")
    .split(" ")
);

const titleCase = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return undefined;
  return t === t.toUpperCase() ? t.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : t;
};

const drive = (marketing) => {
  const s = String(marketing ?? "").toUpperCase();
  if (/\bAWD\b|ALL.?WHEEL|\b4WD\b/.test(s)) return "AWD";
  if (/\b2WD\b|\bFWD\b|FRONT/.test(s)) return "FWD";
  return undefined;
};

// "AWD ELITE" → "Elite"; "2WD Touring" → "Touring"; "AWD" → undefined.
// The drive token is stripped rather than kept, for toyota.mjs's reason: the
// record already carries the drivetrain in its own field, and "AWD" is not a
// trim level. A marketing name that says nothing but the drivetrain leaves the
// trim empty rather than inventing one out of it.
const trimOf = (marketing, fallback) => {
  const raw = String(marketing ?? "").replace(/\b(AWD|FWD|RWD|2WD|4WD|HYBRID)\b/gi, " ").replace(/\s+/g, " ").trim();
  const t = raw || String(fallback ?? "").trim();
  return t ? titleCase(t) : undefined;
};

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (!s) return undefined;
  return s.startsWith("https://") ? s : s.startsWith("http://") ? "https://" + s.slice(7) : undefined;
};

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const attr = (attrs, code) => asArray(attrs).find((a) => a?.["@Code"] === code)?.["@Value"];

// FUEL_TYP_CD → what the car is. Anything else (G gasoline, D diesel, and any
// code we have not seen) is not an answer this lane will publish.
function kindOf(attrs) {
  const cd = String(attr(attrs, "FUEL_TYP_CD") ?? "").trim().toUpperCase();
  const name = String(attr(attrs, "FUEL_TYP_NAME") ?? "");
  if (cd === "E" && /electric/i.test(name) && !/hybrid|plug/i.test(name)) return "BEV";
  if (cd === "B" && /plug/i.test(name)) return "PHEV";
  return undefined;
}

// Honda's own condition tokens, machine values not display strings (see
// lib/condition.mjs for why that distinction is load-bearing): VehicleType is
// "C" for a certified car and "U" for a HondaTrue Used / plain used one, and
// CPOTier is the programme tier ("T1"/"T2" certified, "U" otherwise).
function conditionOf(v) {
  const t = String(v?.VehicleType ?? "").trim().toUpperCase();
  if (t === "C") return { certified: true, condition: "certified" };
  if (t === "U") return { certified: false, condition: "used" };
  return { certified: undefined, condition: undefined }; // says nothing we can stand behind
}

// One get-vehicle-details.ashx payload → normalized listing, or null.
function toRecord(json) {
  const R = json?.Output?.Results;
  const model = asArray(R?.Models?.Model)[0];
  if (!model) return null;
  const v = asArray(model.ModelVINsOnSite?.VIN)[0];
  if (!v) return null;
  const vin = String(v.VIN ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const kind = kindOf(R?.ModelAttributes?.ModelAttribute);
  if (!kind) return null; // the row did not say it was electrified — drop it
  const year = Number(model.ModelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const dealer = asArray(R?.Dealers?.Dealer).find((d) => String(d?.DealerID) === String(model["@DealerId"])) ?? asArray(R?.Dealers?.Dealer)[0];
  const zip = /^\d{5}/.test(String(dealer?.DealerZip ?? "")) ? String(dealer.DealerZip).slice(0, 5) : undefined;
  const state = US_STATES.has(String(dealer?.DealerState ?? "").toUpperCase()) ? String(dealer.DealerState).toUpperCase() : undefined;
  const imgs = asArray(v.Photos?.Photos?.Photo).map((p) => httpsUrl(p?.["#text"])).filter(Boolean).slice(0, 8);
  const vdp = httpsUrl(v.BuyOnline?.["@VehicleDetailPageURL"]);
  const price = num(v.DSRP);
  const floor = priceFloor({ isNew: false, year });
  return {
    vin,
    year,
    make: HONDA_CPO.make,
    model: String(model.ModelGroupName ?? "").trim() || undefined,
    trim: trimOf(model.ModelMarketingName, model.ModelTrim),
    // DSRP is the only price the record publishes. Under the year's junk floor
    // it is a payment, not an ask (lib/price-floor.mjs), so it is dropped.
    ...pickTaggedPrice("honda-cpo", [["dsrp", price != null && price >= floor ? price : undefined]]),
    mileage: num(v.Mileage),
    driveLine: drive(model.ModelMarketingName),
    exteriorColor: v.ModelExteriorColorName || undefined,
    interiorColor: v.ModelInteriorColorName || undefined,
    dealerName: dealer?.DealerName || undefined,
    city: dealer?.DealerCity ? titleCase(dealer.DealerCity) : undefined,
    state,
    zip,
    ...conditionOf(v),
    cpoTier: v.CPOTier || undefined,
    imageUrl: imgs[0],
    images: imgs,
    // The selling dealer's own VDP — what recheck verifies (header).
    sourceUrl: vdp || `${HONDA_CPO.host}/vehicle-details?vin=${vin}`,
    dealerDomain: HONDA_CPO.domain,
    evKind: kind,
    // Structural: the record's own FUEL_TYP_CD, not the nameplate we queried.
    evConfidence: "high",
    platform: "honda-cpo",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// One getbyfilter call. Returns the VINs it saw plus whether the cell capped.
//
// `models` is a list and the server ORs it — asking for the Prologue alone
// returns 12 near Los Angeles, the Clarity plug-in alone 5, and both together
// 17 — so the whole electrified vocabulary costs one request per cell instead
// of one per nameplate. That is what makes it affordable to keep querying the
// three nameplates (Clarity Electric, Accord Plug-In, Fit EV) that return
// nothing today: their cost is now zero requests rather than one per cell.
async function searchCell(models, zip, report) {
  const body = {
    radius: RADIUS,
    programs: [],
    yearRange: { from: YEAR_FROM, to: String(new Date().getFullYear() + 1) },
    bodyStyles: [],
    sortBy: "oldest",
    models,
    quantity: QUANTITY,
    zipcode: zip,
  };
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(HONDA_CPO.search, {
      headers: { origin: HONDA_CPO.host, referer: `${HONDA_CPO.host}/`, "content-type": "application/json" },
      body,
      timeoutMs: TIMEOUT_MS,
    });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push("robots disallows getbyfilter"); return null; }
    if (res.status === 200 && Array.isArray(res.json)) {
      const vins = res.json
        .map((r) => (String(r?.inventoryUrl ?? "").match(/vin=([A-Z0-9]{17})/i) || [])[1])
        .filter((s) => s && VIN_RE.test(s.toUpperCase()))
        .map((s) => s.toUpperCase());
      return { vins, capped: res.json.length >= CAP };
    }
    // The endpoint states its own validation failures; surface them verbatim.
    if (res.status === 400) { report.errors.push(`400 @${zip}: ${JSON.stringify(res.json?.errors ?? "").slice(0, 120)}`); return null; }
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt < 1 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} @${zip}`);
    return null;
  }
}

// The full record for one VIN.
async function detail(vin, report) {
  const url = `${HONDA_CPO.details}?vin=${vin}&zip=90045`;
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, {
      headers: { origin: HONDA_CPO.host, referer: `${HONDA_CPO.host}/vehicle-details?vin=${vin}` },
      timeoutMs: TIMEOUT_MS,
    });
    report.fetched++;
    if (res.status === 200 && res.json) return res.json;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt < 1 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`detail ${res.status} ${vin}`);
    return null;
  }
}

// Honda's own certified model vocabulary, from the model-library page's
// vehicle-search links. Returns null if the page could not be read — which is
// not the same as "Honda certifies nothing" and must not be treated as such.
async function libraryVocabulary(report) {
  const r = await fetchRaw(HONDA_CPO.library, { timeoutMs: TIMEOUT_MS }).catch(() => ({ status: "error", body: null }));
  report.fetched++;
  if (r.status !== 200 || !r.body) { report.errors.push(`model-library unreadable (${r.status})`); return null; }
  const names = new Set();
  for (const m of r.body.matchAll(/modelgroupname=([^"&<\s]+)/gi)) {
    const name = decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
    if (name) names.add(name);
  }
  return names.size ? [...names] : null;
}

// Coarse national covering grid: one representative CONUS ZIP per cell,
// nearest the centre, so the grid follows where dealers are.
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

/**
 * Pull Honda's national certified + HondaTrue-used electrified inventory.
 * crawl.mjs-shaped report on the synthetic "honda-cpo" domain, always
 * truncated (see header).
 */
export async function pullHondaCpo({ log = () => {} } = {}) {
  const report = { domain: HONDA_CPO.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  // Vocabulary check first: it is cheap, and a nameplate we do not know about
  // is the one way this lane can be quietly incomplete.
  const vocab = await libraryVocabulary(report);
  if (vocab) {
    const unknown = vocab.filter((n) => !KNOWN.has(n.toLowerCase()));
    if (unknown.length) report.notes.push(`UNCLASSIFIED Honda certified nameplates (not queried): ${unknown.join(", ")}`);
    report.notes.push(`model-library lists ${vocab.length} certified nameplates`);
  }

  const grid = coarseAnchors();
  if (!grid) {
    report.errors.push("web/data/zips.json unavailable — cannot build the covering grid");
    report.truncated = true;
    return report;
  }
  const { anchors, zips } = grid;
  // Ops/control knobs: HONDA_CPO_ANCHORS pins the sweep to named ZIPs (the
  // control test in the lane's report compares one metro against Honda's own
  // search feed), HONDA_CPO_MAX_CELLS is a smoke-test throttle.
  const pinned = process.env.HONDA_CPO_ANCHORS?.split(",").map((s) => s.trim()).filter(Boolean);
  const maxCells = Number(process.env.HONDA_CPO_MAX_CELLS) || Infinity;
  const cells = (pinned?.length ? pinned : anchors).slice(0, maxCells);
  const models = process.env.HONDA_CPO_MODELS?.split(",").map((s) => s.trim()).filter(Boolean) ?? EV_MODELS;

  const vins = new Set();
  for (const zip of cells) {
    if (report.fetched >= REQUEST_BUDGET) { report.errors.push("request budget hit during enumeration"); break; }
    const r = await searchCell(models, zip, report);
    if (!r) continue;
    r.vins.forEach((v) => vins.add(v));
    if (!r.capped) continue;
    // The cell is holding more than it can return: move the query centre in.
    const c = zips[zip];
    let resolved = false;
    if (c) {
      for (const sz of subdivideZips(zips, c[0], c[1], SUB_SPAN_MI)) {
        if (report.fetched >= REQUEST_BUDGET) break;
        const sub = await searchCell(models, sz, report);
        if (!sub) continue;
        sub.vins.forEach((v) => vins.add(v));
        if (!sub.capped) resolved = true;
      }
    }
    if (!resolved) report.notes.push(`UNRESOLVED cap: ${zip} still returned ${CAP} after subdivision`);
  }
  log(`honda-cpo: ${cells.length} cells → ${vins.size} candidate VINs, ${report.fetched} reqs`);

  const byVin = new Map();
  for (const vin of vins) {
    if (report.fetched >= REQUEST_BUDGET) { report.errors.push(`request budget hit before detailing ${vins.size - byVin.size} VINs`); break; }
    const j = await detail(vin, report);
    if (!j) continue;
    const rec = toRecord(j);
    if (rec) byVin.set(rec.vin, rec);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const kinds = report.evs.reduce((a, r) => ((a[r.evKind] = (a[r.evKind] ?? 0) + 1), a), {});
  const conds = report.evs.reduce((a, r) => ((a[r.condition ?? "unstated"] = (a[r.condition ?? "unstated"] ?? 0) + 1), a), {});
  report.notes.push(`covering grid ${CELL_LAT}x${CELL_LNG}deg r${RADIUS}: ${cells.length} anchors, ${models.length} nameplates per call, ${vins.size} candidate VINs, ${report.evs.length} electrified ${JSON.stringify(kinds)} ${JSON.stringify(conds)}, ${report.fetched} requests`);
  log(`honda-cpo: ${report.evs.length} cars ${JSON.stringify(kinds)}, ${report.fetched} requests, ${report.errors.length} errors`);
  // Never certifies complete: a per-radius covering grid is a sample, so it
  // must not drive delisting. recheck does that per VIN (header).
  report.truncated = true;
  return report;
}
