// Mazda's national inventory locator (mazdausa.com) — new AND certified, in
// one puller because both lots live under the same domain (see pullMazda's
// completeness note, and kia.mjs, which has the same rule for the same reason).
//
// oem-locator.mjs's header wrote Mazda off on 2026-08-15 as "probed, open, no
// US BEV to sell", and that verdict was right about BEVs and wrong about the
// scope. Mazda sells two plug-in hybrids here — the CX-70 PHEV and the CX-90
// PHEV — and since 2026-08-23 the OEM lanes carry plug-ins. This is that lane.
//
// ============================================================================
// THE ENDPOINTS, re-verified live 2026-08-23 from plain Node with the polite
// identity. www.mazdausa.com/robots.txt is 200 and disallows only
// /EPiServer/CMS/, /Util/ and /component-library/ for User-agent: * — none of
// the paths below — plus a named block list of bots we are not one of.
//
//  1. DEALER ROSTER: GET /handlers/dealer.ajax?ps=100&p=N
//     → {body:{results:[{id,name,city,state,zip,webUrl,…}], total}}
//     With no zip it is the WHOLE national roster, ordered by dealer id, and
//     `ps` caps at 100 however much you ask (200 returns 100). 548 dealers in
//     6 requests, 49 states. This roster is load-bearing twice over: it is the
//     only source of a dealer's city/state (the inventory record carries a
//     bare dealerId), and it is the set the search is scoped BY.
//
//  2. SEARCH: GET /api/inv/search?vc=&yr=&cond=&dlrId=&s=d&p=&ps=
//     → {body:{results:[…], total}} or, on a bad query, an ARRAY of
//       {errorCode,errorMessage} — a 200 either way, so the shape IS the
//       status and every call checks it.
//     Four things about this endpoint cost time to find and are why the lane
//     is shaped the way it is:
//       - `dlrId` is REQUIRED. Omit it and every query returns
//         IVSERRDEALERIDINV. There is no zip/radius knob and no national
//         mode: the search is dealer-scoped, always.
//       - `dlrId` takes a COMMA LIST, and that is what makes a national pull
//         cheap. One dealer returned 34 cars, two returned 37. The ceiling is
//         the URL: 250 ids (2,079 chars) answers 200, 300 ids (~2,479) answers
//         a bare 404. DEALER_CHUNK is 200, which leaves room for the year list.
//       - `yr` is REQUIRED and also takes a comma list, and it UNIONS rather
//         than picking one: at a fixed 50-dealer chunk, 2024 returned 1, 2025
//         returned 1, 2026 returned 162, and "2024,2025,2026" returned 164.
//         So the whole year window is one query. `yr=all` and `yr=0` return 0,
//         not everything — a silent empty, which is why the window is explicit.
//       - `ps` is honoured but CAPS AT 20 (ps=50, ps=100 and ps=500 all return
//         20; the default is 10). `p` paginates, and a page past the end
//         returns total=0 with an empty results array — a real end-of-list
//         signal, so the walk stops on a short/empty page and never on
//         arithmetic.
//     `cond` is n (new) or c (certified). There is no third value: cond=u
//     returns IVSERRCONDINV, so Mazda's own tool has no plain-used lot and
//     this lane cannot invent one.
//
//  3. CATALOGUE: GET /api/vehicles/model/{modelCode} → {body:{carlineCode,
//     title, isEvModel, year, trims:[…]}}. This is the DISCOVERY step and the
//     powertrain gate, below.
//
// ============================================================================
// WHAT COUNTS AS ELECTRIFIED, and why the CARLINE is the gate.
//
// The failure mode this house cares about most is a conventional hybrid
// shipped as a plug-in, and Mazda sells exactly such a car: the CX-50 Hybrid.
// Two facts make the separation structural rather than a name guess:
//
//   - Mazda files the plug-in as its OWN CARLINE. The catalogue's model codes
//     for 2026 are 26C90 → carline C90 "MAZDA CX-90" and 26C9P → carline C9P
//     "MAZDA CX-90 PHEV"; likewise C70/C7P for the CX-70. `vc` is a
//     server-side filter over that distinction and it does not leak. Control
//     test run 2026-08-23 against the same 100-dealer chunk at the same
//     moment: vc=C90 returned 2,889 rows whose every carlineName is "CX-90"
//     and every engine "3.3L e-SKYACTIV®-G Inline 6-Cyl"; vc=C9P returned 307
//     whose every carlineName is "CX-90 PHEV" and every engine
//     "2.5L e-SKYACTIV®-PHEV 4-Cyl". Disjoint, both ways.
//   - The catalogue TITLE carries the plug-in designation and the mild/strong
//     hybrids do not: "MAZDA CX-90 PHEV" and "MAZDA CX-70 PHEV" against
//     "MAZDA CX-50 HYBRID", "MAZDA CX-90", "MAZDA CX-70".
//
// What is NOT a gate, and the traps are worth naming because each one looks
// like one:
//   - The catalogue's per-trim `fuel` field reads "Hybrid" for the CX-90 PHEV
//     AND for the CX-50 Hybrid. Gating on it would publish a conventional
//     hybrid as a plug-in.
//   - The inventory page's own nav groups models under data-type="electrified"
//     — and that group is {2650H, 26C9P, 26C7P}, i.e. it contains the CX-50
//     Hybrid. Mazda's marketing category is not a powertrain claim.
//   - `isEvModel` is a BEV flag, false on both PHEVs (correctly). It is the
//     gate for the MX-30 EV and nothing else.
//
// vPIC control, 2026-08-23, VINs sampled live from each query at the same
// moment (scraper/lib/nhtsa.mjs's decode, ElectrificationLevel):
//   C9P new x5, C7P new x5, C9P certified x3 → all "PHEV (Plug-in Hybrid
//     Electric Vehicle)", FuelTypePrimary Electric / Secondary Gasoline
//   M30 certified x1 (JM1DRADB1P0200162) → "BEV (Battery Electric Vehicle)"
//   C90 new x4 → "Mild HEV", C70 new x3 → "Mild HEV", 50H new x4 →
//     "Strong HEV" — all three refuted by lib/ev.mjs's vpicRefutesEv, and
//     none of them returned by a C9P/C7P/M30 query.
//
// A row still has to agree with the carline it came back from: toRecord
// re-reads the row's own carlineName and engine and drops anything that does
// not restate the plug-in (or EV) designation. The query is trusted and the
// car is checked.
//
// Rows ship as evKind PHEV/BEV at evConfidence "high" on a NAMEPLATE claim
// (Mazda's own carline name), which puts every one of them in vpic-enrich's
// fuelTextOnly hold — vPIC is asked about all of them and demotes anything it
// refutes. Same standing as lib/oem/stellantis-cpo.mjs's 4xe rows.
//
// ============================================================================
// WHY recheck.mjs MUST SKIP THIS DOMAIN.
//
// The per-VIN page is fake-alive. Measured 2026-08-23:
// /shopping-tools/inventory/new/2026-mazda-cx-90-phev?vin=<real VIN> answers
// 200/587,802 bytes and ?vin=JM3KKCHA8T1000000 — a VIN that does not exist —
// answers 200/438,743 bytes, with the fabricated VIN echoed in the body
// (it comes back out of the query string) and dealer price markup on both.
// So the page can never say "gone": a VIN-present check calls a dead car
// alive and a byte-size check is a coin flip. This lane certifies its own
// sweep complete instead, exactly as vw.mjs and toyota.mjs do for the same
// measured reason, and OEM_LOCATOR_DOMAINS below is what tells recheck so.
import { fetchRaw, politeGetJson } from "../http.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";
// The roster shouts every dealer name ("CLASSIC MAZDA"); its cities are
// already title-cased.
import { titleCaseIfShouty } from "./title-case.mjs";

