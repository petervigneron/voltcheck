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
import { conditionToken } from "../condition.mjs";
import { fetchPage, politeGetJson } from "../http.mjs";
import { stabilizeImages } from "../images.mjs";
import { JSONLD, DEOL_INTERNET, DEOL_SELLING, DEOL_MSRP, DEOL_CARD_INTERNET } from "../price-provenance.mjs";

const API_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const numOrU = (v) => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// The <script id="dealeron_tagging_data"> JSON, present on every DealerOn SRP.
// Returns {dealerId, pageId} only for a search results page — pageType is
// usually "itemlist", but some rooftops (BMW of Spokane, diagnosed 2026-08-20:
// docs/agents/coverage-audit-2026-08-20.md) tag their SRP "custom" instead
// while still carrying a real dealerId/pageId pair. A VDP or an unrelated CMS
// page carries no such pair (or a pageId the SRP endpoint rejects), so the
// dealerId/pageId check — not the pageType label — is what keeps a non-SRP
// page from seeding a junk pull; "custom" alone, without both ids, still
// returns null.
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
  const pageType = String(data.pageType).toLowerCase();
  if (pageType !== "itemlist" && pageType !== "custom") return null;
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

// The origin actually reachable over TLS for a page that just answered —
// bmwofspokane.com's bare apex resolves to DealerOn's shared Fastly IP and
// presents its wildcard *.dealeron.com cert, which doesn't cover the apex
// hostname at all (verified live 2026-08-20: TLS handshake fails outright,
// curl: "no alternative certificate subject name matches"); www.<domain> has
// its own valid cert. fetchPage silently recovers via its own apex/www retry,
// so a page fetch's finalUrl already names a host that works — anchoring the
// JSON API calls to it (instead of to crawl.mjs's guessed bare `origin`)
// keeps politeGetJson, which has no such retry, from failing every call on a
// rooftop like this one.
function workingOrigin(url, fallback) {
  try {
    return new URL(url).origin;
  } catch {
    return fallback;
  }
}

// The lots to pull for a rooftop: the SRP that revealed the config, plus its
// sibling (used↔new) so both inventories are covered. The sibling's pageId is
// read from its own search page — the only place it appears. Returns a deduped
// list of {dealerId, pageId, origin}; an unreachable sibling just yields the
// one lot. Each lot carries the origin its own page actually answered on, not
// the bare crawl origin, per the TLS note above.
export async function dealerOnLots(html, pageUrl, origin) {
  const here = dealerOnTagging(html);
  if (!here) return [];
  const lots = [{ ...here, origin: workingOrigin(pageUrl, origin) }];
  const isNew = /searchnew/i.test(pageUrl);
  const siblingPath = isNew ? "/searchused.aspx" : "/searchnew.aspx";
  try {
    const sib = await fetchPage(origin + siblingPath);
    if (sib.status === 200 && sib.body) {
      const other = dealerOnTagging(sib.body);
      if (other && other.pageId !== here.pageId) {
        lots.push({ ...other, origin: workingOrigin(sib.finalUrl, lots[0].origin) });
      }
    }
  } catch {}
  return lots;
}

// "MSRP:54998.0;Selling Price:53998.0;…;calc_INTERNET PRICE:54083.0" (base64) →
// the advertised internet price. Falls back through the selling price and MSRP
// so a rooftop that omits the calc line still yields a number; undefined only
// when the library is absent, which classifyEv/normalize treat as no price.
export function priceFromLibrary(b64) {
  return priceFromLibraryTagged(b64).price;
}

