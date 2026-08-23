// Mercedes-Benz national inventory locator (mbusa.com).
//
// mbusa.com's inventory locator reads a public REST API that needs no auth
// token (just an Origin) — verified open from a plain Node fetch 2026-08-15
// (control: tesla.com/ford.com Akamai-403 the same request; nafta-service
// returns 200, and even answers with no query params at all):
//   GET https://nafta-service.mbusa.com/api/inv/v1/en_us/{new,used}/vehicles/search
//       ?fuelType=E&dealerId={id}&count=100
// fuelType "E" is the Electric (BEV) facet — pure battery-electric. This
// covers BOTH lots: /new (~1k EQ/CLA/EQS/EQE/EQB/G-EQ) and /used (~1.3k, the
// higher-value half, each with real mileage + a certified flag).
//
// PHEVs: the same endpoint has two more facets, "PH" (Plug-In Hybrid) and
// "PPH" (Performance Plug-In Hybrid — the AMG E PERFORMANCE line). Both are
// swept, and the PH facet MUST NOT be trusted on its own: measured 2026-08-23
// over the full per-dealer sweep, 489 of its 844 used rows were 48V MILD
// hybrids Mercedes mis-tags PH (C 300, GLC 300, GLA 250, GLE/GLS 450,
// CLS 450 — none of them plug in). The gate is therefore per-record: keep a
// PH/PPH row only when its modelName carries Mercedes' own plug-in
// designation — a three-digit engine code with the "e" suffix (350e/450e/
// 580e/250e), "E PERFORMANCE" (every one is a PHEV), "E 53 HYBRID" (the W214
// PHEV; the old mild-hybrid "AMG E 53" never carries the HYBRID word), or a
// literal "Plug-In Hybrid". Everything else in the facet is dropped and
// counted in the report notes. vpic-enrich re-verifies every kept VIN anyway
// (the GLC 350e decodes FuelTypePrimary "Gasoline" WITH level PHEV — the
// control test in vpic-enrich.mjs's comments), so a mis-designated row is
// held before it can publish.
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
import { pickTaggedPrice } from "../price-provenance.mjs";

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

// The three electrified facets. `label` is MB's own facet name, carried on the
// record for downstream verification to read.
const FUEL_SWEEPS = [
  { code: "E", evKind: "BEV", label: "Electric" },
  { code: "PH", evKind: "PHEV", label: "Plug-In Hybrid" },
  { code: "PPH", evKind: "PHEV", label: "Performance Plug-In Hybrid" },
];

