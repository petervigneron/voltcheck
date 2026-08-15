// Mercedes-Benz national inventory locator (mbusa.com).
//
// mbusa.com's inventory locator reads a public REST API that needs no auth
// token (just an Origin) — verified open from a plain Node fetch 2026-08-15
// (control: tesla.com/ford.com Akamai-403 the same request; nafta-service
// returns 200, and even answers with no query params at all):
//   GET https://nafta-service.mbusa.com/api/inv/v1/en_us/{new,used}/vehicles/search
//       ?fuelType=E&dealerId={id}&count=100
// fuelType "E" is the Electric (BEV) facet — pure battery-electric (PHEVs are
// "PH"). This covers BOTH lots: /new (~1k EQ/CLA/EQS/EQE/EQB/G-EQ) and /used
// (~1.3k, the higher-value half, each with real mileage + a certified flag).
//
// Coverage quirk that shapes the code: a bare nationwide query reports the true
// count (~992 new) but only returns the first ~100 records (a hard result
// window; radius is ignored). The clean fix is per-DEALER: the response's
// `dealer` facet enumerates every dealer holding EV stock (each well under 100),
// and dealerId scopes the search to that dealer, fully paginable. Summing the
// dealers reconstructs the complete national set — so this certifies COMPLETE
// (real domain mbusa.com, nightly delisting retires sold VINs; see gm.mjs). New
// and used share one puller / one report so a half-pull can't delist the other
// half (see kia.mjs). The facet also hands us each dealer's name + full address,
// which the per-vehicle record echoes — so unlike the BMW lane, dealer geo is
// populated.
import { politeGetJson } from "../http.mjs";

export const MERCEDES = {
  key: "mercedes",
  domain: "mbusa.com",
  make: "Mercedes-Benz",
  base: "https://nafta-service.mbusa.com/api/inv/v1/en_us",
  minExpected: 800,
};

// recheck.mjs skips this: coverage is complete nightly (truncated:false already
// retires gone VINs via db-sync), and the per-VIN VDP is a client-rendered
// mbusa.com shell that echoes the VIN from its URL (same rule as GM).
export const OEM_LOCATOR_DOMAINS = new Set([MERCEDES.domain]);

const PAGE = 100; // result-window cap; every EV dealer is well under it
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// MB electric drivetrains: "4MATIC" in the model name = AWD, else a single
// rear motor = RWD.
const drive = (modelName) => (/4MATIC/i.test(String(modelName ?? "")) ? "AWD" : "RWD");

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  return s.startsWith("https://") ? s : s.startsWith("http://") ? "https://" + s.slice(7) : undefined;
};

const dealerAddr = (dealer) => {
  const a = Array.isArray(dealer?.address) ? dealer.address.find((x) => x.type === "primary") ?? dealer.address[0] : dealer?.address;
  const state = /^[A-Z]{2}$/.test(String(a?.state ?? "")) ? a.state : undefined;
  const zip = /^\d{5}/.test(String(a?.zip ?? "")) ? String(a.zip).slice(0, 5) : undefined;
  return { name: dealer?.name || undefined, city: a?.city || undefined, state, zip };
};

const vdp = (vin) => `https://www.mbusa.com/en/inventory/details/vin/${vin}`;

