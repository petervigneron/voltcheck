// Stellantis CERTIFIED PRE-OWNED — the used half of Jeep/Chrysler/Dodge/Ram/
// Fiat/Alfa Romeo, which lib/oem/stellantis.mjs deliberately left alone.
//
// That module's header wrote the CPO lot off as "a legacy form-POST tool
// returning HTML, needing its own reverse-engineering; current used BEV volume
// is negligible". Both halves of that have moved: the volume is not negligible
// once PHEVs count (247 Wrangler 4xe and 91 Grand Cherokee 4xe in the 5-year
// tier alone, measured nationally 2026-08-23), and the tool is reverse-
// engineered here.
//
// ============================================================================
// THE ENDPOINTS, captured from a real browser on fcacertified.com, not guessed.
//
//  1. CATALOGUE (what models the CPO programme currently carries, per brand):
//       GET https://www.fcacertified.com/{brand}/get_brand_data/ore
//           ?brandName={brand}&selectedModel=
//     → {"params_make":"jeep","brandmodel":[{"maxprice":"…","model_name":"…"}…]}
//     This is the list the brand picker on fcacertified.com populates its model
//     dropdown from, and it is the lane's DISCOVERY step for the same reason
//     stellantis.mjs reads the vehicleData catalog rather than hardcoding
//     nameplates: a new certified nameplate has to be able to show up. Brand
//     slugs are the ones the site itself uses — note `alfa_romeo`, with the
//     underscore ("alfa-romeo" and "alfaromeo" both answer 200 with an EMPTY
//     brandmodel list, which is exactly the silent-nothing this lane must not
//     mistake for "no certified Alfas", so an empty catalogue is an error).
//
//  2. SEARCH. The brand storefronts (jeepcertified.com, chryslercertified.com,
//     …) render 12 cards server-side and reach the rest only through
//       POST https://www.{brand}certified.com/sni_filter_request
//     which is Laravel and answers 419 "CSRF token mismatch" without BOTH the
//     session cookie the search page set and the token that page printed in
//     its csrf-token meta. That is why http.mjs gained politeGetWithHeaders:
//     the GET has to hand its Set-Cookie forward. Nothing is being bypassed —
//     every one of these hosts publishes `User-agent: * / Disallow:` (i.e. all
//     of it is allowed), and www.jeep.com's robots.txt goes further and names
//     /hostc/cpov/vehicleSearch.do in an explicit Allow.
//
//     The POST body is the page's own `filtersearch` object. Three parts of it
//     are load-bearing and cost time to find:
//       - `miles` is the radius, and it is NOT the GET's `radius` param. Omit
//         it and the server re-runs the search at its 25-mile default: a query
//         whose page said 74 matches came back with 6. Set miles=9999 and the
//         result set saturates at the national one (measured from 66101:
//         500mi → 34, 1500mi → 247, 3000mi → 247, 9999 → 247), so ONE query
//         per model covers the country. No covering grid, no per-radius sample.
//       - `action:"filter"` returns page one AND `vehicle_list_exactcount`,
//         the true national total. `action:"loadmore"` with `offset` walks the
//         rest 12 at a time. Collected-vs-exactcount is therefore a real
//         completeness check, not count arithmetic over a sample.
//       - `vehicle_type` is the CPO TIER, and there are two of them:
//         "cpo" (up to 5 years / 75,000 miles) and "go" (6–10 years /
//         75,001–120,000). They partition the programme — the Wrangler 4xe
//         reads 247 exact + 69 partial under cpo and 69 exact under go — and a
//         lane that queried only "cpo" would silently drop every older
//         certified car, which for the Pacifica Hybrid (2017+) and the first-
//         generation 500e is most of them. Both tiers are queried and unioned.
//
//     The `go` tier is reached by changing `vehicle_type`, NOT the URL path:
//     https://…/go/all_model does not resolve. The path stays /ore/.
//
//  3. GEO. The result card carries a dealer NAME and dealer CODE but no
//     address, so state/city would be blank the way stellantis.mjs's new lane
//     leaves them. The per-VIN VDP does carry it (a hidden dealerZip input), so
//     the lane resolves each DEALER once — not each VIN — and reuses the answer
//     for every car on that lot. That is ~1 request per dealer holding an
//     electrified certified car, capped by DEALER_GEO_BUDGET; cars at dealers
//     the budget did not reach keep no state rather than a guessed one.
//
// ============================================================================
// WHAT COUNTS AS ELECTRIFIED, and why it is a nameplate rule here.
//
// Unlike the new-car lane there is no per-vehicle power_source attribute to
// gate on: the card's ENGINE field is dealer-typed free text and reads "4
// cylinder", "3.6L V6", "Gas/Electric V-6 3.6 L/220" and "6 Cyl - 3.6 L" for
// the same car. What IS structural is the SEARCH ITSELF: Stellantis's own
// catalogue lists "Wrangler" and "Wrangler 4xe" as different models, and
// `brand_model=wrangler-4xe` is a server-side filter over that distinction.
// Control test, run 2026-08-23 at the same moment against the same host:
// brand_model=wrangler-4xe returns 247 cars whose every title reads
// "… wrangler 4xe …"; brand_model=wrangler returns a disjoint 300 whose titles
// read "… wrangler 4-Door …". The filter does not leak, and every row is
// re-checked against its own title below before it is admitted.
//
// So the claim each row makes is "Stellantis's certified catalogue calls this a
// Wrangler 4xe", plus the fact that 4xe IS Stellantis's plug-in-hybrid
// designation. That is a nameplate fact, not a fuel-field reading, so PHEV rows
// ship at evConfidence "high" with evKind "PHEV" and land in vpic-enrich's
// fuelTextOnly set — vPIC is asked about every one of them and demotes any
// whose ElectrificationLevel is not PHEV/plug-in. (They cannot ship as
// "name_match": that state is only ever promoted by vpicConfirmsBev, so a
// name_match PHEV would be held by ingest forever.)
//
// Nameplates we deliberately do NOT claim, so they surface as a loud note
// instead of a guess: the Ram 1500 Ramcharger (an EREV, not a PHEV in the sense
// the rest of the feed uses) and the ProMaster EV (a commercial step van, out
// of scope for the same reason stellantis.mjs gives). Neither is in the
// certified catalogue today; WATCH_RE exists so that the day one is, the run
// says so rather than quietly omitting it.
import { politeGetWithHeaders, politePostJson, politeGetJson, fetchRaw } from "../http.mjs";
import { stateFromZip } from "./zip-state.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";