// The same fallback ladder, also naming the rung it stopped on, for
// listing_price_history's provenance column (migration 0041). Only the
// calc_INTERNET PRICE rung claims to be the page's JSON-LD offer — that is the
// line this file's header verified byte-for-byte, and the ones below it are
// different numbers that happen to share a ladder. See lib/price-provenance.mjs
// on why an unverified match is worse than no match.
export function priceFromLibraryTagged(b64) {
  const none = { price: undefined, provenance: undefined };
  if (typeof b64 !== "string" || !b64) return none;
  let txt;
  try {
    txt = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return none;
  }
  const fields = new Map();
  for (const part of txt.split(";")) {
    const i = part.indexOf(":");
    if (i > 0) fields.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim());
  }
  for (const [key, provenance] of [
    ["calc_internet price", JSONLD],
    ["internet price", DEOL_INTERNET],
    ["selling price", DEOL_SELLING],
    ["msrp", DEOL_MSRP],
  ]) {
    const price = numOrU(fields.get(key));
    if (price != null) return { price, provenance };
  }
  return none;
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

  const fromLibrary = priceFromLibraryTagged(vc.VehiclePriceLibrary);
  const cardPrice = numOrU(vc.VehicleInternetPrice);
  const price = fromLibrary.price ?? cardPrice;
  const priceProvenance =
    fromLibrary.price != null ? fromLibrary.provenance : cardPrice != null ? DEOL_CARD_INTERNET : undefined;
  // VehicleType is the machine token ("new"/"used"); VehicleCondition is the
  // localized string the storefront prints, and reading THAT first is what
  // published es.fordofkendall.com's whole Spanish new lot as used — "Nuevo"
  // does not contain "new". Unknown stays unknown: the old `: "used"` tail
  // asserted a condition on any card whose field was missing or unfamiliar.
  // See ../condition.mjs for the measurements and the certified rule.
  const itemCondition = conditionToken(vc.VehicleType) ?? conditionToken(vc.VehicleCondition);
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
  // The dealer's own writeup, which this lane dropped on the floor until
  // 2026-08-27. It costs nothing — VehicleComments is already on the card we
  // fetch — and the cars it was hiding are the expensive kind.
  //
  // Dennis Sneed Ford (sneedford.com, Gower MO) resells Ford's Manufacturer
  // Buy-Back programme: 210 of the 260 cars on its used lot, and ALL 25 of its
  // F-150 Lightnings, end their comments with "PART OF FORDS REACQUIRED
  // VEHICLE BRANDED PROGRAM AND COMES WITH A 12 MONTH 12,000 MILE SPECIAL FORD
  // MOTOR COMPANY FACTORY LIMITED BUMPER TO BUMPER WARRANTY". We were showing
  // 21 of them as ordinary used trucks — one at $45,499 against an original
  // MSRP of $88,224 the same comment states. `buyback_disclosed` (migration
  // 0024) is computed from `payload->>'description'`, so with no description
  // stored it could never fire: the guard was reading a field this lane never
  // filled. A buyback priced under its clean-title cohort is exactly the false
  // bargain the comps guardrails exist to prevent.
  //
  // Taken whatever ShowComments says: that flag toggles the SRP card's
  // comments block, not whether the dealer published the text — the VDP
  // renders it either way, and its JSON-LD carries the identical string (the
  // 1,057-character Sneed Lariat comment, byte-for-byte, 2026-08-27). The
  // HTML VDP path already read it there via normalize.mjs; this is the same
  // fact through the API door, which is the door ~94% of the crawl uses.
  //
  // Plain text on every card sampled (24/24, no markup, no entities, 268-1,103
  // chars), so it needs no unescaping. normalize.mjs caps it at 2,000.
  const description = typeof vc.VehicleComments === "string" && vc.VehicleComments.trim()
    ? vc.VehicleComments.trim()
    : undefined;
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
    description,
    name: vc.VehicleName || [vc.VehicleYear, vc.VehicleMake, vc.VehicleModel, trim].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer: mileage != null ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: vc.ExteriorColorLabel || vc.VehicleGenericColor || undefined,
    vehicleInteriorColor: vc.InteriorColorLabel || undefined,
    driveWheelConfiguration: driveToken(vc.VehicleDriveTrain),
    sku: vc.VehicleStockNumber ? String(vc.VehicleStockNumber) : undefined,
    image: images.length ? images : undefined,
    ...(itemCondition ? { itemCondition } : {}),
    // Certification is a warranty claim: take it only from the feed's own CPO
    // flag, never inferred — the same rule the HTML dotagging path holds to.
    ...(vc.VehicleCpo === true ? { certified: true } : {}),
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", fuelType: fuel },
    offers: {
      "@type": "Offer",
      price,
      priceProvenance,
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
// `origin` is the fallback for a lot dealerOnLots couldn't attribute (should
// not happen in practice, since every lot it returns carries its own).
export async function pullDealerOnApi(lots, origin) {
  const vehicles = [];
  let found = 0;
  let anyOk = false;
  let allComplete = true;
  for (const lot of lots) {
    const lotOrigin = lot.origin || origin;
    const r = await pullLot(lot.dealerId, lot.pageId, lotOrigin, `${lotOrigin}/searchused.aspx`);
    if (r.ok) anyOk = true;
    if (!r.complete) allComplete = false;
    vehicles.push(...r.vehicles);
    found += r.found;
  }
  return { vehicles, complete: anyOk && allComplete, found, ok: anyOk };
}
