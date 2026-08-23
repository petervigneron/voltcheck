// BMW's national USED and BMW Certified inventory (bmwusa.com's pre-owned
// search), the lane lib/oem/bmw.mjs said did not exist yet.
//
// That module's header records the dead end honestly — "BMW CPO/used lives on
// a separate platform (bmwusa.com/{usedcars,preowned}/graphql both 404), not
// this endpoint — a future used lane" — and it is right twice over. The new-car
// GraphQL cannot reach used stock at all: introspected again 2026-08-23, its
// BucketType enum is exactly STOCK | PIPELINE | BYO and its FilterInput has no
// condition, CPO or mileage field. Used BMWs are a different platform, and this
// is it.
//
// THE ENDPOINT, captured live 2026-08-23 by opening bmwusa.com's own pre-owned
// search in a real browser and reading what it fetched (never guessed):
//
//   POST https://inventoryservices.bmwdealerprograms.com/vehicle
//   Authorization: Bearer <token>
//   { pageIndex, PageSize, postalCode, radius, sortBy, sortDirection,
//     formatResponse, includeFacets, includeDealers, includeVehicles,
//     filters: [{ name, values: [...] }] }
//
// The bearer token comes from the site's own anonymous token flow, the same
// shape enterprise.mjs uses: POST https://www.bmwusa.com/token/cpo/ with a
// fixed Basic credential that is printed in the page's JavaScript bundle for
// every visitor (bmwusa:WhsmBMWUSA, base64'd inline in the universal-inventory
// chunk). It identifies the storefront; it is not a credential we were not
// given, and it is in the same class as VW's oneapiKey and Volvo's public
// X-CW-ApiKey. Tokens last 24 hours. No challenge is solved and no bot
// detection is worked around — CONTROL: the same client still gets Akamai 403
// from Tesla's inventory API and a Vercel challenge from finder.porsche.com,
// so this is not a general wall bypass.
//
// ONE NATIONWIDE QUERY, and the earlier "1,001 cap" was a different API.
// radius is honoured up to at least 5000 miles from a central ZIP, which
// covers Alaska and Hawaii, and the reported totalRecords at radius 5000 from
// 66952 (2,287 electric) matches the count the site's own facets report as the
// national figure (2,299 the same afternoon, live drift between the two). The
// origin is not load-bearing but the sweep is still origin-independent by
// construction: there is no per-location result window, only offset paging.
//
// PAGING IS AN OFFSET, NOT A PAGE NUMBER. pageIndex is the record offset —
// pageIndex 0 and 20 at PageSize 20 are disjoint, pageIndex 0 and 1 overlap by
// 19 — and PageSize is capped at 100 however much you ask for. Offsets past
// 3,000 answer normally (checked at 2,800/2,900/2,950/3,000/3,100 on a 6,582-
// row query), so there is no deep-paging ceiling to route around.
//
// COMPLETENESS is a short last page, never arithmetic: the sweep stops when a
// page returns fewer than 100 rows, and a page that FAILED must not be
// mistaken for that. The first version of this sweep did exactly that — it
// treated a missing `vehicles` array as "the end", declared the national
// hybrid set complete at 3,000 of 6,582 rows, and only a spot check at a
// deeper offset caught it. So a failed page is an error that flips truncated,
// and the loop never ends on one.
//
// PACE, because this API throttles and the throttle is silent. It answers a
// plain RFC-9110 403 — no Retry-After, no challenge page, no mention of rate
// anywhere in the body — and it parks the ADDRESS, not the client: while Node
// was getting 403s the same search in a real browser on the same connection
// returned zero vehicles too. Both parks observed on 2026-08-23 cleared
// themselves in roughly twenty minutes with nothing done. The budget looks
// like a rolling request count rather than a rate: ~150 requests over 20
// minutes tripped it once, and a single 84-request pull over 5.5 minutes
// tripped it again at offset 5,700 of 6,582. Hence PACE_MS on top of the
// shared 1.1s per-host floor, and hence a 403 being waited out rather than
// reported as a refusal. If it never clears, the pull is truncated and nothing
// is delisted.
//
// WHAT IT YIELDS, measured 2026-08-23 nationally: 2,287 battery-electric BMWs
// (1,279 BMW Certified + 1,008 plain used), every one with a real dealer VDP
// and an asking price. By series: iX 1,005, i4 1,005, i5 158, i7 104 (a
// further 13 filed under "5 Series"/"7 Series", which are i5s and i7s the feed
// files under the parent series), i3 2.
//
// THE FUEL FACET IS CLEAN FOR ELECTRIC AND USELESS FOR PLUG-INS. All 2,287
// electric rows are genuine i-cars: every VIN is WBY or WB5, and the handful
// with a nonsense cylinder count (a "5 Cyl" i5 M60, an i4 with 30 cylinders)
// are dealer data-entry junk on cars that are electric anyway — no Volvo-style
// petrol impostor was found in the whole set. The "Hybrid" facet is the
// opposite: 6,582 cars of which the overwhelming majority are 48-volt mild
// hybrids (X3s, X5s, X7s, 330is, 540is), which are not electrified in any
// sense this site publishes.
//
// So the plug-ins are picked out by NAMEPLATE, and the claim is settled by
// vPIC rather than by the name. BMW's plug-in badge is a bare "e" — 330e,
// 530e, 550e xDrive, 750e xDrive, X5 xDrive50e/45e/40e, X3 xDrive30e, XM, i8
// — and for the X-cars that badge lives in trimDescription, because the feed's
// `model` field for every X5 is just "X5". Nothing structural separates them:
// the facets carry no plug-in option, package, body style or engine string
// (the mild hybrids' own engine reads "Intercooled Turbo Gas/Electric I-6",
// which is exactly the trap). What makes this safe is that a row this lane
// emits as PHEV is fuel-text-only by lib/ev.mjs's definition, so ingest.mjs
// holds it until vPIC has answered for that VIN and vpic-enrich demotes
// anything vPIC calls a plain hybrid. Over-including costs a decode; it cannot
// publish a mild hybrid. That is also why the pattern is not simply "every
// Hybrid row": 6,582 speculative decodes a night would starve the vPIC queue
// that real listings depend on.
//
// M5 is deliberately inside the pattern even though only the 2025-on G90 M5 is
// a plug-in: the feed gives no field that separates it from the older petrol
// M5, and asking vPIC per VIN is exactly the mechanism above. "eDrive40" is
// deliberately OUTSIDE it — eDrive is BEV nomenclature (i4 eDrive40), and
// matching it would let a mislabelled i-car publish as a plug-in hybrid.
//
// Domain is the synthetic "bmw-cpo", not bmwusa.com. db-sync retires by whole
// domain and bmwusa.com already belongs to the new-car lane; sharing it would
// let a failed pull on either side delist the other's cars (kia.mjs writes
// that hazard up at length). Photos are photoDetails.root + "/images/" +
// filename, the shape the site's own <img> tags use.
//
// STILL A GAP: the API exposes only a coded dealerCode per car, so dealer
// name, city and state are blank, exactly as in the new-car lane. The response
// can carry a `dealers` block when includeDealers is true and that is the
// obvious place to fix it — it was not read here because the API had started
// throttling by the time it mattered, and writing a reader for a payload
// nobody has seen is how a lane invents fields.
import { politePostJson } from "../http.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { publishedCondition } from "../condition.mjs";

