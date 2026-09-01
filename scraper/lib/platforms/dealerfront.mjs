// DealerFront — a small dealer-website vendor (dealerfront.com) with two
// live templates across its three registry rooftops (2026-08-31):
//
//   A. A WordPress plugin (metroautooc.com): wp-content/plugins/dealerfront/
//      assets on every page. SRP /inventory/ paginates PATH-style
//      (/inventory/page/2/ … /10/), ten cards a page. Each card: an
//      `img-overlay` anchor to the VDP (/inventory/{stock}-{slug}/), a
//      per-car "Used"/"New" badge, a price block whose label line prints
//      "Asking Price", a "VIN #" line, and small-text fuel / odometer /
//      engine / transmission stats. No JSON-LD anywhere.
//
//   B. A hosted portal (aamotorsauto.com, hausertrucksales.com): the page
//      credits "powered by dealerfront.com". SRP /inventory/ paginates with
//      ?&page=N. Each `result-item` block: data-iid, a CarStory widget
//      carrying data-carstory-vin, a heading anchor to
//      ../inventory-details/?iid={id} with the name in .standard-view-ymm,
//      and a .vehicle-cost price labelled "Asking Price". The tile has no
//      fuel or odometer — those live on the VDP, which the crawl follows.
//
// The price read is the number beside the platform's own "Asking Price"
// label and nothing else; a card printing two distinct amounts abstains
// (the automanager tilePrices rule). data-carstory-vin is a third party's
// widget attribute but carries the car's identity, not its price — used for
// VIN only, never for a number (the AutoManager data-cg-price precedent).
import { DEALERFRONT_ASKING } from "../price-provenance.mjs";
import { conditionToken } from "../condition.mjs";
import { stabilizeImages } from "../images.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The plugin path and the portal's footer credit. Never the bare word, and
// never data-carstory-* (CarStory is Vroom's widget and appears on other
// vendors' sites). Kept byte-identical to the fingerprint.mjs entry.
const MARK_RE = /wp-content\/plugins\/dealerfront\/|powered by dealerfront\.com/i;

export function isDealerFront(html) {
  return typeof html === "string" && MARK_RE.test(html);
}

export const DEALERFRONT_SRP_PATH = "/inventory/";