export const MAZDA = {
  key: "mazda",
  domain: "mazdausa.com",
  make: "Mazda",
  host: "https://www.mazdausa.com",
  search: "https://www.mazdausa.com/api/inv/search",
  roster: "https://www.mazdausa.com/handlers/dealer.ajax",
  catalogue: "https://www.mazdausa.com/api/vehicles/model",
  inventoryPage: "https://www.mazdausa.com/shopping-tools/inventory",
  // Floor for the completeness gate. Measured 2026-08-23 over the first 100
  // dealers alone: 307 CX-90 PHEV + 157 CX-70 PHEV new, 62 + 24 certified.
  // 300 nationally would mean the plug-in lineup had all but disappeared.
  minExpected: 300,
};

// recheck.mjs skips these — the per-VIN page is fake-alive (header).
export const OEM_LOCATOR_DOMAINS = new Set([MAZDA.domain]);

// Carlines that are no longer in the current-year lineup but whose used stock
// still turns up. The MX-30 EV is the only battery-electric car Mazda has ever
// sold in the US (2022-23, California only), and its catalogue file still
// resolves — so it is discovered through exactly the same door as everything
// else rather than hardcoded as a claim: /api/vehicles/model/23M30 answers
// carlineCode M30, title "Mazda MX-30 EV", isEvModel true. Live 2026-08-23 it
// had one certified car left in the first 100 dealers, decoding BEV at vPIC.
const LEGACY_MODEL_CODES = ["23M30"];

