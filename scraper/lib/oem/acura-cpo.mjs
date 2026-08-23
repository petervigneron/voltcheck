// Acura Certified Pre-Owned (acuracertified.com) — the whole national used lot
// of every Acura rooftop, certified and not.
//
// Acura's shopping app is a Tekion consumer storefront, and its discovery
// service answers a plain Node POST once you send the headers the app sends.
// Endpoint and headers came out of the running page (an XHR interceptor on the
// search screen), never a guess:
//     POST https://www.acuracertified.com/shopping/api/aec-cp-discovery-api/p/v1/vehicles/search
//     headers: oemId: HONDA, programId: ACURA_CPO, client: T1_VSR,
//              tenantId: 0, dealerId: 0          (the service 400s naming the
//                                                 missing one, so these are
//                                                 measured, not padded)
//     body: {"filters":{"geo":{"zipCode":"…"}},
//            "sort":{"name":"distance","order":"ASC"},
//            "paymentTypes":["CASH"],
//            "pagination":{"size":20,"from":N}}
// robots.txt on www.acuracertified.com disallows only /diagnostics/ and
// /platform/admin/, so /shopping/api/ is open policy as well as open in fact.
//
// WHY THE WHOLE INDEX IS WALKED rather than filtered to the EVs. There IS a
// server-side fuel facet — filters.fuelType.values ["electric"] — and it is
// honest about the cars it can see: the facets endpoint returns Gas 6,834 and
// Electric 42 against a facet total of 6,876, i.e. the two buckets partition
// that population exactly, the way Mitsubishi's did. But the search's own
// count for the same query is 8,669. The ~1,800-car difference is the
// NON-ACURA trade-ins sitting on Acura lots, and they carry no fuelType at all
// (a 2024 Prologue at Cardinaleway Acura Las Vegas returns `fuelType`
// undefined). A fuel-facet-only lane would have shipped 42 ZDXs and silently
// left 16 Prologues — plus whatever else lands there — behind. So the lane
// walks all 8,669 at 20 a page (`size` is capped at 20; `from` is the cursor,
// and `offset`/`page`/`start` are all silently ignored) and classifies every
// row: an "electric" fuelType is a structured field and ships BEV/high, and
// anything else goes through lib/ev.mjs's classifyEv, which resolves an
// EV-only WMI at high confidence and a known nameplate at "name_match" for
// vpic-enrich to confirm. That is the same treatment a dealer-crawl row gets,
// and for the same reason: the marketplace did not say what the car is.
//
// DELISTING. This lane is one of the few that has to carry it, because there is
// no per-VIN page recheck can trust: /shopping/inventory/vehicle?vinSlug=… is a
// client-rendered shell that returns the identical 61,305 bytes for a real VIN
// and for a fabricated one, echoing whichever VIN is in the URL — recheck's
// "200 but no VIN" rule would fire on nothing and the rows would never leave.
// So acuracertified.com goes in the recheck-skip set, and instead the walk is
// what retires sold cars: `truncated` is false only when every page came back
// clean AND the rows collected match the count the service itself reported.
// A short read, a failed page or a yield under the floor all flip it back to
// true, which costs freshness rather than coverage.
import { politePostJson } from "../http.mjs";
import { classifyEv } from "../ev.mjs";
import { stateFromZip } from "./zip-state.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";

export const ACURA_CPO = {
  key: "acura-cpo",
  // The real host: this pull is the complete national index and delisting
  // depends on that (see the note above).
  domain: "acuracertified.com",
  host: "https://www.acuracertified.com",
  search: "https://www.acuracertified.com/shopping/api/aec-cp-discovery-api/p/v1/vehicles/search",
  facets: "https://www.acuracertified.com/shopping/api/aec-cp-discovery-api/p/v1/vehicles/facets",
  // Floor. Observed 58 electrified nationally (42 ZDX + 16 Prologue) on
  // 2026-08-23; this fires if the index or the classifier moves, not on
  // ordinary stock swings in a small lot.
  minExpected: 15,
};

// recheck.mjs SKIPS this domain — the per-VIN page is fake-alive (header).
// Removing it from this set would delist the whole lane on the first pass.
export const OEM_LOCATOR_DOMAINS = new Set([ACURA_CPO.domain]);

