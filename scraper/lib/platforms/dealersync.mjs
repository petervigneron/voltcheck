// DealerSync platform extractor.
//
// DealerSync is a dealer-website vendor used by a cluster of small independent
// lots (CarFinders in Littleton CO among them). The probe filed these as
// "no lead token" — its static-HTML scan found no schema.org Vehicle, no known
// platform host it recognised, and numeric-id VDP URLs it couldn't key on. But
// the served HTML is only a shell: the inventory is fetched in the browser from
// a clean same-origin JSON API the static scan never sees —
//   GET /Inventory/Search?IsSold=0&startIndex=N&results=50
//   -> { Success, totalResults, vehicles: [ {Vin, Year, Make, Model, Trim,
//        VehicleTitle, FinalPrice, InternetPrice, IncentiveDiscount, Fuel,
//        Mileage, Drivetrain, StockNo, VehicleId, FirstImageUrl, IsNew}, … ] }
// The page size is fixed at 10 regardless of `results`, so we walk startIndex
// by 10 to totalResults. No login, no bot-detection: this is the request the
// dealer's own inventory grid makes.
//
// This is why the "unknown" dark-tail pile is not empty — a chunk of it is
// API-backed vendors whose runtime fetch a static probe cannot observe. The
// lesson from Dealr applies: don't conclude "no inventory" from the served HTML;
// the whole lot is one JSON call away.
//
// Like the other API-backed producers it exports a puller (`pullDealerSync`)
// and manufactures schema.org Vehicle nodes, so classifyEv/normalize handle it
// exactly as every other source. The dealer's declared `Fuel` ("Electric Fuel
// System", "Gasoline Fuel", "Gas/Electric Hybrid") is passed through untouched;
// classifyEv reads it and decides — nothing here pre-judges EV-ness.

import { politeGetJson } from "../http.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const PER_PAGE = 10; // the API's fixed page size (the `results` param is capped to it)
const MAX_PAGES = 300; // 300 * 10 = 3,000 — a runaway guard, not a real ceiling

// Page-level fingerprint. DealerSync serves its assets from dealersync.com
// (dealer-cdn.dealersync.com, www.dealersync.com) on every page it renders,
// including the homepage — a specific vendor host, not a generic CDN.
const DS_MARK = /dealersync\.com/i;

export function isDealerSync(html) {
  return typeof html === "string" && DS_MARK.test(html);
}