export const STELLANTIS_CPO = {
  key: "stellantis-cpo",
  // One synthetic domain for all six brands, isolated from the per-brand
  // domains stellantis.mjs certifies complete for NEW stock. Sharing
  // jeep.com would make a CPO sweep's absence delist new Jeeps and vice
  // versa. Always truncated (see pullStellantisCpo): each row carries the
  // real per-VIN certified VDP, which honestly 404s the car away — a
  // fabricated VIN returns a 13,659-byte page that does not echo the VIN,
  // where a real one returns 173,543 bytes that does — so recheck verifies
  // liveness there and is NOT skipped for this domain.
  domain: "stellantis-cpo",
  catalogue: "https://www.fcacertified.com",
  minExpected: 100,
};

// recheck.mjs must NOT skip this domain — see the note above. Empty on purpose.
export const OEM_LOCATOR_DOMAINS = new Set();

// Brand slug (the catalogue's own) → storefront host and display make.
// fiatcertified.com does not resolve (NXDOMAIN) and there is no Fiat
// storefront of its own; the search backend is brand-agnostic, verified live
// by asking the Jeep host for brand_name=fiat&brand_model=500e and getting the
// 500e set back, so Fiat rides the Jeep host with its own brand_name.
const BRANDS = [
  { slug: "jeep", host: "www.jeepcertified.com", make: "Jeep" },
  { slug: "chrysler", host: "www.chryslercertified.com", make: "Chrysler" },
  { slug: "dodge", host: "www.dodgecertified.com", make: "Dodge" },
  { slug: "ram", host: "www.ramcertified.com", make: "Ram" },
  { slug: "alfa_romeo", host: "www.alfaromeousacertified.com", make: "Alfa Romeo" },
  { slug: "fiat", host: "www.jeepcertified.com", make: "Fiat" },
];