const PAGE = 20; // server cap, whatever `size` asks for
const NATIONAL_ZIP = "66101"; // any populated ZIP; with no radius the set is national
const MAX_PAGES = 1200; // 24,000 cars — ~3x today's index
const TIMEOUT_MS = 60000;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const HEADERS = {
  oemId: "HONDA",
  programId: "ACURA_CPO",
  client: "T1_VSR",
  tenantId: "0",
  dealerId: "0",
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/AWD|SH.?AWD|ALL.?WHEEL|4WD/.test(s)) return "AWD";
  if (/RWD|REAR/.test(s)) return "RWD";
  if (/FWD|FRONT/.test(s)) return "FWD";
  return undefined;
};

const titleCase = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return undefined;
  return t === t.toUpperCase() ? t.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : t;
};

// variant.desc is marketing HTML ("<span class='acr-nowrap'>A-Spec<sup>&reg;</sup></span>");
// variant.name is the plain code ("A-SPEC"). Prefer the code, de-shouted.
const trimOf = (v) => {
  const name = String(v?.name ?? "").trim();
  if (name) return titleCase(name);
  const desc = String(v?.desc ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return desc ? titleCase(desc) : undefined;
};

/**
 * stockDetails.condition is the machine token ("CPO" / "USED"), and the
 * PROGRAM_TIER tag is the marketing string ("Precision Certified",
 * "Precision Certified EV", "Precision Used", "Used"). lib/condition.mjs's
 * rule applies: read the token, and let certification ride the flag rather
 * than the marketing string.
 */
function conditionOf(hit) {
  const t = String(hit?.stockDetails?.condition ?? "").trim().toUpperCase();
  if (t === "CPO") return { certified: true, condition: "certified" };
  if (t === "USED" || t === "PRE_OWNED") return { certified: false, condition: "used" };
  if (t === "NEW") return { certified: false, condition: "new" };
  return { certified: undefined, condition: undefined };
}

// One hit → normalized listing, or null if it is not an electrified car.
function toRecord(hit) {
  const vin = String(hit?.id ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(hit.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = String(hit.model ?? "").trim();
  if (!model) return null;

  // classifyEv reads the structured fuel field first, then the VIN's WMI, then
  // the nameplate — exactly the ladder the dealer crawl uses. Acura's own cars
  // carry fuelType and settle at "high"; a trade-in with no fuelType settles on
  // its name or WMI, and a name-only match is left for vPIC to confirm.
  const cls = classifyEv({ fuelType: hit.fuelType, model, vehicleIdentificationNumber: vin });
  if (!cls.isEv) return null;

  const cond = conditionOf(hit);
  const price = num(hit.pricing?.cash?.netPrice?.value) ?? num(hit.pricing?.cash?.baseDealerFeaturedPrice?.value);
  const floor = priceFloor({ isNew: cond.condition === "new", year });
  const zip = /^\d{5}/.test(String(hit.dealer?.postalCode ?? "")) ? String(hit.dealer.postalCode).slice(0, 5) : undefined;
  const imgs = [
    ...(hit.media?.dealer ?? []).map((m) => m?.url),
    ...(hit.media?.oem ?? []).map((m) => m?.url),
  ].filter((u) => typeof u === "string" && u.startsWith("https://")).slice(0, 8);
  return {
    vin,
    year,
    make: String(hit.make ?? "").trim() || "Acura",
    model,
    trim: trimOf(hit.variant),
    // netPrice is the advertised cash price; baseDealerFeaturedPrice is the
    // same number on rows that publish no netPrice. baseMsrp is deliberately
    // NOT a rung: it is the original sticker of a used car, not its ask.
    ...pickTaggedPrice("acura-cpo", [
      ["netPrice", price != null && price >= floor ? price : undefined],
    ]),
    mileage: Number.isFinite(hit.mileage) ? Math.round(hit.mileage) : undefined,
    driveLine: drive(hit.driveType),
    exteriorColor: titleCase(hit.baseExteriorColor),
    dealerName: hit.dealer?.name || undefined,
    zip,
    state: stateFromZip(zip),
    ...cond,
    imageUrl: imgs[0],
    images: imgs,
    // The marketplace's own listing page. It is a fake-alive shell, which is
    // why recheck skips this domain and the walk carries delisting instead.
    sourceUrl: `${ACURA_CPO.host}/shopping/inventory/vehicle?vinSlug=${vin}`,
    dealerDomain: ACURA_CPO.domain,
    evKind: cls.kind,
    evConfidence: cls.confidence,
    platform: "acura-cpo",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

async function post(url, body, report) {
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(url, {
      headers: { origin: ACURA_CPO.host, referer: `${ACURA_CPO.host}/shopping/inventory/search`, ...HEADERS },
      body,
      timeoutMs: TIMEOUT_MS,
    });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push("robots disallows the discovery API"); return null; }
    if (res.status === 200 && res.json?.data) return res.json.data;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt < 1 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} ${JSON.stringify(res.json?.errorDetails ?? "").slice(0, 100)}`);
    return null;
  }
}

const searchBody = (from) => ({
  filters: { geo: { zipCode: NATIONAL_ZIP } },
  sort: { name: "distance", order: "ASC" },
  paymentTypes: ["CASH"],
  pagination: { size: PAGE, from },
});

/**
 * Pull every electrified car on an Acura rooftop, certified or used.
 * crawl.mjs-shaped report on acuracertified.com.
 */
export async function pullAcuraCpo({ log = () => {} } = {}) {
  const report = { domain: ACURA_CPO.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  // The fuel facet, for the record and as a cross-check on the walk: it is the
  // authoritative count of the Acura-branded electrics, and the walk must find
  // at least that many.
  const facets = await post(ACURA_CPO.facets, { filters: { geo: { zipCode: NATIONAL_ZIP } }, sort: { name: "distance", order: "ASC" }, paymentTypes: ["CASH"] }, report);
  const facetElectric = (facets?.fuelType ?? []).find((f) => /electric/i.test(String(f.displayValue)))?.count;
  const facetTotal = (facets?.fuelType ?? []).reduce((a, f) => a + (Number(f.count) || 0), 0);
  if (facets) report.notes.push(`fuelType facet: electric ${facetElectric ?? "?"} of ${facetTotal} (facet population ${facets.count})`);

  const first = await post(ACURA_CPO.search, searchBody(0), report);
  if (!first) { report.errors.push("first page failed"); report.truncated = true; return report; }
  const total = Number(first.count ?? 0);
  report.notes.push(`national index ${total} vehicles`);
  log(`acura-cpo: walking ${total} vehicles at ${PAGE}/page`);

  const byVin = new Map();
  let seen = 0;
  const collect = (hits) => {
    for (const hit of hits ?? []) {
      seen++;
      const rec = toRecord(hit);
      if (rec) byVin.set(rec.vin, rec);
    }
  };
  collect(first.hits);

  const maxPages = Number(process.env.ACURA_CPO_MAX_PAGES) || MAX_PAGES;
  let short = false;
  for (let page = 1; page < maxPages; page++) {
    const d = await post(ACURA_CPO.search, searchBody(page * PAGE), report);
    if (!d) { short = true; break; }
    const hits = d.hits ?? [];
    if (!hits.length) break;
    collect(hits);
    if (page % 50 === 0) log(`acura-cpo: page ${page}, ${seen}/${total} rows, ${byVin.size} electrified`);
    if (seen >= total) break;
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const kinds = report.evs.reduce((a, r) => ((a[`${r.evKind}/${r.evConfidence}`] = (a[`${r.evKind}/${r.evConfidence}`] ?? 0) + 1), a), {});
  const conds = report.evs.reduce((a, r) => ((a[r.condition ?? "unstated"] = (a[r.condition ?? "unstated"] ?? 0) + 1), a), {});
  report.notes.push(`walked ${seen}/${total}, ${report.evs.length} electrified ${JSON.stringify(kinds)} ${JSON.stringify(conds)}, ${report.fetched} requests`);
  log(`acura-cpo: ${report.evs.length} electrified of ${seen} walked, ${report.fetched} requests, ${report.errors.length} errors`);

  if (seen < total) report.errors.push(`walked ${seen} of ${total} — short read`);
  if (facetElectric != null && report.evs.length < facetElectric) {
    report.errors.push(`walk found ${report.evs.length} electrified, the fuel facet says at least ${facetElectric}`);
  }
  // Completeness (see gm.mjs): every page clean, the walk reached the count the
  // service reported, and the yield clears the floor. Only then may this pull
  // delist — and it must be able to, because recheck cannot verify these rows.
  report.truncated = short || report.errors.length > 0 || report.evs.length < ACURA_CPO.minExpected;
  return report;
}
