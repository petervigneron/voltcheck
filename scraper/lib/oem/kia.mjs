// Kia national inventory locator (kia.com).
//
// Kia's find-inventory page posts to a public JSON endpoint that needs no auth
// token, only a normal Referer — verified from a plain Node fetch 2026-08-15
// (control: tesla.com and ford.com/inventory both Akamai-403 the identical
// request; Kia returns 200). The endpoint is:
//   POST https://www.kia.com/us/services/en/inventory
//   body: { filterSet: { series, zipCode, zipLocation:{lat,lng}, selectedRange,
//           page, pageSize, sortOrder, isInitialRequest:true, status:["DS","IT"] } }
// With isInitialRequest:true and no dealers array, the server resolves the
// dealers itself and returns every matching car in one response (no
// pagination). A single call from the geographic center of the US with a
// nation-spanning range therefore covers the whole lower 48 per model.
//
// This module pulls BOTH lots under kia.com in one puller:
//   - New: POST /us/services/en/inventory (above), one call per BEV series.
//   - CPO (used): POST /us/services/en/cpo/inventory/exactmatch, per model
//     name, paginated 10-per-call. Full dealer address + real mileage/VDP.
// They share one report on purpose — certifying kia.com complete on a
// half-pull would delist the other half (see pullKia's completeness note).
//
// Coverage notes:
//   - The search is per-series/per-model, so each EV nameplate is one call
//     (New) or a short pagination (CPO)
//   - Range is a real radius from zipLocation; 3500mi from the US center
//     reaches both coasts. Alaska/Hawaii dealers fall outside it — a known,
//     negligible gap (as with the GM lane)
import { politePostJson } from "../http.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const KIA = {
  key: "kia",
  domain: "kia.com",
  make: "Kia",
  api: "https://www.kia.com/us/services/en/inventory",
  minExpected: 2000,
};

// Kia series codes for battery-electric nameplates (from the allSeries facet,
// 2026-08-15). Niro EV is the BEV; the gas/hybrid Niro is a different series.
//
// PHEV series added 2026-08-23, read off the inventory landing page's own
// series links (kia.com/us/en/inventory/landing names every series id):
// 4AP "Sportage Plug-in Hybrid" and 7AP "Sorento Plug-in Hybrid" are their
// own series, disjoint from the conventional-hybrid series (4AH/7AH) and the
// gas ones (4AC/7AC) — the series id IS the powertrain gate, same as GAE vs
// GAH for the Niro. Probed: 4AP = 891 national, 7AP = 314, and every row's
// model reads "… Plug-in Hybrid". There is no GAP series on the landing page
// (the Niro Plug-in Hybrid is out of the new lineup); its leftover new stock,
// if any, is unreachable by series query and its used stock comes via CPO
// below.
const EV_SERIES = [
  { code: "NAE", name: "EV6", evKind: "BEV" },
  { code: "PAE", name: "EV9", evKind: "BEV" },
  { code: "9AE", name: "EV3", evKind: "BEV" }, // 2027, just launching — may be zero for now
  { code: "GAE", name: "Niro EV", evKind: "BEV" },
  { code: "4AP", name: "Sportage Plug-in Hybrid", evKind: "PHEV" },
  { code: "7AP", name: "Sorento Plug-in Hybrid", evKind: "PHEV" },
];

// Certified Pre-Owned BEV nameplates (kia.com/us/services/en/cpo/inventory/
// exactmatch, queried by display name; Soul EV/EV3 return zero as of
// 2026-08-15). CPO is *used* inventory — the higher-value half for a used-EV
// site — and its records are richer than the New feed (real mileage, trim,
// interior color, drivetrain, a proper VDP url, full dealer address).
//
// PHEV model names added 2026-08-23. "exactmatch" means it: each query
// returned only its own nameplate (Niro Plug-In Hybrid 28 / Sportage 81 /
// Sorento 48 national, every row's model restating "… Plug-in Hybrid",
// nearMatch false throughout), and the "Niro EV" control returned only
// Niro EVs — the plug-in and the conventional hybrid are separate models
// here, so the model name is the gate. toCpoRecord still requires the row's
// own model to agree with the queried kind.
const CPO_EV_MODELS = [
  { name: "EV6", evKind: "BEV" },
  { name: "EV9", evKind: "BEV" },
  { name: "Niro EV", evKind: "BEV" },
  { name: "Niro Plug-In Hybrid", evKind: "PHEV" },
  { name: "Sportage Plug-In Hybrid", evKind: "PHEV" },
  { name: "Sorento Plug-In Hybrid", evKind: "PHEV" },
];
const CPO_API = "https://www.kia.com/us/services/en/cpo/inventory/exactmatch";
const CPO_PAGE = 10; // server returns 10 per call regardless of the end-start window

// Lebanon, KS — the geographic center of the contiguous US.
const CENTER = { zip: "66952", zipLocation: { longitude: -98.5, latitude: 39.84 }, range: 3500 };
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

