// Sitemap discovery + inventory-URL ranking, shared by crawl.mjs (deep
// crawl) and probe.mjs (cheap validation of discovered domains).
import { fetchPage } from "./http.mjs";

export const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
export const INV_PATH_RE = /(inventory|\/used|\/new-|vehicle|\/vdp|\/detail|listing|search(used|new))/i;
export const VIN_RE = /[A-HJ-NPR-Z0-9]{17}/i;
export const EVISH_RE = /(tesla|bolt|leaf|ioniq|ev6|ev9|niro.?ev|kona.?el|id-?\.?4|mach-?e|lightning|ariya|lyriq|blazer.?ev|equinox.?ev|silverado.?ev|sierra.?ev|hummer|escalade.?iq|optiq|vistiq|taycan|e-?tron|polestar|rivian|lucid|solterra|bz4x|prologue|zdx|eqb|eqe|eqs|i[45x]\b|500e|cooper.?se|charger.?daytona|wagoneer.?s\b|electric)/i;

// SRP seeds that exist across major dealer platforms
export const SRP_PATHS = [
  "/searchused.aspx", "/searchnew.aspx", // DealerOn
  "/used-vehicles/", "/new-vehicles/",   // Dealer Inspire / DealerOn alt
  "/inventory/used", "/inventory/new", "/inventory/", // Dealer.com and others
  "/inventory", // DealerWebsites (its Angular bootstrap ships the whole lot here; /inventory/ 200s WITHOUT the blob)
  "/used-inventory/index.htm", "/new-inventory/index.htm", // Dealer.com
  // Dealer.com EV-facet SRPs (verified on hendrickcars.com cache and
  // berkshirehathawayautomotive.com) — land directly on the electric
  // inventory instead of wandering the whole lot. 404s elsewhere cost one
  // request each.
  "/new-inventory/electric-vehicles.htm",
  "/used-inventory/all-electric-used-cars.htm",
  "/electric/electric-vehicles.htm",
];

export const dedupe = (arr) => [...new Set(arr)];

// Sitemaps are XML, so URLs arrive entity-encoded: a literal "+" in a path
// shows up as &#x2B;. Fetching the raw string 404s every time. Found on
// DealerOn sites 2026-08-12, where it silently sank whole dealers.
export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Group sites enumerate tens of thousands of VDPs across sub-sitemaps; caps
// scale with the caller's page budget so a 500-page crawl isn't starved by
// prototype-era limits.
export async function discoverSitemapUrls(domain, { maxUrls = 3000, maxSitemaps = 25 } = {}) {
  const origin = `https://${domain}`;
  const urls = [];
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const robots = await fetchPage(`${origin}/robots.txt`);
  if (robots.status === 200 && robots.body) {
    for (const line of robots.body.split(/\r?\n/)) {
      const m = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (m) candidates.push(m[1]);
    }
  }
  const seen = new Set();
  const queue = dedupe(candidates);
  while (queue.length && urls.length < maxUrls) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const res = await fetchPage(sm);
    if (res.status !== 200 || !res.body) continue;
    for (const m of res.body.matchAll(LOC_RE)) {
      const loc = decodeEntities(m[1]);
      if (/\.xml(\.gz)?$/i.test(loc) && seen.size < maxSitemaps) queue.push(loc);
      else if (INV_PATH_RE.test(loc)) urls.push(loc);
    }
  }
  return urls;
}

export function rank(urls) {
  return dedupe(urls)
    .map((u) => ({
      u,
      score:
        (VIN_RE.test(u) ? 4 : 0) +
        (EVISH_RE.test(u) ? 8 : 0) +
        (/used/i.test(u) ? 2 : 0) +
        (/(vdp|detail|vehicle\/)/i.test(u) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.u);
}
