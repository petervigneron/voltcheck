// Audi dealer-network inventory (omnigraph.audi.com).
//
// This lane is not really "Audi's cars". Audi's used search returns the whole
// used stock of every Audi rooftop in the US — including the trade-ins, which
// are every make on the road. A single national sweep of the BEV facet returns
// ~2.5k used EVs of which fewer than half are Audis; the rest are Teslas, BMWs,
// VWs, Rivians and so on, sitting on Audi lots. That is the point of the lane:
// the OEM channel is the only public, structured route we have to used Teslas,
// which are ~44% of used BEV sales (WA title data) and which Tesla itself
// serves from behind an Akamai wall.
//
// Measured 2026-08-15: 2,483 unique used BEV VINs, of which a 497-VIN sample
// showed 387 (78%) absent from our listings table. Plus 2,123 new Audi BEVs.
//
// Discovery, for the next person: the endpoint is a federated Apollo router at
// omnigraph.audi.com/graphql, found by grepping www.audiusa.com's HTML for API
// hosts. Introspection is disabled, so the operation was read out of the
// inventory feature-app bundle — fa-vlp-list-page's app-alpha.js, which carries
// `query StockCarSearch(...)` and the variable shape verbatim. Same technique
// as honda.mjs (endpoint + params read from the client bundle, not guessed).
//
// Why this is fair game, and the control that shows it:
//   - www.audiusa.com/robots.txt disallows only /userinfo/. The inventory pages
//     and the app that calls this endpoint are permitted.
//   - The API host's own robots.txt is Akamai-403 (unreachable), so it states
//     no policy; robotsAllows() treats an unreachable robots.txt as "no rules",
//     which is the crawler's existing behaviour on every host, not a special
//     case carved out here.
//   - The endpoint answers a plain Node POST with real data. It requires the
//     two apollographql-client-* headers, and says so itself in a 400 that
//     names the missing headers — that is Apollo Router client identification,
//     the same class of requirement as the Origin/Referer that hyundai.mjs,
//     kia.mjs, genesis.mjs and honda.mjs already send. No challenge is solved,
//     no proxy rotated, no bot detection worked around.
//   - CONTROL: the identical client against Tesla's inventory API still gets a
//     403. We are not bypassing walls generally; this host simply has no wall.
//
// Completeness stance — deliberately does NOT certify, even though it could.
// Paging walks to resultNumber exactly (offset 2400 → 48 rows, offset 2500 →
// 15, summing to the advertised 2515), so the enumeration really is exhaustive
// and we could mark it complete and let db-sync delist by absence. We don't,
// for two reasons. Every row carries a real per-VIN dealer VDP, and a control
// test showed those VDPs return a hard 404 for a VIN that is not there while a
// live VIN returns 200 — so recheck can retire these rows one at a time on
// direct evidence, which is strictly better than inferring absence from one
// query. And the rows live under a synthetic domain that spans hundreds of real
// dealer domains, several of which the dealer crawl also covers; a
// completeness claim scoped to a domain that isn't a real site is exactly the
// kind of claim that goes wrong quietly. So: truncated always, and the domain
// is deliberately NOT in recheck's OEM_LOCATOR_DOMAINS skip set (same posture
// as honda.mjs and ford-blue-advantage.mjs).
//
// Query traps worth knowing before editing SELECTION below. Several StockCar
// subfields are non-nullable in the schema but unpopulated for non-Audi cars,
// and GraphQL null-propagation means one such car nulls the entire page of 200.
// Confirmed offenders: `model{id{code}}` and `colorInfo.exteriorColor.colorInfo`
// (use `baseColorInfo` instead). Every field below was bisected against a full
// page containing non-Audi records. Add fields only after re-running that test;
// the CORE_SELECTION fallback exists so a newly-poisoned field costs us the
// extra columns on one page rather than the 200 cars.
import { politePostJson } from "../http.mjs";
import { EV_MODEL_RE, EV_ONLY_WMIS } from "../ev.mjs";
import { isPhevDesignated } from "./phev-designator.mjs";
import { stateFromZip } from "./zip-state.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const AUDI = {
  key: "audi",
  // Synthetic: these cars sit on hundreds of different dealer domains and the
  // set is not any one site's inventory. Never certifies (see header).
  domain: "audi-network",
  make: "Audi",
  api: "https://omnigraph.audi.com/graphql",
  // Floor across both stock types. Well under the ~4.6k observed, so it fires
  // only if the fuel facet or the market identifier stops resolving.
  minExpected: 1500,
};

