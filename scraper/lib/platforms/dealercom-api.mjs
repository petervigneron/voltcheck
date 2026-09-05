// Dealer.com (DDC) inventory API.
//
// The current "v9" React storefront no longer server-renders the whole lot into
// `DDC.dataLayer['vehicles']` — a filtered or paginated SRP embeds no vehicle
// array at all (extractDdcVehicles returns 0 on hendrickcars.com's electric
// SRP, which still lists 414 cars). Every rooftop instead serves its inventory
// from one same-origin JSON endpoint, the same one the storefront's own widgets
// read:
//
//   POST https://www.<domain>/api/widget/ws-inv-data/getInventoryAndFacets
//   body: { siteId, widgetName:"ws-inv-data", inventoryParameters:{start:["0"]},
//           preferences:{pageSize:"48"}, includePricing:true, ... }
//   → { pageInfo:{totalCount,pageSize,pageStart}, inventory:[ {full records} ],
//       accounts:{ <accountId>:{name,address} } }
//
// One record carries everything a VDP fetch used to: vin, year/make/model/trim,
// odometer, declared fuel, the full dealer.com price stack, colours, drivetrain,
// images, stock number, and the owning rooftop's own name/address (via the
// `accounts` block, keyed by the record's accountId — the group-site rooftop,
// not the group domain). So this replaces BOTH the SRP page-walk and the
// per-car VDP fetch the old dealer.com path did: the lot is ceil(total/48) calls
// instead of ~total/24 SRP pages plus one VDP per EV.
//
// Why the whole lot and not a server-side electric filter: the storefront
// filters fine over the browser (?normalFuelType=Electric), but this widget
// endpoint rejects every fuel-filter shape tried against it in 2026-08 — a
// `normalFuelType` parameter returns an empty result set, `fuelType` is ignored.
// Rather than ship a filter that silently returns zero (which would read as "no
// EVs here" and delist a dealer's whole electric inventory), we page the whole
// used lot and let classifyEv decide downstream — the same fuel/VIN/model signal
// every other lane trusts. That also catches an EV the dealer mistagged as
// petrol (a trade-in Tesla comes back on its WMI), which a fuel filter drops.
//
// Pricing goes through the shared resolveDdcPrice in dealercom.mjs, unchanged.
// The record's rendered "Final Price" (the dprice row flagged isFinalPrice) is
// byte-for-byte the VDP's JSON-LD offers.price that the old HTML path fed the
// resolver (verified on live rooftops 2026-08-19), and trackingPricing carries
// the same internet/sale/asking/msrp fields the DDC.dataLayer record did — so
// the resolver returns an identical number to the pre-API path, including its
// abstain-to-0 behaviour, with no VDP fetch.
import { conditionToken } from "../condition.mjs";
import { politePostJson } from "../http.mjs";
import { stabilizeImages } from "../images.mjs";

