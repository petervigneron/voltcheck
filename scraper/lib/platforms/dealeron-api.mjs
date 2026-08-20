// DealerOn ("Fusion", the vhcliaa/Cosmos storefront) inventory API.
//
// A DealerOn SRP is a client-rendered React shell (spaCosmos): the page ships
// skeleton loaders, then fetches its cars from one same-origin JSON endpoint —
// the same one the storefront's own search grid reads:
//
//   GET https://www.<domain>/api/vhcliaa/vehicle-pages/cosmos/srp/vehicles/
//       {dealerId}/{pageId}?pt=<page>&pn=<pageSize>&host=www.<domain>
//   → { Paging:{ PaginationDataModel:{ TotalCount, TotalPages, PageSize } },
//       DisplayCards:[ { IsAdCard, VehicleCard:{ full record } } ] }
//
// Both ids sit inline on every SRP in a <script id="dealeron_tagging_data">
// JSON block: { "dealerId":"25890", "pageId":3160807, "pageType":"itemlist" }.
// The pageId scopes the lot — searchused.aspx and searchnew.aspx carry different
// pageIds — so both are pulled for full new+used coverage (see dealerOnLots).
//
// Each DisplayCard is a structured VehicleCard (not the HTML the old dotagging
// extractor parsed): vin, year/make/model/trim, mileage, declared fuel, the
// dealer's price stack, colours, drivetrain, photos, stock number, and the
// owning rooftop's name/city/state. So this replaces BOTH the SRP page-walk and
// the per-car VDP fetch — the lot is ceil(total/24) calls instead of ~total/12
// SRP pages plus one VDP per EV.
//
// Price: the card's advertised price is the "calc_INTERNET PRICE" line inside
// the base64 VehiclePriceLibrary — verified byte-for-byte against the VDP's
// JSON-LD offers.price the old path used (dublinchevrolet OPTIQ: 54083 both
// ways, 2026-08-19). VehicleInternetPrice is 0 on these records and TaggingPrice
// is the MSRP, so neither is the number a shopper reads; the price library is.
import { fetchPage, politeGetJson } from "../http.mjs";
import { stabilizeImages } from "../images.mjs";

const API_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const numOrU = (v) => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// The <script id="dealeron_tagging_data"> JSON, present on every DealerOn SRP.
// Returns {dealerId, pageId} only for a search results page (pageType
// "itemlist") — a VDP carries a different pageId that the SRP endpoint rejects,
// so gating on itemlist keeps a VDP from seeding a junk pull.
export function dealerOnTagging(html) {
  if (typeof html !== "string") return null;
  const m = html.match(/id="dealeron_tagging_data"[^>]*>\s*(\{[\s\S]*?\})\s*</);
  if (!m) return null;
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (String(data.pageType).toLowerCase() !== "itemlist") return null;
  const dealerId = String(data.dealerId ?? "").match(/^\d{2,9}$/)?.[0];
  const pageId = String(data.pageId ?? "").match(/^\d{2,12}$/)?.[0];
  if (!dealerId || !pageId) return null;
  return { dealerId, pageId };
}

// A page is DealerOn when it carries the vhcliaa storefront and the tagging
// block. Used by crawl.mjs to decide whether to take the API path.
export function isDealerOnApi(html) {
  return typeof html === "string" && /vhcliaa/.test(html) && /dealeron_tagging_data/.test(html);
}

// The lots to pull for a rooftop: the SRP that revealed the config, plus its
// sibling (used↔new) so both inventories are covered. The sibling's pageId is
// read from its own search page — the only place it appears. Returns a deduped
// list of {dealerId, pageId}; an unreachable sibling just yields the one lot.
export async function dealerOnLots(html, pageUrl, origin) {
  const here = dealerOnTagging(html);
  if (!here) return [];
  const lots = [here];
  const isNew = /searchnew/i.test(pageUrl);
  const siblingPath = isNew ? "/searchused.aspx" : "/searchnew.aspx";
  try {
    const sib = await fetchPage(origin + siblingPath);
    if (sib.status === 200 && sib.body) {
      const other = dealerOnTagging(sib.body);
      if (other && other.pageId !== here.pageId) lots.push(other);
    }
  } catch {}
  return lots;
}