// "CLA 250+ ELECTRIC Sedan" with className "CLA" → trim "250+ Electric".
function trimOf(modelName, className) {
  let t = String(modelName ?? "").trim();
  if (className) t = t.replace(new RegExp("^" + className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i"), "");
  t = t.replace(/\b(sedan|suv|coupe|wagon|cabriolet)\b/gi, "").replace(/\belectric\b/gi, "Electric").replace(/\s+/g, " ").trim();
  return t || undefined;
}

// Shared normalizer for a new or used record. `used` picks the used-only fields
// (mileage/certified/images live under usedVehicleAttributes).
function toRecord(v, used) {
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  if (String(v.fuelType?.id ?? v.fuelType ?? "").toUpperCase() !== "E") return null; // structured BEV guard
  const year = Number(v.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = String(v.className ?? v.classId ?? "").trim();
  if (!model) return null;
  const ua = used ? v.usedVehicleAttributes ?? {} : null;
  const dealer = (used ? ua.dealer : v.dealer) ?? v.dealer ?? {};
  const { name, city, state, zip } = dealerAddr(dealer);
  const imgs = (used ? ua.images : v.images) ?? [];
  const img = httpsUrl(Array.isArray(imgs) ? imgs[0] : imgs);
  const certified = Boolean(used && ua.certified);
  return {
    vin,
    year,
    make: MERCEDES.make,
    model,
    trim: trimOf(v.modelName, model),
    priceUsd: num(v.dealPrice) ?? num(v.inventoryPrice) ?? num(v.msrp),
    mileage: used ? (Number.isFinite(ua.mileage) ? Math.round(ua.mileage) : num(ua.mileage)) : undefined,
    driveLine: drive(v.modelName),
    exteriorColor: v.paint?.name || undefined,
    interiorColor: v.upholstery?.name || undefined,
    dealerName: name,
    city,
    state,
    zip,
    certified: certified || undefined,
    condition: used ? (certified ? "certified" : "used") : "new",
    imageUrl: img,
    images: img ? [img] : [],
    sourceUrl: vdp(vin),
    dealerDomain: MERCEDES.domain,
    evKind: "BEV",
    evConfidence: "high", // server-side fuelType=E facet, not a name match
    platform: "mercedes-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

async function apiGet(lot, params, report) {
  const url = `${MERCEDES.base}/${lot}/vehicles/search?${params}`;
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, { headers: { origin: "https://www.mbusa.com", referer: "https://www.mbusa.com/" } });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push(`robots disallows ${lot}`); return null; }
    if (res.status === 200 && res.json?.result?.pagedVehicles) return res.json.result;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} ${lot} ${params.slice(0, 60)}`);
    return null;
  }
}

// Pull one lot (new or used) per-dealer over the EV dealer facet. Returns the
// national count the facet reported, and folds records into byVin.
async function pullLot(lot, used, byVin, report, log) {
  // One facet query gives the national count and every EV dealer id.
  const facetRes = await apiGet(lot, "fuelType=E&count=1", report);
  if (!facetRes) return 0;
  const total = facetRes.pagedVehicles?.paging?.totalCount ?? 0;
  const dealers = (facetRes.facets?.dealer?.values ?? []).map((d) => d.value).filter(Boolean);
  report.notes.push(`${lot}: ${total} BEVs across ${dealers.length} dealers`);
  log(`mercedes/${lot}: ${total} BEVs, ${dealers.length} dealers`);

  const before = byVin.size;
  for (const id of dealers) {
    const res = await apiGet(lot, `fuelType=E&dealerId=${encodeURIComponent(id)}&count=${PAGE}`, report);
    if (!res) continue; // error recorded; flips truncated below
    const recs = res.pagedVehicles?.records ?? [];
    for (const v of recs) {
      const rec = toRecord(v, used);
      if (rec) byVin.set(rec.vin, rec);
    }
    // A dealer over the window would silently drop cars — flag it (not seen in
    // practice; the densest EV dealer holds ~60).
    const dt = res.pagedVehicles?.paging?.totalCount ?? 0;
    if (dt > PAGE) report.notes.push(`dealer ${id} has ${dt} > ${PAGE} — window may truncate`);
  }
  log(`mercedes/${lot}: +${byVin.size - before} collected`);
  return total;
}

// Pull Mercedes' complete national BEV inventory, new + used together. Returns a
// crawl.mjs-shaped report (see gm.mjs for the completeness contract, kia.mjs for
// why new and used must share one report/domain).
export async function pullMercedes({ log = () => {} } = {}) {
  const report = { domain: MERCEDES.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();

  const newTotal = await pullLot("new", false, byVin, report, log);
  const afterNew = byVin.size;
  const usedTotal = await pullLot("used", true, byVin, report, log);
  const total = newTotal + usedTotal;

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`national BEV count ${total} (${afterNew} new + ${byVin.size - afterNew} used)`);
  // Completeness (see gm.mjs): both lots fetched cleanly AND yield over floor.
  // Per-dealer sums reconstruct the whole, so a big shortfall means a dealer
  // page failed. Live drift (cars selling mid-pull) keeps it under 100%.
  const shortfall = total > 0 && byVin.size < total * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size} of ${total} — per-dealer shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < MERCEDES.minExpected;
  return report;
}
