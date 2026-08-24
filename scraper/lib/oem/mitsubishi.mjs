// Mitsubishi's national inventory locator — clickshop.mitsubishicars.com, an
// AutoFi ("powered by Drive") BFF that is the OEM's own shop-online store and
// carries every US rooftop's stock in one index.
//
// oem-locator.mjs's header probed this in the BEV era and recorded a correct
// negative: no battery-electric Mitsubishi is on sale here, the 2027 Eclipse
// Sportback EV is still "Coming Soon". What that verdict also found — a 572-car
// "Hybrid" bucket that is the Outlander PHEV — became in-scope on 2026-08-23,
// when the OEM lanes started carrying plug-ins. This is that lane. Re-measured
// live for this build: 611 Outlander PHEVs nationally, 197 dealers, 44 states.
//
// ============================================================================
// THE ENDPOINT, re-verified live 2026-08-23 from plain Node with the polite
// identity. clickshop.mitsubishicars.com/robots.txt is 200 and reads
// "User-agent: * / Allow: /" — the whole site, including /api/graphql.
//
//   POST https://clickshop.mitsubishicars.com/api/graphql?<OperationName>
//   body {operationName, query, variables}
//
// Introspection is off, so the operations and their selection sets were read
// out of the site's own _next chunks (and the request shapes confirmed by
// watching the live page's fetches). Three are used here:
//
//   SearchVehiclesTotal(input:{filters}) -> {total}
//     The service's own count for a filter set. This is the completeness
//     yardstick: the walk is checked against it, not against arithmetic.
//   VehiclesSummary(input:{filters}) -> {summary:{fuelTypes[], models[], …}}
//     The facets. With filters:{} they describe the WHOLE national index,
//     which is what makes the partition proof below possible.
//   SearchVehicles(input:{filters, options:{limit, offset, sort}}) -> vehicles
//     + pagination{limit, offset, hasNextPage, total}
//     The card query the page itself sends omits fuelType; the same operation
//     with the richer selection set (also in the bundle, used by another
//     screen) returns fuelType, engine, msrp and stockNumber, so this lane
//     asks for that one and gets a per-record powertrain field.
//
// Two things worth knowing before touching this:
//   - filters:{} means NATIONAL. There is no zip and no distance, and the
//     answer is the entire index (12,509 vehicles). A covering grid would be
//     pure waste here; `zip` and `distance` exist only to sort by proximity.
//   - `limit` is honoured up to at least 1,000 (one request returned all 611
//     plug-ins). The lane still pages at 200 with hasNextPage, because a cap
//     that moves would silently truncate a single-shot pull and the paged walk
//     ends on a short page instead.
//
// ============================================================================
// WHAT COUNTS AS ELECTRIFIED, and why the MODEL is the gate.
//
// Mitsubishi sells one plug-in in the US and five cars that are not, and the
// house's worst failure would be shipping one of the five as a plug-in. Three
// measurements make the separation structural, all taken 2026-08-23 within
// minutes of each other:
//
//   1. The MODEL facet files the plug-in separately: Outlander Sport, Eclipse
//      Cross, Outlander, Outlander PHEV, Mirage G4, Mirage. "Outlander PHEV"
//      is its own model, not a trim of "Outlander", and `model` is a
//      server-side filter over that distinction.
//   2. The filter does not leak, in either direction:
//        model "Outlander PHEV"                    -> 611
//        fuelType "Hybrid"                         -> 611
//        model "Outlander PHEV" + fuelType Hybrid  -> 611
//        model "Outlander"      + fuelType Hybrid  ->   0
//        model "Outlander"                         -> 6,607
//      So the plug-in model and the Hybrid fuel bucket are the SAME 611 cars,
//      and the conventional Outlander is disjoint from both.
//   3. The fuel facet partitions the entire index: Gasoline 11,898 + Hybrid
//      611 = 12,509 = the national total, and fuelType "Electric" returns 0.
//      Nothing electrified can be hiding in an unqueried bucket — which is
//      also the check that will notice the day the Eclipse Sportback EV lands.
//
// vPIC control, 2026-08-23, VINs sampled live from these same queries:
//   Outlander PHEV x6 -> ElectrificationLevel "PHEV (Plug-in Hybrid Electric
//     Vehicle)", FuelTypePrimary Electric / Secondary Gasoline
//   Outlander x4 -> "Mild HEV (Hybrid Electric Vehicle)", Gasoline primary
//   Eclipse Cross x3 -> level blank, Gasoline — all seven refuted by
//     lib/ev.mjs's vpicRefutesEv, and none returned by the PHEV query.
//
// The claim each row makes is "Mitsubishi's own catalogue calls this an
// Outlander PHEV", plus the fact that PHEV is the plug-in designation. That is
// a NAMEPLATE claim, so rows ship at evConfidence "high" and land in
// vpic-enrich's fuelTextOnly hold, where vPIC is asked about every one and
// demotes anything it refutes — the same standing as stellantis-cpo's 4xe
// rows. The per-record fuelType is checked too, but as a refutation ("Hybrid"
// alone never promotes anything, and "Gasoline" drops the row).
//
// ============================================================================
// WHAT THIS LANE IS NOT.
//
// New cars only. VehicleSearchFilters has no condition/certified/isNew field
// (probed by name; the schema's own "did you mean" suggestions offered none),
// every row's `age` reads "new", and the national mileage facet tops out at
// 9,830 — this is Mitsubishi's new-car store and it has no used or certified
// lot to pull. The i-MiEV and any used Outlander PHEV reach us only through
// dealer rooftops the crawl already covers.
//
// ============================================================================
// WHY recheck.mjs MUST SKIP THIS DOMAIN.
//
// The per-car page is a client-rendered shell. Measured 2026-08-23:
// /vehicle/10264393936/new/2026/Mitsubishi/Outlander%20PHEV/SEL%20S-AWC/
// JA4T5WA91TZ054612 and the same path with a fabricated id and VIN both answer
// 200 with a BYTE-IDENTICAL 10,517-byte body, and the VIN appears in it only
// because it is in the URL. This is exactly the vw.com case: rechecking it
// could not tell a sold car from a live one, and the "200 but no VIN" soft-gone
// rule would fire on the whole lane. This lane certifies its own sweep complete
// instead, and OEM_LOCATOR_DOMAINS below is what tells recheck so.
import { politePostJson } from "../http.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";
import { conditionToken } from "../condition.mjs";
// This feed shouts its dealer names ("CHERRY HILL MITSUBISHI") and the dealer
// directory shouts its cities; a card should not.
import { titleCaseIfShouty } from "./title-case.mjs";