export const BMW_CPO = {
  key: "bmw-cpo",
  domain: "bmw-cpo",
  make: "BMW",
  api: "https://inventoryservices.bmwdealerprograms.com/vehicle",
  tokenUrl: "https://www.bmwusa.com/token/cpo/",
  // Public storefront credential, printed in bmwusa.com's own JS bundle. If
  // BMW rotates it the token call fails → truncated + error → the shortfall
  // alert fires and someone re-reads it from the page.
  tokenBasic: "bmwusa:WhsmBMWUSA",
  zip: "66952", // ~geographic centre of the US
  radius: 5000, // miles — reaches Alaska and Hawaii from there
  minExpected: 1200, // 2,287 BEVs on the capture day; alert well below that
};

// recheck.mjs skips this: the sweep is complete national coverage nightly, so
// db-sync's truncated:false already retires gone VINs, and rechecking every
// dealer VDP would be thousands of same-host fetches (same rule as GM/BMW).
export const OEM_LOCATOR_DOMAINS = new Set([BMW_CPO.domain]);

const PAGE = 100; // server caps PageSize here whatever you ask for
const PACE_MS = 3000; // on top of http.mjs's 1.1s per-host floor — see header
// A throttled sweep WAITS rather than giving up: measured 2026-08-23, a 90s
// retry was far too short (the park outlasted three of them at offset 5,700 of
// 6,582 and the pull went truncated), while the parks themselves cleared in
// roughly twenty minutes. Wall clock is the cheap resource here — the nightly
// runs the lanes in parallel and has hours of headroom — and an incomplete
// pull is the expensive one, because truncated:true suspends delisting for the
// whole domain, BEV leg included, however cleanly that leg finished.
const THROTTLE_SLEEP_MS = 300_000;
const THROTTLE_ATTEMPTS = 5;
// …but the waiting is BUDGETED, because nightly.yml gives the whole
// oem-locator job 90 minutes and every lane in it runs inside that one clock.
// Five attempts per page times five minutes is twenty minutes for a single
// page, and a run that kept meeting the park could eat the job's budget and
// take the other lanes' pulls down with it. Six waits — half an hour — is the
// most this lane will spend sitting still; past that a throttle is reported
// like any other failure and the pull is truncated, which costs a night's
// freshness and nothing else.
const THROTTLE_WAIT_BUDGET = 6;
const MAX_OFFSET = 30_000; // runaway guard, ~10x today's largest sweep
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// BMW's plug-in badge, as it appears in `model` or `trimDescription`. See the
// header for why eDrive is excluded and M5 is included.
const PLUGIN_RE = /(^|[\s(])(\d{3}e|xDrive\d{2}e|XM|i8|M5)([\s)]|$)/i;

