#!/usr/bin/env node
// Prototype dealer-site crawler.
//   node crawl.mjs <domain> [<domain>…] [--max-pages N]
// Discovery: sitemaps + known SRP paths; SRP ItemList JSON-LD bridges to VDPs
// (DealerOn-style sites list no VDPs in their sitemap). Extraction: schema.org
// Vehicle JSON-LD. EV-targeting: ItemList names/VINs are pre-filtered so the
// page budget is spent on electric cars, not the whole lot.
import { mkdir, writeFile } from "node:fs/promises";
import { fetchPage, setCacheTtl } from "./lib/http.mjs";
import { extractVehicles, extractItemListEntries } from "./lib/jsonld.mjs";
import { classifyEv } from "./lib/ev.mjs";
import { normalize, richness } from "./lib/normalize.mjs";
import { extractDdcVehicles, enrichFromDdc } from "./lib/platforms/dealercom.mjs";
import { extractDealerOn, enrichFromDealerOn } from "./lib/platforms/dealeron.mjs";
import { extractTeamVelocity, enrichFromTeamVelocity } from "./lib/platforms/teamvelocity.mjs";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
}
const MAX_PAGES = flag("--max-pages", 25);
const CONCURRENCY = flag("--concurrency", 6);
// --cache-hours N: reuse pages fetched within N hours (0 = always live)
setCacheTtl(flag("--cache-hours", 0) * 3_600_000);
const flagIdxs = new Set(
  ["--max-pages", "--concurrency", "--cache-hours"].flatMap((f) => {
    const i = args.indexOf(f);
    return i >= 0 ? [i, i + 1] : [];
  })
);
const domains = args.filter((a, i) => !flagIdxs.has(i) && !a.startsWith("--"));

const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
const INV_PATH_RE = /(inventory|\/used|\/new-|vehicle|\/vdp|\/detail|listing|search(used|new))/i;
const VIN_RE = /[A-HJ-NPR-Z0-9]{17}/i;
const EVISH_RE = /(tesla|bolt|leaf|ioniq|ev6|ev9|niro.?ev|kona.?el|id-?\.?4|mach-?e|lightning|ariya|lyriq|blazer.?ev|equinox.?ev|silverado.?ev|sierra.?ev|hummer|escalade.?iq|optiq|vistiq|taycan|e-?tron|polestar|rivian|lucid|solterra|bz4x|prologue|zdx|eqb|eqe|eqs|i[45x]\b|500e|cooper.?se|charger.?daytona|wagoneer.?s\b|electric)/i;

// SRP seeds that exist across major dealer platforms
const SRP_PATHS = [
  "/searchused.aspx", "/searchnew.aspx", // DealerOn
  "/used-vehicles/", "/new-vehicles/",   // Dealer Inspire / DealerOn alt
  "/inventory/used", "/inventory/new", "/inventory/", // Dealer.com and others
  "/used-inventory/index.htm", "/new-inventory/index.htm", // Dealer.com
];

const EV_ONLY_WMIS = new Set(["5YJ", "7SA", "7G2", "LRW", "XP7", "7FC", "7PD", "50E", "LPS", "YSP"]);
const dedupe = (arr) => [...new Set(arr)];

function evishEntry({ url, name, vin }) {
  if (vin && VIN_RE.test(vin) && EV_ONLY_WMIS.has(vin.slice(0, 3).toUpperCase())) return true;
  return EVISH_RE.test(`${name ?? ""} ${url}`);
}

async function discoverSitemapUrls(domain) {
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
  while (queue.length && urls.length < 3000) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const res = await fetchPage(sm);
    if (res.status !== 200 || !res.body) continue;
    for (const m of res.body.matchAll(LOC_RE)) {
      const loc = m[1];
      if (/\.xml(\.gz)?$/i.test(loc) && seen.size < 25) queue.push(loc);
      else if (INV_PATH_RE.test(loc)) urls.push(loc);
    }
  }
  return urls;
}

