// Overfuel (overfuel.com; "mobile-first dealership websites"). The platform of
// the small independent lot — 712 Auto Sales (Albuquerque) is the first we saw.
//
// Unlike Dealer Car Search, Overfuel is friendly to the generic pipeline: its
// VDPs publish a full schema.org Vehicle node (the generic extractor reads them
// with mileage, trim and colours). What the generic pipeline can't do is
// ENUMERATE the lot. Two gaps:
//
//   1. The SRP lives at a per-rooftop slug ("/used-cars-albuquerque-nm") that no
//      path guess will find, so a crawl that doesn't happen to reach it through
//      the sitemap wanders the whole lot one VDP at a time.
//   2. The SRP's inventory is an ItemList of ListItem→Product nodes whose url
//      sits on the nested Product, not the ListItem — so the generic
//      extractItemListEntries (which reads ListItem.url) sees nothing, and the
//      SRP contributes no discovery bridge at all.
//
// So this module names the platform (its asset/API hosts are on every page),
// reads the SRP link off any Overfuel page so the crawl can seed it, and parses
// the SRP's Products into vehicle records. Each Product carries the VDP url with
// the VIN embedded in its slug
// (…-used-2024-subaru-solterra-premium-JTMABABA1RA062847-in-albuquerque-nm) plus
// name and price, so a rooftop is enumerated from ≤4 SRP fetches before a single
// VDP is opened, and the EV ones are then followed for their full record.
import { extractNodes } from "../jsonld.mjs";

const ASSET_RE = /(?:static|api|www)\.overfuel\.com/i;

export function isOverfuel(html) {
  return typeof html === "string" && ASSET_RE.test(html);
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