// A number this large is a dealer's "call us" placeholder, not an asking
// price. The floors in lib/price-floor.mjs guard the other end and ingest.mjs
// applies them to every lane, but nothing anywhere guards the top, and this
// feed does put a placeholder there: one row in the 3,028 collected on
// 2026-08-23 was a 915-mile 2026 M5 at $999,999, against a real spread of
// $10,378 to $161,135 across everything else. $500,000 sits far above any BMW
// a dealer has ever asked for and far below the repdigit sentinels. Over it,
// the price becomes a deliberate abstain (0, no provenance) rather than a
// wrong claim — the car stays listed, the number goes quiet, which is the same
// shape ingest.mjs uses at the bottom of the range.
const PRICE_CEILING = 500_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (s === "AWD") return "AWD";
  if (s === "RWD") return "RWD";
  if (s === "FWD") return "FWD";
  return undefined; // "Other" is not a claim about the driveline
};

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (s.startsWith("https://")) return s;
  if (s.startsWith("http://")) return "https://" + s.slice(8);
  return undefined;
};

// "i4 eDrive35" → model "i4", trim "eDrive35"; "X5" with trimDescription
// "xDrive50e" → "X5" / "xDrive50e". Same first-token split the new-car lane
// uses, so the two lanes name the same car the same way.
function split(v) {
  const raw = String(v.model ?? "").trim();
  const series = String(v.modelSeries ?? "").trim();
  const base = raw || series;
  if (!base) return null;
  const sp = base.indexOf(" ");
  const model = sp < 0 ? base : base.slice(0, sp);
  const rest = sp < 0 ? "" : base.slice(sp + 1).trim();
  const trim = String(v.trimDescription ?? "").trim() || rest || undefined;
  return { model, trim };
}

function photoUrls(v, root) {
  if (!root || !Array.isArray(v.photos)) return [];
  return v.photos
    .filter((p) => typeof p === "string" && /^[\w.-]+\.(jpe?g|png|webp)$/i.test(p))
    .slice(0, 12)
    .map((p) => `${root}/images/${p}`);
}