// edwTrim carries the drivetrain token ("LT LR AWD", "GT-Line RWD").
const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/\bAWD\b|E-4ORCE|ALL.?WHEEL/.test(s)) return "AWD";
  if (/\bRWD\b|REAR/.test(s)) return "RWD";
  if (/\bFWD\b|FRONT/.test(s)) return "FWD";
  return undefined;
};

// Image paths are site-relative ("/us/content/dam/kia/…").
const imageUrl = (imgs) => {
  const p = imgs?.exteriorProfile || imgs?.exterior360;
  if (!p) return undefined;
  const s = String(p);
  return s.startsWith("/") ? `https://www.kia.com${s}` : s.startsWith("http") ? s : undefined;
};

function toRecord(hit, series) {
  const vin = String(hit.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(hit.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = String(hit.model ?? "").trim() || series.name;
  if (!model) return null;
  // Belt for the series gate: a PHEV-series row must say "Plug-in" itself,
  // and its seriesId (when echoed) must be the one queried.
  if (hit.seriesId && String(hit.seriesId).toUpperCase() !== series.code) return null;
  if (series.evKind === "PHEV" && !/plug/i.test(model)) return null;
  const { priceUsd, priceProvenance } = pickTaggedPrice("kia", [
    ["dealerPrice", num(hit.dealerPrice)],
    ["msrp", num(hit.msrp)],
  ]);
  const code = String(hit.dealer?.code ?? "");
  const state = US_STATES.has(code.slice(0, 2).toUpperCase()) ? code.slice(0, 2).toUpperCase() : undefined;
  const img = imageUrl(hit.exteriorImages);
  const vdp = typeof hit.dealer?.vdp_URL === "string" && hit.dealer.vdp_URL.startsWith("http") ? hit.dealer.vdp_URL : undefined;
  return {
    vin,
    year,
    make: KIA.make,
    model,
    trim: hit.trim || undefined,
    priceUsd,
    priceProvenance,
    driveLine: drive(hit.edwTrim || hit.trim),
    exteriorColor: hit.extColor || undefined,
    interiorColor: hit.intColor || undefined,
    dealerName: hit.dealer?.name || undefined,
    state,
    condition: "new", // status DS = dealer stock; Kia CPO is a separate endpoint
    imageUrl: img,
    images: img ? [img] : [],
    sourceUrl: vdp || `https://www.kia.com/us/en/inventory/result?seriesId=${hit.seriesId ?? ""}`,
    dealerDomain: KIA.domain,
    evKind: series.evKind,
    // Kia's own engine facet string for the electrified series; the PHEV
    // series' rows also restate "Plug-in Hybrid" in their model name.
    fuelType: series.evKind === "BEV" ? "Electric Motor" : "Plug-in Hybrid",
    evConfidence: "high", // powertrain-specific series query + per-record model echo
    platform: "kia-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// CPO exactmatch record: {dealer:{name,city,state,postalCode,latLong,…},
// vehicle:{vin,year,mileage,internetPrice,trim,drivetrain,exteriorColor,
// interiorColor,images,vdpUrl,…}}.
function toCpoRecord(entry, m) {
  const v = entry.vehicle ?? {};
  const d = entry.dealer ?? {};
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(v.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = String(v.model ?? "").trim();
  if (!model) return null;
  // exactmatch has been exact in practice, but require the row's own model to
  // agree with what was asked: a PHEV query's rows must say "Plug-in", a BEV
  // query's must not (the near-match machinery exists server-side, and a
  // drifted match must drop rather than relabel).
  if (m.evKind === "PHEV" ? !/plug/i.test(model) : /plug/i.test(model)) return null;
  const state = US_STATES.has(String(d.state ?? "").toUpperCase()) ? String(d.state).toUpperCase() : undefined;
  const zip = /^\d{5}/.test(String(d.postalCode ?? "")) ? String(d.postalCode).slice(0, 5) : undefined;
  // Window-sticker photos are served over http; rewrite to https so they load
  // on our https pages (the CDN serves both).
  const imgs = (Array.isArray(v.images) ? v.images : [])
    .map((u) => String(u).replace(/^http:\/\//, "https://"))
    .filter((u) => u.startsWith("https://"))
    .slice(0, 8);
  const vdp = typeof v.vdpUrl === "string" && v.vdpUrl.startsWith("http") ? v.vdpUrl : undefined;
  return {
    vin,
    year,
    make: KIA.make,
    model,
    trim: v.trim || v.cdmTrim || undefined,
    ...pickTaggedPrice("kia-cpo", [
      ["internetPrice", num(v.internetPrice)],
    ]),
    mileage: Number.isFinite(v.mileage) ? Math.round(v.mileage) : undefined,
    driveLine: drive(v.drivetrain || v.trim),
    exteriorColor: v.exteriorColor || undefined,
    interiorColor: v.interiorColor || undefined,
    dealerName: d.name || undefined,
    city: d.city || undefined,
    state,
    zip,
    certified: true, // CPO — ingest maps this to condition "certified"
    condition: "certified",
    imageUrl: imgs[0],
    images: imgs,
    sourceUrl: vdp || (d.url && String(d.url).startsWith("http") ? d.url : "https://www.kia.com/us/en/inventory/result?view=cpo"),
    dealerDomain: KIA.domain,
    evKind: m.evKind,
    // Kia's own strings: engineType when the feed carries one, else the
    // model's own powertrain word is what downstream verification reads.
    fuelType: v.engineType || undefined,
    evConfidence: "high",
    platform: "kia-locator-cpo",
    fromVdp: Boolean(vdp),
    scrapedAt: new Date().toISOString(),
  };
}

// Page one CPO model to exhaustion (start += 10 until the reported total is
// covered or a page comes back short). Adds records to byVin; returns the
// server's totalMatches so the caller can tally national coverage.
async function searchCpoModel(m, byVin, report) {
  let total = null;
  for (let start = 0; total === null || start < total; start += CPO_PAGE) {
    let data = null;
    for (let attempt = 0; ; attempt++) {
      const res = await politePostJson(CPO_API, {
        headers: { referer: "https://www.kia.com/us/en/inventory/result" },
        body: { radius: CENTER.range, zipCode: CENTER.zip, model: m.name, transmissions: [], trims: [], year: "", dealers: [], sortBy: "LOWEST_PRICE", start, end: start + CPO_PAGE },
      });
      report.fetched++;
      if (res.status === 200 && res.json?.dealerVehicles) { data = res.json; break; }
      const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
      if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
      report.errors.push(`${res.status} cpo=${m.name} start=${start}`);
      return total ?? 0;
    }
    if (total === null) total = data.totalMatches ?? 0;
    const page = data.dealerVehicles ?? [];
    if (!page.length) break; // ran dry early (inventory shifted mid-pull)
    for (const entry of page) {
      const rec = toCpoRecord(entry, m);
      if (rec) byVin.set(rec.vin, rec);
    }
  }
  return total ?? 0;
}

async function searchSeries(series, report) {
  const body = {
    filterSet: {
      series: series.code,
      zipCode: CENTER.zip,
      zipLocation: CENTER.zipLocation,
      page: 1,
      pageSize: 9999,
      sortOrder: "DISTANCE_ASC",
      currentRange: CENTER.range,
      selectedRange: CENTER.range,
      isInitialRequest: true,
      status: ["DS", "IT"],
    },
  };
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(KIA.api, {
      headers: { referer: "https://www.kia.com/us/en/inventory/result" },
      body,
    });
    report.fetched++;
    // A series with no inventory returns 200 with no vehicleCount — that's a
    // valid empty result, not an error.
    if (res.status === 200 && res.json && !(typeof res.json === "string")) {
      return { count: res.json.vehicleCount ?? 0, items: res.json.inventoryVehicles ?? [] };
    }
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    report.errors.push(`${res.status} series=${series.code}`);
    return null;
  }
}

// Pull Kia's complete national BEV inventory. Returns a crawl.mjs-shaped report
// (see lib/oem/gm.mjs for the completeness contract).
export async function pullKia({ log = () => {} } = {}) {
  const report = { domain: KIA.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();
  let totalReported = 0;

  // New inventory: one call per series returns the whole set.
  for (const series of EV_SERIES) {
    const data = await searchSeries(series, report);
    if (!data) continue; // error recorded; contributes to truncated below
    totalReported += data.count;
    for (const hit of data.items) {
      const rec = toRecord(hit, series);
      if (rec) byVin.set(rec.vin, rec);
    }
    log(`kia/${series.name} (new): ${data.count} nationwide, ${byVin.size} cumulative VINs`);
  }
  const afterNew = byVin.size;

  // CPO (used) inventory: paginated per model. New and CPO both live under
  // kia.com, so they MUST be pulled together into one report — certifying the
  // domain complete on a half-pull would delist the other half. A CPO failure
  // records an error, which flips truncated:true below.
  for (const m of CPO_EV_MODELS) {
    const cpoTotal = await searchCpoModel(m, byVin, report);
    totalReported += cpoTotal;
    log(`kia/${m.name} (cpo): ${cpoTotal} nationwide, ${byVin.size} cumulative VINs`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`national BEV count ${totalReported} (${afterNew} new + ${byVin.size - afterNew} cpo)`);
  // Completeness (see gm.mjs): no errors from either the New or CPO pulls AND
  // yield over the floor. Each New series and each CPO page returns its full
  // slice, so a shortfall vs the reported total means a response was truncated.
  const shortfall = totalReported > 0 && byVin.size < totalReported * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size} of ${totalReported} — response shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < KIA.minExpected;
  return report;
}
