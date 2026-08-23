// Driveway (Lithia Motors' national storefront, ~300 rooftops), the complete
// national used-EV set via its shop GraphQL API.
//
// Driveway is a Next.js SPA. The SEO category pages (/shop/used/<body>/<make>/
// <model>/<fuel>) server-render an inventoryJsonLd ItemList, but that list is
// CAPPED at 24 vehicles per category and the page exposes no pagination — so
// the old lib/platforms/driveway.mjs SSR reader could never see past the first
// 24 of a busy model, and a national used-Model-3 category (75 cars) came back
// as 24. That is why Driveway crawled truncated with a fraction of its EVs.
//
// The site itself pages through a plain GraphQL endpoint (captured live 2026-
// 08-18 by watching the "next page" button in a real browser):
//   POST https://api-gateway.driveway.com/shop/gql/v5/graphql
//   header Ocp-Apim-Subscription-Key: <static client key, also used by the
//     site's /api/geolocation call — public, baked into the bundle>
//   query search(commonInputs){ pageInfo{ totalItems } vehicleResults{ … } }
// filterInput takes vehicleConditions + fuelTypes server-side and
// paginationInput is a clean {items, skip} offset with an exact totalItems, so
// one filtered sweep (fuelTypes Electric + PHEV, conditions USED + CPO) returns
// every used EV Driveway has — 1,583 on the capture day (1,046 BEV + PHEVs),
// vs the few hundred the 24-cap allowed. No auth beyond the public key, no bot
// wall (contrast Tesla/Ford's Akamai 403s).
//
// This lane REPLACES the dealer-crawl path for driveway.com: the domain is
// taken out of the working crawl set (registry note), so only this puller
// reports it — a complete national sweep, truncated:false, licensing nightly
// db-sync to retire sold VINs, exactly like enterprise.mjs. recheck skips it
// (OEM_LOCATOR_DOMAINS) since the sweep is its own liveness check.
//
// PHEVs are included (fuelTypes ["Electric","PHEV"]) because the site lumps
// EVs + PHEVs; the source's own fuel facet is authoritative, so evKind is set
// straight from it rather than routed through classifyEv (whose fuel-string
// path doesn't yet admit "Plug-in Hybrid" — a separate, cross-lane fix).
import { politePostJson } from "../http.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const DRIVEWAY = {
  key: "driveway",
  domain: "driveway.com",
  apiUrl: "https://api-gateway.driveway.com/shop/gql/v5/graphql",
  // Static public client key (Azure APIM subscription key). If Driveway rotates
  // it the sweep 401s → truncated + error → the shortfall alert fires and
  // someone re-captures it from the site.
  subscriptionKey: "e6c1852eb5124b1890fbd17ad53e870a",
  minExpected: 400, // 1,583 on first capture; alert well below that
};

// recheck.mjs skips this domain: the nightly sweep is the complete national set
// and its truncated:false already retires gone VINs, and every VDP it points at
// is a driveway.com page this same pull certified.
export const OEM_LOCATOR_DOMAINS = new Set([DRIVEWAY.domain]);

const PAGE_SIZE = 200;
const MAX_PAGES = 60; // 12k ceiling — ~8x today's count, pure runaway guard
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const CURRENT_YEAR = new Date().getFullYear();

const SEARCH_QUERY = `query Search($commonInputs: VehicleCommonInputsInput) {
  search(commonInputs: $commonInputs) {
    pageInfo { totalItems items skip }
    vehicleResults {
      vehicleId vin fuel condition mileage price msrp
      ymmt { year make model trim }
      exteriorColor { name }
      image { heroUrl }
      dealership { state }
    }
  }
}`;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// The source's fuel facet is exact: "Electric" is a pure BEV bucket, "PHEV" the
// plug-in hybrids. Anything else means the fuelTypes filter drifted.
function evKindFromFuel(fuel) {
  const f = String(fuel ?? "").toUpperCase();
  if (f === "ELECTRIC") return "BEV";
  if (f === "PHEV") return "PHEV";
  return null;
}

