// Ford Blue Advantage certified-used locator (fordblueadvantage.com).
//
// ford.com/inventory itself is Akamai-walled to non-browser clients (see
// oem-locator.mjs) and stays off-limits. But Ford's certified-used program,
// Ford Blue Advantage, runs on a Cox/AutoTrader white-label whose listing REST
// API is proxied under the fordblueadvantage.com host — and THAT proxy answers
// a plain Node fetch with clean JSON (verified 2026-08-15):
//   GET https://www.fordblueadvantage.com/rest/lsc/listing
//       ?zip=&searchRadius=0&makeCode=FORD&fuelTypeGroup=ELE
//        &listingType=CERTIFIED&numRecords=100&firstRecord=
// Note the contrast that makes this fair game, not evasion: autotrader.com's
// OWN host Akamai-blocks the identical request (returns an HTML challenge), but
// the fordblueadvantage.com proxy returns JSON and its robots.txt permits
// /rest/. fuelTypeGroup=ELE is the structured Electric facet (pure BEV) and
// listingType=CERTIFIED scopes to Ford Blue Advantage certified stock, so every
// hit is a certified-used Ford BEV (Mustang Mach-E, F-150 Lightning, E-Transit)
// with VIN, price, real mileage, a dealer VDP and full dealer address.
//
// Coverage quirk that shapes the code: searchRadius=0 is nationwide and reports
// the true count (~1.2k), but the marketplace caps the browsable window at ~400
// records (firstRecord past ~300 returns an empty page) — a single query can't
// page the whole set. The fix is a covering PARTITION: driveGroup {AWD4WD, RWD}
// x model year. Those slices are disjoint and sum exactly to the national total
// (measured 1222 == 1222), and the largest slice (~382) sits under the window,
// so each paginates to completion. Summing them reconstructs the full set.
//
// Unlike the OEM sweeps (BMW/GM/Genesis), this is a third-party marketplace with
// no delisting authority over the dealers whose cars it lists — those dealers
// also live on their own domains that VoltCheck crawls directly. So this lane
// uses a SYNTHETIC domain isolated from every real pull and is truncated:true
// ALWAYS (like hyundai-cpo): it must never drive delisting. Each row keeps the
// dealer's real per-VIN VDP as sourceUrl, so recheck verifies liveness there and
// these rows are NOT added to the recheck-skip set.
import { politeGetJson } from "../http.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const FORD_BLUE_ADVANTAGE = {
  key: "ford-blue-advantage",
  // Synthetic completeness domain, isolated from any real Ford/dealer pull: a
  // marketplace snapshot must never certify completeness (that would delist
  // certified Fords this sample never saw). Marked truncated always; recheck
  // verifies liveness through each car's real dealer VDP instead.
  domain: "ford-blue-advantage",
  make: "Ford",
  api: "https://www.fordblueadvantage.com/rest/lsc/listing",
  // driveGroup x year partitions the national set into window-sized, disjoint
  // slices. Ford BEVs are AWD or RWD only; FWD/4X2 return zero today but are
  // cheap insurance if Ford adds a front-drive EV.
  drives: ["AWD4WD", "RWD", "FWD", "4X2"],
  minExpected: 300,
};

// recheck.mjs does NOT skip this: coverage is a truncated sample (never drives
// delisting), and every row carries a real dealer VDP that recheck can verify.
export const OEM_LOCATOR_DOMAINS = new Set(); // intentionally empty

const PAGE = 100; // server caps numRecords at 100 whatever you ask
const WINDOW_MAX_FIRST = 300; // firstRecord past ~300 returns an empty page
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// Known Ford BEV model codes → clean display names; unknown codes fall back to
// the API's model name so a new nameplate still lands (just less tidy).
const MODEL_NAMES = {
  FORDMACHE: "Mustang Mach-E",
  FORF150LIG: "F-150 Lightning",
  FORETRANSI: "E-Transit",
  FORTRANEV: "E-Transit",
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/AWD|4WD|ALL.?WHEEL/.test(s)) return "AWD";
  if (/RWD|REAR/.test(s)) return "RWD";
  if (/FWD|FRONT/.test(s)) return "FWD";
  return undefined;
};

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (!s) return undefined;
  return s.startsWith("https://") ? s : s.startsWith("http://") ? "https://" + s.slice(7) : undefined;
};