// Mercedes' own plug-in designations, required of every PH/PPH row (see the
// header: the PH facet mis-tags 48V mild hybrids). \b\d{3}e\b = 350e/450e/
// 580e/250e; the E 53 HYBRID is the W214 PHEV (the mild-hybrid "AMG E 53"
// never carries the HYBRID word).
const PHEV_DESIGNATION = /\b\d{3}e\b|plug-?in|E PERFORMANCE|E 53 HYBRID/i;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// MB electric drivetrains: "4MATIC" in the model name = AWD, else a single
// rear motor = RWD. That "else" is a BEV fact only — a non-4MATIC PHEV may be
// front-driven (GLA/CLA-class), so PHEV rows abstain rather than claim RWD.
const drive = (modelName, evKind) =>
  /4MATIC/i.test(String(modelName ?? "")) ? "AWD" : evKind === "BEV" ? "RWD" : undefined;

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
// (mileage/certified/images live under usedVehicleAttributes). `sweep` is the
// facet this record came from; the record must echo its code, and PHEV rows
// must additionally carry the plug-in designation (header).
function toRecord(v, used, sweep, drops) {
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // Structured guard: the record's own fuelType must echo the queried facet.
  if (String(v.fuelType?.id ?? v.fuelType ?? "").toUpperCase() !== sweep.code) return null;
  if (sweep.evKind === "PHEV" && !PHEV_DESIGNATION.test(String(v.modelName ?? ""))) {
    // A PH-tagged row with no plug-in designation is a mis-tagged mild hybrid
    // (measured: 58% of the used PH facet) — dropped, counted, never shipped.
    drops.set(`${v.year} ${v.modelName}`, (drops.get(`${v.year} ${v.modelName}`) ?? 0) + 1);
    return null;
  }
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
    ...pickTaggedPrice("mercedes", [
      ["dealPrice", num(v.dealPrice)],
      ["inventoryPrice", num(v.inventoryPrice)],
      ["msrp", num(v.msrp)],
    ]),
    mileage: used ? (Number.isFinite(ua.mileage) ? Math.round(ua.mileage) : num(ua.mileage)) : undefined,
    driveLine: drive(v.modelName, sweep.evKind),
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
    evKind: sweep.evKind,
    // MB's own facet name for this record's fuel — what downstream
    // verification reads alongside the model name.
    fuelType: sweep.label,
    evConfidence: "high", // server-side fuelType facet + per-record echo (+ designation for PHEV)
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

// Pull one (lot, fuel facet) per-dealer over that facet's dealer list. Returns
// the national count the facet reported, and folds records into byVin.
// `dropped` collects the PH rows the plug-in designation rejected.
async function pullLot(lot, used, sweep, byVin, report, log, dropped) {
  // One facet query gives the national count and every dealer id holding stock.
  const facetRes = await apiGet(lot, `fuelType=${sweep.code}&count=1`, report);
  if (!facetRes) return 0;
  const total = facetRes.pagedVehicles?.paging?.totalCount ?? 0;
  const dealers = (facetRes.facets?.dealer?.values ?? []).map((d) => d.value).filter(Boolean);
  report.notes.push(`${lot}/${sweep.code}: ${total} across ${dealers.length} dealers`);
  log(`mercedes/${lot}/${sweep.code}: ${total} vehicles, ${dealers.length} dealers`);

  const before = byVin.size;
  for (const id of dealers) {
    const res = await apiGet(lot, `fuelType=${sweep.code}&dealerId=${encodeURIComponent(id)}&count=${PAGE}`, report);
    if (!res) continue; // error recorded; flips truncated below
    const recs = res.pagedVehicles?.records ?? [];
    for (const v of recs) {
      const rec = toRecord(v, used, sweep, dropped);
      if (rec) byVin.set(rec.vin, rec);
    }
    // A dealer over the window would silently drop cars — flag it (not seen in
    // practice; the densest EV dealer holds ~60).
    const dt = res.pagedVehicles?.paging?.totalCount ?? 0;
    if (dt > PAGE) report.notes.push(`dealer ${id} has ${dt} > ${PAGE} — window may truncate`);
  }
  log(`mercedes/${lot}/${sweep.code}: +${byVin.size - before} collected`);
  return total;
}

// Pull Mercedes' complete national BEV + PHEV inventory, new + used together.
// Returns a crawl.mjs-shaped report (see gm.mjs for the completeness contract,
// kia.mjs for why new and used must share one report/domain — and the same
// rule binds the fuel facets: certifying mbusa.com complete on the BEV sweep
// alone would delist every PHEV row).
export async function pullMercedes({ log = () => {} } = {}) {
  const report = { domain: MERCEDES.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();
  const dropped = new Map(); // PH rows the plug-in designation rejected

  let total = 0;
  let afterNew = 0;
  for (const lot of ["new", "used"]) {
    for (const sweep of FUEL_SWEEPS) {
      total += await pullLot(lot, lot === "used", sweep, byVin, report, log, dropped);
    }
    if (lot === "new") afterNew = byVin.size;
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const droppedN = [...dropped.values()].reduce((a, b) => a + b, 0);
  report.notes.push(`national electrified count ${total} (${afterNew} new + ${byVin.size - afterNew} used collected)`);
  if (droppedN) {
    const top = [...dropped].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${n} ${k}`).join(", ");
    report.notes.push(`dropped ${droppedN} PH-facet rows without a plug-in designation (mis-tagged mild hybrids, e.g. ${top})`);
  }
  // Completeness (see gm.mjs): every lot+facet fetched cleanly AND yield over
  // floor. Per-dealer sums reconstruct the whole, so a big shortfall means a
  // dealer page failed. The comparison EXCLUDES the deliberately-dropped
  // mild-hybrid rows, or the designation gate would read as a paging failure.
  const shortfall = total > 0 && byVin.size + droppedN < total * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size}+${droppedN} dropped of ${total} — per-dealer shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < MERCEDES.minExpected;
  return report;
}
