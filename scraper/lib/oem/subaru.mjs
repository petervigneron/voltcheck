// Subaru national inventory locator (subaru.com) — new + certified pre-owned.
//
// The 2026-08-15 survey wrote Subaru off as "SSR (AEM) + AWS WAF + CAPTCHA,
// Solterra = Toyota bZ twin, same platform". Half of that was wrong and worth
// correcting, because it cost this maker a lane for three days: Subaru is
// indeed an AEM site, but its shopping tools are NOT Toyota's GraphQL — they
// are Subaru's own JSON services under subaru.com/services/*, and those answer
// a plain Node fetch with 200 JSON and no token. Control that proves it is a
// real door and not a hole in a wall: /services/vehicles/models/basicdata
// returns the full model catalogue to the same client that tesla.com and
// ford.com Akamai-403, and robots.txt allows everything except /cms/,
// /rawdata/, /nscms/ and a handful of marketing pages. Nothing here is behind
// the WAF the earlier probe hit on the rendered inventory PAGE.
//
// Three endpoints, all read out of the local-inventory Vue chunk
// (webpack.bundles/js/modern-local_inventory_page.*.js and its
// certified-pre-owned~local_inventory_page sibling) rather than guessed:
//   GET  /services/vehicles/models/basicdata          → model catalogue
//   GET  /services/dealers/query?query=&count=&type=  → retailer roster
//   POST /services/graphql/retailerinventory          → new stock   (JSON body)
//   GET  /services/graphql/cpoinventory?…             → certified stock
// "graphql" in the path is a lie the site tells itself: both are ordinary
// REST-ish endpoints keyed by query params, and POSTing an actual GraphQL
// document to them returns {"pagedListWrapper":null}.
//
// THE BEV GATE IS STRUCTURAL, and it is Genesis's trick: Subaru has no
// fuel-type facet, but each of its BEVs has its own model file, so querying
// only those model codes IS the electric filter. The codes are not hardcoded —
// basicdata tags every nameplate with marketing `types`, and we keep the codes
// whose types contain "Electric" and contain neither "Gas" nor "Hybrid". That
// discovery matters more here than anywhere else so far: Subaru shipped TWO
// new BEV nameplates this year, and a hardcoded ["SOL"] would have found 194
// cars and missed 1,232. Today it resolves UNC (Uncharted) + SOL (Solterra) +
// TSK (Trailseeker); Crosstrek and Forester read "Hybrid" and are dropped, so
// the PHEV/HEV trap that caught the Audi lane cannot fire here.
//
// COVERAGE is complete, and the proof has two halves:
//  1. The inventory query is scoped to an explicit dealerCode list — there is
//     no "all dealers" mode — so completeness starts with the retailer roster.
//     /services/dealers/query is a case-insensitive SUBSTRING match on the
//     retailer NAME (control-tested: "ubar" returns 643, "zz" returns Piazza
//     Subaru of Limerick, and the city name "charlevoix" returns 0 — so it does
//     not read the address). Every retailer name contains at least one
//     alphanumeric character, so the union over a–z0–9 is the whole roster by
//     construction: 644 retailers in 49 states. (Querying "subaru" alone gets
//     643 of them — one retailer is not named "… Subaru" — which is exactly the
//     kind of near-miss that would have looked complete and quietly wasn't.)
//  2. Each lot pages to its own reported totalItems with zero repeated VINs
//     (measured: 1,426 new over 15 pages, 100 certified over 2, no dupes), and
//     a partition control confirms the totals are real rather than a capped
//     window — certified Solterra by model year sums 66+15+11+4 = 96 = the
//     unpartitioned Solterra count.
// So this certifies COMPLETE on the real domain subaru.com and db-sync's
// nightly delisting retires sold VINs (see gm.mjs for that contract). The lane
// refuses to certify if it ever sees a repeated VIN (vw.mjs's rule — VW's new
// sweep looked fine until the dupes were counted).
//
// recheck SKIPS subaru.com, on GM's rule rather than VW's, and the fabricated-id
// control says why. Sampling six distinct dealer platforms out of the 476 the
// detailsUrls span: five return 200 on the real car with the VIN echoed in the
// HTML (so recheck would read them correctly), one — capitolsubarusj.com — 403s
// our client on a car the sweep just saw live (inconclusive, harmless). But
// FOUR of the six address the car by an opaque platform id rather than the VIN
// (premiersubaru.com/catcher.esl?vehicleId=87c11f3c…), so the fabricated-id
// control cannot even be run on them: there is no id to falsify, and no way to
// tell a retired id from a reused one. On the one platform where the control
// does run (dchsubaruthousandoaks.com) it behaves properly — real VIN 200s and
// echoes, fabricated VIN 200s and does not. So this is NOT vw.mjs's situation,
// where rechecking would have delisted the whole lane; recheck would mostly
// work. It is skipped because it would spray ~1.5k requests across 476
// third-party dealer hosts to learn what a complete nightly sweep already
// says. The VDP stays the shopper's click-through.
//
// WHAT IS DELIBERATELY NOT CLAIMED:
//  - evConfidence is "high" only for Solterra, whose nameplate is in
//    EV_MODEL_RE. Trailseeker and Uncharted are BEV-only nameplates too, but
//    they are not in that list and their WMI is not in EV_ONLY_WMIS, so they
//    ship "name_match" for vpic-enrich.mjs to promote or refute. Adding two
//    words to ev.mjs would have made 1,232 rows read "high" on our say-so;
//    letting vPIC confirm them costs a decode and cannot be wrong.
//  - EVERY Subaru BEV VIN in this sweep starts JTM — Toyota's WMI, not
//    Subaru's 4S3/4S4. These cars are built by Toyota (Solterra/Trailseeker are
//    bZ siblings, Uncharted a C-HR+ sibling). Worth knowing if a Toyota lane
//    ever keys on WMI: it would swallow Subarus.
//  - driveLine is left blank. The records carry `transmission: "SST"` and no
//    drivetrain field, and guessing "AWD" from the badge would be a claim the
//    data does not make (2026 Uncharted ships FWD and AWD).
//  - imageUrl is left blank. The `image` field is a scene7 factory RENDER of
//    the trim+colour combination, not a photograph of that car — same call
//    stellantis.mjs made about its mackevision renders.
//  - Prices: `internetPrice` is the dealer's advertised ask, which is what a
//    shopper is quoted; tsrp (MSRP + destination) is the fallback. In-transit
//    new cars often carry 0 for all three, and those ship with no price rather
//    than a fabricated one.
import { politeGetJson, politePostJson } from "../http.mjs";
import { EV_MODEL_RE, EV_ONLY_WMIS } from "../ev.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