// The advertised price and the field it came from, with the placeholder at the
// top of the range turned into an abstain (see PRICE_CEILING).
function price(v) {
  const picked = pickTaggedPrice("bmw-cpo", [
    ["internetPrice", num(v.internetPrice)],
    ["msrp", num(v.msrp)],
  ]);
  if (picked.priceUsd != null && picked.priceUsd >= PRICE_CEILING) {
    return { priceUsd: 0, priceProvenance: undefined };
  }
  return picked;
}

export function toRecord(v, root, evKind) {
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(v.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const names = split(v);
  if (!names) return null;
  const images = photoUrls(v, root);
  // `type` is the machine token ("Used" / "CPO"), not a display string — the
  // rule lib/condition.mjs exists for. CPO is a certification claim and rides
  // on that flag alone.
  const certified = String(v.type ?? "").toUpperCase() === "CPO";
  return {
    vin,
    year,
    make: BMW_CPO.make,
    model: names.model,
    trim: names.trim,
    ...price(v),
    mileage: Number.isFinite(v.odometer) && v.odometer > 0 ? Math.round(v.odometer) : num(v.odometer),
    driveLine: drive(v.drivetrain),
    exteriorColor: v.exterior || v.exteriorMeta || undefined,
    interiorColor: v.interior || v.interiorMeta || undefined,
    certified: certified || undefined,
    condition: publishedCondition({ certified, condition: v.type }),
    imageUrl: images[0],
    images,
    // Every record carries the selling rooftop's own VDP; the brand search is
    // the fallback for the rare row without one.
    sourceUrl: httpsUrl(v.vdpUrl) ?? "https://www.bmwusa.com/certified-preowned-search.html",
    dealerDomain: BMW_CPO.domain,
    evKind,
    // BEV: the server-side fuelTypes facet, which this lane verified carries no
    // petrol impostors. PHEV: the nameplate, which lib/ev.mjs classes as
    // fuel-text-only, so ingest holds the row until vPIC answers (see header).
    evConfidence: "high",
    platform: "bmw-cpo-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

let cachedToken = null;
let throttleWaits = 0;

// The site's anonymous storefront token. Cached for the process: one pull is
// far shorter than the 24h expiry.
async function getToken(report) {
  if (cachedToken) return cachedToken;
  const basic = Buffer.from(BMW_CPO.tokenBasic).toString("base64");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await politePostJson(BMW_CPO.tokenUrl, {
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: "",
    });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push("robots disallows the token endpoint"); return null; }
    if (res.json?.access_token) { cachedToken = res.json.access_token; return cachedToken; }
    if (attempt < 2) await sleep(5000);
    else report.errors.push(`token ${res.status}`);
  }
  return null;
}

// One page of one filtered search. Returns the parsed body, or null with the
// reason recorded — null NEVER means "no more rows".
async function page(pageIndex, filters, report) {
  const token = await getToken(report);
  if (!token) return null;
  const body = {
    pageIndex,
    PageSize: PAGE,
    postalCode: BMW_CPO.zip,
    radius: BMW_CPO.radius,
    sortBy: null,
    sortDirection: null,
    formatResponse: false,
    includeFacets: false,
    includeDealers: false,
    includeVehicles: true,
    filters,
  };
  for (let attempt = 0; attempt < THROTTLE_ATTEMPTS; attempt++) {
    const res = await politePostJson(BMW_CPO.api, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json", "accept-language": "en" },
      body,
    });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push("robots disallows the inventory endpoint"); return null; }
    if (res.status === 200 && Array.isArray(res.json?.vehicles)) return res.json;
    // 403 here is the address being parked for volume, not a refusal of the
    // identity, and it clears itself (see header). 401 means the token aged
    // out mid-pull; drop it and let the next attempt fetch a fresh one.
    if (res.status === 401) cachedToken = null;
    const throttled = (res.status === 403 || res.status === 429) && throttleWaits < THROTTLE_WAIT_BUDGET;
    const transient = throttled || res.status === 401 || String(res.status).startsWith("error:") || res.status >= 500;
    const last = attempt >= (throttled ? THROTTLE_ATTEMPTS : 3) - 1;
    if (!last && transient) {
      if (throttled) throttleWaits++;
      await sleep(throttled ? THROTTLE_SLEEP_MS : 5000);
      continue;
    }
    report.errors.push(`${res.status} offset=${pageIndex}`);
    return null;
  }
  return null;
}