export function dealerFrontSeeds(origin) {
  return [origin.replace(/\/$/, "") + DEALERFRONT_SRP_PATH];
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Every distinct "Asking Price"-labelled amount in one card chunk. */
function askingPrices(chunk) {
  const seen = new Set();
  // Template A: <div …>$11,222</div><div …>Asking Price</div>
  for (const m of chunk.matchAll(/>\s*\$([0-9][0-9,]{2,})\s*<[^]{0,200}?>\s*Asking Price\s*</g)) {
    const n = num(m[1]);
    if (n != null) seen.add(n);
  }
  // Template B: <span class="vehicle-meta">Asking Price</span>$19,995
  for (const m of chunk.matchAll(/>\s*Asking Price\s*<\/span>\s*\$([0-9][0-9,]{2,})/g)) {
    const n = num(m[1]);
    if (n != null) seen.add(n);
  }
  return [...seen];
}

function vehicleFrom({ vin, url, name, chunk, pageUrl }) {
  if (!VIN_RE.test(vin)) return null;
  let abs;
  try {
    abs = url ? new URL(url, pageUrl).toString() : undefined;
  } catch {}
  const prices = askingPrices(chunk);
  const price = prices.length === 1 ? prices[0] : undefined;
  // Template A's per-car badge is the platform's own token; absent → silence.
  const itemCondition = conditionToken(chunk.match(/badge bg-primary">([A-Za-z -]{3,20})</)?.[1]);
  // Template A's small-text stats: fuel, odometer, engine ride under their
  // icon spans. The dealer's own strings, passed through untouched.
  const fuel = chunk.match(/fuel-icon"[^]{0,900}?<small>([^<]{2,30})<\/small>/)?.[1]?.trim();
  const mileage = num(chunk.match(/mileage-icon"[^]{0,900}?<small>([^<]{1,20})<\/small>/)?.[1]);
  const engine = chunk.match(/engine-icon"[^]{0,900}?<small>([^<]{2,40})<\/small>/)?.[1]?.trim();
  const img = chunk.match(/<img src="((?:https?:)?\/\/[^"]+)"[^>]*alt="picture of |<img[^>]*class="[^"]*card-img[^"]*"[^>]*src="([^"]+)"/)?.slice(1).find(Boolean);
  const images = stabilizeImages([img && img.startsWith("//") ? `https:${img}` : img].filter(Boolean));
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    name: name || undefined,
    ...(itemCondition ? { itemCondition } : {}),
    mileageFromOdometer: mileage != null ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    image: images.length ? images : undefined,
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", name: engine || undefined, fuelType: fuel },
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? DEALERFRONT_ASKING : undefined,
      priceCurrency: "USD",
      url: abs,
    },
  };
}

/** Every car on a DealerFront SRP page, whichever template rendered it. */
export function dealerFrontVehicles(html, pageUrl) {
  if (!isDealerFront(html)) return [];
  const out = [];
  const seen = new Set();

  // Template A: chunk from one img-overlay anchor to the next.
  const overlays = [...html.matchAll(/<a class="img-overlay" href="([^"]+)">/g)];
  for (let i = 0; i < overlays.length; i++) {
    const chunk = html.slice(overlays[i].index, overlays[i + 1]?.index ?? overlays[i].index + 12000);
    const vin = (chunk.match(/VIN\s*#<\/strong>\s*([A-HJ-NPR-Z0-9]{17})/)?.[1] ?? "").toUpperCase();
    const name = chunk.match(/<a[^>]*href="[^"]*"[^>]*>\s*<span class="standard-view-ymm">([^<]+)</)?.[1]
      ?? chunk.match(/<h[1-6][^>]*>\s*<a[^>]*>([^<]{5,80})</)?.[1];
    const v = vehicleFrom({ vin, url: overlays[i][1], name: name?.trim(), chunk, pageUrl });
    if (v && !seen.has(v.vehicleIdentificationNumber)) {
      seen.add(v.vehicleIdentificationNumber);
      out.push(v);
    }
  }

  // Template B: chunk per result-item block.
  const items = [...html.matchAll(/<div class="result-item format-standard[^"]*"/g)];
  for (let i = 0; i < items.length; i++) {
    const chunk = html.slice(items[i].index, items[i + 1]?.index ?? items[i].index + 15000);
    const vin = (chunk.match(/data-carstory-vin="([A-HJ-NPR-Z0-9]{17})"/)?.[1] ?? "").toUpperCase();
    const link = chunk.match(/<a href="([^"]*inventory-details\/?\?iid=\d+)"/)?.[1];
    const name = chunk.match(/<span class="standard-view-ymm">([^<]+)</)?.[1];
    const v = vehicleFrom({ vin, url: link, name: name?.trim(), chunk, pageUrl });
    if (v && !seen.has(v.vehicleIdentificationNumber)) {
      seen.add(v.vehicleIdentificationNumber);
      out.push(v);
    }
  }
  return out;
}

/** Next SRP page. Template A pages path-style (/inventory/page/N/), which the
 *  crawl's generic ?page= href scan cannot see; template B's ?&page=N links
 *  are matched here too so both walk the same way. */
export function dealerFrontNextPageUrl(html, pageUrl) {
  if (typeof html !== "string") return null;
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const pathPages = [...html.matchAll(/href="[^"]*\/inventory\/page\/(\d{1,3})\/"/g)].map((m) => Number(m[1]));
  if (pathPages.length) {
    const cur = Number(u.pathname.match(/\/page\/(\d{1,3})\/?$/)?.[1] ?? 1);
    if (cur >= Math.max(...pathPages)) return null;
    return new URL(`/inventory/page/${cur + 1}/`, u).toString();
  }
  const qPages = [...html.matchAll(/href="\?&?page=(\d{1,3})"/g)].map((m) => Number(m[1]));
  if (qPages.length) {
    const cur = Number(u.searchParams.get("page") ?? 1);
    if (!Number.isFinite(cur) || cur >= Math.max(...qPages)) return null;
    u.searchParams.set("page", String(cur + 1));
    return u.toString();
  }
  return null;
}