const HOST = "https://www.subaru.com";

export const SUBARU = {
  key: "subaru",
  domain: "subaru.com",
  make: "Subaru",
  basicData: `${HOST}/services/vehicles/models/basicdata`,
  dealerQuery: `${HOST}/services/dealers/query`,
  newInventory: `${HOST}/services/graphql/retailerinventory`,
  cpoInventory: `${HOST}/services/graphql/cpoinventory`,
  referer: `${HOST}/vehicles/local-inventory.html`,
  // Retailer names are matched by substring, so this alphabet is a covering
  // set: no name can avoid every character in it.
  rosterAlphabet: "abcdefghijklmnopqrstuvwxyz0123456789",
  pageSize: 100, // server honours it; larger values are not accepted
  maxPages: 60, // safety ceiling — 15 pages covers the new lot today
  minDealers: 400, // roster floor; below this the sweep is not national
  minExpected: 200, // BEV floor; below this we do not certify (no delisting)
};

// recheck.mjs skips this domain — the complete nightly sweep already retires
// gone VINs via db-sync (gm.mjs's contract), and the per-VIN VDPs live on ~640
// third-party dealer platforms.
export const OEM_LOCATOR_DOMAINS = new Set([SUBARU.domain]);

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// Subaru's colour and feature strings carry markup: "Gray StarTex<sup>&reg;</sup>".
const clean = (s) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&reg;|&trade;|&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .trim() || undefined;

