// Hyundai national inventory locator (hyundaiusa.com).
//
// Hyundai's find-inventory page (Search Inventory) is powered by a public
// JSON search API with no auth token — verified from a plain Node fetch
// 2026-08-15 (control: tesla.com and ford.com/inventory both Akamai-403 the
// identical request; Hyundai returns 200). One POST covers the whole country:
//   POST https://papp-bsi-api.hyundaiusa.com/inventory/item/v2/search
//   body: { zipCode, distance:-1 (nationwide), page, pageSize, sort,
//           filterTag:"fuelType", fuelType:["Electric"], ... }
// The "Electric" fuel-type facet is pure BEV (PHEVs sit under a separate
// "Plug-in Hybrid" facet), so every hit is a battery-electric car with VIN,
// MSRP/dealer price, trim, drivetrain, colors, dealer name and a VDP link.
// ~5.2k EVs nationwide (2026-08-15), which — like the GM lane — covers every
// franchised Hyundai rooftop including any behind a dealer-site bot wall.
//
// Quirks that shape the code below:
//   - pageSize is capped at 30 whatever you ask for; paginate to totalPages
//   - deep pages work (page 170+ returns rows) — no ~10k result-window cap
//     like GM's, and the EV count is well under it regardless
//   - records carry dealerCode (state-prefixed, e.g. "KS022") and dealerName
//     but no dealer zip; state is taken from the code prefix, precise
//     distance is left to a future dealerCode→zip map
import { politePostJson } from "../http.mjs";

export const HYUNDAI = {
  key: "hyundai",
  domain: "hyundaiusa.com",
  make: "Hyundai",
  api: "https://papp-bsi-api.hyundaiusa.com/inventory/item/v2/search",
  minExpected: 1000,
};

const PAGE_SIZE = 30; // server cap
const NATIONAL_ZIP = "66952"; // ~geographic center of the US; distance:-1 = nationwide
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// dealerCode prefixes are USPS state codes ("KS022" → KS). Validate against the
// real set so a non-state prefix becomes "no state" rather than a fake one.
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
  if (/AWD|ALL.?WHEEL/.test(s)) return "AWD";
  if (/RWD|REAR/.test(s)) return "RWD";
  if (/FWD|FRONT/.test(s)) return "FWD";
  return undefined;
};

// scene7 image URLs arrive protocol-relative ("//s7d1.scene7.com/…").
const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  if (!s) return undefined;
  return s.startsWith("//") ? `https:${s}` : s.startsWith("http") ? s : undefined;
};

function toRecord(hit) {
  const vin = String(hit.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(hit.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const model = String(hit.modelDisplayName || hit.model || "").trim();
  if (!model) return null;
  const priceUsd = num(hit.dealerInternetPrice) ?? num(hit.msrp) ?? num(hit.startingMsrp);
  const state = US_STATES.has(String(hit.dealerCode ?? "").slice(0, 2).toUpperCase())
    ? hit.dealerCode.slice(0, 2).toUpperCase()
    : undefined;
  const img = httpsUrl(hit.exteriorImage || hit.defaultExteriorImage || hit.bsiExteriorImage);
  const vdp = httpsUrl(hit.dealerVDPURL);
  return {
    vin,
    year,
    make: hit.make ? hit.make.charAt(0) + hit.make.slice(1).toLowerCase() : HYUNDAI.make,
    model,
    trim: hit.trimDisplayName || hit.trim || undefined,
    priceUsd,
    driveLine: drive(hit.drivetrainName || hit.drivetrain),
    exteriorColor: hit.exteriorColor ? titleCase(hit.exteriorColor) : undefined,
    interiorColor: hit.interiorColor ? titleCase(hit.interiorColor) : undefined,
    dealerName: hit.dealerName || undefined,
    state,
    condition: "new", // Hyundai search returns dealer new stock (inventoryStatusCode DS)
    imageUrl: img,
    images: img ? [img] : [],
    // Prefer the dealer's own VDP for click-through; else the brand search page.
    sourceUrl: vdp || `https://www.hyundaiusa.com/us/en/inventory-search`,
    dealerDomain: HYUNDAI.domain,
    evKind: "BEV",
    evConfidence: "high", // server-side fuelType=Electric facet, not a name match
    platform: "hyundai-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

async function searchPage(page, report) {
  const body = {
    zipCode: NATIONAL_ZIP,
    distance: -1,
    page,
    pageSize: PAGE_SIZE,
    sort: { attributeName: "distance", order: "asc" },
    atDealershipOnly: false,
    availableOnline: false,
    filterTag: "fuelType",
    fuelType: ["Electric"],
    personalization: null,
  };
  // One retry on transient failures, same rationale as the GM lane: a ~174-page
  // pull will hit the occasional blip, and aborting mid-pull would forfeit the
  // complete-coverage certification that licenses delisting.
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(HYUNDAI.api, {
      headers: { origin: "https://www.hyundaiusa.com", referer: "https://www.hyundaiusa.com/" },
      body,
    });
    report.fetched++;
    if (res.status === 200 && res.json?.data) return res.json.data;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    report.errors.push(`${res.status} search page=${page}`);
    return null;
  }
}

// Pull Hyundai's complete national BEV inventory. Returns a crawl.mjs-shaped
// report so merge-shards/db-sync treat it exactly like a crawl shard (see
// lib/oem/gm.mjs for the completeness contract).
export async function pullHyundai({ log = () => {} } = {}) {
  const report = { domain: HYUNDAI.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  const first = await searchPage(1, report);
  if (!first) {
    report.errors.push("first page failed — endpoint changed or down");
    report.truncated = true;
    return report;
  }
  const total = first.total ?? 0;
  const totalPages = first.totalPages ?? 1;
  report.notes.push(`national BEV count ${total} across ${totalPages} pages`);
  log(`hyundai: ${total} EVs, ${totalPages} pages`);

  const byVin = new Map();
  const collect = (items) => {
    for (const hit of items ?? []) {
      const rec = toRecord(hit);
      if (rec) byVin.set(rec.vin, rec);
    }
  };
  collect(first.items);

  for (let page = 2; page <= totalPages; page++) {
    const data = await searchPage(page, report);
    if (!data) break; // error recorded; truncated follows
    collect(data.items);
    if (page % 25 === 0) log(`hyundai: page ${page}/${totalPages}, ${byVin.size} VINs`);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  // Completeness (see gm.mjs): every page fetched cleanly AND yield over floor.
  const shortfall = total > 0 && byVin.size < total * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size} of ${total} — paging shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < HYUNDAI.minExpected;
  return report;
}
