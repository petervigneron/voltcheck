#!/usr/bin/env node
// Prototype dealer-site crawler.
//   node crawl.mjs <domain> [<domain>…] [--max-pages N]
// Discovery: sitemaps + known SRP paths; SRP ItemList JSON-LD bridges to VDPs
// (DealerOn-style sites list no VDPs in their sitemap). Extraction: schema.org
// Vehicle JSON-LD. EV-targeting: ItemList names/VINs are pre-filtered so the
// page budget is spent on electric cars, not the whole lot.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fetchPage, setCacheTtl } from "./lib/http.mjs";
import { extractVehicles, extractMicrodataVehicles, extractItemListEntries } from "./lib/jsonld.mjs";
import { classifyEv, EV_ONLY_WMIS } from "./lib/ev.mjs";
import { normalize, richness } from "./lib/normalize.mjs";
import { discoverSitemapUrls, rank, dedupe, SRP_PATHS, VIN_RE, EVISH_RE } from "./lib/sitemap.mjs";
import { extractDdcVehicles, enrichFromDdc } from "./lib/platforms/dealercom.mjs";
import { extractDealerOn, enrichFromDealerOn } from "./lib/platforms/dealeron.mjs";
import { extractTeamVelocity, enrichFromTeamVelocity } from "./lib/platforms/teamvelocity.mjs";
import { extractDrivewayVehicles } from "./lib/platforms/driveway.mjs";
import { extractDcsVehicles, dcsNextPageUrl, dcsSeeds, isDealerCarSearch } from "./lib/platforms/dealercarsearch.mjs";
import {
  extractDealerFire,
  extractDealerFireDealers,
  enrichFromDealerFire,
  dealerFireVehicles,
  dealerFireSeeds,
  dealerFireNextPageUrl,
  isDealerFire,
} from "./lib/platforms/dealerfire.mjs";
import { isDealerVenom, extractDealerVenomConfig, pullDealerVenom } from "./lib/platforms/dealervenom.mjs";
import { isDealr, pullDealr } from "./lib/platforms/dealr.mjs";
import { isDealerSync, pullDealerSync } from "./lib/platforms/dealersync.mjs";
import { isAutoManager, pullAutoManager } from "./lib/platforms/automanager.mjs";
import { isAutoRevo, pullAutoRevo } from "./lib/platforms/autorevo.mjs";
import { extractDealerWebsitesVehicles } from "./lib/platforms/dealerwebsites.mjs";
import {
  isOverfuel,
  overfuelVehicles,
  overfuelSeeds,
  overfuelNextPageUrl,
  overfuelApiConfig,
  pullOverfuelApi,
} from "./lib/platforms/overfuel.mjs";

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

  // Dealer Car Search sites are crawled through their own search page rather
  // than one sitemap VDP at a time: a single SRP request enumerates up to 100
  // cars, and its fuel-type facet hands back the electric ones on their own.
  // Sites the registry already knows run it are seeded up front; the rest are
  // recognised from the first DCS page this crawl happens to fetch (their
  // sitemaps do list /vdp/ URLs, so one usually turns up on its own).
  const dcs = { seeded: false, srp: new Set(), done: 0, failed: false, evVdps: new Set(), trimmed: false };
  function seedDcs() {
    if (dcs.seeded) return;
    dcs.seeded = true;
    const seeds = dcsSeeds(origin).filter((u) => !visited.has(u));
    for (const u of seeds) dcs.srp.add(u);
    queue.unshift(...seeds);
    report.notes.push("dealercarsearch: seeded SRP + electric-facet SRP");
  }
  if (siteInfo.get(domain)?.platform === "dealercarsearch") seedDcs();

  // DealerVenom is API-backed (see the pull block below) and reveals its
  // Typesense config only in the page's own <script> — reliably on the
  // homepage, not on the client-rendered VDP shells. Seed the homepage first
  // for any site the registry can't already place on an HTML-extractable
  // platform (dealervenom, or still-unknown), so a DealerVenom site is caught
  // on page one instead of burning its budget on empty shells. Only ~353
  // working sites are unknown-platform, so the extra fetch is negligible.
  const dv = { done: false };
  const of = { done: false };
  const dl = { done: false };
  const ds = { done: false };
  const am = { done: false };
  const ar = { done: false };
  const dvPlat = siteInfo.get(domain)?.platform;
  if (
    !dvPlat ||
    dvPlat === "unknown" ||
    dvPlat === "dealervenom" ||
    dvPlat === "overfuel" ||
    dvPlat === "dealr" ||
    dvPlat === "dealersync" ||
    dvPlat === "automanager" ||
    dvPlat === "autorevo"
  )
    queue.unshift(origin + "/");

  // Overfuel hides its inventory behind a per-rooftop SRP slug
  // ("/used-cars-albuquerque-nm") that no path guess finds and that its own
  // ItemList doesn't expose as a followable link — so the SRP is read off the
  // first Overfuel page seen (the homepage, seeded above) and jumped to the
  // front, exactly like DealerFire's per-rooftop search slug.
  let ofSeeded = false;
  function seedOverfuel(html, pageUrl) {
    if (ofSeeded) return;
    const seeds = overfuelSeeds(html, pageUrl).filter((u) => !visited.has(u));
    if (!seeds.length) return;
    ofSeeded = true;
    queue.unshift(...seeds);
    report.notes.push(`overfuel: seeded ${seeds.length} SRP(s)`);
  }

  // DealerFire's SRP slug is per-rooftop ("/cars-for-sale-hillsboro-or"), so
  // there is nothing to seed until a page of theirs tells us its own — which
  // its SearchAction JSON-LD does. One request at limit=100 then replaces a
  // hundred VDP fetches at their Crawl-delay of 10s.
  let dfSeeded = false;
  function seedDealerFire(html, pageUrl) {
    if (dfSeeded) return;
    const seeds = dealerFireSeeds(html, pageUrl).filter((u) => !visited.has(u));
    if (!seeds.length) return;
    dfSeeded = true;
    queue.unshift(...seeds);
    report.notes.push(`dealerfire: seeded ${seeds.length} SRP(s)`);
  }

  while (queue.length && report.fetched < budget) {
    // A completed DCS search walk has enumerated every car the dealer lists,
    // so whatever is left in the queue can only re-find them — one page at a
    // time, at the cost of the whole budget. Keep the EV detail pages still
    // owed a fetch and drop the rest. Skipped if any SRP page in the walk
    // failed: a walk with a hole in it saw a subset, and claiming otherwise
    // would let db-sync delist cars that were merely unfetched.
    if (dcs.seeded && !dcs.trimmed && !dcs.failed && dcs.done > 0 && dcs.done === dcs.srp.size) {
      dcs.trimmed = true;
      const owed = queue.filter((u) => dcs.evVdps.has(u));
      queue.length = 0;
      queue.push(...owed);
      report.notes.push(`dealercarsearch: ${dcs.done} SRP pages covered the lot, ${owed.length} EV pages owed`);
      // The loop's own `while (queue.length)` was tested before this ran, so
      // an emptied queue has to be caught here or the next shift() hands
      // fetchPage an undefined URL.
      if (!queue.length) break;
    }

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
    if (res.status === "robots_disallowed") {
      if (dcs.srp.has(url)) dcs.failed = true;
      continue;
    }
    if (res.status !== 200 || !res.body) {
      if (dcs.srp.has(url)) dcs.failed = true;
      report.errors.push(`${res.status} ${url}`);
      continue;
    }

    // DealerVenom renders no inventory in HTML — it lives in a Typesense index
    // whose client config is inline on every page. On the first page that
    // reveals it, pull the whole collection through the search API and finish:
    // the rest of this site's pages have nothing for the walk to find.
    if (!dv.done && isDealerVenom(res.body)) {
      const cfg = extractDealerVenomConfig(res.body);
      if (cfg) {
        dv.done = true;
        const before = report.evs.length;
        const { vehicles: dvVehicles, complete, found } = await pullDealerVenom(cfg, origin);
        for (const v of dvVehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "dealervenom";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `dealervenom: ${found} in index, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
        );
        // A partial or failed pull must never certify a complete crawl, or
        // db-sync would delist cars we merely failed to finish fetching
        // (migration 0002, and the truncated: note at the end of this loop).
        if (!complete) report.stoppedEarly = "dealervenom partial pull";
        queue.length = 0;
        break;
      }
    }

    // Overfuel serves its whole lot from an open API keyed by a dealer id that
    // sits inline in every page's __NEXT_DATA__. On the first page that reveals
    // it, pull the inventory through the API and finish — this is the complete,
    // structured source (mileage, declared fuel, price) and, on the franchise
    // rooftops, the ONLY one, since their SRP/VDP HTML 404s to a crawler. The
    // HTML SRP path below stays as the fallback for any page with no dealer id.
    if (!of.done && isOverfuel(res.body)) {
      const cfg = overfuelApiConfig(res.body);
      if (cfg) {
        of.done = true;
        const before = report.evs.length;
        const { vehicles: ofVehicles, complete, found } = await pullOverfuelApi(cfg, origin);
        for (const v of ofVehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "overfuel";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `overfuel-api: ${found} in inventory, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
        );
        // A partial or failed pull must never certify a complete crawl, or
        // db-sync would delist cars we merely failed to finish fetching.
        if (!complete) report.stoppedEarly = "overfuel partial pull";
        queue.length = 0;
        break;
      }
    }

    // Dealr renders no VIN'd inventory in HTML (its JSON-LD lists cars as bare
    // @type:Car), but serves the whole lot from a paged JSON API. On the first
    // Dealr page seen — the homepage, seeded above, carries the cdn.dealrcloud
    // signature — page the API to completion and finish; the rest of the site's
    // pages have nothing for the walk to find. pullDealr resolves the canonical
    // (apex/www) host itself, so it needs only the origin.
    if (!dl.done && isDealr(res.body)) {
      dl.done = true;
      const before = report.evs.length;
      const { vehicles: dlVehicles, complete, found, ok } = await pullDealr(origin);
      if (ok) {
        for (const v of dlVehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "dealr";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `dealr: ${found} in inventory, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
        );
        // A partial or failed pull must never certify a complete crawl, or
        // db-sync would delist cars we merely failed to finish fetching.
        if (!complete) report.stoppedEarly = "dealr partial pull";
        queue.length = 0;
        break;
      }
    }

    // DealerSync renders a client-side shell; its whole lot is behind a same-
    // origin /Inventory/Search JSON API. On the first DealerSync page seen — the
    // homepage, seeded above — page the API to completion and finish. The page
    // HTML carries the per-rooftop inventory slug the VDP URLs need.
    if (!ds.done && isDealerSync(res.body)) {
      ds.done = true;
      const before = report.evs.length;
      const { vehicles: dsVehicles, complete, found, ok } = await pullDealerSync(origin, res.body);
      if (ok) {
        for (const v of dsVehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "dealersync";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `dealersync: ${found} in inventory, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
        );
        if (!complete) report.stoppedEarly = "dealersync partial pull";
        queue.length = 0;
        break;
      }
    }

    // AutoManager (WebManager) server-renders its lot at /view-inventory, paged
    // ?page=N, with the VIN in each card but no schema.org. On the first
    // AutoManager page seen — the homepage, seeded above — page the SRP to
    // completion and finish; the rest of this site's pages have nothing new.
    if (!am.done && isAutoManager(res.body)) {
      am.done = true;
      const before = report.evs.length;
      const { vehicles: amVehicles, complete, found, ok } = await pullAutoManager(origin);
      if (ok) {
        for (const v of amVehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "automanager";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `automanager: ${found} in inventory, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
        );
        if (!complete) report.stoppedEarly = "automanager partial pull";
        queue.length = 0;
        break;
      }
    }

    // AutoRevo server-renders its lot at /vehicles, paged ?page=N, the VIN in a
    // labelled definition list. On the first AutoRevo page seen (the homepage,
    // seeded above), page the SRP to completion and finish.
    if (!ar.done && isAutoRevo(res.body)) {
      ar.done = true;
      const before = report.evs.length;
      const { vehicles: arVehicles, complete, found, ok } = await pullAutoRevo(origin);
      if (ok) {
        for (const v of arVehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "autorevo";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `autorevo: ${found} in inventory, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
        );
        if (!complete) report.stoppedEarly = "autorevo partial pull";
        queue.length = 0;
        break;
      }
    }

    if (dcs.srp.has(url)) {
      // A 200 is not enough to count an SRP page as covered: plenty of sites
      // answer any unknown path with a soft-404 homepage, and two of those
      // would look like a finished walk and hand db-sync a licence to delist
      // the dealer's whole inventory. It has to be a DCS page.
      if (isDealerCarSearch(res.body)) dcs.done++;
      else dcs.failed = true;
    } else if (!dcs.seeded && isDealerCarSearch(res.body)) seedDcs();

    // Extract vehicles present on this page (VDPs, and SRPs that embed
    // arrays; Driveway embeds its JSON-LD inside __NEXT_DATA__ instead;
    // Dealer Car Search emits no JSON-LD at all and is read from its Tealium
    // product list plus the visible tiles)
    const dcsVehicles = extractDcsVehicles(res.body, res.finalUrl);
    const dcsVins = new Set(dcsVehicles.map((v) => v.vehicleIdentificationNumber));
    if (isDealerFire(res.body)) seedDealerFire(res.body, res.finalUrl);
    if (isOverfuel(res.body)) seedOverfuel(res.body, res.finalUrl);
    const dealerFire = extractDealerFire(res.body);
    const dealerFireRooftops = dealerFire.size ? extractDealerFireDealers(res.body) : [];
    const overfuel = overfuelVehicles(res.body, res.finalUrl);
    const overfuelVins = new Set(overfuel.map((v) => v.vehicleIdentificationNumber));
    const vehicles = [
      ...extractVehicles(res.body),
      ...extractMicrodataVehicles(res.body),
      ...extractDealerWebsitesVehicles(res.body, res.finalUrl),
      ...extractDrivewayVehicles(res.body),
      ...dcsVehicles,
      ...dealerFireVehicles(res.body, res.finalUrl),
      ...overfuel,
    ];
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
      if (rec.vin && dcsVins.has(rec.vin)) rec.platform = "dealercarsearch";
      if (rec.vin && overfuelVins.has(rec.vin)) rec.platform = "overfuel";
      if (dealerFire.size) rec = enrichFromDealerFire(rec, dealerFire, dealerFireRooftops);
      report.evs.push(rec);
      // An SRP tile knows its car's own page — fetch the VDP for the full
      // record (odometer, trim, gallery, canonical URL).
      if (isSrp && rec.vdpUrl && rec.vdpUrl.startsWith("http") && !visited.has(rec.vdpUrl)) {
        queue.unshift(rec.vdpUrl);
        if (rec.platform === "dealercarsearch") dcs.evVdps.add(rec.vdpUrl);
      }
    }

    // DCS paginates with ?page=N behind a <button onClick=…>, which the
    // rel=next / href scan below cannot see.
    if (dcs.srp.has(url)) {
      const nextSrp = dcsNextPageUrl(res.body, res.finalUrl);
      if (nextSrp && !visited.has(nextSrp) && !dcs.srp.has(nextSrp)) {
        dcs.srp.add(nextSrp);
        // Ahead of the sitemap URLs, not behind them: pushed to the back, the
        // second SRP page sat behind ~180 sitemap VDPs and three of ten test
        // sites burned their whole page budget without ever reaching it — so
        // the walk never completed and the crawl could certify nothing.
        queue.unshift(nextSrp);
      }
    }
    // Same for DealerFire, which pages with ?limit=&offset= on links the
    // generic scan doesn't recognise either.
    if (dealerFire.size > 1) {
      const nextDf = dealerFireNextPageUrl(res.body, res.finalUrl);
      if (nextDf && !visited.has(nextDf)) queue.unshift(nextDf);
    }
    // Overfuel SRPs page with rel=next ("/…/page/2"). Jump it ahead of the
    // sitemap so the whole ItemList is walked before budget runs out.
    if (overfuel.length) {
      const nextOf = overfuelNextPageUrl(res.body, res.finalUrl);
      if (nextOf && !visited.has(nextOf)) queue.unshift(nextOf);
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
// crawledAt lets db-sync tell the DB when these rows were observed, so a
// replayed snapshot can't masquerade as fresh evidence (migration 0013).
for (const r of reports) r.crawledAt ??= new Date().toISOString();
await writeFile(new URL("./out/report.json", import.meta.url), JSON.stringify(reports, null, 2));
console.error(`\n${byVin.size} unique EV listings → scraper/out/listings.json`);
