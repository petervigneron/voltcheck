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
  "/used-inventory/index.htm", "/new-inventory/index.htm", // Dealer.com
];

export const dedupe = (arr) => [...new Set(arr)];

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
      const loc = m[1];
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
