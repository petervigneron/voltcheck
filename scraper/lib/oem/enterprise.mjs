// Enterprise Car Sales national used inventory (enterprisecarsales.com).
//
// Enterprise sells its own rental-fleet retirees from its own branches at
// no-haggle prices, so unlike the marketplace lanes (ford-blue-advantage,
// hyundai-cpo) there is no other rooftop where these cars could appear: this
// endpoint IS the merchant's whole national stock, and one sweep covers it.
// The registry has carried enterprisecarsales.com as needs-investigation
// since the 2026-08-13 probe found 0 vehicles — the site is an AEM SPA with
// no server-rendered inventory; this lane is where that inventory actually
// lives.
//
// How it works (probed 2026-08-16, plain Node fetch, no bot wall — contrast
// Tesla/Ford, whose Akamai 403s put them off-limits):
//   1. GET /search on www.enterprisecarsales.com. The page embeds its client
//      config in plain HTML, including anonymousSecurityConfig: the IAM base
//      URL and the Ehi-Api-Key the SPA hands every anonymous visitor. We
//      re-read it each run so a rotated key heals without a code change.
//   2. POST {iam}/consumer/generate-anonymous-access-token with that key →
//      array of {resourceName, accessToken} JWTs (1h expiry; one per run).
//   3. POST /vehicle/sales/retail/inventory/search on api.ehi.com with the
//      ar.oauth.bff-carsales_opensearch_api token. The BFF passes raw
//      OpenSearch DSL through (the SPA itself builds DSL client-side for its
//      aggregations), so we filter server-side on the structured
//      fuelTypeDescription facet = "Electric" — a pure-BEV bucket ("Hybrid"
//      is a separate value; verified against the whole 14.5k index).
//
// PHEVs (2026-08-23): the fuelTypeDescription vocabulary is Gasoline /
// Hybrid / Electric / Diesel / Flex — a terms aggregation over the whole
// index shows NO plug-in value, so Enterprise's own facet lumps plug-ins
// into "Hybrid" alongside Priuses, RAV4 Hybrids and 48V Audis (first 200
// Hybrid docs: 119 Jeep 4xe next to 12 Prius and 7 A3 mild hybrids). The
// facet therefore cannot ship alone. The Hybrid bucket (1,706 on probe day)
// IS swept, but each row must carry the maker's own plug-in designation in
// its model/trim name (lib/oem/phev-designator.mjs — 4xe, Plug-In, PHEV,
// Energi, Prime, E-Hybrid …), plus one special case: a Chrysler Pacifica
// whose trim starts "Hybrid" is the Pacifica Hybrid, which has only ever
// been a plug-in. Rows without a designation are dropped and counted;
// vpic-enrich re-verifies every kept VIN before it can publish.
//
// Docs are richer than most dealer pages: VIN, no-haggle salePrice, real
// odometer, branch ZIP + geo, list date, photos (~80%). All makes appear —
// Enterprise retails what its fleet bought, so this is one of the few lanes
// that yields used Teslas (25 of 136 on first probe; the Audi lane is the
// only other source).
//
// Every hit carries a per-VIN VDP at enterprisecarsales.com/vehicle/{VIN}
// (confirmed against vdp-sitemap.xml). Real domain, complete sweep →
// truncated:false certifies completeness and nightly db-sync retires sold
// VINs; recheck skips the domain (same rule as GM/BMW: the sweep itself is
// the liveness check).
import { fetchPage, politePostJson } from "../http.mjs";
import { isPhevDesignated } from "./phev-designator.mjs";
import { stateFromZip } from "./zip-state.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const ENTERPRISE = {
  key: "enterprise",
  domain: "enterprisecarsales.com",
  configPage: "https://www.enterprisecarsales.com/search",
  // Fallbacks if the config page changes shape; the page-scraped values win.
  iamUrl: "https://api.ehi.com/identityAndAccessManagement",
  ehiApiKey: "1Kbdq0FWQf3Cxd2SEtR2Bhz5Rx0V4RJC",
  searchUrl: "https://api.ehi.com/vehicle/sales/retail/inventory/search",
  tokenResource: "ar.oauth.bff-carsales_opensearch_api",
  minExpected: 60, // 136 BEVs on first probe; alert well below that
};

// recheck.mjs skips this domain: one query is the complete national set every
// night, so db-sync's truncated:false already retires gone VINs, and the VDPs
// are enterprisecarsales.com pages this same pull just certified.
export const OEM_LOCATOR_DOMAINS = new Set([ENTERPRISE.domain]);

const PAGE_SIZE = 200;
const MAX_PAGES = 25; // 5k ceiling — 35x today's count, pure runaway guard
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/AWD|4WD|ALL.?WHEEL|FOUR.?WHEEL/.test(s)) return "AWD";
  if (/RWD|REAR/.test(s)) return "RWD";
  if (/FWD|FRONT/.test(s)) return "FWD";
  return undefined;
};

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (!s) return undefined;
  return s.startsWith("https://") ? s : s.startsWith("http://") ? "https://" + s.slice(7) : undefined;
};

