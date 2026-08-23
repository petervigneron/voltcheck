// Overfuel (overfuel.com; "mobile-first dealership websites"). Runs everything
// from a small independent lot (712 Auto Sales, the first we saw) to a franchise
// group (Gravity Autos, Woody's) — 1,761 cars on steponeauto, 95 on 712.
//
// Every Overfuel rooftop serves its inventory from ONE open, unauthenticated API
//   GET https://api.overfuel.com/api/1.0/dealers/{dealerId}/search?limit=&offset=
// whose `dealerId` is inline in the page's Next.js __NEXT_DATA__ ("dealerId":1052),
// and whose response is the whole lot as structured JSON — vin, year/make/model/
// trim, mileage, the dealer-declared `fuel` ("Electric"), price, colours, the VDP
// url. `meta.total` bounds it and `robots.txt` is `Disallow:` (empty) — so this
// is the primary path, pulled to completion like DealerVenom's Typesense lane
// (`pullOverfuelApi`), and it's the ONLY path for the franchise sites, whose SRP
// and VDP HTML routes 404 to a crawler (the inventory is client-rendered).
//
// The HTML helpers below (isOverfuel/overfuelSeeds/overfuelVehicles/…) are the
// fallback for any Overfuel page that doesn't expose a dealerId: the SRP is an
// ItemList of ListItem→Product nodes whose url (VIN embedded in its slug) and
// price sit on the nested Product, which the generic extractItemListEntries
// (reads ListItem.url) can't see — so we parse it here and jump rel=next.
import { extractNodes } from "../jsonld.mjs";
import { politeGetJson } from "../http.mjs";
import { stabilizeImages } from "../images.mjs";
import { OVERFUEL_PRICE } from "../price-provenance.mjs";

const ASSET_RE = /(?:static|api|www)\.overfuel\.com/i;

export function isOverfuel(html) {
  return typeof html === "string" && ASSET_RE.test(html);
}

// The dealer id the API is keyed by, read from the page's __NEXT_DATA__. Only an
// Overfuel page's id is trusted (the ASSET_RE gate), and only a plain positive
// integer — the id is interpolated into a hardcoded api.overfuel.com path, so a
// non-numeric value could not redirect the request elsewhere, but rejecting it
// keeps a malformed page from issuing a junk request.
export function overfuelApiConfig(html) {
  if (typeof html !== "string" || !ASSET_RE.test(html)) return null;
  const id = html.match(/"dealer(?:Id|_id)"\s*:\s*(\d{1,9})\b/)?.[1];
  if (!id) return null;
  return { dealerId: Number(id) };
}