export const MITSUBISHI = {
  key: "mitsubishi",
  domain: "mitsubishicars.com",
  make: "Mitsubishi",
  host: "https://clickshop.mitsubishicars.com",
  api: "https://clickshop.mitsubishicars.com/api/graphql",
  // Floor for the completeness gate. The national plug-in count measured 611
  // on 2026-08-23 and 572 in the earlier probe; 150 would mean the Outlander
  // PHEV had all but left the lineup, which is a thing to notice rather than
  // to certify.
  minExpected: 150,
};

// recheck.mjs skips this domain — the per-car page is fake-alive (header).
export const OEM_LOCATOR_DOMAINS = new Set([MITSUBISHI.domain]);

const REFERER = "https://clickshop.mitsubishicars.com/cars";

// Mitsubishi's own plug-in designation, as it appears in the model facet.
// "Hybrid" alone is deliberately NOT here: a conventional-hybrid Outlander is
// exactly the car this lane must never publish as a plug-in.
const PHEV_MODEL_RE = /\bphev\b|plug[\s-]?in/i;
// A battery-electric nameplate, for the day one ships. Mitsubishi has
// announced the Eclipse Sportback EV; when it appears in the facet this
// matches it and the lane picks it up without an edit.
const BEV_MODEL_RE = /\bev\b|\belectric\b/i;
// A fuel string that REFUTES an electrified claim. Used as a veto, never as a
// promotion: "Hybrid" is not evidence of a plug and is not in this list, and
// it is not in any promotion path either.
const FUEL_REFUTES_RE = /^\s*(gasoline|gas|diesel|flex|e-?85)\s*$/i;
// A model name that looks electrified but that this lane declined to classify,
// so a nameplate nobody has thought about is a loud note rather than a silent
// omission.
const WATCH_RE = /\bphev\b|plug[\s-]?in|\bev\b|electric|hybrid|sportback/i;