const TIERS = ["cpo", "go"]; // 5yr/75k and 6-10yr/75-120k — they partition the programme
const NATIONAL_ZIP = "66101"; // any populated ZIP; miles=9999 spans the country
const NATIONAL_MILES = "9999";
const PAGE = 12; // server renders 12 cards per response, whatever you ask
const MAX_PAGES = 400; // ceiling per (brand, model, tier): 4,800 cars
const REQUEST_BUDGET = 700;
const DEALER_GEO_BUDGET = 400; // one VDP per dealer, not per VIN
const TIMEOUT_MS = 120000; // these hosts are slow and occasionally refuse a connection
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// Nameplate → what it is. Ordered: the exact names first so a future generic
// rule can never override a known one.
const ELECTRIFIED = [
  { re: /^wrangler\s*4xe$/i, kind: "PHEV" },
  { re: /^grand cherokee\s*4xe$/i, kind: "PHEV" },
  // The US Pacifica Hybrid IS the plug-in — Chrysler has never sold a
  // non-plug-in Pacifica hybrid here, and the catalogue lists the petrol van
  // separately as "Pacifica". So this name is a PHEV claim, not a hybrid one.
  { re: /^pacifica hybrid$/i, kind: "PHEV" },
  { re: /^500e$/i, kind: "BEV" },
  { re: /^charger daytona/i, kind: "BEV" },
  { re: /^wagoneer s\b/i, kind: "BEV" }, // "Wagoneer" and "Wagoneer L" are petrol; the S is the BEV
  { re: /^recon\b/i, kind: "BEV" },
  { re: /^hornet r\/?t\b/i, kind: "PHEV" },
  { re: /^tonale\b/i, kind: "PHEV" },
  { re: /\b4xe$/i, kind: "PHEV" }, // any future 4xe (Compass 4xe, Gladiator 4xe…)
];

// Names that LOOK electrified but that this lane refuses to classify. Matching
// here and not in ELECTRIFIED raises a note in the report, so a nameplate we
// have not thought about is loud rather than silently missing.
const WATCH_RE = /4xe|hybrid|electri|\bev\b|\bphev\b|daytona|500e|recon|wagoneer s\b|hornet|tonale|ramcharger|\bee\b/i;

/** The kind this catalogue name claims, or undefined. */
export function electrifiedKind(modelName) {
  for (const e of ELECTRIFIED) if (e.re.test(String(modelName).trim())) return e.kind;
  return undefined;
}
export const isWatched = (modelName) => WATCH_RE.test(String(modelName));

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const decodeEntities = (s) =>
  String(s ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&reg;|&trade;|[®™]/gi, "");

const titleCase = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b4Xe\b/g, "4xe")
    .replace(/\b500E\b/g, "500e");

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/4X4|\b4WD\b/.test(s)) return "4WD";
  if (/AWD|ALL.?WHEEL/.test(s)) return "AWD";
  if (/RWD|REAR|4X2/.test(s)) return "RWD";
  if (/FWD|FRONT/.test(s)) return "FWD";
  return undefined;
};

const field = (card, label) => {
  const m = new RegExp(`${label}\\s*<\\/td>\\s*<td[^>]*>\\s*([^<]*?)\\s*<`, "i").exec(card);
  return m ? decodeEntities(m[1]).trim() : undefined;
};

const one = (card, re) => {
  const m = re.exec(card);
  return m ? decodeEntities(m[1]).trim() : undefined;
};