const API_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const numOrU = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// One API record → a schema.org Vehicle node, shaped like the DCS/DealerFire/
// DealerVenom producers so it flows through the same classifyEv/normalize path.
// Field names are from a live document, not guessed.
function apiVehicleNode(r, origin) {
  const vin = String(r?.vin ?? "").toUpperCase();
  if (!API_VIN_RE.test(vin)) return null;

  // The advertised price is `price`. `specialprice` (a lower sale figure) is
  // deliberately NOT used: it is 0 on every record observed, and adopting it
  // unvalidated risks printing a conditional/incentive price as the asking
  // price — the false bargain the house rule forbids, where caution runs
  // asymmetric toward the higher, unconditional number. `originalprice` is
  // inconsistent (sometimes above, sometimes below `price`) so it is ignored.
  const price = numOrU(r.price);

  const cond = String(r.condition ?? "").toLowerCase();
  const itemCondition = /new/.test(cond) ? "new" : "used";

  // Not live-verified for URL stability this session (design doc,
  // 2026-08-20) — stabilizeImages() strips any volatile query string
  // defensively before this rides the payload-equality guard in 0025.
  const images = stabilizeImages(
    Array.isArray(r.photos)
      ? r.photos.filter((u) => typeof u === "string" && u)
      : typeof r.featuredphoto === "string" && r.featuredphoto
        ? [r.featuredphoto]
        : [],
  );

  let url = origin;
  if (typeof r.url === "string" && r.url) {
    try {
      url = new URL(r.url, origin).toString();
    } catch {}
  }

  const dealer = r.dealer && typeof r.dealer === "object" ? r.dealer : null;

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: r.year != null ? String(r.year) : undefined,
    brand: r.make || undefined,
    model: r.model || undefined,
    vehicleConfiguration: r.trim || undefined,
    name: r.title || [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer: numOrU(r.mileage) != null ? { "@type": "QuantitativeValue", value: Number(r.mileage) } : undefined,
    color: r.exteriorcolor || undefined,
    vehicleInteriorColor: r.interiorcolor || undefined,
    driveWheelConfiguration: r.drivetrainstandard || undefined,
    sku: r.stocknumber ? String(r.stocknumber) : undefined,
    image: images.length ? images : undefined,
    itemCondition,
    // The dealer's own declared fuel ("Electric", "Gasoline", "Hybrid",
    // "Diesel", "Flex Fuel"); classifyEv reads it and decides — nothing here
    // pre-judges which values count as electric.
    vehicleEngine: { "@type": "EngineSpecification", fuelType: r.fuel || undefined },
    fuelType: r.fuel || undefined,
    offers: {
      "@type": "Offer",
      price,
      // The API record's `price` field. Kept distinct from the SRP ItemList's
      // Offer price below, which IS the page's JSON-LD and is left untagged:
      // the two have never been checked equal, and a split only goes quiet.
      priceProvenance: OVERFUEL_PRICE,
      priceCurrency: "USD",
      url,
      seller: dealer
        ? {
            "@type": "AutoDealer",
            name: dealer.name || undefined,
            address: {
              "@type": "PostalAddress",
              addressLocality: dealer.city || undefined,
              addressRegion: dealer.state || undefined,
            },
          }
        : undefined,
    },
  };
}

const API_LIMIT = 200; // honoured by the endpoint (meta.limit echoes it back)
const API_MAX_PAGES = 60; // 60 * 200 = 12k, a runaway guard well past any lot seen

function apiUrl(dealerId, offset) {
  return `https://api.overfuel.com/api/1.0/dealers/${dealerId}/search?limit=${API_LIMIT}&offset=${offset}`;
}

// Page a dealer's inventory to completion and return every vehicle as a
// schema.org Vehicle node. `complete` is true ONLY when the walk reached the
// reported `meta.total` (or a clean empty lot): a partial or failed pull returns
// complete=false so the caller reports truncated:true and db-sync never delists
// a lot on the strength of an API hiccup.
export async function pullOverfuelApi(config, origin) {
  const out = [];
  let offset = 0;
  let total = 0;
  let ok = false;
  let reachedEnd = false;
  let pages = 0;

  // Completeness is "we reached the last page", NOT "offset caught up to
  // meta.total": the endpoint's `total` can overrun the records it will actually
  // page out by one or two (a sold/hidden row it still counts — steponeauto
  // reports 1761 and pages out 1760), which would peg an otherwise-complete pull
  // as partial forever. A page shorter than the limit is the last page; an empty
  // page confirms the end when the count lands on an exact multiple. Only a
  // mid-stream error or the runaway cap leaves reachedEnd false → partial.
  while (pages < API_MAX_PAGES) {
    const { status, json } = await politeGetJson(apiUrl(config.dealerId, offset));
    if (status !== 200 || !json || !Array.isArray(json.results)) break;
    ok = true;
    if (Number.isFinite(json.meta?.total)) total = json.meta.total;
    for (const r of json.results) {
      const node = apiVehicleNode(r, origin);
      if (node) out.push(node);
    }
    offset += json.results.length;
    pages++;
    if (json.results.length < API_LIMIT) {
      reachedEnd = true;
      break;
    }
  }

  const complete = ok && reachedEnd;
  return { vehicles: out, complete, found: total || offset, ok };
}

// Cheap liveness check for probe.mjs: one request, does this dealer hold VIN'd
// inventory? Keeps the probe's fetch budget intact — the full paged pull happens
// later, in the nightly crawl.
export async function countOverfuelApi(config) {
  const { status, json } = await politeGetJson(apiUrl(config.dealerId, 0));
  if (status !== 200 || !json || !Array.isArray(json.results)) return { ok: false, found: 0, hasVin: false };
  const hasVin = json.results.some((r) => API_VIN_RE.test(String(r?.vin ?? "").toUpperCase()));
  return { ok: true, found: Number.isFinite(json.meta?.total) ? json.meta.total : json.results.length, hasVin };
}