// "MSRP:54998.0;Selling Price:53998.0;…;calc_INTERNET PRICE:54083.0" (base64) →
// the advertised internet price. Falls back through the selling price and MSRP
// so a rooftop that omits the calc line still yields a number; undefined only
// when the library is absent, which classifyEv/normalize treat as no price.
export function priceFromLibrary(b64) {
  if (typeof b64 !== "string" || !b64) return undefined;
  let txt;
  try {
    txt = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return undefined;
  }
  const fields = new Map();
  for (const part of txt.split(";")) {
    const i = part.indexOf(":");
    if (i > 0) fields.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim());
  }
  return (
    numOrU(fields.get("calc_internet price")) ??
    numOrU(fields.get("internet price")) ??
    numOrU(fields.get("selling price")) ??
    numOrU(fields.get("msrp"))
  );
}

const DRIVE_TOKENS = new Set(["FWD", "RWD", "AWD", "4WD"]);
const driveToken = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/ALL.?WHEEL|AWD/.test(s)) return "AWD";
  if (/FOUR.?WHEEL|4WD|4X4/.test(s)) return "4WD";
  if (/REAR.?WHEEL|RWD/.test(s)) return "RWD";
  if (/FRONT.?WHEEL|FWD/.test(s)) return "FWD";
  return DRIVE_TOKENS.has(s) ? s : undefined;
};