function rank(urls) {
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

async function crawlDealer(domain) {
  const report = { domain, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const origin = `https://${domain}`;
  const visited = new Set();

  const sitemapUrls = await discoverSitemapUrls(domain);
  report.notes.push(`${sitemapUrls.length} inventory-ish sitemap urls`);

  // Queue: SRP seeds first (cheap, high leverage), then ranked sitemap URLs.
  const srpSeeds = [
    ...SRP_PATHS.map((p) => origin + p),
    ...rank(sitemapUrls.filter((u) => /search|inventory|used-vehicles|new-vehicles/i.test(u))).slice(0, 4),
  ];
  const queue = dedupe([...srpSeeds, ...rank(sitemapUrls)]);

  while (queue.length && report.fetched < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    const res = await fetchPage(url);
    report.fetched++;
    if (res.status === "robots_disallowed") continue;
    if (res.status !== 200 || !res.body) {
      report.errors.push(`${res.status} ${url}`);
      continue;
    }

    // Extract vehicles present on this page (VDPs, and SRPs that embed arrays)
    const vehicles = extractVehicles(res.body);
    if (vehicles.length) report.vehiclePages++;
    const isSrp = vehicles.length > 1;
    // Platform layer: Dealer.com and DealerOn pages embed full vehicle records
    const ddcByVin = new Map(extractDdcVehicles(res.body).map((d) => [String(d.vin).toUpperCase(), d]));
    const dealerOn = extractDealerOn(res.body);
    const teamVelocity = extractTeamVelocity(res.body);
    for (const v of vehicles) {
      const cls = classifyEv(v);
      if (!cls.isEv) continue;
      let rec = normalize(v, { sourceUrl: res.finalUrl, dealerDomain: domain });
      rec.evKind = cls.kind;
      rec.evConfidence = cls.confidence;
      rec.fromVdp = !isSrp;
      if (rec.vin && ddcByVin.has(rec.vin)) rec = enrichFromDdc(rec, ddcByVin.get(rec.vin));
      if (dealerOn) rec = enrichFromDealerOn(rec, dealerOn);
      if (teamVelocity) rec = enrichFromTeamVelocity(rec, teamVelocity);
      report.evs.push(rec);
      // An SRP tile knows its car's own page — fetch the VDP for the full
      // record (odometer, trim, gallery, canonical URL).
      if (isSrp && rec.vdpUrl && !visited.has(rec.vdpUrl)) queue.unshift(rec.vdpUrl);
    }

    // Bridge: SRP ItemList → VDP urls, EV-filtered, jump the queue
    const allEntries = extractItemListEntries(res.body);
    const entries = allEntries.filter(evishEntry);
    if (entries.length) {
      report.itemListVdps += entries.length;
      queue.unshift(...entries.map((e) => e.url).filter((u) => !visited.has(u)));
    }

    // Pagination: a page that carries an ItemList is an SRP — follow its
    // rel=next / page-param links so EVs deeper in inventory are reachable.
    if (allEntries.length) {
      const next = [
        ...[...res.body.matchAll(/<(?:a|link)[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]),
        ...[...res.body.matchAll(/href=["']([^"']*[?&](?:pt|page|pg)=\d+[^"']*)["']/gi)].map((m) => m[1]),
      ]
        .map((h) => (h.startsWith("http") ? h : origin + (h.startsWith("/") ? h : `/${h}`)))
        .map((h) => h.replace(/&amp;/g, "&"))
        .filter((h) => !visited.has(h));
      queue.push(...dedupe(next).slice(0, 5));
    }
  }
  return report;
}

// Domains crawl in parallel: politeness is enforced per host inside
// fetchPage, so concurrency across different dealers is free speed.
const allEvs = [];
const reports = [];
let next = 0;
async function worker() {
  while (next < domains.length) {
    const domain = domains[next++];
    console.error(`── crawling ${domain}`);
    const rep = await crawlDealer(domain);
    reports.push(rep);
    allEvs.push(...rep.evs);
    console.error(
      `── ${domain}: fetched ${rep.fetched}, ${rep.vehiclePages} pages w/ vehicles, ${rep.itemListVdps} ItemList VDPs queued, ${rep.evs.length} EVs`
    );
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, domains.length) }, worker));

await mkdir(new URL("./out/", import.meta.url), { recursive: true });
const byVin = new Map();
for (const ev of allEvs) {
  const key = ev.vin ?? `${ev.dealerDomain}:${ev.sourceUrl}`;
  const prev = byVin.get(key);
  if (!prev || richness(ev) > richness(prev)) byVin.set(key, ev);
}
await writeFile(new URL("./out/listings.json", import.meta.url), JSON.stringify([...byVin.values()], null, 2));
await writeFile(new URL("./out/report.json", import.meta.url), JSON.stringify(reports, null, 2));
console.error(`\n${byVin.size} unique EV listings → scraper/out/listings.json`);