const API_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const numText = (v) => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// The site's own client config, inline on every dealer.com page. siteId is all
// the endpoint needs; it is interpolated into a hardcoded same-origin path, so a
// junk value cannot redirect the request off the dealer's host. Gated on the
// ws-inv-data widget marker so a page that merely mentions the string can't be
// mistaken for a dealer.com storefront.
export function dealerComApiConfig(html) {
  if (typeof html !== "string" || !/ws-inv-data/.test(html)) return null;
  const siteId = html.match(/["']siteId["']\s*[:=]\s*["']([A-Za-z0-9_-]+)["']/)?.[1];
  if (!siteId) return null;
  return { siteId };
}

// name → attribute, over the record's attribute lists. dealer.com splits facts
// across `attributes` (display strings: "11,416 miles", "Pure Gray") and
// `trackingAttributes` (machine values: odometer "11416", driveLine "RWD",
// normalFuelType "Electric") — we read whichever is cleaner per field.
function byName(list) {
  const m = new Map();
  for (const a of Array.isArray(list) ? list : []) if (a?.name) m.set(a.name, a.value);
  return m;
}

// The advertised price a human reads off the VDP, from the dealer.com price
// stack: the dprice row the platform flags isFinalPrice (the "Transparent Price"
// after unconditional adjustments). This is the value the VDP publishes as its
// JSON-LD offers.price, so it stands in for the `jsonld` leg resolveDdcPrice
// expects. Falls back to the plain retail/asking figure when no final row is
// marked; null when the record carries no price, which resolveDdcPrice turns
// into its abstain sentinel.
function renderedFinalPrice(pricing) {
  const dprice = Array.isArray(pricing?.dprice) ? pricing.dprice : [];
  const final = dprice.find((p) => p?.isFinalPrice);
  return numText(final?.value) ?? numText(pricing?.retailPrice) ?? numText(pricing?.finalPrice);
}

const DRIVE_TOKENS = new Set(["FWD", "RWD", "AWD", "4WD"]);

// One API record → a schema.org Vehicle node (for classifyEv + normalize) paired
// with a DDC.dataLayer-shaped object (for enrichFromDdc, which owns the field
// merge and the price resolve). Returns null for a record with no valid VIN.
export function mapRecord(r, accounts, origin) {
  const vin = String(r?.vin ?? "").toUpperCase();
  if (!API_VIN_RE.test(vin)) return null;

  const attrs = byName(r.attributes);
  const tracking = byName(r.trackingAttributes);
  const odometer = numText(tracking.get("odometer"));
  const driveRaw = tracking.get("driveLine") ?? attrs.get("normalDriveLine");
  const driveLine = DRIVE_TOKENS.has(driveRaw) ? driveRaw : undefined;
  const exteriorColor = attrs.get("exteriorColor") || undefined;
  const interiorColor = attrs.get("interiorColor") || undefined;
  // Declared fuel: top-level fuelType ("Battery Electric"/"Electric") is what
  // classifyEv reads; the tracking normalFuelType is a second signal. Nothing
  // here decides EV-ness — classifyEv does, downstream.
  const fuel = r.fuelType || tracking.get("normalFuelType") || undefined;
  // `type` is the machine token ("new"/"used"); `condition` is the string the
  // storefront prints, and it is neither a fixed vocabulary nor English on
  // every rooftop — "New", "USED", "Pre-Owned", "Certified Pre-Owned",
  // "Certified Used", "BMW Certified", "Certified by Volvo" all appear in one
  // 115-rooftop sample. The old `=== "new"` test therefore had exactly one
  // spelling of new and turned everything else, an ABSENT field included,
  // into a "used" claim. Unknown now stays unknown; see ../condition.mjs.
  const cond = conditionToken(r.type) ?? conditionToken(r.condition);
  // Every image in the record's own images[] list — not just the hero. URLs
  // observed live carry no query string (content-hashed CDN path), but
  // stabilizeImages() strips one defensively; see scraper/lib/images.mjs.
  const images = stabilizeImages(
    (Array.isArray(r.images) ? r.images : []).map((i) => (typeof i?.uri === "string" ? i.uri : undefined)).filter(Boolean),
  );

  let vdpUrl = origin;
  if (typeof r.link === "string" && r.link) {
    try {
      vdpUrl = new URL(r.link, origin).toString();
    } catch {}
  }

  const account = r.accountId && accounts ? accounts[r.accountId] : undefined;
  const addr = account?.address;

  const node = {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: r.year != null ? String(r.year) : undefined,
    brand: r.make || undefined,
    model: r.model || undefined,
    vehicleConfiguration: r.trim || undefined,
    name: Array.isArray(r.title) ? r.title.join(" ") : typeof r.title === "string" ? r.title : undefined,
    mileageFromOdometer: odometer != null ? { "@type": "QuantitativeValue", value: odometer } : undefined,
    color: exteriorColor,
    vehicleInteriorColor: interiorColor,
    driveWheelConfiguration: driveRaw || undefined,
    image: images.length ? images : undefined,
    ...(cond ? { itemCondition: cond } : {}),
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", fuelType: fuel },
    offers: {
      "@type": "Offer",
      // The rendered final price — resolveDdcPrice's `jsonld` leg. enrichFromDdc
      // reruns the resolve with the price fields below and this value, so the
      // number that reaches the row is the resolver's, not this raw figure.
      price: renderedFinalPrice(r.pricing),
      priceCurrency: "USD",
      url: vdpUrl,
    },
  };

  // The DDC.dataLayer shape enrichFromDdc/resolveDdcPrice expect. trackingPricing
  // holds the same internet/sale/asking/msrp fields the old dataLayer record did.
  const tp = r.trackingPricing ?? {};
  const ddc = {
    vin,
    odometer,
    trim: r.trim || undefined,
    driveLine,
    exteriorColor,
    interiorColor,
    msrp: tp.msrp,
    internetPrice: tp.internetPrice,
    salePrice: tp.salePrice,
    askingPrice: tp.askingPrice,
    // undefined when the record said nothing: enrichFromDdc reads
    // `d.newOrUsed ?? rec.condition`, so an unknown here falls through to the
    // node above rather than becoming a claim.
    newOrUsed: cond,
    certified: r.certified === true,
    stockNumber: r.stockNumber ? String(r.stockNumber) : undefined,
    accountName: account?.name || addr?.accountName || undefined,
    address: addr ? { city: addr.city, state: addr.state, postalCode: addr.postalCode } : undefined,
  };

  return { node, ddc };
}

const PAGE_SIZE = 48; // the endpoint's hard cap — asking for more returns 48
// Runaway guard, set past the largest group lot seen (hendrickcars ~33k,
// berkshirehathaway ~28k → ~700 pages). A rooftop past this pages partial and is
// reported truncated, never falsely complete.
const MAX_PAGES = 1500;

function requestBody(config, start) {
  return {
    siteId: config.siteId,
    locale: "en_US",
    device: "DESKTOP",
    widgetName: "ws-inv-data",
    includePricing: true,
    inventoryParameters: { start: [String(start)] },
    preferences: { pageSize: String(PAGE_SIZE) },
  };
}

// Page a rooftop's whole lot to completion. Returns schema.org Vehicle nodes and
// a vin→DDC-shape map for enrichFromDdc. `complete` is true ONLY when the walk
// reached the reported totalCount (or a clean empty lot): a partial or failed
// pull returns complete=false so the caller reports truncated:true and db-sync
// never delists a lot on the strength of an API hiccup. `ok` is false when the
// first call didn't answer at all, so the caller can fall back to the HTML path.
export async function pullDealerComApi(config, origin, { deadlineAt = 0 } = {}) {
  const apiUrl = `${origin}/api/widget/ws-inv-data/getInventoryAndFacets`;
  const referer = `${origin}/used-inventory/index.htm`;
  const nodes = [];
  const ddcByVin = new Map();
  let start = 0;
  let total = 0;
  let ok = false;
  let reachedEnd = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    // Stop ASKING at the deadline. crawl.mjs's wall ends the crawl's WAIT, not
    // this loop — an abandoned pull goes on POSTing to the dealer until the
    // process exits. That matters most here, because this endpoint's pageSize
    // really is capped (48; 96 and 200 both measured returning ~50 on
    // 2026-09-05) and the group-aggregator rooftops behind it are enormous:
    // hendrickcars.com reports 34,168 cars and sonicautomotive.com 43,914,
    // which are 712 and 915 requests. Neither can finish inside a per-domain
    // budget and neither should keep going after one. `complete` stays false,
    // so the caller reports truncated and nothing is delisted.
    if (deadlineAt && Date.now() > deadlineAt) break;
    const { status, json } = await politePostJson(apiUrl, { body: requestBody(config, start), headers: { referer } });
    if (status !== 200 || !json || !Array.isArray(json.inventory)) break;
    ok = true;
    const accounts = json.accounts && typeof json.accounts === "object" ? json.accounts : {};
    if (Number.isFinite(json.pageInfo?.totalCount)) total = json.pageInfo.totalCount;
    for (const r of json.inventory) {
      const mapped = mapRecord(r, accounts, origin);
      if (!mapped) continue;
      nodes.push(mapped.node);
      ddcByVin.set(mapped.ddc.vin, mapped.ddc);
    }
    const got = json.inventory.length;
    start += got;
    // A short page is the last page; an empty page ends a lot whose count landed
    // on an exact multiple. Completeness is "we reached the last page", not
    // "start caught total", so a totalCount that overcounts by a hidden row
    // can't peg an otherwise-finished pull as partial.
    if (got < PAGE_SIZE) {
      reachedEnd = true;
      break;
    }
    if (total && start >= total) {
      reachedEnd = true;
      break;
    }
  }

  return { vehicles: nodes, ddcByVin, complete: ok && reachedEnd, found: total || start, ok };
}