// One VehicleCard → a schema.org Vehicle node, shaped like the other API
// producers so it flows through classifyEv/normalize unchanged. Field names are
// from a live document, not guessed. Returns null for a card with no valid VIN.
export function vehicleNode(vc, origin) {
  const vin = String(vc?.VehicleVin ?? vc?.VehicleImageModel?.VehicleImageCarouselModel?.Vin ?? "").toUpperCase();
  if (!API_VIN_RE.test(vin)) return null;

  const price = priceFromLibrary(vc.VehiclePriceLibrary) ?? numOrU(vc.VehicleInternetPrice);
  const cond = String(vc.VehicleCondition ?? vc.VehicleType ?? "").toLowerCase();
  const itemCondition = cond.includes("new") ? "new" : "used";
  const mileage = numOrU(vc.VehicleMileage) ?? numOrU(vc.Mileage);
  // Declared fuel ("Electric Fuel System", "Gas/Electric Hybrid", "Gasoline").
  // classifyEv reads it and decides — nothing here pre-judges electric-ness.
  const fuel = vc.VehicleFuelType || undefined;

  const photos = Array.isArray(vc.VehicleImageModel?.VehicleImageCarouselModel?.PhotoList)
    ? vc.VehicleImageModel.VehicleImageCarouselModel.PhotoList
    : [];
  // Every photo in the carousel's own PhotoList — not just the hero. URLs
  // observed live carry no query string (root-relative, filename-indexed
  // paths), but stabilizeImages() strips one defensively; see
  // scraper/lib/images.mjs.
  const images = stabilizeImages(
    photos
      .map((p) => {
        try {
          return new URL(p, origin).toString();
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  );

  let vdpUrl = origin;
  const rawUrl = vc.VehicleDetailUrl || vc.VehicleImageModel?.VehicleDetailUrl;
  if (typeof rawUrl === "string" && rawUrl) {
    try {
      vdpUrl = new URL(rawUrl, origin).toString();
    } catch {}
  }

  const trim = vc.VehicleTrim || vc.VehicleRuleAdjustedTrim || undefined;
  const city = vc.DealerLocatedAtCity || undefined;
  const state = vc.DealerLocatedAtState || undefined;
  const dealerName = vc.VehicleLocationName || vc.DealerName || undefined;

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: vc.VehicleYear != null ? String(vc.VehicleYear) : undefined,
    brand: vc.VehicleMake || undefined,
    model: vc.VehicleModel || undefined,
    vehicleConfiguration: trim,
    name: vc.VehicleName || [vc.VehicleYear, vc.VehicleMake, vc.VehicleModel, trim].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer: mileage != null ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: vc.ExteriorColorLabel || vc.VehicleGenericColor || undefined,
    vehicleInteriorColor: vc.InteriorColorLabel || undefined,
    driveWheelConfiguration: driveToken(vc.VehicleDriveTrain),
    sku: vc.VehicleStockNumber ? String(vc.VehicleStockNumber) : undefined,
    image: images.length ? images : undefined,
    itemCondition,
    // Certification is a warranty claim: take it only from the feed's own CPO
    // flag, never inferred — the same rule the HTML dotagging path holds to.
    ...(vc.VehicleCpo === true ? { certified: true } : {}),
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", fuelType: fuel },
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: "USD",
      url: vdpUrl,
      seller:
        dealerName || city || state
          ? {
              "@type": "AutoDealer",
              name: dealerName,
              address: { "@type": "PostalAddress", addressLocality: city, addressRegion: state },
            }
          : undefined,
    },
  };
}

const PAGE_SIZE = 24; // the endpoint's cap — asking for more falls back to 12
const MAX_PAGES = 400; // runaway guard, well past any single-lot total seen

function apiUrl(dealerId, pageId, origin, host, pt) {
  return `${origin}/api/vhcliaa/vehicle-pages/cosmos/srp/vehicles/${dealerId}/${pageId}?pt=${pt}&pn=${PAGE_SIZE}&host=${host}`;
}

// Page one lot (a dealerId/pageId pair) to completion. `complete` is true ONLY
// when the walk reached the reported TotalCount (or a clean empty lot): a
// partial or failed pull returns complete=false so the caller reports
// truncated:true and db-sync never delists on an API hiccup.
async function pullLot(dealerId, pageId, origin, referer) {
  const host = new URL(origin).host;
  const out = [];
  let total = 0;
  let fetched = 0;
  let ok = false;
  let reachedEnd = false;

  for (let pt = 1; pt <= MAX_PAGES; pt++) {
    const { status, json } = await politeGetJson(apiUrl(dealerId, pageId, origin, host, pt), { headers: { referer } });
    if (status !== 200 || !json || !Array.isArray(json.DisplayCards)) break;
    ok = true;
    const tc = json.Paging?.PaginationDataModel?.TotalCount;
    if (Number.isFinite(tc)) total = tc;
    // Ad cards are interleaved with vehicles; only VehicleCards are inventory.
    const cards = json.DisplayCards.filter((c) => c && !c.IsAdCard && c.VehicleCard).map((c) => c.VehicleCard);
    for (const vc of cards) {
      const node = vehicleNode(vc, origin);
      if (node) out.push(node);
    }
    fetched += cards.length;
    if (cards.length === 0) {
      reachedEnd = true;
      break;
    }
    if (total && fetched >= total) {
      reachedEnd = true;
      break;
    }
  }

  return { vehicles: out, complete: ok && reachedEnd, found: total || fetched, ok };
}

// Pull every lot for a rooftop and merge. `complete` is true only when EVERY
// lot completed AND at least one answered — a single failed lot taints the
// crawl's completeness so db-sync won't delist behind a half-read rooftop.
export async function pullDealerOnApi(lots, origin) {
  const referer = `${origin}/searchused.aspx`;
  const vehicles = [];
  let found = 0;
  let anyOk = false;
  let allComplete = true;
  for (const lot of lots) {
    const r = await pullLot(lot.dealerId, lot.pageId, origin, referer);
    if (r.ok) anyOk = true;
    if (!r.complete) allComplete = false;
    vehicles.push(...r.vehicles);
    found += r.found;
  }
  return { vehicles, complete: anyOk && allComplete, found, ok: anyOk };
}