// The per-rooftop inventory URL slug, read off any VDP link the shell already
// carries (the homepage lists featured vehicles as
// /{slug}/detail/{Year}-{Make}-{Model}/{VehicleId}). The VDP resolves on the
// trailing VehicleId regardless of the slug, so this is only for a clean,
// dealer-canonical URL; "inventory" is a safe fallback.
export function dealerSyncSlug(html) {
  const m = String(html ?? "").match(/\/([a-z0-9][a-z0-9-]*)\/detail\/[^/"']+\/\d+/i);
  return m ? m[1] : "inventory";
}

const slugify = (s) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "");

function vehicleNode(v, origin, slug) {
  const vin = String(v.Vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;

  // Advertised price, false-bargain-safe. FinalPrice is what the grid displays,
  // but on a rooftop running conditional offers it folds them in — the API
  // breaks that out as IncentiveDiscount, so adding it back yields the price a
  // shopper who qualifies for nothing actually pays. When IncentiveDiscount is 0
  // (the common case) this is just the displayed price. Never the bare
  // InternetPrice, which on a genuine sale is the higher pre-markdown number and
  // would overstate. Asymmetric toward the higher, unconditional figure by
  // design (house rule).
  const final = Number(v.FinalPrice ?? v.FinalPriceDisplay);
  const incentive = Number(v.IncentiveDiscount) || 0;
  const base = Number.isFinite(final) ? final + Math.max(0, incentive) : NaN;
  const price = Number.isFinite(base) && base > 0 ? base : undefined;

  const mileage = Number(v.Mileage);
  const year = v.Year != null ? String(v.Year) : undefined;
  const cond = String(v.Condition ?? "").toLowerCase();
  const itemCondition = v.IsNew === true ? "new" : cond === "new" ? "new" : "used";

  // Image is protocol-relative ("//images.dealersync.com/…").
  let image;
  const img = v.FirstImageUrl || v.VehicleImage;
  if (typeof img === "string" && img) image = img.startsWith("//") ? "https:" + img : img;

  let url = origin;
  if (v.VehicleId != null) {
    const seg = [year, v.Make, v.Model].filter(Boolean).map(slugify).join("-") || "vehicle";
    url = `${origin}/${slug}/detail/${seg}/${v.VehicleId}`;
  }

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: year,
    brand: v.Make || undefined,
    model: v.Model || undefined,
    name: v.VehicleTitle || [year, v.Make, v.Model, v.Trim].filter(Boolean).join(" ") || undefined,
    vehicleConfiguration: v.Trim || undefined,
    mileageFromOdometer:
      Number.isFinite(mileage) && mileage >= 0 ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: v.FactoryColorText || v.FactoryColor || undefined,
    vehicleInteriorColor: v.FactoryInteriorText || v.FactoryInterior || undefined,
    driveWheelConfiguration: v.Drivetrain || undefined,
    sku: v.StockNo || undefined,
    image: image ? [image] : undefined,
    itemCondition,
    // The dealer's declared fuel ("Electric Fuel System", "Gasoline Fuel",
    // "Gas/Electric Hybrid"). classifyEv reads it and decides.
    vehicleEngine: { "@type": "EngineSpecification", fuelType: v.Fuel || undefined },
    offers: { "@type": "Offer", price, priceCurrency: "USD", url },
  };
}

// Map a page of API `vehicles` to schema.org Vehicle nodes. Exposed for tests
// and shared by the puller; the slug (for VDP URLs) is read off the page shell.
export function dealerSyncNodes(vehicles, origin, html = "") {
  const slug = dealerSyncSlug(html);
  return (Array.isArray(vehicles) ? vehicles : []).map((v) => vehicleNode(v, origin, slug)).filter(Boolean);
}

function searchUrl(base, startIndex) {
  return `${base}/Inventory/Search?IsSold=0&startIndex=${startIndex}&results=${PER_PAGE}`;
}

// Dealer rooftops redirect apex→www on deep paths; try the given origin and its
// www/apex toggle, keep whichever answers the API with JSON.
function hostVariants(origin) {
  const out = [origin];
  try {
    const u = new URL(origin);
    u.host = u.host.startsWith("www.") ? u.host.slice(4) : "www." + u.host;
    out.push(u.origin);
  } catch {}
  return out;
}

async function fetchPageJson(base, startIndex) {
  const { status, json } = await politeGetJson(searchUrl(base, startIndex));
  if (status === "robots_disallowed") return { robots: true };
  if (status !== 200 || !json || !Array.isArray(json.vehicles)) return { ok: false };
  return { ok: true, json };
}

// Page a DealerSync rooftop's inventory to completion and return every car as a
// schema.org Vehicle node. `complete` is true ONLY when the walk reached the
// reported totalResults: a partial or failed pull returns complete=false so the
// caller reports truncated:true and db-sync never delists a lot on an API hiccup.
export async function pullDealerSync(origin, html = "") {
  const slug = dealerSyncSlug(html);

  let base = null;
  let first = null;
  for (const cand of hostVariants(origin)) {
    const r = await fetchPageJson(cand, 0);
    if (r.robots) return { vehicles: [], complete: false, found: 0, ok: false, robots: true };
    if (r.ok) {
      base = cand;
      first = r.json;
      break;
    }
  }
  if (!base) return { vehicles: [], complete: false, found: 0, ok: false };

  const total = Number.isFinite(Number(first.totalResults)) ? Number(first.totalResults) : null;
  const out = [];
  const seen = new Set();
  let json = first;
  let fetched = 0;
  let ok = true;
  let startIndex = 0;

  while (startIndex / PER_PAGE < MAX_PAGES) {
    const vs = json.vehicles;
    for (const v of vs) {
      const node = vehicleNode(v, base, slug);
      if (node && !seen.has(node.vehicleIdentificationNumber)) {
        seen.add(node.vehicleIdentificationNumber);
        out.push(node);
      }
    }
    fetched += vs.length;
    if (vs.length < PER_PAGE) break; // last page
    if (total != null && fetched >= total) break;
    startIndex += PER_PAGE;
    const r = await fetchPageJson(base, startIndex);
    if (!r.ok) {
      ok = false; // a hole in the walk — cannot certify completeness
      break;
    }
    json = r.json;
  }

  const complete = ok && (total == null ? true : fetched >= total);
  return { vehicles: out, complete, found: total ?? fetched, ok: true };
}

// Cheap liveness check for probe.mjs: one request, does the API hold VIN'd
// inventory? Keeps the probe's small fetch budget intact — the full paged pull
// happens later in the nightly crawl.
export async function countDealerSync(origin) {
  for (const cand of hostVariants(origin)) {
    const r = await fetchPageJson(cand, 0);
    if (r.robots) return { ok: false, found: 0, hasVin: false };
    if (r.ok) {
      const hasVin = r.json.vehicles.some((v) => VIN_RE.test(String(v.Vin ?? "").toUpperCase()));
      const total = Number(r.json.totalResults);
      return { ok: true, found: Number.isFinite(total) ? total : r.json.vehicles.length, hasVin };
    }
  }
  return { ok: false, found: 0, hasVin: false };
}
