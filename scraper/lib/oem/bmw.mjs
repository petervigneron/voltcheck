// BMW national inventory locator (bmwusa.com).
//
// BMW's find-inventory tool posts to a public GraphQL endpoint that needs no
// auth token (just an Origin) — verified open from a plain Node fetch
// 2026-08-15 (control: tesla.com/ford.com still Akamai-403 the same request;
// bmwusa.com/inventory/graphql returns 200 and even answers introspection).
// The endpoint accepts arbitrary queries, so we send a compact one.
//
// Unlike Nissan's distance-capped GraphQL, BMW's getInventory takes a
// locatorRange (radius, miles) AND paginates cleanly, so ONE nationwide sweep
// covers the country:
//   getInventory(zip, bucket: STOCK, filter: {fuelTypes:"E", locatorRange:7000},
//                pagination: {pageSize, pageIndex})
// fuelTypes "E" is the Electric (BEV) facet — pure battery-electric. PHEVs sit
// under "X", and that facet is swept too (probed 2026-08-23: 5,726 national —
// X5 xDrive50e, 550e/750e xDrive, XM, M5 — every nameplate in it is a real
// plug-in; BMW sells no conventional hybrid in the US and fuelTypes "H"
// returns 0, so the X bucket has nothing non-plug-in to admit). Each record
// restates its own fuelType, and toRecord() gates on that rather than
// trusting the query facet; PHEV rows ship evKind "PHEV" and vpic-enrich
// re-verifies them per VIN (an M5's ElectrificationLevel really is PHEV).
// locatorRange 7000 from any populated ZIP returns the same national
// set (~2k BEV i4/i5/i7/iX + ~5.7k PHEV), so we page every page and certify
// COMPLETE — real domain bmwusa.com, so nightly delisting retires sold VINs
// (see gm.mjs).
//
// bucket is STOCK (on-lot dealer stock) — the available-now new set. PIPELINE
// (in-transit/build) and BYO are intentionally excluded. BMW CPO/used lives on
// a separate platform (bmwusa.com/{usedcars,preowned}/graphql both 404), not
// this endpoint — a future used lane.
//
// Each hit carries a real dealer VDP (vehicleDetailsPage, e.g. a dealer.com
// page), used as the click-through sourceUrl. The record's dealerDomain is the
// brand domain bmwusa.com (the completeness/delisting key, like GM's
// chevrolet.com), NOT the physical dealer — the API exposes only a coded
// dealerId, no dealer name/city, so dealer geo is left blank (a known gap).
import { politePostJson } from "../http.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const BMW = {
  key: "bmw",
  domain: "bmwusa.com",
  make: "BMW",
  api: "https://www.bmwusa.com/inventory/graphql",
  locatorRange: 7000, // miles from the query ZIP — spans the country
  minExpected: 800,
};

// recheck.mjs skips this: the sweep is complete national coverage nightly, so
// db-sync's truncated:false already retires gone VINs — and rechecking every
// dealer VDP would be thousands of same-host fetches (same rule as GM).
export const OEM_LOCATOR_DOMAINS = new Set([BMW.domain]);

const PAGE_SIZE = 100; // server accepts this; ~2k BEV + ~5.7k PHEV ⇒ ~80 pages
const NATIONAL_ZIP = "66952"; // any populated ZIP works; range does the rest
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The two electrified facets, each swept to exhaustion. The code is what the
// record's own fuelType field echoes back; toRecord() requires that echo.
const FUEL_SWEEPS = [
  { code: "E", evKind: "BEV", label: "Electric" },
  { code: "X", evKind: "PHEV", label: "Plug-in Hybrid" },
];

const QUERY = `query($zip: String!, $bucket: BucketType!, $filter: FilterInput, $pagination: PaginationInput) {
  getInventory(zip: $zip, bucket: $bucket, filter: $filter, pagination: $pagination) {
    numberOfFilteredVehicles
    totalPages
    result {
      vin name modelYear totalMsrp baseMsrp
      fuelType used sold
      exteriorGenericColor interiorGenericColor
      engineDriveType { name }
      initialCOSYURL
      vehicleDetailsPage
    }
  }
}`;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/XDRIVE|AWD|ALL.?WHEEL/.test(s)) return "AWD";
  if (/SDRIVE|EDRIVE|RWD|REAR/.test(s)) return "RWD";
  return undefined;
};

const httpsUrl = (u) => {
  const s = String(u ?? "").trim();
  return s.startsWith("https://") ? s : s.startsWith("http://") ? "https://" + s.slice(7) : undefined;
};

// "i7 xDrive60" → model "i7", trim "xDrive60"; "iX xDrive45" → "iX" / "xDrive45".
// Some PHEV names restate the make ("BMW XM Label") — strip that first, or the
// model comes out as "BMW".
function splitName(name) {
  const s = String(name ?? "").replace(/^BMW\s+/i, "").trim();
  if (!s) return { model: "", trim: undefined };
  const sp = s.indexOf(" ");
  if (sp < 0) return { model: s, trim: undefined };
  return { model: s.slice(0, sp), trim: s.slice(sp + 1).trim() || undefined };
}