// A catalogue title that claims a plug. Mazda writes it "PHEV" on both cars;
// "plug-in" is accepted too so a future nameplate spelled the long way is not
// silently dropped. Deliberately does NOT match "HYBRID" — that is the CX-50
// Hybrid, a conventional hybrid, and matching it is the whole failure mode.
const PHEV_TITLE_RE = /\bphev\b|plug[\s-]?in/i;
// The same claim restated by the row itself (carlineName "CX-90 PHEV", engine
// "2.5L e-SKYACTIV®-PHEV 4-Cyl" / "2.5L E-SKYACTIV PHEV").
const PHEV_ROW_RE = /\bphev\b|plug[\s-]?in/i;
// A row's own battery-electric claim: carlineName "MX-30 EV PP FWD", engine
// "E-SKYACTIV EV". \b on both sides so the EV inside "PHEV" cannot match it.
const BEV_ROW_RE = /\bev\b|\belectric\b/i;
// Titles that LOOK electrified but that this lane refuses to classify, so a
// nameplate nobody has thought about is a loud note rather than a silent
// omission. "HYBRID" alone is deliberately absent: the CX-50 Hybrid is a
// conventional hybrid, correctly out of scope, and noting it every night
// would train the reader to ignore this line.
const WATCH_RE = /\bphev\b|plug[\s-]?in|\bev\b|electric|\be-?skyactiv ev\b|\b6e\b/i;

// The year window the search is asked for. `yr` is required and unions a
// comma list, so this is one query rather than nine. Six years back covers
// Mazda's certified programme (and the 2022-23 MX-30 while it lasts); two
// forward covers stock that lands before the calendar does.
const YEAR_BACK = 6;
const YEAR_FORWARD = 2;

const ROSTER_PAGE = 100;   // `ps` caps here whatever you ask
const DEALER_CHUNK = 200;  // 250 ids answers 200, 300 answers 404 — see header
const PAGE_SIZE = 20;      // `ps` caps here too
const MAX_PAGES = 400;     // 8,000 cars per (chunk, carline, condition)
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

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/\bAWD\b|ALL.?WHEEL/.test(s)) return "AWD";
  if (/\bRWD\b|REAR/.test(s)) return "RWD";
  if (/\bFWD\b|FRONT/.test(s)) return "FWD";
  return undefined;
};