function toRecord(l) {
  const vin = String(l.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // Structured BEV guard: the query already filters fuelTypeGroup=ELE, and each
  // record echoes fuelType.code "E". Anything else means the facet drifted.
  if (String(l.fuelType?.code ?? "").toUpperCase() !== "E") return null;
  const year = Number(l.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = MODEL_NAMES[l.modelCode] || String(l.model?.name ?? "").trim();
  if (!model) return null;
  const addr = l.owner?.location?.address ?? {};
  const state = /^[A-Z]{2}$/.test(String(addr.state ?? "").toUpperCase()) ? addr.state.toUpperCase() : undefined;
  const zip = /^\d{5}/.test(String(addr.zip ?? "")) ? String(addr.zip).slice(0, 5) : undefined;
  const sources = Array.isArray(l.images?.sources) ? l.images.sources : [];
  const primary = Number.isInteger(l.images?.primary) ? l.images.primary : 0;
  const ordered = sources[primary] ? [sources[primary], ...sources.filter((_, i) => i !== primary)] : sources;
  const imgs = ordered.map((s) => httpsUrl(s?.src)).filter(Boolean).slice(0, 8);
  // The dealer's own site is the click-through; deepLink marks a true per-VIN
  // VDP (vs a dealer homepage), which is what recheck can verify.
  const vdp = httpsUrl(l.owner?.website?.href);
  const isVdp = Boolean(l.owner?.website?.deepLink && vdp);
  return {
    vin,
    year,
    make: FORD_BLUE_ADVANTAGE.make,
    model,
    trim: l.trim?.name || undefined,
    ...pickTaggedPrice("ford-blue-advantage", [
      ["salePrice", num(l.pricingDetail?.salePrice)],
      ["displayPrice", num(l.pricingDetail?.displayPrice)],
    ]),
    mileage: num(l.mileage?.value),
    driveLine: drive(l.driveType?.name),
    exteriorColor: l.color?.exteriorColor || undefined,
    interiorColor: l.color?.interiorColor || undefined,
    dealerName: l.owner?.name || undefined,
    city: addr.city || undefined,
    state,
    zip,
    certified: true,
    condition: "certified", // listingType=CERTIFIED = Ford Blue Advantage
    imageUrl: imgs[0],
    images: imgs,
    // Real dealer VDP for click-through + recheck liveness; else the FBA search.
    sourceUrl: vdp || "https://www.fordblueadvantage.com/cars-for-sale",
    dealerDomain: FORD_BLUE_ADVANTAGE.domain,
    evKind: "BEV",
    evConfidence: "high", // server-side fuelTypeGroup=ELE facet, not a name match
    platform: "ford-blue-advantage-locator",
    fromVdp: isVdp,
    scrapedAt: new Date().toISOString(),
  };
}

async function apiGet(params, report) {
  const url = `${FORD_BLUE_ADVANTAGE.api}?${params}`;
  for (let attempt = 0; ; attempt++) {
    const res = await politeGetJson(url, { headers: { referer: "https://www.fordblueadvantage.com/cars-for-sale" } });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push("robots disallows /rest/lsc/listing"); return null; }
    // A JSON body with a listings array is the good case. Past the window the
    // server returns JSON with no listings — that's the natural end of a slice,
    // not an error; a non-JSON body (HTML challenge) IS an error.
    if (res.status === 200 && res.json) return res.json;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} ${params.slice(0, 70)}`);
    return null;
  }
}

const FIXED = "zip=66952&searchRadius=0&makeCode=FORD&fuelTypeGroup=ELE&listingType=CERTIFIED";

// Paginate one (driveGroup, year) slice to completion, folding into byVin.
// Returns the slice's reported total (for the completeness accounting).
async function pullSlice(dg, year, byVin, report) {
  const q = `${FIXED}&driveGroup=${dg}&startYear=${year}&endYear=${year}&numRecords=${PAGE}`;
  const first = await apiGet(`${q}&firstRecord=0`, report);
  if (!first) return 0;
  const total = first.totalResultCount ?? 0;
  if (!total) return 0;
  const collect = (j) => {
    for (const l of j?.listings ?? []) {
      const rec = toRecord(l);
      if (rec) byVin.set(rec.vin, rec);
    }
  };
  collect(first);
  for (let fr = PAGE; fr <= WINDOW_MAX_FIRST && fr < total; fr += PAGE) {
    const j = await apiGet(`${q}&firstRecord=${fr}`, report);
    if (!j) break; // error recorded; flips truncated
    if (!(j.listings?.length)) break; // window exhausted
    collect(j);
  }
  // A slice larger than the browsable window would silently drop its tail. The
  // driveGroup x year partition keeps every slice under it today; warn if that
  // ever stops holding so the partition can be refined (e.g. add a price axis).
  if (total > WINDOW_MAX_FIRST + PAGE) report.notes.push(`slice ${dg}/${year} total ${total} exceeds window — tail dropped`);
  return total;
}

// Pull Ford Blue Advantage's national certified-used BEV inventory over the
// driveGroup x year partition. Returns a crawl.mjs-shaped report. Always
// truncated:true — a marketplace snapshot must not drive delisting (see the
// header note and hyundai-cpo); recheck handles liveness via dealer VDPs.
export async function pullFordBlueAdvantage({ log = () => {} } = {}) {
  const report = { domain: FORD_BLUE_ADVANTAGE.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = 2020; y <= thisYear + 1; y++) years.push(y);

  let reportedTotal = 0;
  for (const dg of FORD_BLUE_ADVANTAGE.drives) {
    let dgTotal = 0;
    for (const y of years) dgTotal += await pullSlice(dg, y, byVin, report);
    if (dgTotal) log(`ford-blue-advantage/${dg}: ${dgTotal} reported, ${byVin.size} cumulative VINs`);
    reportedTotal += dgTotal;
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`national certified BEV count ${reportedTotal} across ${FORD_BLUE_ADVANTAGE.drives.length} drive groups x ${years.length} years, ${byVin.size} unique collected`);
  // Never certify complete: marketplace snapshot with a browsable-window cap. A
  // hard failure (endpoint moved / Akamai now walls the proxy) shows as too few
  // collected — surface it so a dead lane doesn't pass silently.
  if (byVin.size < FORD_BLUE_ADVANTAGE.minExpected) report.errors.push(`collected ${byVin.size} < floor ${FORD_BLUE_ADVANTAGE.minExpected} — proxy may be walled or moved`);
  report.truncated = true;
  return report;
}