// A shared retry wrapper: one 5s retry on a transient failure, then record the
// error (which flips truncated and suppresses delisting). gm.mjs's rationale.
async function withRetry(fn, label, report) {
  for (let attempt = 0; ; attempt++) {
    const res = await fn();
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push(`robots disallows ${label}`); return null; }
    if (res.status === 200) return res;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} ${label}`);
    return null;
  }
}

// The BEV-only model codes, discovered rather than hardcoded. Returns null if
// the catalogue is unreachable or names no electric nameplate — either way the
// caller must not certify, because an empty model list would sweep zero cars
// and delist the whole make.
async function discoverBevModels(report) {
  const res = await withRetry(
    () => politeGetJson(SUBARU.basicData, { headers: { referer: SUBARU.referer } }),
    "models/basicdata",
    report
  );
  if (!res) return null;
  const rows = Array.isArray(res.json) ? res.json : null;
  if (!rows) { report.errors.push("basicdata was not an array"); return null; }
  const byCode = new Map();
  for (const m of rows) {
    if (!m?.code) continue;
    const types = byCode.get(m.code) ?? new Set();
    for (const t of m.types ?? []) types.add(String(t));
    byCode.set(m.code, types);
    if (!byCode.get(m.code).size) byCode.delete(m.code);
  }
  const bev = [];
  const names = new Map();
  for (const [code, types] of byCode) {
    const has = (t) => [...types].some((x) => x.toLowerCase() === t);
    if (has("electric") && !has("gas") && !has("hybrid")) bev.push(code);
  }
  for (const m of rows) if (bev.includes(m.code) && m.name) names.set(m.code, m.name);
  if (!bev.length) { report.errors.push("basicdata named no BEV-only model"); return null; }
  report.notes.push(`BEV model codes: ${bev.map((c) => `${c}(${names.get(c) ?? "?"})`).join(", ")}`);
  return bev;
}

// The whole retailer roster, by substring-sweeping the name search. Returns a
// Map id → retailer, or null if it came back implausibly small (which would
// silently narrow the inventory sweep rather than fail it).
async function fetchRoster(report, log) {
  const roster = new Map();
  for (const ch of SUBARU.rosterAlphabet) {
    const url = `${SUBARU.dealerQuery}?query=${encodeURIComponent(ch)}&count=5000&type=Active`;
    const res = await withRetry(
      () => politeGetJson(url, { headers: { referer: `${HOST}/find/a-retailer.html` } }),
      `dealers/query?${ch}`,
      report
    );
    if (!res) return null; // a missing letter is a hole in the roster
    for (const d of Array.isArray(res.json) ? res.json : []) if (d?.id) roster.set(String(d.id), d);
  }
  log(`subaru: roster ${roster.size} retailers`);
  if (roster.size < SUBARU.minDealers) {
    report.errors.push(`roster only ${roster.size} retailers (floor ${SUBARU.minDealers})`);
    return null;
  }
  report.notes.push(`${roster.size} retailers from ${SUBARU.rosterAlphabet.length} name-substring queries`);
  return roster;
}

// One inventory row → normalized listing, or null if it fails a gate. `dealer`
// is the roster entry for the row's dealerCode; the caller has already dropped
// rows with no roster match, because the owner's rule is that a car is never
// listed without a location.
function toRecord(v, dealer, { certified, bevCodes }) {
  const vin = String(v.vinNumber ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // The query was scoped to BEV-only model files; a row from any other model
  // file means the filter stopped filtering, so drop rather than mislabel.
  if (!bevCodes.includes(String(v.modelCode ?? "").toUpperCase())) return null;
  const year = Number(v.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = clean(v.modelName);
  if (!model) return null;
  const addr = dealer.address ?? {};
  const zip = /^\d{5}/.test(String(addr.zipcode ?? "")) ? String(addr.zipcode).slice(0, 5) : undefined;
  const state = /^[A-Z]{2}$/.test(String(addr.state ?? "").toUpperCase()) ? String(addr.state).toUpperCase() : undefined;
  if (!state) return null; // no location, no listing
  const mileage = certified && Number.isFinite(v.mileage) ? Math.round(v.mileage) : undefined;
  // Only claim BEV-high where the house rule allows it: an EV-only WMI or a
  // nameplate already in EV_MODEL_RE. Trailseeker/Uncharted fall to name_match.
  const evConfidence =
    EV_ONLY_WMIS.has(vin.slice(0, 3)) || EV_MODEL_RE.test(`${SUBARU.make} ${model}`.toLowerCase())
      ? "high"
      : "name_match";
  return {
    vin,
    year,
    make: SUBARU.make,
    model,
    trim: clean(v.trimName),
    ...pickTaggedPrice("subaru", [
      ["internetPrice", num(v.internetPrice)],
      ["tsrp", num(v.tsrp)],
      ["msrp", num(v.msrp)],
    ]),
    mileage,
    driveLine: undefined, // the API carries no drivetrain field — see header
    exteriorColor: clean(v.exteriorColor?.name),
    interiorColor: clean(v.interiorColor?.name),
    dealerName: clean(v.dealership) ?? clean(dealer.name),
    city: clean(addr.city),
    state,
    zip,
    certified: certified || undefined,
    condition: certified ? "certified" : "new",
    imageUrl: undefined, // `image` is a factory render, not this car — see header
    images: [],
    sourceUrl: String(v.detailsUrl ?? "") || SUBARU.referer,
    dealerDomain: SUBARU.domain,
    evKind: "BEV",
    evConfidence,
    platform: "subaru-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// Page one lot (new or certified) to exhaustion. Returns false if any page
// failed, the paging fell short of the reported total, or a VIN repeated.
async function pullLot({ certified, bevCodes, dealerCodes, roster, byVin, report, log }) {
  const models = bevCodes.join(",");
  let total = null;
  let raw = 0;
  let dupes = 0;
  let noDealer = 0;
  const lot = certified ? "certified" : "new";
  for (let page = 0; page < SUBARU.maxPages; page++) {
    let res;
    if (certified) {
      const qs = new URLSearchParams({
        page: String(page),
        itemsPerPage: String(SUBARU.pageSize),
        sortBy: "asc",
        models,
        dealerCode: dealerCodes,
      });
      res = await withRetry(
        () => politeGetJson(`${SUBARU.cpoInventory}?${qs}`, { headers: { referer: `${HOST}/vehicle-info/certified-pre-owned/certified-pre-owned.html` } }),
        `${lot} p${page}`,
        report
      );
    } else {
      const body = { models, page, itemsPerPage: SUBARU.pageSize, sortBy: "asc", dealerCode: dealerCodes };
      res = await withRetry(
        () => politePostJson(SUBARU.newInventory, { headers: { origin: HOST, referer: SUBARU.referer }, body }),
        `${lot} p${page}`,
        report
      );
    }
    if (!res) return false;
    const pl = res.json?.pagedListWrapper;
    if (!pl) { report.errors.push(`${lot} p${page}: no pagedListWrapper`); return false; }
    total = pl.pager?.totalItems ?? total;
    const items = pl.items ?? [];
    raw += items.length;
    for (const it of items) {
      const dealer = roster.get(String(it.dealerCode ?? ""));
      if (!dealer) { noDealer++; continue; }
      const rec = toRecord(it, dealer, { certified, bevCodes });
      if (!rec) continue;
      if (byVin.has(rec.vin)) dupes++;
      byVin.set(rec.vin, rec);
    }
    log(`subaru/${lot}: page ${page} → ${items.length} rows, ${byVin.size} cumulative`);
    if (!items.length || !pl.pager?.next) break;
  }
  report.notes.push(`${lot}: ${raw} rows returned, reported total ${total}, ${noDealer} without a roster dealer`);
  if (noDealer) report.errors.push(`${lot}: ${noDealer} rows had a dealerCode outside the roster`);
  // vw.mjs's rule: repeated VINs mean the backend's paging is unstable under
  // ties, so the page walk is a sample, not the set. Never certify that.
  if (dupes) { report.errors.push(`${lot}: ${dupes} repeated VINs across pages — paging unstable`); return false; }
  if (total != null && raw < total) { report.errors.push(`${lot}: paged ${raw}/${total}`); return false; }
  return true;
}

// Pull Subaru's complete national BEV inventory, new + certified pre-owned.
// crawl.mjs-shaped report on the real domain; truncated:false certifies the
// sweep and lets db-sync delist (see gm.mjs).
export async function pullSubaru({ log = () => {} } = {}) {
  const report = { domain: SUBARU.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  const bevCodes = await discoverBevModels(report);
  if (!bevCodes) { report.truncated = true; return report; }
  log(`subaru: BEV model codes ${bevCodes.join(",")}`);

  const roster = await fetchRoster(report, log);
  if (!roster) { report.truncated = true; return report; }
  const dealerCodes = [...roster.keys()].join(",");

  const byVin = new Map();
  const okNew = await pullLot({ certified: false, bevCodes, dealerCodes, roster, byVin, report, log });
  const okCpo = await pullLot({ certified: true, bevCodes, dealerCodes, roster, byVin, report, log });

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const certified = report.evs.filter((e) => e.certified).length;
  report.notes.push(`${report.evs.length} BEVs (${certified} certified), ${report.fetched} requests`);
  log(`subaru: ${report.evs.length} BEVs (${certified} certified), ${report.fetched} requests, ${report.errors.length} errors`);
  // Completeness (gm.mjs): both lots fully paged with no dupes, no errors, and
  // yield over the floor. The floor guards against the API returning an empty
  // set, which must not delist the make.
  report.truncated = !okNew || !okCpo || report.errors.length > 0 || byVin.size < SUBARU.minExpected;
  return report;
}