// Mazda's own asset URLs carry an explicit ":443" ("https://www.mazdausa.com
// :443/siteassets/…"), which is legal but breaks naive string matching
// downstream and looks broken in a src attribute. Certified cars' photos come
// from mazda.assets.shiftdigitalinventory.com and need no repair.
export function cleanImage(u) {
  const s = String(u ?? "");
  if (!s.startsWith("https://")) return undefined;
  return s.replace(/^https:\/\/([^/:]+):443\//, "https://$1/");
}

/** "MAZDA CX-90 PHEV" → "CX-90 PHEV"; "Mazda MX-30 EV" → "MX-30 EV". The
 *  catalogue title is the model name this lane publishes, because the row's
 *  own carlineName is the model on a new car ("CX-90 PHEV") and the model
 *  PLUS trim on a certified one ("CX-90 PHEV PREMIUM"). One name for both. */
export function modelFromTitle(title) {
  const t = String(title ?? "").trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  const stripped = t.replace(/^mazda\s+/i, "").trim();
  if (!stripped) return undefined;
  // Mazda shouts its 2026 titles ("MAZDA CX-90 PHEV") and title-cases the
  // older ones ("Mazda MX-30 EV"). Normalise the shouting, keep the tokens.
  return stripped === stripped.toUpperCase()
    ? stripped
        .toLowerCase()
        .replace(/\b([a-z])/g, (m) => m.toUpperCase())
        .replace(/\bPhev\b/g, "PHEV")
        .replace(/\bEv\b/g, "EV")
        .replace(/\bCx-/g, "CX-")
        .replace(/\bMx-/g, "MX-")
    : stripped;
}

/** What a catalogue entry claims, or undefined. `isEvModel` is Mazda's own
 *  battery-electric flag; the title's PHEV token is its own plug-in
 *  designation. Nothing else in the file is consulted — see the header on why
 *  the per-trim `fuel` field and the "electrified" nav group are not gates. */
export function carlineKind(entry) {
  if (!entry) return undefined;
  if (entry.isEvModel === true) return "BEV";
  if (PHEV_TITLE_RE.test(String(entry.title ?? ""))) return "PHEV";
  return undefined;
}

/** Does the row itself restate the powertrain its carline claims? The query is
 *  server-side and control-tested (header), but a car is admitted on its own
 *  evidence, not on the filter that found it. A row carrying neither a
 *  carlineName nor an engine says nothing and is dropped rather than assumed —
 *  4 of 20 CX-50 Hybrid rows in the 2026-08-23 sample had both fields null,
 *  so the empty case is real. */
export function rowConfirms(row, kind) {
  const text = `${row?.carlineName ?? ""} ${row?.engine ?? ""}`.trim();
  if (!text) return false;
  if (kind === "PHEV") return PHEV_ROW_RE.test(text);
  if (kind === "BEV") return BEV_ROW_RE.test(text) && !PHEV_ROW_RE.test(text);
  return false;
}

/** The condition this row publishes, read off the machine token rather than
 *  the query we happened to send. Mazda slugs its own detail URL /new/ or
 *  /cpo/, and the two lots carry different fields (msrp on new, cpoPrice +
 *  mileage on certified). A row whose URL disagrees with the lot it came back
 *  from is dropped: it is one claim contradicting another, and lib/condition
 *  .mjs exists because an else-branch guess published 678 new cars as used.
 *  @returns {"new"|"certified"|undefined} */
export function conditionOf(row, cond) {
  const path = String(row?.detailUrl ?? "");
  const slug = /\/inventory\/cpo\//.test(path) ? "certified" : /\/inventory\/new\//.test(path) ? "new" : undefined;
  if (!slug) return undefined;
  const asked = cond === "c" ? "certified" : "new";
  return slug === asked ? slug : undefined;
}

/** One search row → a normalized listing, or null if it fails a gate.
 *  `carline` is {code, kind, model}; `dealer` is the roster entry. */
export function toRecord(row, carline, dealer, cond) {
  const vin = String(row?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(row.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  if (!rowConfirms(row, carline.kind)) return null;
  const condition = conditionOf(row, cond);
  if (!condition) return null;
  const certified = condition === "certified";

  // Trim: the certified feed mashes model and trim into carlineName
  // ("CX-90 PHEV PREMIUM") and puts a bare code in trimName ("PR"); the new
  // feed puts the model in carlineName and a real name in trimName ("PHEV
  // Premium Sport"). Strip the model off carlineName first and fall back to
  // trimName, so both lots name the same car the same way.
  const clean = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
  const MODEL = carline.model.toUpperCase();
  const cn = clean(row.carlineName);
  const fromCarline = cn.toUpperCase().startsWith(MODEL) ? cn.slice(carline.model.length).trim() : "";
  // The new feed's trimName sometimes repeats the model ("CX-70 PHEV Premium")
  // and sometimes does not ("PHEV Premium Sport"); either way the model
  // belongs in `model`, so it comes off here rather than printing twice.
  const tn = clean(row.trimName);
  const fallback = tn.toUpperCase().startsWith(MODEL) ? tn.slice(carline.model.length).trim() : tn;
  const trim = fromCarline || (fallback.length > 2 ? fallback : undefined);

  // Price. New rows publish msrp, certified rows cpoPrice; they are different
  // numbers on different lots, so they get different provenance tags and can
  // never pair into a price cut nobody made (lib/price-provenance.mjs). A
  // number under the year's junk floor is a payment, not an ask, and is
  // dropped rather than printed (lib/price-floor.mjs).
  //
  // cpoPrice is not always a number: 33 of 464 certified rows in the
  // 2026-08-23 national sweep carry the literal string "Contact Dealer"
  // (e.g. JM3KJEHA2S1105885, a 15,693-mile 2025 CX-70 PHEV). num() abstains
  // on it, which is the whole point — the car still publishes, without a
  // price it does not have.
  const floor = priceFloor({ isNew: !certified, year });
  const msrp = num(row.msrp);
  const cpo = num(row.cpoPrice);
  const priced = certified ? cpo : msrp;
  const { priceUsd, priceProvenance } = pickTaggedPrice(
    "mazda",
    certified ? [["cpoPrice", priced != null && priced >= floor ? priced : undefined]]
              : [["msrp", priced != null && priced >= floor ? priced : undefined]]
  );

  const images = (Array.isArray(row.images?.vehicle) ? row.images.vehicle : [])
    .map(cleanImage)
    .filter(Boolean)
    .slice(0, 8);
  const state = US_STATES.has(String(dealer?.state ?? "").toUpperCase()) ? String(dealer.state).toUpperCase() : undefined;
  const zip = /^\d{5}/.test(String(dealer?.zip ?? "")) ? String(dealer.zip).slice(0, 5) : undefined;
  const detail = String(row.detailUrl ?? "");

  return {
    vin,
    year,
    make: MAZDA.make,
    model: carline.model,
    trim,
    priceUsd,
    priceProvenance,
    mileage: certified ? num(row.mileage) : undefined,
    driveLine: drive(row.drivetrain),
    exteriorColor: row.extColor?.description || undefined,
    interiorColor: row.intColor?.description || undefined,
    dealerName: titleCaseIfShouty(dealer?.name) || undefined,
    dealerCode: String(row.dealerId ?? "") || undefined,
    city: dealer?.city || undefined,
    state,
    zip,
    certified: certified || undefined, // ingest maps this to "certified"
    condition,
    imageUrl: images[0],
    images,
    sourceUrl: detail.startsWith("/") ? `${MAZDA.host}${detail}` : MAZDA.inventoryPage,
    dealerDomain: MAZDA.domain,
    evKind: carline.kind,
    // Mazda's own designation for the carline, restated per row by the engine
    // string this record was checked against.
    fuelType: carline.kind === "PHEV" ? "Plug-in Hybrid" : "Electric",
    // A nameplate claim (Mazda's own carline), so vpic-enrich's fuelTextOnly
    // hold asks vPIC about every one of these — see the header.
    evConfidence: "high",
    platform: "mazda-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// ── plumbing ───────────────────────────────────────────────────────────────

async function getJson(url, report, { attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const r = await politeGetJson(url, { headers: { referer: MAZDA.inventoryPage } });
    report.fetched++;
    if (r.status === "robots_disallowed") { report.errors.push(`robots disallows ${url.slice(0, 80)}`); return null; }
    if (r.status === 200 && r.json) return r.json;
    const transient = String(r.status).startsWith("error:") || r.status === 429 || r.status >= 500;
    if (!transient) { report.errors.push(`${r.status} ${url.slice(0, 110)}`); return null; }
    await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
  }
  report.errors.push(`failed after retries: ${url.slice(0, 110)}`);
  return null;
}

const searchUrl = (params) => {
  const u = new URL(MAZDA.search);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

/** The whole national dealer roster, id → {name, city, state, zip}. Returns
 *  null on any failure: without it the search has nothing to be scoped by, and
 *  a partial roster would certify a partial country. */
async function fetchRoster(report, log) {
  const roster = new Map();
  let total = null;
  for (let page = 1; page <= 40; page++) {
    const j = await getJson(`${MAZDA.roster}?ps=${ROSTER_PAGE}&p=${page}`, report);
    if (!j) return null;
    const body = j.body ?? {};
    const rows = Array.isArray(body.results) ? body.results : [];
    if (total === null) total = Number(body.total) || null;
    for (const d of rows) {
      const id = String(d?.id ?? "");
      if (id) roster.set(id, { id, name: d.name, city: d.city, state: d.state, zip: d.zip });
    }
    if (!rows.length) break; // short/empty page — the end, not arithmetic
  }
  log(`mazda: roster ${roster.size} dealers (reported ${total})`);
  if (!roster.size) { report.errors.push("dealer roster empty"); return null; }
  if (total && roster.size < total) { report.errors.push(`roster ${roster.size}/${total}`); return null; }
  report.notes.push(`dealer roster ${roster.size} dealers`);
  return roster;
}

/** Which carlines this lane pulls, discovered rather than hardcoded: the
 *  inventory page's own model nav gives the current lineup's model codes, and
 *  each code's catalogue file says what the car is. Returns null on failure —
 *  an empty discovery must not be read as "Mazda sells no plug-ins". */
async function discoverCarlines(report, log) {
  const page = await fetchRaw(MAZDA.inventoryPage, { timeoutMs: 25000 });
  report.fetched++;
  if (page.status !== 200 || !page.body) { report.errors.push(`inventory page ${page.status}`); return null; }
  const codes = [...new Set([...page.body.matchAll(/data-model="([0-9A-Za-z]{4,8})"/g)].map((m) => m[1].toUpperCase()))];
  if (!codes.length) { report.errors.push("no data-model codes on the inventory page — the nav changed"); return null; }
  const all = [...new Set([...codes, ...LEGACY_MODEL_CODES])];
  log(`mazda: catalogue codes ${all.join(",")}`);

  const carlines = [];
  const watched = [];
  for (const code of all) {
    const j = await getJson(`${MAZDA.catalogue}/${code}`, report);
    const entry = j?.body;
    if (!entry?.carlineCode) continue; // a code with no catalogue file says nothing
    const kind = carlineKind(entry);
    const title = String(entry.title ?? "");
    if (!kind) {
      if (WATCH_RE.test(title)) watched.push(`${code} "${title}"`);
      continue;
    }
    const model = modelFromTitle(title);
    if (!model) continue;
    carlines.push({ code: String(entry.carlineCode).toUpperCase(), kind, model, title });
  }
  // Dedupe on the carline code: a model code exists per year, and the legacy
  // list can name a year the nav already covers.
  const byCode = new Map(carlines.map((c) => [c.code, c]));
  const picked = [...byCode.values()];
  for (const w of watched) report.notes.push(`WATCH: electrified-looking model not classified — ${w}`);
  if (!picked.length) { report.errors.push("no electrified carline found in the catalogue"); return null; }
  log(`mazda: carlines ${picked.map((c) => `${c.code}=${c.model}/${c.kind}`).join(", ")}`);
  report.notes.push(`carlines ${picked.map((c) => `${c.code} ${c.model} (${c.kind})`).join("; ")}`);
  return picked;
}

/** Page one (dealer chunk, carline, condition) to exhaustion. Adds rows to
 *  byVin; returns {rows, total, ok} where ok is false if the walk did not
 *  cover the total the service itself reported. */
async function walk({ chunk, carline, cond, years, roster, byVin, report, log }) {
  let total = null;
  let rows = 0;
  let missingDealer = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const j = await getJson(
      searchUrl({ vc: carline.code, yr: years, cond, dlrId: chunk.join(","), s: "d", p: String(p), ps: String(PAGE_SIZE) }),
      report
    );
    if (!j) return { rows, total, ok: false };
    const body = j.body;
    if (Array.isArray(body)) {
      // The endpoint's validation errors come back as a 200 with an array
      // body — the shape IS the status here.
      report.errors.push(`${carline.code}/${cond}: ${body.map((e) => e.errorCode).join(",")}`);
      return { rows, total, ok: false };
    }
    const results = Array.isArray(body?.results) ? body.results : [];
    if (p === 1) total = Number(body?.total) || 0;
    if (!results.length) break; // short/empty page = the end
    for (const row of results) {
      rows++;
      const dealer = roster.get(String(row?.dealerId ?? ""));
      if (!dealer) { missingDealer++; continue; }
      const rec = toRecord(row, carline, dealer, cond);
      if (rec) byVin.set(rec.vin, rec);
    }
    if (results.length < PAGE_SIZE) break; // short page = the end
  }
  if (missingDealer) report.errors.push(`${carline.code}/${cond}: ${missingDealer} rows named a dealer outside the roster`);
  const ok = total === null || rows >= total;
  if (!ok) report.errors.push(`${carline.code}/${cond}: walked ${rows} of ${total} reported`);
  log(`mazda/${carline.model} (${cond === "c" ? "cpo" : "new"}): ${rows} rows of ${total} reported, ${byVin.size} cumulative VINs`);
  return { rows, total, ok };
}

/** Pull Mazda's complete national plug-in (and MX-30) inventory, new AND
 *  certified. crawl.mjs-shaped report on the real domain; truncated:false
 *  certifies the sweep and lets db-sync delist (see gm.mjs).
 *
 *  New and certified are pulled TOGETHER on purpose. They share mazdausa.com,
 *  and certifying the domain complete on a half-pull would delist the other
 *  half — the rule kia.mjs states for the same reason. */
export async function pullMazda({ log = () => {} } = {}) {
  const report = { domain: MAZDA.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  const carlines = await discoverCarlines(report, log);
  if (!carlines) { report.truncated = true; return report; }
  const roster = await fetchRoster(report, log);
  if (!roster) { report.truncated = true; return report; }

  const now = new Date().getFullYear();
  const years = Array.from({ length: YEAR_BACK + YEAR_FORWARD + 1 }, (_, i) => now - YEAR_BACK + i).join(",");
  const ids = [...roster.keys()];
  const chunks = [];
  for (let i = 0; i < ids.length; i += DEALER_CHUNK) chunks.push(ids.slice(i, i + DEALER_CHUNK));

  const byVin = new Map();
  let allOk = true;
  let reported = 0;
  let walked = 0;
  for (const carline of carlines) {
    for (const cond of ["n", "c"]) {
      for (const chunk of chunks) {
        const r = await walk({ chunk, carline, cond, years, roster, byVin, report, log });
        allOk &&= r.ok;
        reported += r.total ?? 0;
        walked += r.rows;
      }
    }
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const certified = report.evs.filter((e) => e.certified).length;
  report.notes.push(
    `${report.evs.length} electrified Mazdas (${report.evs.length - certified} new, ${certified} certified) from ${walked} rows over ${reported} reported, ${chunks.length} dealer chunks, ${report.fetched} requests`
  );
  log(`mazda: ${report.evs.length} cars (${certified} certified), ${report.fetched} requests, ${report.errors.length} errors`);
  // Completeness (gm.mjs): every walk reached its own reported total and ended
  // on a short/empty page, no errors, and yield over the floor. The floor
  // guards against the API answering an empty set, which must not delist Mazda.
  report.truncated = !allOk || report.errors.length > 0 || byVin.size < MAZDA.minExpected;
  return report;
}