function toRecord(v) {
  const vin = String(v?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const evKind = evKindFromFuel(v.fuel);
  if (!evKind) return null; // server-side filter guard
  const ymmt = v.ymmt ?? {};
  const year = Number(ymmt.year);
  if (!(year >= 1981 && year <= CURRENT_YEAR + 2)) return null;
  const make = String(ymmt.make ?? "").trim();
  const model = String(ymmt.model ?? "").trim();
  if (!make || !model) return null;
  const vehicleId = String(v.vehicleId ?? "").trim();
  const hero = typeof v.image?.heroUrl === "string" && v.image.heroUrl.startsWith("https://") ? v.image.heroUrl : undefined;
  // condition is "USED" or "CPO"; a CPO car is dealer-certified used.
  const condition = String(v.condition ?? "").toUpperCase() === "CPO" ? "certified" : "used";
  return {
    vin,
    year,
    make,
    model,
    trim: String(ymmt.trim ?? "").trim() || undefined,
    // Driveway's advertised price, in dollars. `price` is the no-haggle figure
    // the card shows; priceWithFees (doc fees added) is deliberately not used —
    // the higher, unconditional number is the honest one to print.
    ...pickTaggedPrice("driveway", [
      ["price", num(v.price)],
    ]),
    mileage: num(v.mileage),
    exteriorColor: v.exteriorColor?.name || undefined,
    dealerName: "Driveway",
    state: v.dealership?.state || undefined,
    condition,
    imageUrl: hero,
    images: hero ? [hero] : undefined,
    sourceUrl: vehicleId ? `https://www.driveway.com/shop/vehicle/${vehicleId}` : `https://www.driveway.com/`,
    dealerDomain: DRIVEWAY.domain,
    evKind,
    evConfidence: "high", // server-side fuel facet, not a name match
    platform: "driveway-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

function variables(skip) {
  return {
    commonInputs: {
      filterInput: {
        vehicleConditions: ["USED", "CPO"],
        fuelTypes: ["Electric", "PHEV"],
      },
      paginationInput: { items: PAGE_SIZE, skip },
      // National inventory ships anywhere, so location only affects sort; a
      // fixed central point keeps the sweep deterministic across nights.
      userLocation: { postalCode: "66952", state: "KS" },
      sortCriteria: "RELEVANCE",
    },
  };
}

async function searchPage(skip, report) {
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(DRIVEWAY.apiUrl, {
      headers: {
        "Ocp-Apim-Subscription-Key": DRIVEWAY.subscriptionKey,
        origin: "https://www.driveway.com",
        referer: "https://www.driveway.com/",
      },
      body: { query: SEARCH_QUERY, variables: variables(skip) },
    });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows the shop GraphQL endpoint");
      return null;
    }
    const search = res.json?.data?.search;
    if (res.status === 200 && search) return search;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    report.errors.push(`${res.status} skip=${skip}${res.json?.errors ? " " + JSON.stringify(res.json.errors).slice(0, 160) : ""}`);
    return null;
  }
}

// Pull Driveway's complete national used-EV stock (BEV + PHEV). crawl.mjs-shaped
// report; see gm.mjs/enterprise.mjs for the completeness contract
// (truncated:false certifies driveway.com fully covered, licensing db-sync
// delisting).
export async function pullDriveway({ log = () => {} } = {}) {
  const report = { domain: DRIVEWAY.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const byVin = new Map();
  let total = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const search = await searchPage(page * PAGE_SIZE, report);
    if (!search) break; // error recorded; truncated follows
    total = Number(search.pageInfo?.totalItems) || total;
    const results = search.vehicleResults ?? [];
    for (const v of results) {
      const rec = toRecord(v);
      if (rec) byVin.set(rec.vin, rec);
    }
    log(`driveway: page ${page}, ${byVin.size}/${total} EV VINs`);
    if (!results.length || (page + 1) * PAGE_SIZE >= total) break;
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`national used EV count ${total}; ${report.evs.length} collected`);
  const shortfall = total > 0 && byVin.size < total * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size} of ${total} — paging shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < DRIVEWAY.minExpected;
  return report;
}