// One result card → normalized listing, or null if it fails a gate. `cfg`
// carries the catalogue name we queried and the kind it claims.
function toRecord(card, cfg, brand, tier) {
  const vin = String(one(card, /id="idDivVin_selected_([A-Z0-9]{17})"/) ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const name = one(card, /class="car_name"[^>]*>([^<]*)</);
  if (!name) return null;
  // The row must belong to the model we asked for. The filter has never been
  // seen to leak (see header control), but a title check costs nothing and is
  // the difference between trusting a query and checking a car.
  const modelToken = cfg.model.toLowerCase().replace(/\s+/g, " ");
  if (!name.toLowerCase().replace(/\s+/g, " ").includes(modelToken)) return null;
  const year = Number((name.match(/\b(19|20)\d{2}\b/) || [])[0]);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  // "2024 wrangler 4xe Rubicon 4xe" → trim "Rubicon 4xe" → "Rubicon 4xe".
  const trimRaw = name
    .replace(/\b(19|20)\d{2}\b/, " ")
    .replace(new RegExp(modelToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ")
    .replace(/\s+/g, " ")
    .trim();
  const price = num(one(card, /class="dealer_price"[^>]*>\s*([^<]*)</));
  const floor = priceFloor({ isNew: false, year });
  const dealerCode = one(card, /data-dealer="(\d+)"/) ?? one(card, /dealercode=(\d+)/);
  const img = one(card, /data-original="(https:\/\/[^"]+)"/);
  const vdp = one(card, /href="(https:\/\/[^"]*\/(?:ore|go)\?vin=[^"]+)"/);
  const mileage = num(field(card, "MILEAGE"));
  return {
    vin,
    year,
    make: brand.make,
    model: cfg.model,
    trim: trimRaw ? titleCase(trimRaw) : undefined,
    // Only one price is published on a certified card, and a number under the
    // year's junk floor is a payment, not an ask (lib/price-floor.mjs) — so it
    // is dropped rather than printed.
    ...pickTaggedPrice("stellantis-cpo", [["dealerPrice", price != null && price >= floor ? price : undefined]]),
    mileage,
    driveLine: drive(field(card, "DRIVE")),
    dealerName: one(card, /class="dealer_name"[^>]*>\s*([^<]*)</),
    dealerCode,
    certified: true,
    condition: "certified",
    imageUrl: img,
    images: img ? [img] : [],
    // Real per-VIN certified VDP; recheck verifies the car there (header).
    sourceUrl: vdp ? decodeEntities(vdp) : `https://${brand.host}/`,
    dealerDomain: STELLANTIS_CPO.domain,
    evKind: cfg.kind,
    // A nameplate claim, checked by vPIC downstream — see the header.
    evConfidence: "high",
    platform: "stellantis-cpo",
    cpoTier: tier,
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// GET with retries. These storefronts refuse a connection outright often
// enough that a single attempt loses whole models (measured: 6 of 8 probe
// queries failed first try, all succeeded on retry).
async function getPage(url, report) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const g = await politeGetWithHeaders(url, { timeoutMs: TIMEOUT_MS });
    report.fetched++;
    if (g.status === "robots_disallowed") { report.errors.push(`robots disallows ${url.slice(0, 60)}`); return null; }
    if (g.status === 200 && g.text) return g;
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  report.errors.push(`GET failed after retries: ${url.slice(0, 90)}`);
  return null;
}

const FILTERSEARCH = {
  miles: NATIONAL_MILES, resetfiltersilder: 0, chnagemilesrange_limit: 0,
  recordtype: "exact", offset: 0, drivetype: "", color: {}, year: "", s_year: "",
  e_year: "", dealers: {}, dealerscount: "", colorcount: "", secondaryfilter: "",
  minprice: "", maxprice: "", mileage: "", vehicle_type: "cpo",
};

async function search(session, cfg, brand, tier, offset, action, report) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = await politePostJson(`https://${brand.host}/sni_filter_request`, {
      headers: {
        origin: `https://${brand.host}`, referer: session.url, cookie: session.cookie,
        "x-csrf-token": session.token, "x-requested-with": "XMLHttpRequest",
      },
      body: {
        filtersearch: { ...FILTERSEARCH, offset, vehicle_type: tier },
        modelname: cfg.model.toLowerCase(), makevalue: brand.slug,
        zipcode: NATIONAL_ZIP, tier: "ore", action,
      },
      timeoutMs: TIMEOUT_MS,
    });
    report.fetched++;
    if (p.status === 200 && p.json) return p.json;
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  report.errors.push(`POST failed: ${brand.slug}/${cfg.model}/${tier}@${offset}`);
  return null;
}

// Pull one (brand, model, tier) to exhaustion. Returns false if anything went
// wrong or the walk fell short of the server's own exact count.
async function pullConfig(cfg, brand, tier, byVin, report, log) {
  const slug = cfg.model.toLowerCase().replace(/\s+/g, "-");
  const url =
    `https://${brand.host}/ore/all_model?brand_model=${encodeURIComponent(slug)}` +
    `&minyear=2010&maxyear=${new Date().getFullYear() + 1}&pricedetail=&mileage=&radius=500` +
    `&selectZipcode=${NATIONAL_ZIP}&brand_name=${brand.slug}&vehicletype=cpo`;
  const g = await getPage(url, report);
  if (!g) return false;
  const token = (g.text.match(/name="csrf-token"\s+content="([^"]+)"/i) || [])[1];
  if (!token) { report.errors.push(`no csrf token on ${brand.slug}/${cfg.model}`); return false; }
  const session = { url, token, cookie: g.cookies.map((c) => c.split(";")[0]).join("; ") };

  let total = null;
  let seen = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (report.fetched >= REQUEST_BUDGET) { report.errors.push(`request budget hit in ${brand.slug}/${cfg.model}/${tier}`); return false; }
    const j = await search(session, cfg, brand, tier, page * PAGE, page === 0 ? "filter" : "loadmore", report);
    if (!j) return false;
    if (page === 0) total = Number(j.vehicle_list_exactcount ?? 0);
    const html = j.vehicle_list_exact ?? "";
    const cards = html.split('id="idDivVin_selected_').slice(1).map((c) => 'id="idDivVin_selected_' + c);
    for (const card of cards) {
      const rec = toRecord(card, cfg, brand, tier);
      if (rec) byVin.set(rec.vin, rec);
    }
    seen += cards.length;
    if (!cards.length || (total != null && seen >= total)) break;
  }
  if (total != null && seen < total) {
    report.errors.push(`${brand.slug}/${cfg.model}/${tier}: walked ${seen} of ${total}`);
    return false;
  }
  if (total) log(`stellantis-cpo: ${brand.slug} ${cfg.model} [${tier}] ${total} certified`);
  return true;
}

// The brand's current certified catalogue. Null means we could not read it,
// which must not be mistaken for "this brand certifies nothing".
async function catalogue(brand, report) {
  const url = `${STELLANTIS_CPO.catalogue}/${brand.slug}/get_brand_data/ore?brandName=${brand.slug}&selectedModel=`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await politeGetJson(url, {
      headers: { referer: `${STELLANTIS_CPO.catalogue}/`, "x-requested-with": "XMLHttpRequest" },
      timeoutMs: TIMEOUT_MS,
    });
    report.fetched++;
    if (r.status === "robots_disallowed") { report.errors.push("robots disallows the CPO catalogue"); return null; }
    let j = r.json;
    if (typeof j === "string") { try { j = JSON.parse(j); } catch {} }
    const models = j?.brandmodel;
    if (r.status === 200 && Array.isArray(models) && models.length) return models.map((m) => String(m.model_name ?? "").trim()).filter(Boolean);
    await new Promise((r2) => setTimeout(r2, 4000 * (attempt + 1)));
  }
  report.errors.push(`catalogue unreadable/empty for ${brand.slug}`);
  return null;
}

