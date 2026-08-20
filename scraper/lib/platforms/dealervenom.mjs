// DealerVenom platform extractor.
//
// DealerVenom is a franchise-dealer website vendor (Toyota-heavy: Arlington
// Toyota, Findlay Toyota, Toyota of Hollywood, Walser Toyota…). 43 of our
// registry's sites run it and every one yielded zero cars, because the SRP and
// VDP are a client-rendered shell — the inventory never appears in the served
// HTML, it is fetched in the browser from a Typesense search index. The probe
// fingerprinted these as "algolia"/"api.w.org" (WordPress front end, Algolia-
// style InstantSearch UI), but the search backend is actually Typesense, named
// in the page as `__tsHost`/`__tsApiKey` and queried via `typesenseSearchAdapter`.
//
// What every DealerVenom page carries in a header <script> is the whole search
// client, in the clear:
//   var __tsHost   = "hjnrb3s21408ezpfp.a1.typesense.net";
//   var __tsApiKey = "eQUa8iq30l8Tu908Drz9WKqar6tCJGd4";   // search-only key
//   let currentIndex = "vehicles-TOY09096";                // per-dealer collection
// One Typesense cluster serves the vendor's whole network; each dealer is its
// own `vehicles-<code>` collection. The API key is search-only and exposed to
// every visitor's browser by design — querying it is exactly what the site's
// own search box does. We read the config off the page and page the collection
// straight through, no bot-detection to defeat and no login.
//
// Unlike the HTML producers (DCS/DealerFire), this one does its own paged
// fetching against the search API rather than parsing a fetched page, so it
// exports a puller (`pullDealerVenom`) instead of an `extract…Vehicles(html)`.
// The pull returns the WHOLE lot as schema.org Vehicle nodes; classifyEv does
// the EV/PHEV filtering downstream, exactly as for every other source, so we
// never guess which `fuel` enum values count as electrified and never risk a
// mislabelled plug-in being filtered out at the source.

import { politeGetJson } from "../http.mjs";
import { stabilizeImages } from "../images.mjs";

// Page-level fingerprint. `typesenseSearchAdapter` is the vendor's search
// client init and appears on every page it serves; the `dealervenom` brand
// token is the belt-and-suspenders second signal. Deliberately not the bare
// word "typesense" (a CDN <script src> for the library could appear on an
// unrelated site) — this answer decides whether a crawl reads a dealer's lot.
const DV_MARK = /typesenseSearchAdapter|dealervenom/i;

export function isDealerVenom(html) {
  return typeof html === "string" && DV_MARK.test(html);
}

