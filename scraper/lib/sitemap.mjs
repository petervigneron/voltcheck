// Sitemap discovery + inventory-URL ranking, shared by crawl.mjs (deep
// crawl) and probe.mjs (cheap validation of discovered domains).
import { fetchPage } from "./http.mjs";
import { EV_MODEL_RE, PHEV_MODEL_RE, PHEV_NAME_CLAIM_RE } from "./ev.mjs";

export const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
export const INV_PATH_RE = /(inventory|\/used|\/new-|vehicle|\/vdp|\/detail|listing|search(used|new))/i;
export const VIN_RE = /[A-HJ-NPR-Z0-9]{17}/i;
// \bbz\b: Toyota renamed the bZ4X to plain "bZ" for 2026, so Venom-style
// /vehicle/New/2026/Toyota/bZ/{VIN}/ URLs carry no other EV marker. The
// Primes are PHEVs classifyEv keeps; spelled out (not bare "prime") so a
// Prime-branded dealer group's every URL doesn't rank EV-ish. Ranking-only
// cost either way: a false match here wastes a fetch, never makes a claim.
// The plug-in tokens at the end (4xe, phev, plug-in, energi, e-hybrid,
// pacifica-hybrid) follow lib/ev.mjs's PHEV_MODEL_RE (2026-08-23): on the
// HTML-walk path a 4xe's VDP URL ranked no higher than a petrol Wrangler's.
export const EVISH_RE = /(tesla|bolt|leaf|ioniq|ev6|ev9|niro.?ev|kona.?el|\bid-?\.?4|mach-?e|lightning|ariya|lyriq|blazer.?ev|equinox.?ev|silverado.?ev|sierra.?ev|hummer|escalade.?iq|optiq|vistiq|taycan|e-?tron|polestar|rivian|lucid|solterra|bz4x|\bbz\b|rav4.?prime|prius.?prime|prologue|zdx|i-?miev|eqb|eqe|eqs|i[45x]\b|500e|cooper.?se|charger.?daytona|wagoneer.?s\b|electric|4xe|phev|plug-?in|energi|e-hybrid|pacifica-?hybrid)/i;

// The candidacy net, and the only one the crawl should use. EVISH_RE above is
// a hand-kept nameplate list; lib/ev.mjs keeps the real ones, and the two
// drifted. Measured 2026-09-05 against feldmanchevyoflivonia.com's whole
// DealerOn lot — 4,814 cars, 260 of them electrified by classifyEv — EVISH_RE
// alone could not see 27 of the 260 (10.4%): seven Chrysler "Pacifica Hybrid"
// (the entry reads `pacifica-?hybrid`, and the maker writes it with a SPACE),
// a Dodge Hornet R/T, a BMW 530e, and eighteen BrightDrop Zevo vans. Each of
// those is a nameplate lib/ev.mjs already knows and this list did not. On the
// HTML-walk and Dealer Inspire paths a car that fails this test never gets its
// page read at all, so the gap is cars, not ranking.
//
// Asking ev.mjs directly is what stops it drifting again: every nameplate
// added there from now on widens the crawl's net on the same commit.
// De-hyphenated because these lists are written for names ("prius prime",
// "grand cherokee 4xe") and this predicate is handed URL slugs
// ("used-2023-jeep-grand-cherokee-4xe-1c4…"). Ranking and candidacy only — a
// false match here spends one fetch and makes no claim, which is why the net
// may be generous where classifyEv may not.
export function evish(text) {
  const raw = String(text ?? "");
  // Both shapes, because neither survives the other's punctuation: a slug
  // ("…-rav4-prime-xse") needs the hyphens gone before "rav4 prime" can match,
  // and a rendered name ("Hornet R/T Plus EAWD") needs its slash kept.
  for (const hay of [raw, raw.replace(/[-_]+/g, " ")]) {
    if (EVISH_RE.test(hay) || EV_MODEL_RE.test(hay) || PHEV_MODEL_RE.test(hay) || PHEV_NAME_CLAIM_RE.test(hay)) return true;
  }
  return false;
}

// SRP seeds that exist across major dealer platforms
export const SRP_PATHS = [
  "/searchused.aspx", "/searchnew.aspx", // DealerOn
  "/used-vehicles/", "/new-vehicles/",   // Dealer Inspire / DealerOn alt
  "/inventory/used", "/inventory/new", "/inventory/", // Dealer.com and others
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
        (evish(u) ? 8 : 0) +
        (/used/i.test(u) ? 2 : 0) +
        (/(vdp|detail|vehicle\/)/i.test(u) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.u);
}
