// Team Velocity platform (teamvelocityportal.com).
//
// PRIMARY PATH is the platform's own open inventory API — one call returns a
// rooftop's whole lot as JSON, so the per-VDP HTML scraping below is now the
// fallback for a page we happen to have in hand. Every Team Velocity page
// carries the rooftop's ids inline (`var accountId = '71000'; var campaignId =
// '7226';`), and
//   GET websites.api.teamvelocityportal.com/tvm-services/inventory/vehicles
//        ?AccountID=&CampaignId=&Type=All&Limit=
// answers a plain browser-UA GET (no auth, no token) with vin, year/make/model/
// trim, miles, sellingPrice, the declared fuel, condition and the VDP url. It
// also lives on the Team Velocity host, so it clears the Akamai wall that 403s
// some dealer front-ends. See lib/platforms/overfuel.mjs for the same shape.
//
// Type=All, not Type=Used: the call was hard-coded to Type=Used, which made
// every new-inventory car at every Team Velocity rooftop invisible — caught
// 2026-08-20 on vwofoakland.com, whose site shows 4 new ID. Buzz that the
// crawl never saw. Probed live: Type=Used and Type=New each return only their
// own condition, but Type=All pages New and Used together (verified against
// vwofoakland.com: 96 used + 125 new = 221, matching a Type=All walk exactly,
// with a page short of Limit still correctly ending it). No server-side fuel
// filter is added here — same house rule as dealercom-api.mjs and
// dealeron-api.mjs: pull the whole lot and let classifyEv decide downstream,
// because a server-side EV filter was tried once and false-delisted real cars.
//
// EV signal (verified against live lots, do not simplify): `isElectric` means
// "plugs in", NOT battery-electric — on truwestcdjr its three isElectric cars
// are Jeep 4xe PHEVs with fuel_Type "Hybrid Fuel". And `isElectric` UNDER-counts
// BEVs: a Dublin BMW i4 carried isElectric=false with fuel_Type "Electric Fuel
// System". So fuel_Type is the reliable marker: /electric/ → BEV; isElectric +
// /hybrid/ → PHEV. We hand classifyEv a fuelType string built from those and let
// it make the call, exactly as every other lane does.
import { classifyEv } from "../ev.mjs";
import { politeGetJson } from "../http.mjs";
import { TV_SELLING } from "../price-provenance.mjs";