// One VDP per DEALER (not per VIN) for the dealer ZIP the card omits.
async function fillDealerGeo(byVin, report, log) {
  const byDealer = new Map();
  for (const rec of byVin.values()) {
    if (!rec.dealerCode || !rec.sourceUrl?.includes("vin=")) continue;
    if (!byDealer.has(rec.dealerCode)) byDealer.set(rec.dealerCode, rec.sourceUrl);
  }
  const zips = new Map();
  let spent = 0;
  for (const [code, url] of byDealer) {
    if (spent >= DEALER_GEO_BUDGET) { report.notes.push(`dealer-geo budget ${DEALER_GEO_BUDGET} hit — ${byDealer.size - spent} dealers left without a ZIP`); break; }
    spent++;
    // Same retry as the searches: these hosts refuse connections often enough
    // that a single try left 55 of 433 cars stateless in the first live sweep.
    let zip;
    for (let attempt = 0; attempt < 3 && !zip; attempt++) {
      const r = await fetchRaw(url, { timeoutMs: TIMEOUT_MS }).catch(() => ({ status: "error", body: null }));
      report.fetched++;
      zip = (String(r.body ?? "").match(/id="dealerZip"[^>]*value="(\d{5})/) || [])[1];
      if (!zip) await new Promise((r2) => setTimeout(r2, 3000 * (attempt + 1)));
    }
    if (zip) zips.set(code, zip);
  }
  for (const rec of byVin.values()) {
    const zip = zips.get(rec.dealerCode);
    if (!zip) continue;
    rec.zip = zip;
    rec.state = stateFromZip(zip);
  }
  log(`stellantis-cpo: dealer geo ${zips.size}/${byDealer.size} rooftops`);
}

/**
 * Pull every electrified Stellantis certified-pre-owned car in the country.
 * crawl.mjs-shaped report on the synthetic "stellantis-cpo" domain.
 *
 * ALWAYS truncated:true. The per-model walk is genuinely complete (it checks
 * itself against the server's own exact count), but "complete" would license
 * delisting for the whole domain off a run in which any one brand's storefront
 * refused a connection — and these hosts refuse connections. Recheck retires
 * sold cars per VIN through the real certified VDP instead, which it can do
 * here because that page honestly stops naming a VIN once the car is gone.
 */
export async function pullStellantisCpo({ log = () => {} } = {}) {
  const report = { domain: STELLANTIS_CPO.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();
  const only = process.env.STELLANTIS_CPO_BRANDS?.split(",").map((s) => s.trim()).filter(Boolean);
  const brands = only?.length ? BRANDS.filter((b) => only.includes(b.slug)) : BRANDS;

  for (const brand of brands) {
    const models = await catalogue(brand, report);
    if (!models) continue;
    const configs = [];
    for (const model of models) {
      const kind = electrifiedKind(model);
      if (kind) configs.push({ model, kind });
      else if (isWatched(model)) report.notes.push(`UNCLASSIFIED electrified-looking nameplate: ${brand.slug} "${model}" — not published`);
    }
    report.notes.push(`${brand.slug}: ${models.length} certified nameplates, ${configs.length} electrified (${configs.map((c) => c.model).join(", ") || "none"})`);
    for (const cfg of configs) {
      for (const tier of TIERS) {
        const ok = await pullConfig(cfg, brand, tier, byVin, report, log);
        if (!ok) log(`stellantis-cpo: ${brand.slug}/${cfg.model}/${tier} incomplete`);
      }
    }
  }

  if (byVin.size && process.env.STELLANTIS_CPO_SKIP_GEO !== "1") await fillDealerGeo(byVin, report, log);

  const evs = [...byVin.values()];
  for (const r of evs) delete r.dealerCode; // internal join key, not a listing field
  report.evs = evs;
  report.vehiclePages = report.fetched;
  const kinds = evs.reduce((a, r) => ((a[r.evKind] = (a[r.evKind] ?? 0) + 1), a), {});
  report.notes.push(`${evs.length} certified electrified cars ${JSON.stringify(kinds)}, ${report.fetched} requests`);
  log(`stellantis-cpo: ${evs.length} cars ${JSON.stringify(kinds)}, ${report.fetched} requests, ${report.errors.length} errors`);
  // Never certifies complete — see the doc comment.
  report.truncated = true;
  return report;
}