const PAGE = 200;         // `limit` is honoured well past this; see the header
const MAX_PAGES = 60;     // 12,000 rows, an order of magnitude over the lot
const DEALER_CHUNK = 100; // codes per getDealersByCodes call
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC")
    .split(" ")
);

// getDealersByCodes needs a zipCode to compute the `distance` it also returns.
// We do not read that distance; the argument is required, so it gets the
// geographic centre of the contiguous US and nothing turns on the choice.
const CENTER_ZIP = "66952";

const TOTAL_Q = `query SearchVehiclesTotal($input: SearchVehiclesTotalInput!) {
  searchVehiclesTotal(input: $input) { total }
}`;

const SUMMARY_Q = `query VehiclesSummary($input: VehiclesSummaryInput!) {
  vehiclesSummary(input: $input) {
    summary {
      fuelTypes { name }
      makes { name models { name } }
      models { name makes }
    }
  }
}`;

// The richer of the bundle's two SearchVehicles selection sets — the one that
// carries fuelType, engine, msrp and stockNumber (header).
const SEARCH_Q = `query SearchVehicles($input: SearchVehiclesInput!) {
  searchVehicles(input: $input) {
    vehicles {
      id age bodyType dealerCode dealerName make model trim year vin
      mileage sellingPrice msrp fuelType engine driveTrain transmission
      color colorInterior photoUrl
    }
    pagination { limit offset hasNextPage total }
  }
}`;

const DEALERS_Q = `query DealersByCodes($codes: [String!]!, $zipCode: String!) {
  getDealersByCodes(codes: $codes, zipCode: $zipCode) {
    code name websites address { city state street zip }
  }
}`;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/\bAWD\b|S-?AWC|ALL.?WHEEL|\b4WD\b/.test(s)) return "AWD";
  if (/\bRWD\b|REAR/.test(s)) return "RWD";
  if (/\bFWD\b|\b2WD\b|FRONT/.test(s)) return "FWD";
  return undefined;
};

/** What a model-facet name claims, or undefined. */
export function modelKind(name) {
  const s = String(name ?? "");
  if (PHEV_MODEL_RE.test(s)) return "PHEV";
  // Order matters: "Outlander PHEV" contains no bare "EV" token (the \b in
  // BEV_MODEL_RE sees to that), but testing the plug-in first says out loud
  // that a plug-in is never allowed to fall through to the BEV branch.
  if (BEV_MODEL_RE.test(s)) return "BEV";
  return undefined;
}

/** Does the row itself still support the claim its model made? The filter is
 *  server-side and control-tested (header), but a car is admitted on its own
 *  evidence. The row's model must restate the designation, and its fuelType
 *  must not contradict it — a bare "Gasoline" on a row the model facet called
 *  a plug-in is two of Mitsubishi's own fields disagreeing, and the honest
 *  answer to that is to drop the car, not to pick the field we like. */
export function rowConfirms(row, kind) {
  const model = String(row?.model ?? "");
  if (!model) return false;
  if (FUEL_REFUTES_RE.test(String(row?.fuelType ?? ""))) return false;
  return kind === "PHEV" ? PHEV_MODEL_RE.test(model) : kind === "BEV" ? BEV_MODEL_RE.test(model) && !PHEV_MODEL_RE.test(model) : false;
}

/** The car's own detail URL on the store, in the shape the site links:
 *  /vehicle/{id}/{age}/{year}/{make}/{model}/{trim}/{vin}. */
export function vdpUrl(row) {
  const parts = [row.id, row.age, row.year, row.make, row.model, row.trim, row.vin];
  if (parts.some((p) => p == null || String(p) === "")) return undefined;
  return `${MITSUBISHI.host}/vehicle/${parts.map((p) => encodeURIComponent(String(p))).join("/")}`;
}