// Deliberately empty: recheck must NOT skip this domain. The rows carry real
// dealer VDPs that answer 404 when the car is gone, which is how they retire.
export const OEM_LOCATOR_DOMAINS = new Set();

const PAGE = 200; // server honours limit:200; the app itself asks for 48
const MAX_PAGES = 60; // runaway guard; ~4.6k cars is ~24 pages
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const FUEL_ELECTRIC = "E"; // BEV facet
// The hybrid facet, which is the only place this network's PLUG-INS live:
// probed 2026-08-23, fuel codes "X"/"PH"/"P" all return zero while "H"
// returns 749 used rows mixing Audi's own 55 TFSI e plug-ins with mild
// hybrids (A3/A4 40-45 TFSI), other makes' conventional hybrids (CR-V,
// Accord, UX 300h) and petrol trade-ins mis-filed under H (a 911 Carrera
// GTS). No structured electrification field exists on the record, so H rows
// are kept only when the maker's own plug-in designation appears in the
// title/subtitle/build string (lib/oem/phev-designator.mjs) — TFSI e, 4xe,
// Plug-In, T8, E-Hybrid, 330e/50e… — and everything else is dropped and
// counted. vpic-enrich re-verifies each kept VIN before it can publish, so
// the designation gate is the first check, not the only one.
const FUEL_HYBRID = "H";

// Headers the router requires, plus the site identity every other OEM lane
// sends. politePostJson supplies UA / X-Crawler / content-type.
const HEADERS = {
  origin: "https://www.audiusa.com",
  referer: "https://www.audiusa.com/",
  "apollographql-client-name": "fa-vlp-list-page",
  "apollographql-client-version": "5.29.3",
};

// Full selection — bisected safe against non-Audi records (see header).
const SELECTION = `
  vin weblink titleText subtitleText driveText
  model{name salesModelyear}
  modelInfo{genericModel{code text} modelyear}
  dealer{name city zip}
  carPrices{type price{value}}
  preUse{code text} qualityLabel{label}
  engineInfo{fuel{code}}
  mileage{value{number}}
  colorInfo{exteriorColor{baseColorInfo{text}} interiorColor{baseColorInfo{text}}}
  images(groupIds:["dealerImages"]){url}
`;

// Fallback when a page trips a non-nullable field: everything the listing
// genuinely needs, minus the decorative columns. If this fails too, the page
// is lost and recorded as an error.
const CORE_SELECTION = `
  vin weblink titleText
  model{name salesModelyear}
  modelInfo{genericModel{code text}}
  dealer{name city zip}
  carPrices{type price{value}}
  preUse{code} qualityLabel{label}
  engineInfo{fuel{code}}
  mileage{value{number}}
`;

const query = (sel) =>
  `query StockCarSearch($s:StockIdentifierInput!,$p:StockCarSearchParameterInput){` +
  `stockCarSearch(stockIdentifier:$s,searchParameter:$p){resultNumber results{cars{stockCar{${sel}}}}}}`;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/ALL.?WHEEL|AWD|QUATTRO/.test(s)) return "AWD";
  if (/REAR.?WHEEL|RWD/.test(s)) return "RWD";
  if (/FRONT.?WHEEL|FWD/.test(s)) return "FWD";
  return undefined;
};

// Makes whose name is more than one whitespace token, so the fallback split
// below doesn't cut them in half. Hyphenated names (Mercedes-Benz) are already
// a single token and need no entry.
const MULTIWORD_MAKES = ["Land Rover", "Alfa Romeo", "Aston Martin", "Rolls Royce"];