function toRecord(v, sweep) {
  const vin = String(v.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  // Structured guard: the record's own fuelType must echo the queried facet
  // ("E" battery-electric, "X" plug-in hybrid) — trust the row, not the query.
  if (String(v.fuelType ?? "").toUpperCase() !== sweep.code) return null;
  if (v.used || v.sold) return null; // STOCK is new+available; drop any stray used/sold flag
  const year = Number(v.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return null;
  const { model, trim } = splitName(v.name);
  if (!model) return null;
  const img = httpsUrl(v.initialCOSYURL);
  const vdp = httpsUrl(v.vehicleDetailsPage);
  return {
    vin,
    year,
    make: BMW.make,
    model,
    trim,
    ...pickTaggedPrice("bmw", [
      ["totalMsrp", num(v.totalMsrp)],
      ["baseMsrp", num(v.baseMsrp)],
    ]),
    driveLine: drive(v.engineDriveType?.name),
    exteriorColor: v.exteriorGenericColor || undefined,
    interiorColor: v.interiorGenericColor || undefined,
    condition: "new",
    imageUrl: img,
    images: img ? [img] : [],
    // Real dealer VDP for click-through when present; else the brand search.
    sourceUrl: vdp || "https://www.bmwusa.com/inventory.html",
    dealerDomain: BMW.domain,
    evKind: sweep.evKind,
    // BMW's own machine fuel code, restated per record — what downstream
    // verification reads alongside the model name.
    fuelType: sweep.label,
    evConfidence: "high", // server-side fuelTypes facet + per-record echo, not a name match
    platform: "bmw-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

async function searchPage(fuelCode, pageIndex, report) {
  const variables = {
    zip: NATIONAL_ZIP,
    bucket: "STOCK",
    filter: { fuelTypes: fuelCode, locatorRange: BMW.locatorRange },
    pagination: { pageSize: PAGE_SIZE, pageIndex },
  };
  for (let attempt = 0; ; attempt++) {
    const res = await politePostJson(BMW.api, { headers: { origin: "https://www.bmwusa.com" }, body: { query: QUERY, variables } });
    report.fetched++;
    if (res.status === "robots_disallowed") { report.errors.push("robots disallows the graphql endpoint"); return null; }
    if (res.status === 200 && res.json?.data?.getInventory) return res.json.data.getInventory;
    if (res.status === 200 && res.json?.errors) {
      // "INTERNAL_ERROR for <uuid>" is BMW's transient upstream hiccup: the
      // deep PHEV sweep (58 pages) reliably hits one mid-walk and the same
      // page answers on retry (observed 2026-08-23, page 18/58). Retry it
      // like a 5xx; only a repeat is a real error.
      const msg = String(res.json.errors[0]?.message ?? "");
      if (attempt === 0 && /INTERNAL_ERROR/i.test(msg)) { await new Promise((r) => setTimeout(r, 5000)); continue; }
      report.errors.push(`gql: ${msg.slice(0, 100)}`);
      return null;
    }
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`${res.status} page=${pageIndex}`);
    return null;
  }
}

// Pull BMW's complete national new BEV + PHEV inventory (one sweep per fuel
// facet, one shared report — bmwusa.com must never be certified complete on
// half its electrified stock, see kia.mjs for the same rule). crawl.mjs-shaped
// report; see gm.mjs for the completeness contract (truncated:false certifies
// bmwusa.com fully covered, licensing nightly delisting).
export async function pullBmw({ log = () => {} } = {}) {
  const report = { domain: BMW.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };

  const byVin = new Map();
  let grandTotal = 0;
  for (const sweep of FUEL_SWEEPS) {
    const first = await searchPage(sweep.code, 0, report);
    if (!first) {
      report.errors.push(`first ${sweep.code} page failed — endpoint changed or down`);
      continue;
    }
    const total = first.numberOfFilteredVehicles ?? 0;
    const totalPages = first.totalPages ?? 1;
    grandTotal += total;
    report.notes.push(`national ${sweep.evKind} count ${total} across ${totalPages} pages`);
    log(`bmw/${sweep.evKind}: ${total} vehicles, ${totalPages} pages`);

    const collect = (items) => {
      for (const v of items ?? []) {
        const rec = toRecord(v, sweep);
        if (rec) byVin.set(rec.vin, rec);
      }
    };
    collect(first.result);

    for (let page = 1; page < totalPages; page++) {
      const data = await searchPage(sweep.code, page, report);
      if (!data) break; // error recorded; truncated follows
      collect(data.result);
      if (page % 5 === 0) log(`bmw/${sweep.evKind}: page ${page}/${totalPages}, ${byVin.size} VINs`);
    }
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  // Completeness (see gm.mjs): every page of every sweep fetched cleanly AND
  // yield over floor. Live drift between the reported count and collected VINs
  // is expected.
  const shortfall = grandTotal > 0 && byVin.size < grandTotal * 0.9;
  if (shortfall) report.errors.push(`collected ${byVin.size} of ${grandTotal} — paging shortfall`);
  report.truncated = report.errors.length > 0 || byVin.size < BMW.minExpected;
  return report;
}