/** One search row → a normalized listing, or null if it fails a gate.
 *  `dealer` is the resolved directory entry, or undefined if the roster
 *  lookup did not answer for this dealer code — the car still publishes, it
 *  just carries no city/state rather than a guessed one. */
export function toRecord(row, kind, dealer) {
  const vin = String(row?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(row.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  if (!rowConfirms(row, kind)) return null;

  // Condition from the machine token. `age` is the feed's own field and reads
  // "new" on every row of this store; conditionToken is what turns it into a
  // claim, and an unrecognised value publishes no condition at all rather than
  // defaulting to one (lib/condition.mjs).
  const condition = conditionToken(row.age);
  if (!condition) return null;

  // Price ladder: the dealer's selling price, then MSRP. Different rungs get
  // different provenance tags so a car that moves between them cannot publish
  // a price cut nobody made (lib/price-provenance.mjs). Below the year's junk
  // floor the number is a payment, not an ask, and is dropped.
  const floor = priceFloor({ isNew: condition === "new", year });
  const above = (v) => (v != null && v >= floor ? v : undefined);
  const { priceUsd, priceProvenance } = pickTaggedPrice("mitsubishi", [
    ["sellingPrice", above(num(row.sellingPrice))],
    ["msrp", above(num(row.msrp))],
  ]);

  const images = (Array.isArray(row.photoUrl) ? row.photoUrl : [row.photoUrl])
    .filter((u) => typeof u === "string" && u.startsWith("https://"))
    .slice(0, 8);
  const state = US_STATES.has(String(dealer?.state ?? "").toUpperCase()) ? String(dealer.state).toUpperCase() : undefined;
  const zip = /^\d{5}/.test(String(dealer?.zip ?? "")) ? String(dealer.zip).slice(0, 5) : undefined;
  return {
    vin,
    year,
    make: MITSUBISHI.make,
    model: String(row.model).trim(),
    trim: String(row.trim ?? "").trim() || undefined,
    priceUsd,
    priceProvenance,
    mileage: num(row.mileage),
    driveLine: drive(`${row.driveTrain ?? ""} ${row.trim ?? ""}`),
    exteriorColor: row.color || undefined,
    interiorColor: row.colorInterior || undefined,
    dealerName: titleCaseIfShouty(row.dealerName || dealer?.name) || undefined,
    dealerCode: String(row.dealerCode ?? "") || undefined,
    city: titleCaseIfShouty(dealer?.city) || undefined,
    state,
    zip,
    condition,
    imageUrl: images[0],
    images,
    sourceUrl: vdpUrl(row) ?? `${MITSUBISHI.host}/cars`,
    dealerDomain: MITSUBISHI.domain,
    evKind: kind,
    // Mitsubishi's own fuel string for this row. It is "Hybrid", which is NOT
    // a plug-in claim on its own — the plug-in claim is the nameplate, and
    // vPIC is the check (header). Published as served rather than upgraded.
    fuelType: row.fuelType || undefined,
    evConfidence: "high",
    platform: "mitsubishi-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// ── plumbing ───────────────────────────────────────────────────────────────

async function gql(op, query, variables, report, { attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const r = await politePostJson(`${MITSUBISHI.api}?${op}`, {
      headers: { referer: REFERER, origin: MITSUBISHI.host },
      body: { operationName: op, query, variables },
    });
    report.fetched++;
    if (r.status === "robots_disallowed") { report.errors.push(`robots disallows ${op}`); return null; }
    if (r.status === 200 && r.json?.data && !r.json.errors) return r.json.data;
    if (r.status === 200 && r.json?.errors) {
      // A GraphQL error on a 200 is an answer, not a transport hiccup: the
      // query or the schema is wrong and retrying cannot fix it.
      report.errors.push(`${op}: ${r.json.errors.map((e) => e.message).join("; ").slice(0, 160)}`);
      return null;
    }
    const transient = String(r.status).startsWith("error:") || r.status === 429 || r.status >= 500;
    if (!transient) { report.errors.push(`${op}: HTTP ${r.status}`); return null; }
    await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
  }
  report.errors.push(`${op}: failed after retries`);
  return null;
}

/** Which models this lane pulls, discovered from the national facets rather
 *  than hardcoded, plus the two proofs the header rests on: that the fuel
 *  facet still partitions the whole index, and that nothing electrified is
 *  sitting in a bucket we did not ask for. */
async function discover(report, log) {
  const sum = await gql("VehiclesSummary", SUMMARY_Q, { input: { filters: {} } }, report);
  if (!sum?.vehiclesSummary?.summary) { report.errors.push("no national summary"); return null; }
  const s = sum.vehiclesSummary.summary;
  const fuels = (s.fuelTypes ?? []).map((f) => String(f?.name ?? "")).filter(Boolean);
  const models = [...new Set((s.models ?? []).map((m) => String(m?.name ?? "")).filter(Boolean))];
  log(`mitsubishi: fuel facet [${fuels.join(", ")}], ${models.length} models`);

  const national = await gql("SearchVehiclesTotal", TOTAL_Q, { input: { filters: {} } }, report);
  const nationalTotal = national?.searchVehiclesTotal?.total;
  let partitioned = 0;
  for (const fuel of fuels) {
    const t = await gql("SearchVehiclesTotal", TOTAL_Q, { input: { filters: { fuelType: fuel } } }, report);
    const n = t?.searchVehiclesTotal?.total;
    if (n == null) return null;
    partitioned += n;
    report.notes.push(`fuel facet ${fuel}: ${n}`);
  }
  // The partition proof. If the fuel buckets stop summing to the whole index,
  // some rows carry a fuel the facet does not list — and one of them could be
  // the electrified car this lane exists to find. That is a loud note, not a
  // silent pass.
  if (nationalTotal != null && partitioned !== nationalTotal) {
    report.notes.push(`WATCH: fuel facets sum to ${partitioned} of ${nationalTotal} national vehicles — a bucket is unlisted`);
  } else if (nationalTotal != null) {
    report.notes.push(`fuel facets partition the national index exactly (${partitioned} of ${nationalTotal})`);
  }

  const picked = [];
  for (const name of models) {
    const kind = modelKind(name);
    if (kind) picked.push({ name, kind });
    else if (WATCH_RE.test(name)) report.notes.push(`WATCH: electrified-looking model not classified — "${name}"`);
  }
  if (!picked.length) {
    // Mitsubishi genuinely has no electrified nameplate on some future day;
    // that is a real answer, but it must not be mistaken for a broken query,
    // so it is an error that flips truncated rather than an empty success.
    report.errors.push(`no electrified model in the facet [${models.join(", ")}]`);
    return null;
  }
  log(`mitsubishi: models ${picked.map((p) => `${p.name}/${p.kind}`).join(", ")}`);
  return picked;
}

/** Page one model to exhaustion. Returns {rows, total, ok, dupSameDealer}. */
async function walkModel(m, byVin, rowsByVin, report, log) {
  let total = null;
  let rows = 0;
  let dupSameDealer = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const d = await gql(
      "SearchVehicles",
      SEARCH_Q,
      { input: { filters: { model: m.name }, options: { limit: PAGE, offset: page * PAGE, sort: [{ field: "stockNumber", order: "ASC" }] } } },
      report
    );
    if (!d?.searchVehicles) return { rows, total, ok: false, dupSameDealer };
    const vehicles = d.searchVehicles.vehicles ?? [];
    const pagination = d.searchVehicles.pagination ?? {};
    if (total === null) total = pagination.total ?? null;
    for (const v of vehicles) {
      rows++;
      const vin = String(v?.vin ?? "").toUpperCase();
      const seen = rowsByVin.get(vin);
      // A VIN repeating at the SAME dealer across pages means the backend's
      // paging is unstable under ties, and a page walk that repeats itself is
      // a sample, not the set — vw.mjs's rule. A VIN repeating at a DIFFERENT
      // dealer is a group co-listing, which is ordinary and merely noted.
      if (seen) { if (seen === String(v?.dealerCode ?? "")) dupSameDealer++; }
      else rowsByVin.set(vin, String(v?.dealerCode ?? ""));
      byVin.set(vin, v);
    }
    log(`mitsubishi/${m.name}: page ${page} → ${vehicles.length} rows, ${rows} of ${total} reported`);
    if (!vehicles.length || !pagination.hasNextPage) break; // short page = the end
  }
  const ok = total === null || rows >= total;
  if (!ok) report.errors.push(`${m.name}: walked ${rows} of ${total} reported`);
  if (dupSameDealer) report.errors.push(`${m.name}: ${dupSameDealer} VINs repeated at the same dealer across pages — paging unstable`);
  return { rows, total, ok, dupSameDealer };
}

/** dealerCode → {name, city, state, zip}, resolved in batches. A code the
 *  directory does not answer for is left unresolved: the car keeps its
 *  dealer name from the inventory row and carries no state, which is what
 *  lib/oem/zip-state.mjs's header calls the honest direction. */
async function resolveDealers(codes, report, log) {
  const out = new Map();
  for (let i = 0; i < codes.length; i += DEALER_CHUNK) {
    const batch = codes.slice(i, i + DEALER_CHUNK);
    const d = await gql("DealersByCodes", DEALERS_Q, { codes: batch, zipCode: CENTER_ZIP }, report);
    for (const dealer of d?.getDealersByCodes ?? []) {
      const code = String(dealer?.code ?? "");
      if (!code) continue;
      out.set(code, { name: dealer.name, city: dealer.address?.city, state: dealer.address?.state, zip: dealer.address?.zip });
    }
  }
  log(`mitsubishi: resolved ${out.size} of ${codes.length} dealer codes`);
  if (out.size < codes.length) report.notes.push(`${codes.length - out.size} dealer codes unresolved — those cars carry no state`);
  return out;
}

/** Pull Mitsubishi's complete national plug-in inventory. crawl.mjs-shaped
 *  report on the real domain; truncated:false certifies the sweep and lets
 *  db-sync delist (see gm.mjs). */
export async function pullMitsubishi({ log = () => {} } = {}) {
  const report = { domain: MITSUBISHI.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  const models = await discover(report, log);
  if (!models) { report.truncated = true; return report; }

  const rawByVin = new Map();
  const rowsByVin = new Map();
  const kindByVin = new Map();
  let allOk = true;
  let reported = 0;
  let walked = 0;
  for (const m of models) {
    const before = new Set(rawByVin.keys());
    const r = await walkModel(m, rawByVin, rowsByVin, report, log);
    for (const vin of rawByVin.keys()) if (!before.has(vin)) kindByVin.set(vin, m.kind);
    allOk &&= r.ok;
    reported += r.total ?? 0;
    walked += r.rows;
  }

  const codes = [...new Set([...rawByVin.values()].map((v) => String(v?.dealerCode ?? "")).filter(Boolean))];
  const dealers = await resolveDealers(codes, report, log);

  const evs = [];
  for (const [vin, row] of rawByVin) {
    const rec = toRecord(row, kindByVin.get(vin), dealers.get(String(row?.dealerCode ?? "")));
    if (rec) evs.push(rec);
  }
  report.evs = evs;
  report.vehiclePages = report.fetched;
  const coListed = walked - rawByVin.size;
  report.notes.push(
    `${evs.length} plug-ins from ${walked} rows over ${reported} reported (${coListed} rows were the same VIN at a second dealer), ${dealers.size} dealers, ${report.fetched} requests`
  );
  log(`mitsubishi: ${evs.length} cars, ${report.fetched} requests, ${report.errors.length} errors`);
  // Completeness (gm.mjs): every model walk reached the service's own reported
  // total and ended on a short page, no errors, and yield over the floor. The
  // floor guards against the API answering an empty set, which must not
  // delist the make.
  report.truncated = !allOk || report.errors.length > 0 || evs.length < MITSUBISHI.minExpected;
  return report;
}