// Pull {host, apiKey, collection} out of the inline search-client config.
// Returns null unless all three are present AND the host is a Typesense cloud
// node — we will only ever issue requests to *.typesense.net, so a spoofed
// __tsHost on some unrelated page can never redirect our crawler elsewhere.
export function extractDealerVenomConfig(html) {
  if (typeof html !== "string") return null;
  const host = html.match(/__tsHost\s*=\s*["']([^"']+)["']/)?.[1];
  const apiKey = html.match(/__tsApiKey\s*=\s*["']([^"']+)["']/)?.[1];
  // `currentIndex = "vehicles-TOY09096"` — the page then does
  // currentIndex.split("/")[0], so strip any "/…" suffix the same way.
  const collection = html.match(/currentIndex\s*=\s*["']([A-Za-z0-9_\-]+)["']/)?.[1]?.split("/")[0];
  if (!host || !apiKey || !collection) return null;
  if (!/^[a-z0-9-]+\.[a-z0-9.-]*typesense\.net$/i.test(host)) return null;
  return { host, apiKey, collection };
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// One Typesense search document → a schema.org Vehicle node, shaped like the
// DCS/DealerFire producers so it flows through the same classifyEv/normalize
// path. Field names are taken from a live document, not guessed.
function vehicleNode(d, origin) {
  const vin = String(d.vin ?? d.id ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;

  // Price: finalPriceInt/price is the dealer's advertised price. We steer
  // clear of `internetPrice`, which on the same car is several thousand lower
  // because it folds in conditional incentives (finance-with-us, military,
  // college-grad) a shopper may not qualify for. Printing that as the price
  // would be exactly the false bargain the house rule forbids — caution here
  // is deliberately asymmetric toward the higher, unconditional number.
  const priceRaw = Number(d.finalPriceInt ?? d.price);
  const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : undefined;

  const cond = String(d.condition ?? "").toLowerCase();
  const itemCondition = cond === "used" || cond === "new" ? cond : undefined;

  const mileage = Number(d.mileage);
  // Not live-verified for URL stability this session (design doc,
  // 2026-08-20) — stabilizeImages() strips any volatile query string
  // defensively before this rides the payload-equality guard in 0025.
  const images = stabilizeImages(Array.isArray(d.imageUrls) ? d.imageUrls.filter((u) => typeof u === "string" && u) : []);
  const dealer = d.dealer && typeof d.dealer === "object" ? d.dealer : null;

  let url = origin;
  if (d.vdpUrl) {
    try {
      url = new URL(d.vdpUrl, origin).toString();
    } catch {}
  }

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: d.year != null ? String(d.year) : d.yr != null ? String(d.yr) : undefined,
    brand: d.make || undefined,
    model: d.model || undefined,
    name: d.vehicleTitle || [d.year, d.make, d.model, d.trim].filter(Boolean).join(" ") || undefined,
    vehicleConfiguration: d.trim || undefined,
    mileageFromOdometer: Number.isFinite(mileage) && mileage >= 0 ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: d.exteriorColor || d.genericColor || undefined,
    vehicleInteriorColor: d.interiorColor || undefined,
    driveWheelConfiguration: d.drivetrain || undefined,
    sku: d.stockNumber || undefined,
    image: images.length ? images : undefined,
    itemCondition,
    // The dealer's own declared fuel ("Electric", "Gasoline", "Hybrid",
    // "Plug-In Hybrid"). classifyEv reads it and decides — nothing here
    // pre-judges which values are electric.
    vehicleEngine: { "@type": "EngineSpecification", fuelType: d.fuel || undefined },
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: "USD",
      url,
      seller: dealer
        ? {
            "@type": "AutoDealer",
            name: dealer.name || d.dealerName,
            address: {
              "@type": "PostalAddress",
              streetAddress: dealer.address,
              addressLocality: dealer.city,
              addressRegion: dealer.state,
              postalCode: dealer.zip,
            },
          }
        : undefined,
    },
  };
}

// Typesense caps a single search at per_page 250 and its result window at
// page*per_page <= 10_000. No single dealer collection we've seen runs past
// ~1,500 cars, so the window is never the binding limit; the page cap below is
// only a runaway guard.
const PER_PAGE = 250;
const MAX_PAGES = 40; // 40 * 250 = 10_000, the Typesense window ceiling

function searchUrl({ host, apiKey, collection }, page) {
  const q = new URLSearchParams({
    q: "*",
    // query_by is required syntactically even for the q=* wildcard; vin is an
    // indexed field on the collection and the value is ignored for a wildcard.
    query_by: "vin",
    per_page: String(PER_PAGE),
    page: String(page),
    // Typesense accepts the search-only key as a query param, which is how the
    // site's own browser client sends it — so this needs no custom header.
    "x-typesense-api-key": apiKey,
  });
  return `https://${host}/collections/${encodeURIComponent(collection)}/documents/search?${q}`;
}

// Page a dealer's Typesense collection to completion and return every vehicle
// as a schema.org Vehicle node. `complete` is true ONLY when the walk actually
// reached the reported `found` total (or a clean empty collection): a partial
// or failed pull returns complete=false so the caller reports truncated:true
// and db-sync never delists a lot on the strength of an API hiccup.
export async function pullDealerVenom(config, origin) {
  const out = [];
  let page = 1;
  let found = Infinity;
  let fetched = 0;
  let ok = false;

  while (fetched < found && page <= MAX_PAGES) {
    const { status, json } = await politeGetJson(searchUrl(config, page));
    if (status !== 200 || !json || !Array.isArray(json.hits)) break;
    ok = true;
    found = Number.isFinite(json.found) ? json.found : fetched;
    for (const hit of json.hits) {
      const node = vehicleNode(hit?.document ?? {}, origin);
      if (node) out.push(node);
    }
    fetched += json.hits.length;
    if (json.hits.length < PER_PAGE) break; // last page
    page++;
  }

  const complete = ok && fetched >= found;
  return { vehicles: out, complete, found: Number.isFinite(found) ? found : 0, ok };
}

// Cheap liveness check for probe.mjs: one request, does this collection hold
// VIN'd inventory? Keeps the probe's ≤8-fetch budget intact — the full paged
// pull happens later, in the nightly crawl.
export async function countDealerVenom(config) {
  const { status, json } = await politeGetJson(searchUrl(config, 1));
  if (status !== 200 || !json || !Array.isArray(json.hits)) return { ok: false, found: 0, hasVin: false };
  const hasVin = json.hits.some((h) => VIN_RE.test(String(h?.document?.vin ?? "").toUpperCase()));
  return { ok: true, found: Number.isFinite(json.found) ? json.found : json.hits.length, hasVin };
}