// titleText is "2021 Tesla Model X"; genericModel.text is the model alone
// ("Model X"). Stripping the year and then the model off the end leaves the
// make. Falls back to a leading-token split for records whose title carries no
// model at all (some Mercedes rows are just "2024 Mercedes-Benz").
//
// Audi's catalogue has no model file for most other makes' trade-ins, and
// buckets them into a "Sonstige" (German: "other") placeholder — the giveaway
// is genericModel.text echoing its own code, e.g. {code:"AVZZ",text:"AVZZ"}
// with model.name "Mercedes-Benz Sonst.Merc". Those carry no model name at
// all, so the model comes back undefined rather than as a code. Deliberately
// not filled from subtitleText: for these rows the subtitle is a trim
// ("eDrive40", "Scat Pack AWD", "4MATIC"), and promoting a trim to a model
// would be inventing the fact rather than reporting it.
function makeAndModel(c) {
  const title = String(c.titleText ?? "").replace(/^\s*\d{4}\s+/, "").trim();
  const gm = c.modelInfo?.genericModel;
  const placeholder = gm?.text != null && gm?.code != null && String(gm.text).trim() === String(gm.code).trim();
  const generic = placeholder ? undefined : String(gm?.text ?? "").trim() || undefined;
  if (generic && title.toLowerCase().endsWith(generic.toLowerCase())) {
    const make = title.slice(0, title.length - generic.length).trim();
    if (make) return { make, model: generic };
  }
  const multi = MULTIWORD_MAKES.find((m) => title.toLowerCase().startsWith(m.toLowerCase()));
  if (multi) return { make: multi, model: generic ?? (title.slice(multi.length).trim() || undefined) };
  const [first, ...rest] = title.split(/\s+/);
  return { make: first || undefined, model: generic ?? (rest.join(" ") || undefined) };
}

// Trim is only taken for Audi's own cars, where model.name is the full build
// string ("Audi A6 Sportback e-tron Premium quattro®") and the model name
// strips off cleanly to leave a real trim. For a traded-in Tesla, subtitleText
// is marketing prose ("Performance Dual Motor All-Wheel Drive"), not a trim —
// printing that as a trim would be inventing a fact, so it stays undefined and
// the vPIC/vin_variant lane names the version instead.
function trimOf(c, make, model) {
  if (!/^audi$/i.test(String(make ?? ""))) return undefined;
  const full = String(c.model?.name ?? "").trim();
  if (!full || !model) return undefined;
  const i = full.toLowerCase().indexOf(String(model).toLowerCase());
  if (i < 0) return undefined;
  const tail = full.slice(i + model.length).trim();
  return tail || undefined;
}

// "sale" is the advertised asking price; "final" is that plus doc fees, and
// "list" is the original sticker. Take the ask, and never the fee-inclusive
// number — the site compares asks to sold prices, so an ask inflated by fees
// would read as a car priced above its cohort.
// One named row out of the car's carPrices list. Split by type (was
// `sale ?? final` inline) so the ladder in toRecord can name which of the two
// actually supplied the number — a car moving between them is a field flip,
// not a dealer repricing. See lib/price-provenance.mjs.
function priceOf(c, type) {
  const by = new Map((c.carPrices ?? []).map((p) => [p.type, p.price?.value]));
  return num(by.get(type));
}

// The electric facet is NOT purely battery-electric, which cost us a false
// claim in testing: the first run surfaced a 2014 Chevrolet Volt (a plug-in
// hybrid) and a 2017 Toyota Mirai (hydrogen fuel cell) among the fuel=E rows,
// both of which would have shipped as "BEV, high confidence". Audi's facet
// evidently means "plugs in or has no tailpipe", not "battery-electric".
//
// So the facet alone doesn't certify anything. A record is claimed BEV-high
// only when a second, independent signal agrees: the VIN belongs to a maker
// that builds nothing but EVs, or the nameplate is one the shared classifier
// already knows. Everything else goes out as "name_match", which ingest.mjs
// holds back until vpic-enrich.mjs decodes the VIN and either promotes it to
// high or marks it vpic_refuted. That keeps the Volt and the Mirai out while
// still letting through real BEVs the model regex hasn't learned yet — the
// Rolls-Royce Spectre and Electrified G80 in this feed both take that path.
function evClaim(vin, make, model) {
  if (EV_ONLY_WMIS.has(vin.slice(0, 3))) return { evKind: "BEV", evConfidence: "high" };
  if (EV_MODEL_RE.test(`${make ?? ""} ${model ?? ""}`)) return { evKind: "BEV", evConfidence: "high" };
  return { evKind: "BEV?", evConfidence: "name_match" };
}

