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
//      aggregations), so a terms aggregation over
//      fuelTypeDescription tells us the vocabulary and the bucket sizes, and
//      one keyset walk per bucket reads the whole index.
//
// EVERY fuel bucket is swept, not just the electrified-looking ones
// (2026-09-05). The lane used to filter server-side on fuelTypeDescription =
// Electric + Hybrid, which is a bet that the merchant's own fuel field is
// right about which cars plug in. That bet is not safe in general: the same
// day this changed, a DMS-fed retailer was measured filing 16 of its 38 Grand
// Cherokee 4xe as "Gas" or "Flex Fuel", so a fuel-facet filter there silently
// dropped the plug-ins the retailer mislabels. Enterprise, measured, does NOT
// do that — see the numbers below — but the only way to keep knowing that is
// to read the other buckets instead of assuming, and reading them costs 25
// requests a night against an index this lane already walks.
//
// How a row earns admission depends on which bucket it came from, because
// the buckets carry different amounts of evidence:
//
//   Electric — the merchant's own structured claim that the car is battery
//     electric, and a pure-BEV bucket (verified against the whole index).
//     Ships BEV at high confidence, as it always has.
//   Hybrid — lumps plug-ins with conventional and 48V mild hybrids: the
//     fuelTypeDescription vocabulary (Gasoline / Hybrid / Electric / Diesel /
//     Flex) has NO plug-in value at all, so a Wrangler 4xe sits beside a
//     Prius and an A3 40 TFSI. A row here must carry the maker's own plug-in
//     designation in its model/trim name (lib/oem/phev-designator.mjs — 4xe,
//     Plug-In, PHEV, Energi, Prime, E-Hybrid …), plus one special case: a
//     Chrysler Pacifica whose trim starts "Hybrid" is the Pacifica Hybrid,
//     which has only ever been a plug-in. Facet and maker designation
//     agreeing is two sources, so these ship PHEV at high confidence.
//   Everything else (Gasoline, Diesel, Flex, and any value Enterprise adds) —
//     the fuel field actively DISAGREES, so the car's own nameplate is the
//     only evidence there is, and by the house rule a name match alone never
//     publishes. Admitted at evConfidence "name_match", which ingest.mjs
//     holds until vpic-enrich promotes it on an affirmative decode. Same
//     nameplate rules, no third vocabulary: lib/ev.mjs's EV_MODEL_RE for a
//     battery-electric name, the plug-in designator for a plug-in one.
//
// What that widening is worth at Enterprise TODAY: nothing, and the zero is
// the finding. All 12,157 docs in Gasoline (12,104), Diesel (46) and Flex (7)
// were walked on 2026-09-05 and NOT ONE is electrified by nameplate or by
// VIN. The sharper control is a nameplate-keyed aggregation over the whole
// index with no fuel filter: all 1,201 docs whose name says "4xe" sit in
// Hybrid, zero in Gasoline. The classifier is not simply blind here — the
// same rules over the Hybrid bucket find 1,298 of 1,971 — and the 673 rows
// the designation gate drops were every one of them put to vPIC, which calls
// none of them a plug-in or a BEV while confirming 60 of 60 kept rows. So
// Enterprise files its plug-ins correctly, this sweep admits nobody new, and
// the nightly report now says so in a line rather than needing someone to go
// and look.
//
// Keyset paging, not from/size, and that is forced rather than tidy: the
// Gasoline bucket alone is 12,104 docs against OpenSearch's 10,000-doc
// result window, so a from-based walk 400s at from=10500 (measured) and would
// truncate the bucket silently at 10,000. sort+search_after on the VIN has no
// such ceiling.
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
import { EV_MODEL_RE } from "../ev.mjs";
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

const PAGE_SIZE = 500;
// 100k ceiling — 7x the whole index, pure runaway guard. Every bucket is
// walked now, so the cap has to clear the Gasoline bucket (12,104) rather
// than just the electrified ones.
const MAX_PAGES = 200;
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