// Walk one fuel facet to its short last page. `keep` decides which rows this
// sweep publishes and what kind of car they are.
async function sweep(fuel, keep, byVin, report, log) {
  const filters = [{ name: "FuelType", values: [fuel] }];
  let total = null;
  let seen = 0;
  let kept = 0;
  for (let offset = 0; offset < MAX_OFFSET; offset += PAGE) {
    const data = await page(offset, filters, report);
    if (!data) {
      // A failed page is NOT the end of the list — say so and stop, truncated.
      report.errors.push(`${fuel}: page at offset ${offset} failed, sweep incomplete`);
      return { total, seen, kept };
    }
    total ??= data.totalRecords ?? 0;
    const root = httpsUrl(data.photoDetails?.root);
    for (const v of data.vehicles) {
      seen++;
      const evKind = keep(v);
      if (!evKind) continue;
      const rec = toRecord(v, root, evKind);
      if (rec) { byVin.set(rec.vin, rec); kept++; }
    }
    if (data.vehicles.length < PAGE) break; // the only honest end of the walk
    if (offset && offset % 1000 === 0) log(`bmw-cpo/${fuel}: offset ${offset}/${total}, ${kept} kept`);
    await sleep(PACE_MS);
  }
  report.notes.push(`${fuel}: ${total} national, ${seen} read, ${kept} kept`);
  log(`bmw-cpo/${fuel}: ${total} national, ${seen} read, ${kept} kept`);
  return { total, seen, kept };
}

// The Electric facet is a BEV bucket; a stray non-electric fuelType would mean
// the server-side filter drifted, so it is re-checked per record.
export const keepBev = (v) => (String(v.fuelType ?? "").toLowerCase() === "electric" ? "BEV" : null);

// A Hybrid-facet row is a plug-in candidate only if BMW's own plug-in badge is
// in its name; vPIC settles each one (see header).
export const keepPhev = (v) => {
  if (String(v.fuelType ?? "").toLowerCase() !== "hybrid") return null;
  const name = `${v.model ?? ""} ${v.trimDescription ?? ""} ${v.modelSeries ?? ""}`;
  return PLUGIN_RE.test(name) ? "PHEV" : null;
};

/** Pull BMW's complete national used + certified electrified stock.
 *  crawl.mjs-shaped report; see gm.mjs for the completeness contract that
 *  truncated:false certifies, and kia.mjs for why the two sweeps share one
 *  report and one domain. */
export async function pullBmwCpo({ log = () => {} } = {}) {
  const report = { domain: BMW_CPO.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();
  throttleWaits = 0;

  const bev = await sweep("Electric", keepBev, byVin, report, log);
  const afterBev = byVin.size;
  // If the electric leg could not finish, the API is parked and the pull is
  // already truncated — spending another sixty-odd requests against a parked
  // endpoint would only lengthen the park for tomorrow's run. Say so and stop.
  if (report.errors.length) {
    report.notes.push("electric leg incomplete — plug-in leg skipped rather than hammering a parked API");
    log("bmw-cpo: electric leg incomplete, skipping the plug-in leg");
  } else {
    await sleep(PACE_MS);
    await sweep("Hybrid", keepPhev, byVin, report, log);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`${afterBev} BEV + ${byVin.size - afterBev} plug-in candidates`);
  // Completeness (see gm.mjs): both sweeps reached a short page cleanly AND the
  // BEV yield cleared the floor. The BEV leg carries the floor because it is
  // the one with a stable denominator — the plug-in leg's size depends on how
  // many candidates the nameplate pattern finds, and vPIC prunes it afterwards.
  const shortfall = bev.total > 0 && afterBev < bev.total * 0.9;
  if (shortfall) report.errors.push(`collected ${afterBev} of ${bev.total} electric — paging shortfall`);
  report.truncated = report.errors.length > 0 || afterBev < BMW_CPO.minExpected;
  return report;
}