const VIN_RE = /\b([A-HJ-NPR-Z0-9]{17})\b/i;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// The SRP url(s) this page links to. A single-rooftop site names one
// ("/used-cars-albuquerque-nm"); the same shape covers new-car slugs too. The
// canonical/next links a page carries about ITSELF are deliberately not seeds —
// only nav hrefs to a search page — so a VDP doesn't seed itself as an SRP, and
// /page/N variants are skipped so page 1 is always the entry point.
export function overfuelSeeds(html, pageUrl) {
  if (typeof html !== "string") return [];
  const seeds = new Set();
  for (const m of html.matchAll(/href=["'](\/(?:used|new|certified)-cars-[a-z0-9-]+)["']/gi)) {
    if (/\/page\/\d+$/.test(m[1])) continue;
    try {
      seeds.add(new URL(m[1], pageUrl).toString());
    } catch {}
  }
  return [...seeds];
}

// The next SRP page, from the page's own <link rel="next"> (Overfuel paginates
// as "/…/page/2"). The crawler jumps this to the front of the queue rather than
// trailing it behind the sitemap's whole-lot VDP list — otherwise a rooftop
// with more than one SRP page never reaches page 2 within budget, and an EV
// sitting on page 3 (the Lexus RZ on 712, 2026-08-18) is silently missed.
export function overfuelNextPageUrl(html, pageUrl) {
  if (typeof html !== "string") return null;
  const href = html.match(/<link[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (!href) return null;
  try {
    return new URL(href.replace(/&amp;/g, "&"), pageUrl).toString();
  } catch {
    return null;
  }
}

const listType = (t) => (Array.isArray(t) ? t : [t]).some((x) => String(x).toLowerCase() === "itemlist");

// Every car on an SRP page, from its ItemList of Products. Shaped as schema.org
// Vehicle nodes so crawl.mjs treats them exactly like any other extracted
// vehicle: classify EV, normalize, and (because these are SRP tiles) follow the
// offer url to the VDP for mileage and trim. The VIN is recovered from the VDP
// slug, the only place the Product carries it.
export function overfuelVehicles(html, pageUrl) {
  if (typeof html !== "string" || !ASSET_RE.test(html)) return [];
  const out = [];
  const seen = new Set();
  for (const node of extractNodes(html)) {
    if (!listType(node["@type"])) continue;
    for (const el of node.itemListElement ?? []) {
      const item = el?.item ?? el;
      const url = typeof item?.url === "string" ? item.url : undefined;
      if (!url) continue;
      const vin = url.match(VIN_RE)?.[1]?.toUpperCase();
      if (!vin || seen.has(vin)) continue;
      seen.add(vin);
      const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
      // The name is "YEAR MAKE MODEL TRIM": the year and make are one token
      // each; the model/trim split is left to the VDP (which carries them as
      // their own fields), so only make and year are lifted cleanly here and
      // the remaining tokens ride along as the model name until the VDP record,
      // which is richer, supersedes this one on VIN.
      const nm = typeof item.name === "string" ? item.name.trim() : "";
      const parts = nm.split(/\s+/).filter(Boolean);
      const year = /^\d{4}$/.test(parts[0]) ? parts[0] : undefined;
      const make = year ? parts[1] : parts[0];
      const model = parts.slice(year ? 2 : 1).join(" ") || undefined;
      let abs;
      try {
        abs = new URL(url, pageUrl).toString();
      } catch {
        abs = url;
      }
      out.push({
        "@type": "Vehicle",
        vehicleIdentificationNumber: vin,
        vehicleModelDate: year,
        brand: make,
        model,
        name: nm || undefined,
        image: typeof item.image === "string" ? item.image : undefined,
        itemCondition: "used",
        offers: {
          "@type": "Offer",
          price: num(offer?.price),
          priceCurrency: "USD",
          url: abs,
        },
      });
    }
  }
  return out;
}