// Which of Enterprise's fuel values carry which kind of evidence (see header).
// Read off the live vocabulary rather than hardcoded, so a value Enterprise
// adds is swept as a disagreeing bucket instead of going unread.
const BUCKET_KIND = (facet) => (facet === "Electric" ? "electric" : facet === "Hybrid" ? "hybrid" : "outside");

// What identifies this doc as electrified, and on whose word. Returns null
// when nothing does — the honest answer for the great majority of the index.
//
// The confidence is the whole point of splitting this out. "high" means two
// sources agree (the merchant's fuel field and, for a plug-in, the maker's own
// badge). "name_match" means the fuel field says the car does NOT plug in and
// only the nameplate says otherwise, so ingest.mjs holds the row and
// vpic-enrich must get an affirmative decode before it can reach the site.
function identify(spec, kind) {
  if (kind === "electric") return { evKind: "BEV", evConfidence: "high" };
  const model = String(spec.modelDescription ?? "");
  const name = `${spec.makeDescription ?? ""} ${model} ${spec.trimDescription ?? ""}`;
  // A Chrysler Pacifica whose trim starts "Hybrid" is the Pacifica Hybrid,
  // which has only ever been a plug-in.
  const pacificaHybrid = /pacifica/i.test(model) && /^hybrid\b/i.test(String(spec.trimDescription ?? "").trim());
  if (isPhevDesignated(name) || pacificaHybrid) {
    return { evKind: "PHEV", evConfidence: kind === "hybrid" ? "high" : "name_match" };
  }
  // A battery-electric nameplate in a bucket that denies it. Reached from the
  // Hybrid bucket as well as the others, because a BEV mislabeled "Hybrid" is
  // the same class of merchant error as one mislabeled "Gasoline" — and it
  // costs the Hybrid bucket nothing: measured 2026-09-05 this fires on 0 of
  // its 1,971 docs.
  if (EV_MODEL_RE.test(name)) return { evKind: "BEV", evConfidence: "name_match" };
  return null;
}

export function toRecord(src, sweep, drops) {
  const v = src?.vehicle ?? {};
  const spec = v.specification ?? {};
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // Structured guard: the query already filters the facet; a doc that
  // arrives without the queried value means the mapping drifted.
  if (String(spec.fuelTypeDescription ?? "") !== sweep.facet) return null;
  const id = identify(spec, sweep.kind);
  if (!id) {
    // Counted per nameplate so the nightly note can show WHAT was refused —
    // the drops are the check on this gate, and a plug-in appearing in them
    // is how a designator hole would surface.
    if (drops) drops.set(`${spec.makeDescription} ${spec.modelDescription}`, (drops.get(`${spec.makeDescription} ${spec.modelDescription}`) ?? 0) + 1);
    return null;
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
    evKind: id.evKind,
    // Enterprise's own fuel string (facet value, restated per doc). Kept even
    // when it disagrees with the nameplate: it is the merchant's claim, and
    // hiding it would hide the disagreement vpic-enrich is being asked about.
    fuelType: spec.fuelTypeDescription || undefined,
    evConfidence: id.evConfidence,
    platform: "enterprise-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// One page of a bucket. `after` is the previous page's last sort value —
// keyset paging, because from/size cannot reach past OpenSearch's 10,000-doc
// result window and the Gasoline bucket is larger than that (header).
async function searchPage(cfg, token, facet, after, report) {
  const body = {
    query: { bool: { filter: [{ term: { "vehicle.specification.fuelTypeDescription.keyword": facet } }] } },
    size: PAGE_SIZE,
    track_total_hits: true,
    sort: [{ "vehicle.vin.keyword": "asc" }], // stable order across pages
    // groupLevelPrices repeats the price for every destination branch (~40kB
    // per doc); the flat salePrice is the same no-haggle figure.
    _source: { excludes: ["totalPriceForSRPs", "vehicle.prices"] },
  };
  if (after) body.search_after = after;
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
    report.errors.push(`${res.status} ${facet} after=${after ? after[0] : "start"}`);
    return null;
  }
}

// Enterprise's live fuelTypeDescription vocabulary and the size of each
// bucket, in one request. Read fresh so a value Enterprise adds is swept
// rather than silently unread — the whole reason the sweep no longer names
// its facets.
async function fuelBuckets(cfg, token, report) {
  const res = await politePostJson(cfg.searchUrl, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json; version=1.0.0",
      origin: "https://www.enterprisecarsales.com",
      referer: "https://www.enterprisecarsales.com/",
    },
    body: {
      size: 0,
      track_total_hits: true,
      aggs: { fuel: { terms: { field: "vehicle.specification.fuelTypeDescription.keyword", size: 50 } } },
    },
  });
  report.fetched++;
  const buckets = res.json?.aggregations?.fuel?.buckets;
  if (res.status !== 200 || !Array.isArray(buckets) || !buckets.length) {
    report.errors.push(`fuel aggregation: ${res.status}`);
    return null;
  }
  return buckets.map((b) => ({ facet: b.key, docs: b.doc_count, kind: BUCKET_KIND(b.key) }));
}

