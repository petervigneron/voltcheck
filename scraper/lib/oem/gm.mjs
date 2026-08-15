// GM brand-site inventory locators (chevrolet.com / gmc.com / cadillac.com).
//
// All GM brands run the same "aec-cp-discovery-api" behind their find-inventory
// pages: a public JSON search endpoint, no auth, no bot wall (verified from a
// plain Node fetch 2026-08-15 — control: tesla.com and ford.com/inventory both
// Akamai-403 the identical request). Every hit is a dealer-stock vehicle keyed
// by VIN, with dealer name/zip, trim, drive type, mileage and MSRP/dealer
// price — which makes this one extractor cover every franchised GM rooftop,
// including the ~1.5k dealer domains whose own sites sit behind bot walls.
//
// Request shape (reverse-engineered from the locator page's own XHR):
//   POST https://{host}/{prefix}/shopping/api/aec-cp-discovery-api/p/v1/vehicles/search
//   headers: client=T1_VSR, oemId=GM, programId={BRAND}, tenantId=0, dealerId=0
//   body: {filters:{geo:{zipCode,radius}, vehicleCategory:{values:["EV"]}},
//          sort, paymentTypes:["CASH"], pagination:{size,from}}
// Quirks that shape the code below:
//   - sort and paymentTypes are REQUIRED (400 without them)
//   - page size is silently capped at 20 whatever you ask for
//   - from+size beyond ~10k errors (ES result window), so the pull is
//     partitioned per model (largest model observed: ~3.6k)
//   - one zip + radius 3000 converges on the national count, so a single
//     fixed center covers the country (66952 ≈ geographic center of the US)
import { politePostJson } from "../http.mjs";

export const GM_BRANDS = [
  { key: "chevrolet", host: "www.chevrolet.com", prefix: "chevrolet", programId: "CHEVROLET", domain: "chevrolet.com", make: "Chevrolet", minExpected: 2000 },
  { key: "gmc", host: "www.gmc.com", prefix: "gmc", programId: "GMC", domain: "gmc.com", make: "GMC", minExpected: 300 },
  { key: "cadillac", host: "www.cadillac.com", prefix: "cadillac", programId: "CADILLAC", domain: "cadillac.com", make: "Cadillac", minExpected: 2000 },
  // Buick sells no US EVs as of 2026-08 (vehicleCategory EV facet: 0). Listed
  // so a future Buick EV shows up as a yield change, not silent absence.
  { key: "buick", host: "www.buick.com", prefix: "buick", programId: "BUICK", domain: "buick.com", make: "Buick", minExpected: 0 },
];

// recheck.mjs must skip these: locator coverage is complete every night, so
// the locator itself is the authoritative liveness signal — and their VDP
// sourceUrls are client-rendered app shells whose HTML echoes the VIN from
// the URL, which would fake "alive" forever.
export const OEM_LOCATOR_DOMAINS = new Set(GM_BRANDS.map((b) => b.domain));

const PAGE_SIZE = 20; // server cap; asking for more still returns 20
const WINDOW_MAX = 9980; // from+size must stay under the ~10k result window
const NATIONAL_ZIP = "66952";
const NATIONAL_RADII = [4000, 3000, 2000]; // first radius the API accepts wins

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// "PIERRE CHEVROLET" → "Pierre Chevrolet"; mixed-case names pass untouched.
function titleCaseIfShouty(s) {
  if (!s || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Gmc|Llc|Inc|Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());
}

// The hit's own image URL embeds every option code (~1.4KB per URL — real
// cost at 20k+ rows, in the DB payload and the repo snapshot alike). The
// renderer ignores everything past the paint code, so rebuild the short form:
// image.gen?i={year}/{body}/{body}__{trim}/{paint}gmds4.jpg (verified 200,
// same bytes as the full URL, 2026-08-15).
function shortImageUrl(url) {
  const m = String(url ?? "").match(/^(https:\/\/[^?]+\/image\.gen\?i=\d{4}\/[^/]+\/[^/]+\/)([A-Z0-9]{3})/);
  return m ? `${m[1]}${m[2]}gmds4.jpg&v=deg43&std=true&country=US` : undefined;
}

