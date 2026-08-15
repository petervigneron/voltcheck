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
// Coverage notes:
//   - The search is per-series, so each EV nameplate is one call
//   - Range is a real radius from zipLocation; 3500mi from the US center
//     reaches both coasts. Alaska/Hawaii dealers fall outside it — a known,
//     negligible gap (as with the GM lane)
//   - New inventory only here; Kia also exposes a separate CPO endpoint
//     (/cpoinventory/…) that a later pass can add — CPO is used stock, so
//     it is the higher-value follow-up
import { politePostJson } from "../http.mjs";

export const KIA = {
  key: "kia",
  domain: "kia.com",
  make: "Kia",
  api: "https://www.kia.com/us/services/en/inventory",
  minExpected: 2000,
};

// Kia series codes for battery-electric nameplates (from the allSeries facet,
// 2026-08-15). Niro EV is the BEV; the gas/hybrid Niro is a different series.
const EV_SERIES = [
  { code: "NAE", name: "EV6" },
  { code: "PAE", name: "EV9" },
  { code: "9AE", name: "EV3" }, // 2027, just launching — may be zero for now
  { code: "GAE", name: "Niro EV" },
];

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

function toRecord(hit, seriesName) {
  const vin = String(hit.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(hit.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = seriesName || String(hit.model ?? "").trim();
  if (!model) return null;
  const priceUsd = num(hit.dealerPrice) ?? num(hit.msrp);
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
    evKind: "BEV",
    evConfidence: "high", // BEV series list, not a name match
    platform: "kia-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
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

  for (const series of EV_SERIES) {
    const data = await searchSeries(series, report);
    if (!data) continue; // error recorded; contributes to truncated below
    totalReported += data.count;
    for (const hit of data.items) {
      const rec = toRecord(hit, series.name);
      if (rec) byVin.set(rec.vin, rec);
    }
    log(`kia/${series.name}: ${data.count} nationwide, ${byVin.size} cumulative VINs`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`national BEV count ${totalReported} across ${EV_SERIES.length} series`);
  // Completeness (see gm.mjs): no per-series errors AND yield over the floor.
  // One call per series returns the full set, so a shortfall vs the reported
  // count means the response itself was truncated.
  const shortfall = totalReported > 0 && byVin.size < totalReported * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size} of ${totalReported} — response shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < KIA.minExpected;
  return report;
}