// Pull Enterprise Car Sales' complete national used BEV + PHEV stock (every
// fuel bucket, one report — a half-pull must never certify the domain, kia.mjs's
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

  const buckets = await fuelBuckets(cfg, token, report);
  if (!buckets) {
    report.truncated = true;
    return report;
  }

  const byVin = new Map();
  const drops = new Map(); // rows no nameplate rule identifies as electrified
  let outsideKept = 0;
  for (const sweep of buckets) {
    let total = 0;
    let collected = 0;
    let after = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const hits = await searchPage(cfg, token, sweep.facet, after, report);
      if (!hits) break; // error recorded; truncated follows
      total = hits.total?.value ?? total;
      const rows = hits.hits ?? [];
      for (const h of rows) {
        collected++;
        const rec = toRecord(h._source, sweep, drops);
        if (rec) {
          byVin.set(rec.vin, rec);
          if (sweep.kind === "outside") outsideKept++;
        }
      }
      if (!rows.length) break;
      after = rows[rows.length - 1].sort;
      log(`enterprise/${sweep.facet}: ${collected}/${total} walked, ${byVin.size} kept`);
      if (collected >= total || !after) break;
    }
    // Completeness is judged on rows WALKED, not rows kept — the nameplate
    // gate drops nearly the whole index on purpose.
    if (total > 0 && collected < total * 0.9) report.errors.push(`${sweep.facet}: walked ${collected} of ${total} — paging shortfall`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const phevKept = report.evs.filter((r) => r.evKind === "PHEV").length;
  const droppedN = [...drops.values()].reduce((a, b) => a + b, 0);
  report.notes.push(`${report.evs.length - phevKept} used BEVs + ${phevKept} plug-ins kept; ${droppedN} rows no nameplate identifies as electrified, dropped`);
  report.notes.push(`fuel buckets: ${buckets.map((b) => `${b.facet}=${b.docs}`).join(" ")}`);
  // The measurement this widening exists to keep making. Zero is the expected
  // reading and the honest one to print: it says Enterprise still files its
  // plug-ins under a fuel value that admits they plug in. A non-zero reading
  // is the DriveTime failure arriving here, and these rows are held at
  // name_match until vpic-enrich decides them.
  report.notes.push(`${outsideKept} electrified by nameplate in a bucket whose fuel field denies it (held for vPIC)`);
  if (droppedN) {
    const top = [...drops].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${n} ${k}`).join(", ");
    report.notes.push(`top dropped (petrol and conventional/mild hybrids, correct): ${top}`);
  }
  report.truncated = report.errors.length > 0 || byVin.size < ENTERPRISE.minExpected;
  return report;
}
