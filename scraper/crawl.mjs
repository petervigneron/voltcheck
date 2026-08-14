#!/usr/bin/env node
// Prototype dealer-site crawler.
//   node crawl.mjs <domain> [<domain>…] [--max-pages N]
// Discovery: sitemaps + known SRP paths; SRP ItemList JSON-LD bridges to VDPs
// (DealerOn-style sites list no VDPs in their sitemap). Extraction: schema.org
// Vehicle JSON-LD. EV-targeting: ItemList names/VINs are pre-filtered so the
// page budget is spent on electric cars, not the whole lot.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fetchPage, setCacheTtl } from "./lib/http.mjs";
import { extractVehicles, extractItemListEntries } from "./lib/jsonld.mjs";
import { classifyEv } from "./lib/ev.mjs";
import { normalize, richness } from "./lib/normalize.mjs";
import { discoverSitemapUrls, rank, dedupe, SRP_PATHS, VIN_RE, EVISH_RE } from "./lib/sitemap.mjs";
import { extractDdcVehicles, enrichFromDdc } from "./lib/platforms/dealercom.mjs";
import { extractDealerOn, enrichFromDealerOn } from "./lib/platforms/dealeron.mjs";
import { extractTeamVelocity, enrichFromTeamVelocity } from "./lib/platforms/teamvelocity.mjs";
import { extractDrivewayVehicles } from "./lib/platforms/driveway.mjs";

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
  ["--max-pages", "--concurrency", "--cache-hours", "--page-budget"].flatMap((f) => {
    const i = args.indexOf(f);
    return i >= 0 ? [i, i + 1] : [];
  })
);
const domains = args.filter((a, i) => !flagIdxs.has(i) && !a.startsWith("--"));

// Per-site page budgets: registry pageBudget wins; group sites (one domain,
// many rooftops) default deep; everything else uses --max-pages.
const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));
const siteInfo = new Map(registry.sites.map((s) => [s.domain, s]));
// --page-budget N overrides everything, including a registry pageBudget, so a
// group site's real depth can be measured without editing the registry.
const BUDGET_OVERRIDE = flag("--page-budget", 0);
function pageBudget(domain) {
  if (BUDGET_OVERRIDE) return BUDGET_OVERRIDE;
  const s = siteInfo.get(domain);
  return s?.pageBudget ?? (s?.kind === "group" ? 400 : MAX_PAGES);
}

// Dry-hole floors. Most domains yield a median of 6 cars and some yield none
// at all, yet every one of them costs a full page budget: a Honda store was
// observed fetching all 80 pages for zero EVs. At 654 registry domains that
// waste is what makes a full crawl miss its window, so a crawl now stops once
// the evidence says there is nothing here. Both floors sit well past the SRP
// seeds, which are queued first — a real inventory shows itself long before.
const NO_VEHICLE_FLOOR = 25; // no vehicle record and no ItemList by here => not a shoppable site
const NO_EV_FLOOR = 40; // sells cars, just none of them electric

const EV_ONLY_WMIS = new Set(["5YJ", "7SA", "7G2", "LRW", "XP7", "7FC", "7PD", "50E", "LPS", "YSP"]);