// Enterprise appends the body style to the trim ("SV PLUS Hatchback");
// drop that suffix when it just repeats the body type field.
function cleanTrim(trim, bodyType) {
  const t = String(trim ?? "").trim();
  if (!t) return undefined;
  const b = String(bodyType ?? "").trim();
  if (b && t.toLowerCase().endsWith(b.toLowerCase())) {
    const cut = t.slice(0, t.length - b.length).trim();
    if (cut) return cut;
  }
  return t;
}

// The SPA's anonymous-visitor config, embedded in the /search page HTML
// (quotes arrive as &#34; entities). Scraped fresh each run so a rotated
// api key or moved host heals on its own; hardcoded fallbacks cover a
// page-shape change until someone looks.
async function readSiteConfig(report) {
  const page = await fetchPage(ENTERPRISE.configPage);
  report.fetched++;
  if (page.status !== 200 || !page.body) {
    report.notes.push(`config page ${page.status}; using built-in fallbacks`);
    return { iamUrl: ENTERPRISE.iamUrl, ehiApiKey: ENTERPRISE.ehiApiKey, searchUrl: ENTERPRISE.searchUrl };
  }
  const html = page.body.replace(/&#34;/g, '"');
  const anon = html.match(/"anonymousSecurityConfig"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"\s*,\s*"ehiApiKey"\s*:\s*"([^"]+)"/);
  const open = html.match(/"openSearchConfig"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/);
  if (!anon) report.notes.push("anonymousSecurityConfig not found on page; using built-in fallbacks");
  return {
    iamUrl: anon?.[1] ?? ENTERPRISE.iamUrl,
    ehiApiKey: anon?.[2] ?? ENTERPRISE.ehiApiKey,
    searchUrl: open ? `${open[1]}/vehicle/sales/retail/inventory/search` : ENTERPRISE.searchUrl,
  };
}

async function anonymousToken(cfg, report) {
  const res = await politePostJson(`${cfg.iamUrl}/consumer/generate-anonymous-access-token`, {
    headers: {
      "content-type": "application/json; version=1.0.0",
      accept: "application/json; version=1.0.1",
      "ehi-api-key": cfg.ehiApiKey,
      origin: "https://www.enterprisecarsales.com",
      referer: "https://www.enterprisecarsales.com/",
    },
  });
  report.fetched++;
  if (res.status === "robots_disallowed") {
    report.errors.push("robots disallows the IAM endpoint");
    return null;
  }
  const tok = Array.isArray(res.json) ? res.json.find((t) => t?.resourceName === ENTERPRISE.tokenResource)?.accessToken : null;
  if (!tok) {
    report.errors.push(`anonymous token: ${res.status}${Array.isArray(res.json) ? " (resource missing from grant)" : ""}`);
    return null;
  }
  return tok;
}

// The two swept facets. Enterprise's own vocabulary has no plug-in value, so
// the Hybrid sweep's rows are additionally gated on the maker designation in
// toRecord (see header).
const FUEL_SWEEPS = [
  { facet: "Electric", evKind: "BEV" },
  { facet: "Hybrid", evKind: "PHEV" },
];

function toRecord(src, sweep, drops) {
  const v = src?.vehicle ?? {};
  const spec = v.specification ?? {};
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // Structured guard: the query already filters the facet; a doc that
  // arrives without the queried value means the mapping drifted.
  if (String(spec.fuelTypeDescription ?? "") !== sweep.facet) return null;
  // The Hybrid bucket lumps plug-ins with conventional/mild hybrids (header):
  // a plug-in row must wear its maker's own designation, or be a Pacifica
  // whose trim leads "Hybrid" (that nameplate has only ever been a plug-in).
  if (sweep.evKind === "PHEV") {
    const nameText = `${spec.modelDescription ?? ""} ${spec.trimDescription ?? ""}`;
    const pacificaHybrid = /pacifica/i.test(String(spec.modelDescription ?? "")) && /^hybrid\b/i.test(String(spec.trimDescription ?? "").trim());
    if (!isPhevDesignated(nameText) && !pacificaHybrid) {
      if (drops) drops.set(`${spec.makeDescription} ${spec.modelDescription}`, (drops.get(`${spec.makeDescription} ${spec.modelDescription}`) ?? 0) + 1);
      return null;
    }
  }
  const year = Number(spec.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const make = String(spec.makeDescription ?? "").trim();
  const model = String(spec.modelDescription ?? "").trim();
  if (!make || !model) return null;
  const odo = v.odometer ?? {};
  const mileage = String(odo.unit ?? "MILE").toUpperCase() === "MILE" ? num(odo.lastKnownValue) : undefined;
  const zipRaw = String(v.physicalLocation?.postalCode ?? "");
  const zip = /^\d{5}/.test(zipRaw) ? zipRaw.slice(0, 5) : undefined;
  const imgs = (v.marketingImages?.images ?? []).map(httpsUrl).filter(Boolean).slice(0, 8);
  return {
    vin,
    year,
    make,
    model,
    trim: cleanTrim(spec.trimDescription, spec.bodyTypes?.[0]),
    ...pickTaggedPrice("enterprise", [
      ["salePrice", num(src.salePrice)],
    ]),
    mileage,
    driveLine: drive(spec.drivetrainDescription),
    exteriorColor: v.mappedColor?.exteriorColor?.derivedExteriorColor || v.color?.exteriorColorDescription || undefined,
    interiorColor: v.color?.interiorColorDescription || undefined,
    dealerName: "Enterprise Car Sales",
    zip,
    state: stateFromZip(zip),
    condition: "used",
    imageUrl: imgs[0],
    images: imgs,
    sourceUrl: `https://www.enterprisecarsales.com/vehicle/${vin}`,
    dealerDomain: ENTERPRISE.domain,
    evKind: sweep.evKind,
    // Enterprise's own fuel string (facet value, restated per doc) — the
    // PHEV rows' real identity is the maker designation in their name.
    fuelType: spec.fuelTypeDescription || undefined,
    evConfidence: "high", // facet + (for PHEV) the maker's own plug-in designation
    platform: "enterprise-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

async function searchPage(cfg, token, facet, from, report) {
  const body = {
    query: { bool: { filter: [{ term: { "vehicle.specification.fuelTypeDescription.keyword": facet } }] } },
    size: PAGE_SIZE,
    from,
    track_total_hits: true,
    sort: [{ "vehicle.vin.keyword": "asc" }], // stable order across pages
    // groupLevelPrices repeats the price for every destination branch (~40kB
    // per doc); the flat salePrice is the same no-haggle figure.
    _source: { excludes: ["totalPriceForSRPs", "vehicle.prices"] },
  };
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(cfg.searchUrl, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json; version=1.0.0",
        origin: "https://www.enterprisecarsales.com",
        referer: "https://www.enterprisecarsales.com/",
      },
      body,
    });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows the search endpoint");
      return null;
    }
    if (res.status === 200 && res.json?.hits) return res.json.hits;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    report.errors.push(`${res.status} from=${from}`);
    return null;
  }
}

// Pull Enterprise Car Sales' complete national used BEV + PHEV stock (both
// facets, one report — a half-pull must never certify the domain, kia.mjs's
// rule). crawl.mjs-shaped report; see gm.mjs for the completeness contract
// (truncated:false certifies enterprisecarsales.com fully covered, licensing
// nightly delisting).
export async function pullEnterprise({ log = () => {} } = {}) {
  const report = { domain: ENTERPRISE.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  const cfg = await readSiteConfig(report);
  const token = await anonymousToken(cfg, report);
  if (!token) {
    report.truncated = true;
    return report;
  }

  const byVin = new Map();
  const drops = new Map(); // Hybrid-bucket rows without a plug-in designation
  let phevKept = 0;
  for (const sweep of FUEL_SWEEPS) {
    let total = 0;
    let collected = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const hits = await searchPage(cfg, token, sweep.facet, page * PAGE_SIZE, report);
      if (!hits) break; // error recorded; truncated follows
      total = hits.total?.value ?? total;
      for (const h of hits.hits ?? []) {
        collected++;
        const rec = toRecord(h._source, sweep, drops);
        if (rec) byVin.set(rec.vin, rec);
      }
      log(`enterprise/${sweep.evKind}: page ${page}, ${byVin.size}/${total} VINs`);
      if ((page + 1) * PAGE_SIZE >= total || !(hits.hits ?? []).length) break;
    }
    // Completeness is judged on rows WALKED, not rows kept — the designation
    // gate drops most of the Hybrid bucket on purpose.
    if (total > 0 && collected < total * 0.9) report.errors.push(`${sweep.facet}: walked ${collected} of ${total} — paging shortfall`);
    if (sweep.evKind === "PHEV") phevKept = [...byVin.values()].filter((r) => r.evKind === "PHEV").length;
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const droppedN = [...drops.values()].reduce((a, b) => a + b, 0);
  report.notes.push(`${report.evs.length - phevKept} used BEVs + ${phevKept} plug-ins kept; ${droppedN} Hybrid-bucket rows without a plug-in designation dropped`);
  if (droppedN) {
    const top = [...drops].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${n} ${k}`).join(", ");
    report.notes.push(`top dropped (conventional/mild hybrids, correct): ${top}`);
  }
  report.truncated = report.errors.length > 0 || byVin.size < ENTERPRISE.minExpected;
  return report;
}