const API = "https://websites.api.teamvelocityportal.com/tvm-services/inventory/vehicles";
const API_LIMIT = 200;
const API_MAX_PAGES = 30; // runaway guard; a page < limit ends the walk
const TV_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const posNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// The rooftop's ids, read from any Team Velocity page's inline globals.
export function teamVelocityApiIds(html) {
  if (typeof html !== "string") return null;
  const accountId = html.match(/\baccountId\s*=\s*['"](\d+)['"]/)?.[1];
  const campaignId = html.match(/\bcampaignId\s*=\s*['"](\d+)['"]/)?.[1];
  if (!accountId || !campaignId) return null;
  return { accountId, campaignId };
}

// The declared fuel, mapped so classifyEv reads it: fuel_Type names the BEVs
// ("Electric Fuel System"); a plug-in shows up as isElectric with a hybrid
// fuel_Type. Anything else is left as-is (classifyEv returns not-EV).
function fuelTypeFor(r) {
  const f = String(r.fuel_Type ?? "");
  if (/electric/i.test(f)) return "Electric";
  if (r.isElectric && /hybrid/i.test(f)) return "Plug-in Hybrid Electric";
  return f || undefined;
}

// One API record → schema.org Vehicle node, shaped like the other producers.
// The price is `sellingPrice` (the dealer-shown asking price); internetPrice is
// 0 on real cars, so it is never used — the false-bargain guardrail, same as the
// dealer.com resolver. Exported for the classification test.
export function teamVelocityApiVehicle(r) {
  const vin = String(r?.vin ?? "").toUpperCase();
  if (!TV_VIN_RE.test(vin)) return null;
  const vdp = typeof r.vdpUrl === "string" && /^https?:\/\//.test(r.vdpUrl) ? r.vdpUrl : undefined;
  const cond = String(r.type ?? "").toLowerCase();
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: r.year != null ? String(r.year) : undefined,
    brand: r.make || undefined,
    model: r.model || undefined,
    vehicleConfiguration: r.trim || undefined,
    name: [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer: posNum(r.miles) != null ? { "@type": "QuantitativeValue", value: Number(r.miles) } : undefined,
    color: r.exteriorColor || undefined,
    vehicleInteriorColor: r.interiorColor || undefined,
    driveWheelConfiguration: DRIVES.has(String(r.driveTrain ?? "").toUpperCase()) ? String(r.driveTrain).toUpperCase() : undefined,
    sku: r.stockNumber ? String(r.stockNumber) : undefined,
    image: typeof r.firstPhotoUrl === "string" && r.firstPhotoUrl ? [r.firstPhotoUrl] : undefined,
    itemCondition: cond === "new" ? "new" : "used",
    fuelType: fuelTypeFor(r),
    vehicleEngine: { "@type": "EngineSpecification", fuelType: fuelTypeFor(r) },
    offers: {
      "@type": "Offer",
      price: posNum(r.sellingPrice) ?? posNum(r.yourPrice),
      // Not the page's JSON-LD offer — this node is assembled from the API
      // record, so it names its own field (lib/price-provenance.mjs).
      priceProvenance: TV_SELLING,
      priceCurrency: "USD",
      url: vdp,
      seller: {
        "@type": "AutoDealer",
        name: r.dealerName || r.clientName || undefined,
        address: {
          "@type": "PostalAddress",
          addressLocality: r.addressCity || undefined,
          addressRegion: r.addressState || undefined,
          postalCode: r.addressZip || undefined,
        },
      },
    },
    // carried through for the caller's per-car rooftop attribution
    certified: r.certified === true || /certified|cpo/i.test(String(r.certifiedType ?? "")) || undefined,
  };
}

const apiUrl = (ids, page) =>
  `${API}?AccountID=${ids.accountId}&CampaignId=${ids.campaignId}&Type=All&Limit=${API_LIMIT}&Page=${page}`;

// Page a rooftop's whole lot (new + used + CPO) to completion, returning
// schema.org nodes. `complete` is true only when a short page ends the walk
// (offset-vs-total is not trusted; the endpoint has no reliable total on this
// call). A partial pull leaves complete=false so the caller never certifies a
// crawl it didn't finish.
export async function pullTeamVelocityApi(ids) {
  const out = [];
  let ok = false;
  let reachedEnd = false;
  for (let page = 1; page <= API_MAX_PAGES; page++) {
    const { status, json } = await politeGetJson(apiUrl(ids, page));
    const cars = json?.inventoryVehicles;
    if (status !== 200 || !Array.isArray(cars)) break;
    ok = true;
    for (const r of cars) {
      const node = teamVelocityApiVehicle(r);
      if (node) out.push(node);
    }
    if (cars.length < API_LIMIT) {
      reachedEnd = true;
      break;
    }
  }
  return { vehicles: out, complete: ok && reachedEnd, found: out.length, ok };
}

// Cheap probe liveness: one request, does this rooftop hold VIN'd inventory?
export async function countTeamVelocityApi(ids) {
  const { status, json } = await politeGetJson(apiUrl(ids, 1));
  const cars = json?.inventoryVehicles;
  if (status !== 200 || !Array.isArray(cars)) return { ok: false, found: 0, hasVin: false };
  return { ok: true, found: cars.length, hasVin: cars.some((r) => TV_VIN_RE.test(String(r?.vin ?? "").toUpperCase())) };
}

function grabVar(html, name) {
  const m = html.match(new RegExp(`var\\s+${name}\\s*=\\s*["']([^"']*)["']`));
  return m && m[1] !== "" ? m[1] : undefined;
}

export function extractTeamVelocity(html) {
  const vin = grabVar(html, "vin");
  if (!vin) return null;
  // `miles` is server-rendered as a ternary literal — new-inventory pages
  // read '0', everything else carries the real odometer figure as the
  // else-branch, e.g. var miles = 'cpo' ==='new' ? '0':'23584';
  const milesMatch = html.match(
    /var\s+miles\s*=\s*['"]([^'"]*)['"]\s*===\s*['"]new['"]\s*\?\s*['"]0['"]\s*:\s*['"](\d+)['"]/
  );
  const mileage = milesMatch
    ? milesMatch[1] === "new"
      ? 0
      : Number(milesMatch[2])
    : undefined;
  return {
    vin: vin.toUpperCase(),
    stockNumber: grabVar(html, "stockNumber"),
    trim: grabVar(html, "trim"),
    driveTrain: grabVar(html, "driveTrain"),
    vehicleType: grabVar(html, "vehicleType"), // "new" | "used" | "cpo"
    exteriorColor: grabVar(html, "vdpVehicleExteriorColor"),
    interiorColor: grabVar(html, "vdpVehicleInteriorColor"),
    mileage,
    dealer: {
      name: grabVar(html, "clientName"),
      city: grabVar(html, "city"),
      state: grabVar(html, "state"),
      zip: grabVar(html, "zip"),
    },
  };
}

const DRIVES = new Set(["FWD", "RWD", "AWD", "4WD"]);

// Merge Team Velocity fields into a normalized record. Mileage passes through
// verbatim including 0 for new inventory (same standing as dealeron.mjs: the
// dealer's own page shows "Mileage: 0" to shoppers on these cars).
export function enrichFromTeamVelocity(rec, data) {
  if (!data || data.vin !== rec.vin) return rec;
  return {
    ...rec,
    mileage: data.mileage ?? rec.mileage,
    trim: data.trim ?? rec.trim,
    driveLine: DRIVES.has(data.driveTrain) ? data.driveTrain : rec.driveLine,
    exteriorColor: data.exteriorColor ?? rec.exteriorColor,
    interiorColor: data.interiorColor ?? rec.interiorColor,
    certified: data.vehicleType === "cpo" || undefined,
    stockNumber: data.stockNumber ?? rec.stockNumber,
    city: data.dealer.city ?? rec.city,
    state: data.dealer.state ?? rec.state,
    zip: data.dealer.zip ?? rec.zip,
    dealerName: data.dealer.name ?? rec.dealerName,
    platform: "team-velocity",
  };
}