// Dealer platforms emit VDP links in every shape: absolute, root-relative
// ("/inventory/..."), even bare-relative ("used-2022-volvo-..."). Resolve
// against the page that linked them; anything that still doesn't parse is
// dropped, not queued — unresolved relatives reaching fetchPage killed 4 of
// 8 shards on 2026-08-14 (ERR_INVALID_URL is thrown before any try/catch).
function abs(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function evishEntry({ url, name, vin }) {
  if (vin && VIN_RE.test(vin) && EV_ONLY_WMIS.has(vin.slice(0, 3).toUpperCase())) return true;
  return EVISH_RE.test(`${name ?? ""} ${url}`);
}

async function crawlDealer(domain) {
  const budget = pageBudget(domain);
  const report = { domain, budget, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const origin = `https://${domain}`;
  const visited = new Set();

  const sitemapUrls = await discoverSitemapUrls(domain, {
    maxUrls: Math.max(3000, budget * 40),
    maxSitemaps: budget > 100 ? 120 : 25,
  });
  report.notes.push(`${sitemapUrls.length} inventory-ish sitemap urls (budget ${budget})`);

  // Queue: SRP seeds first (cheap, high leverage), then ranked sitemap URLs.
  const srpSeeds = [
    ...SRP_PATHS.map((p) => origin + p),
    ...rank(sitemapUrls.filter((u) => /search|inventory|used-vehicles|new-vehicles/i.test(u))).slice(0, 4),
  ];
  const queue = dedupe([...srpSeeds, ...rank(sitemapUrls)]);

  while (queue.length && report.fetched < budget) {
    // Bail on dry holes (see floors above). Checked at the top of the loop
    // because the paths that matter most here — pages that 404, time out, or
    // are robots-disallowed — `continue` below without reaching the bottom.
    // The first dry hole caught this way had burned all 80 fetches on errors.
    if (report.fetched >= NO_VEHICLE_FLOOR && !report.vehiclePages && !report.itemListVdps) {
      report.stoppedEarly = `no vehicle records in ${report.fetched} pages`;
      break;
    }
    if (report.fetched >= NO_EV_FLOOR && !report.evs.length) {
      report.stoppedEarly = `${report.vehiclePages} vehicle pages, no EVs in ${report.fetched}`;
      break;
    }

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

    // Extract vehicles present on this page (VDPs, and SRPs that embed
    // arrays; Driveway embeds its JSON-LD inside __NEXT_DATA__ instead)
    const vehicles = [...extractVehicles(res.body), ...extractDrivewayVehicles(res.body)];
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
      // A relative vdpUrl would also ship a broken link to the site.
      if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, res.finalUrl) ?? rec.vdpUrl;
      rec.evKind = cls.kind;
      rec.evConfidence = cls.confidence;
      rec.fromVdp = !isSrp;
      if (rec.vin && ddcByVin.has(rec.vin)) rec = enrichFromDdc(rec, ddcByVin.get(rec.vin));
      if (dealerOn) rec = enrichFromDealerOn(rec, dealerOn);
      if (teamVelocity) rec = enrichFromTeamVelocity(rec, teamVelocity);
      report.evs.push(rec);
      // An SRP tile knows its car's own page — fetch the VDP for the full
      // record (odometer, trim, gallery, canonical URL).
      if (isSrp && rec.vdpUrl && rec.vdpUrl.startsWith("http") && !visited.has(rec.vdpUrl))
        queue.unshift(rec.vdpUrl);
    }

    // Bridge: SRP ItemList → VDP urls, EV-filtered, jump the queue
    const allEntries = extractItemListEntries(res.body);
    const entries = allEntries.filter(evishEntry);
    if (entries.length) {
      report.itemListVdps += entries.length;
      queue.unshift(...entries.map((e) => abs(e.url, res.finalUrl)).filter((u) => u && !visited.has(u)));
    }

    // Pagination: a page that carries an ItemList OR embeds multiple vehicle
    // records is an SRP — follow its rel=next / page-param links so EVs
    // deeper in inventory are reachable. (Dealer.com SRPs embed vehicle
    // arrays with no ItemList; gating on ItemList alone left their ?start=
    // pagination unfollowed — found on hendrickcars/BHA 2026-08-11.)
    if (allEntries.length || isSrp) {
      const next = [
        ...[...res.body.matchAll(/<(?:a|link)[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]),
        ...[...res.body.matchAll(/href=["']([^"']*[?&](?:pt|page|pg|start)=\d+[^"']*)["']/gi)].map((m) => m[1]),
      ]
        .map((h) => abs(h.replace(/&amp;/g, "&"), res.finalUrl))
        .filter((h) => h && !visited.has(h));
      queue.push(...dedupe(next).slice(0, 5));
    }
  }
  // Coverage honesty. A crawl that emptied its queue saw everything the
  // site offered; one that stopped at its page budget saw a subset, and a
  // different subset each night. Only the former can support "this VIN is
  // gone, therefore it sold" — see supabase/migrations/0002.
  // A crawl that bailed early never saw the whole site, even if its queue
  // happened to run dry on the same page — so it must never certify complete.
  // Without the stoppedEarly term, a dealer having a bad night (every page
  // erroring, so nothing new gets queued) would report truncated:false and
  // db-sync would delist every car it has.
  report.truncated = queue.length > 0 || Boolean(report.stoppedEarly);
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
    let rep;
    try {
      rep = await crawlDealer(domain);
    } catch (e) {
      // One domain must never take the whole worker pool's run down with
      // it. truncated:true — a crashed crawl certifies nothing, so db-sync
      // will not delist this dealer's cars.
      rep = { domain, budget: pageBudget(domain), fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [`crash: ${e.message}`], notes: [], truncated: true };
    }
    reports.push(rep);
    allEvs.push(...rep.evs);
    console.error(
      `── ${domain}: fetched ${rep.fetched}, ${rep.vehiclePages} pages w/ vehicles, ${rep.itemListVdps} ItemList VDPs queued, ${rep.evs.length} EVs${rep.stoppedEarly ? ` [bailed: ${rep.stoppedEarly}]` : ""}`
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