function toRecord(hit, brand) {
  const vin = String(hit.id ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(hit.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const cash = hit.pricing?.cash ?? {};
  // dealerFeaturedPrice is the dealer's advertised price; msrp is the honest
  // fallback. netPrice bakes in conditional incentives — never shown.
  const priceUsd = num(cash.dealerFeaturedPrice?.value) ?? num(cash.msrp?.value);
  const zipRaw = String(hit.dealer?.postalCode ?? "");
  const zip = /^\d{5}/.test(zipRaw) ? zipRaw.slice(0, 5) : undefined;
  const condRaw = String(hit.stockDetails?.condition ?? "").toUpperCase();
  const condition =
    condRaw === "NEW" ? "new" : /CERT|CPO/.test(condRaw) ? "certified" : /USED|PRE.?OWNED/.test(condRaw) ? "used" : undefined;
  const imageUrl = shortImageUrl(hit.images?.[0]?.url);
  const model = String(hit.model ?? "").trim();
  if (!model) return null;
  const q = `brand=${brand.key}&vinSlug=${vin}${zip ? `&postalCode=${zip}&zipCode=${zip}` : ""}&paymentType=CASH&radius=100`;
  return {
    vin,
    year,
    make: hit.make ?? brand.make,
    model,
    trim: hit.variant?.name || undefined,
    priceUsd,
    mileage: Number.isFinite(hit.mileage) ? Math.round(hit.mileage) : undefined,
    exteriorColor: hit.baseExteriorColor || undefined,
    driveLine: ["FWD", "AWD", "RWD", "4WD"].includes(hit.driveType) ? hit.driveType : undefined,
    stockNumber: hit.stockDetails?.stockNumber || undefined,
    dealerName: titleCaseIfShouty(hit.dealer?.name) || undefined,
    zip,
    condition,
    imageUrl,
    images: imageUrl ? [imageUrl] : [],
    sourceUrl: `https://${brand.host}/shopping/inventory/vehicle/${encodeURIComponent(model.toUpperCase())}/${year}?${q}`,
    dealerDomain: brand.domain,
    evKind: "BEV",
    evConfidence: "high", // vehicleCategory=EV filter + Electric fuelType, not a name match
    platform: "gm-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

function api(brand, path) {
  return `https://${brand.host}/${brand.prefix}/shopping/api/aec-cp-discovery-api/p/v1/vehicles/${path}`;
}

function headers(brand) {
  return { client: "T1_VSR", oemId: "GM", programId: brand.programId, tenantId: "0", dealerId: "0" };
}

async function search(brand, filters, from, report) {
  // One retry on transient failures (socket reset, 5xx, 429): a ~550-page
  // pull will hit the odd blip, and without the retry a single one aborts
  // the partition and costs the whole brand its complete certification
  // (observed on the first full run: one TypeError at blazer ev from=440).
  // A 4xx is an answer, not a blip — no retry, same rule as fetchPage.
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(api(brand, "search"), {
      headers: headers(brand),
      body: {
        filters,
        sort: { name: "distance", order: "ASC" },
        paymentTypes: ["CASH"],
        pagination: { size: PAGE_SIZE, from },
      },
    });
    report.fetched++;
    if (res.status === 200 && res.json?.data) return res.json.data;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    report.errors.push(`${res.status} search from=${from} ${JSON.stringify(filters).slice(0, 120)}`);
    return null;
  }
}

// Page one filter partition to exhaustion (or the result window's edge).
async function pullPartition(brand, filters, byVin, report) {
  let expected = Infinity;
  for (let from = 0; from < Math.min(expected, WINDOW_MAX); from += PAGE_SIZE) {
    const data = await search(brand, filters, from, report);
    if (!data) return; // error already recorded; truncated follows from it
    expected = data.count ?? 0;
    const hits = data.hits ?? [];
    if (!hits.length) return; // live drift shrank the partition — done
    for (const hit of hits) {
      const rec = toRecord(hit, brand);
      if (rec) byVin.set(rec.vin, rec);
    }
  }
  if (expected > WINDOW_MAX) {
    report.errors.push(`partition over result window (${expected}): ${JSON.stringify(filters).slice(0, 120)}`);
  }
}

// Pull one brand's complete national EV inventory. Returns a crawl.mjs-shaped
// report so merge-shards and db-sync treat locator output exactly like a
// crawl shard: truncated:false certifies complete coverage of brand.domain,
// which lets nightly delisting retire VINs the locator no longer returns.
export async function pullGmBrand(brand, { log = () => {} } = {}) {
  const report = { domain: brand.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  // Find the widest radius this deployment accepts (facets is the cheap probe).
  let geo = null;
  let facets = null;
  for (const radius of NATIONAL_RADII) {
    const res = await politePostJson(api(brand, "facets"), {
      headers: headers(brand),
      body: { filters: { geo: { zipCode: NATIONAL_ZIP, radius }, vehicleCategory: { values: ["EV"] } } },
    });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows the locator API path");
      report.truncated = true;
      return report;
    }
    if (res.status === 200 && res.json?.data) {
      geo = { zipCode: NATIONAL_ZIP, radius };
      facets = res.json.data;
      break;
    }
    report.notes.push(`facets radius ${radius} → ${res.status}`);
  }
  if (!facets) {
    report.errors.push("no accepted national radius — endpoint changed or down");
    report.truncated = true;
    return report;
  }

  const models = (facets.model ?? []).filter((m) => m.count > 0);
  const total = facets.count ?? 0;
  report.notes.push(`national EV count ${total} across ${models.length} models (radius ${geo.radius})`);
  log(`${brand.key}: ${total} EVs in ${models.length} models`);

  const byVin = new Map();
  for (const m of models) {
    const value = m.values?.[0];
    if (!value) continue;
    const filters = { geo, vehicleCategory: { values: ["EV"] }, model: { values: [value] } };
    if (m.count <= WINDOW_MAX) {
      await pullPartition(brand, filters, byVin, report);
    } else {
      // A single model past the window (not yet observed; largest ≈ 3.6k) —
      // split by model year, the only other facet guaranteed small.
      for (const y of facets.year ?? []) {
        await pullPartition(brand, { ...filters, year: { values: y.values } }, byVin, report);
      }
    }
    log(`${brand.key}/${value}: ${byVin.size} cumulative VINs`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;

  // Completeness, spelled out: truncated:false === "delisting may trust this
  // run" === every partition paged to its end with zero errors AND the yield
  // clears the brand's sanity floor (a half-dead API must never certify).
  // Live drift between the facet count and collected VINs is expected (cars
  // sell mid-pull); a >10% shortfall means paging itself broke.
  const shortfall = total > 0 && byVin.size < total * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size} of ${total} — paging shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < brand.minExpected;
  return report;
}