function conditionOf(c, stockCarsType) {
  if (stockCarsType === "NEW") return "new";
  const labels = (c.qualityLabel ?? []).map((q) => String(q?.label ?? "").toLowerCase());
  if (labels.some((l) => /cpo|certified/.test(l))) return "certified";
  return "used";
}

// `drops` tallies why rows were discarded, so a gate that starts eating the
// feed shows up in the nightly report instead of looking like thin inventory.
function toRecord(c, stockCarsType, fuelCode, drops) {
  const bad = (reason) => {
    drops[reason] = (drops[reason] ?? 0) + 1;
    return null;
  };
  const vin = String(c.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return bad("bad vin");
  // Structural gate. We query one fuel facet, but each record also carries
  // its own fuel code — trust the record, not just the filter.
  if (c.engineInfo?.fuel?.code && c.engineInfo.fuel.code !== fuelCode) return bad("fuel code != queried facet");
  // The hybrid facet's rows must additionally wear a maker plug-in
  // designation (see FUEL_HYBRID above) — a bare "hybrid" is not a claim
  // this site can stand behind.
  if (fuelCode === FUEL_HYBRID && !isPhevDesignated(`${c.titleText ?? ""} ${c.subtitleText ?? ""} ${c.model?.name ?? ""}`)) {
    return bad("hybrid without a plug-in designation");
  }
  const vdp = String(c.weblink ?? "");
  // No per-VIN dealer page means nothing recheck could ever verify, and this
  // lane certifies nothing on its own — such a row could never be retired.
  if (!/^https:\/\//.test(vdp)) return bad("no dealer VDP");
  const year = Number(c.model?.salesModelyear ?? c.modelInfo?.modelyear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return bad("implausible year");
  const { make, model } = makeAndModel(c);
  // ingest.mjs requires a model, and these rows genuinely have no model name
  // (Audi's "Sonstige" bucket — see makeAndModel). Dropped here, counted, so
  // the loss is stated rather than disappearing silently inside ingest.
  if (!make || !model) return bad("no model name (Audi 'Sonstige' trade-in bucket)");
  const zip = /^\d{5}/.test(String(c.dealer?.zip ?? "")) ? String(c.dealer.zip).slice(0, 5) : undefined;
  const images = (c.images ?? []).map((i) => i?.url).filter((u) => typeof u === "string").slice(0, 12);
  return {
    vin,
    year,
    make,
    model,
    trim: trimOf(c, make, model),
    ...pickTaggedPrice("audi", [
      ["sale", priceOf(c, "sale")],
      ["final", priceOf(c, "final")],
    ]),
    mileage: num(c.mileage?.value?.number),
    driveLine: drive(c.driveText ?? c.subtitleText),
    exteriorColor: c.colorInfo?.exteriorColor?.baseColorInfo?.text || undefined,
    interiorColor: c.colorInfo?.interiorColor?.baseColorInfo?.text || undefined,
    dealerName: c.dealer?.name || undefined,
    city: c.dealer?.city || undefined,
    state: stateFromZip(zip),
    zip,
    condition: conditionOf(c, stockCarsType),
    imageUrl: images[0],
    images,
    sourceUrl: vdp, // real dealer VDP — recheck verifies (404 when gone)
    dealerDomain: AUDI.domain,
    // The network's own fuel facet code, restated per record ("E"/"H");
    // plug-ins additionally carry their maker designation in the name.
    fuelType: fuelCode === FUEL_HYBRID ? "Hybrid (plug-in designated)" : "Electric",
    ...(fuelCode === FUEL_HYBRID ? { evKind: "PHEV", evConfidence: "high" } : evClaim(vin, make, model)),
    platform: "audi-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// One page. Retries once on a transient failure, then once more with the
// reduced selection if the router reports a missing upstream field (which
// nulls the whole page rather than the one bad car).
async function fetchPage(stockCarsType, fuelCode, offset, report) {
  const variables = {
    s: { marketIdentifier: { brand: "A", country: "us", language: "en" }, stockCarsType },
    p: { paging: { limit: PAGE, offset }, criteria: [{ id: "fuel", items: [fuelCode] }] },
  };
  for (const sel of [SELECTION, CORE_SELECTION]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await politePostJson(AUDI.api, { headers: HEADERS, body: { query: query(sel), variables } });
      report.fetched++;
      if (res.status === "robots_disallowed") {
        report.errors.push("robots disallows the inventory endpoint");
        return null;
      }
      if (res.status === 200 && res.json?.data?.stockCarSearch) {
        if (sel === CORE_SELECTION) report.notes.push(`${stockCarsType} offset ${offset}: fell back to core fields`);
        return res.json.data.stockCarSearch;
      }
      // A field the upstream VTP system didn't populate — reduced selection
      // may survive it, so stop retrying this selection and step down.
      const code = res.json?.errors?.[0]?.extensions?.code;
      if (code === "VTP_API_ERROR") break;
      if (res.json?.errors) {
        report.errors.push(`${stockCarsType} offset ${offset}: ${String(res.json.errors[0]?.message).slice(0, 120)}`);
        return null;
      }
      const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
      if (attempt === 0 && transient) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      report.errors.push(`${stockCarsType} offset ${offset}: HTTP ${res.status}`);
      return null;
    }
  }
  report.errors.push(`${stockCarsType} offset ${offset}: unpopulated field even on core selection`);
  return null;
}

// Walk one (stock type, fuel facet) to exhaustion, folding rows into byVin.
async function sweep(stockCarsType, fuelCode, byVin, report, log) {
  let offset = 0;
  let total = null;
  let kept = 0;
  const drops = {};
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchPage(stockCarsType, fuelCode, offset, report);
    if (!data) break;
    total ??= data.resultNumber;
    const cars = (data.results?.cars ?? []).map((c) => c.stockCar).filter(Boolean);
    if (!cars.length) break;
    for (const c of cars) {
      const rec = toRecord(c, stockCarsType, fuelCode, drops);
      if (rec && !byVin.has(rec.vin)) {
        byVin.set(rec.vin, rec);
        kept++;
      }
    }
    offset += cars.length;
    if (total != null && offset >= total) break;
  }
  const short = total != null && offset < total;
  if (short) report.errors.push(`${stockCarsType}/${fuelCode}: stopped at ${offset} of ${total} advertised`);
  const dropped = Object.entries(drops).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
  report.notes.push(`${stockCarsType}/${fuelCode}: ${offset}/${total ?? "?"} rows walked, ${kept} kept, dropped ${dropped}`);
  log(`audi/${stockCarsType}/${fuelCode}: ${kept} kept (${offset} of ${total ?? "?"} rows; dropped ${dropped})`);
  return kept;
}

// Pull the Audi dealer network's national BEV inventory, used and new.
// crawl.mjs-shaped report on the synthetic "audi-network" domain, always
// truncated (see header — recheck retires these per VIN via the dealer VDP).
export async function pullAudi({ log = () => {} } = {}) {
  const report = { domain: AUDI.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();

  // Used first: it is the half this site exists for, so if the run is going to
  // die partway it should die having collected the used cars. The electric
  // facet first for the same reason, then the hybrid facet's plug-in subset.
  for (const type of ["USED", "NEW"]) await sweep(type, FUEL_ELECTRIC, byVin, report, log);
  for (const type of ["USED", "NEW"]) await sweep(type, FUEL_HYBRID, byVin, report, log);

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const nonAudi = report.evs.filter((r) => !/^audi$/i.test(String(r.make ?? ""))).length;
  const phevN = report.evs.filter((r) => r.evKind === "PHEV").length;
  report.notes.push(`${report.evs.length - phevN} BEVs + ${phevN} PHEVs (${nonAudi} non-Audi trade-ins) across ${new Set(report.evs.map((r) => r.dealerName)).size} dealers`);
  if (byVin.size < AUDI.minExpected) {
    report.errors.push(`collected ${byVin.size} < floor ${AUDI.minExpected} — the fuel facet or market identifier may have moved`);
  }
  // Never certifies: the domain is synthetic and spans real dealer sites the
  // crawl also covers. Liveness rides on recheck per VIN.
  report.truncated = true;
  return report;
}
