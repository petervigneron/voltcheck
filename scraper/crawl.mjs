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
import { classifyEv, EV_ONLY_WMIS } from "./lib/ev.mjs";
import { normalize, richness } from "./lib/normalize.mjs";
import { colistingAccumulator, colistedDomainCount } from "./lib/colisting.mjs";
import { discoverSitemapUrls, rank, dedupe, SRP_PATHS, VIN_RE, EVISH_RE } from "./lib/sitemap.mjs";
import { extractDdcVehicles, enrichFromDdc } from "./lib/platforms/dealercom.mjs";
import { dealerComApiConfig, pullDealerComApi } from "./lib/platforms/dealercom-api.mjs";
import { extractDealerOn, enrichFromDealerOn } from "./lib/platforms/dealeron.mjs";
import { isDealerOnApi, dealerOnLots, pullDealerOnApi } from "./lib/platforms/dealeron-api.mjs";
import { extractTeamVelocity, enrichFromTeamVelocity, teamVelocityApiIds, pullTeamVelocityApi } from "./lib/platforms/teamvelocity.mjs";
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
import {
  isOverfuel,
  overfuelVehicles,
  overfuelSeeds,
  overfuelNextPageUrl,
  overfuelApiConfig,
  pullOverfuelApi,
} from "./lib/platforms/overfuel.mjs";
import { dealrVehicles, dealrNextPageUrl, dealrSeeds, isDealrCloud } from "./lib/platforms/dealrcloud.mjs";
import { isRideMotive, rideMotiveConfig, pullRideMotiveApi } from "./lib/platforms/ridemotive.mjs";
import {
  isAutoManager,
  autoManagerSeeds,
  autoManagerVehicles,
  autoManagerNextPageUrl,
} from "./lib/platforms/automanager.mjs";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
}
const MAX_PAGES = flag("--max-pages", 25);
const CONCURRENCY = flag("--concurrency", 6);
// How long ONE domain may hold a worker. --deadline-min below governs the whole
// run and can only stop workers taking NEW domains; it cannot end a crawl
// already in flight, so a single slow rooftop keeps setting the clock for
// everyone after the deadline has passed. Measured on rolling-crawl slice 41
// (2026-08-22): every one of its 274 domains finished, so nothing was
// throughput-bound, yet the run took 26.6 minutes at concurrency 20 and 24.4 at
// concurrency 32 — adding 12 workers bought 2.25 minutes, because the run was
// waiting on one dealer either way. Doubling the workers cannot shorten the
// longest single crawl; only this can.
//
// 0 disables it, which is the default and what nightly-style whole-fleet runs
// with hours of headroom should keep. A domain that hits the cap sets
// stoppedEarly, and `report.truncated` below is already
// `queue.length > 0 || Boolean(report.stoppedEarly)` — so it certifies nothing
// and db-sync will not delist that dealer's cars. The unfetched pages are not
// lost, they are simply that rooftop's next visit.
const DOMAIN_CAP_MIN = flag("--domain-cap-min", 0);
// Stop taking new domains after this many minutes and write what's crawled so
// far. crawl.mjs used to write out/ only after every worker finished, so a
// shard killed by the CI job timeout — which skips the upload-artifact step —
// handed up nothing: on 2026-08-19 all 8 shards timed out at 5h30m and the
// day's dealer discoveries were thrown away. With a deadline the pool stops
// pulling domains in time to reach a clean final write (and the checkpoint
// below covers a harder kill). Anchored at process start. 0 = no cap.
const DEADLINE_MIN = flag("--deadline-min", 0);
const DEADLINE_AT = DEADLINE_MIN > 0 ? Date.now() + DEADLINE_MIN * 60_000 : Infinity;
// --cache-hours N: reuse pages fetched within N hours (0 = always live)
setCacheTtl(flag("--cache-hours", 0) * 3_600_000);
const flagIdxs = new Set(
  ["--max-pages", "--concurrency", "--cache-hours", "--page-budget", "--deadline-min", "--domain-cap-min"].flatMap((f) => {
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
  const domainCapAt = DOMAIN_CAP_MIN > 0 ? Date.now() + DOMAIN_CAP_MIN * 60_000 : 0;
  const report = { domain, budget, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  // The host to ASK is not always the row's identity. A registry domain that
  // 200s by redirecting to another host has no sitemap and no inventory paths
  // of its own — furymotors.net returns 0 sitemap URLs where
  // saintpaul.furymotors.com returns 848 — so every path built on it misses.
  // probe.mjs records where the homepage actually landed; use it here and keep
  // `domain` as the row's identity and the listing's dealer_domain.
  const canonicalHost = siteInfo.get(domain)?.probe?.canonicalHost;
  let origin = `https://${canonicalHost ?? domain}`;
  // Only adopt a redirect when the registry has not already told us one — see
  // the first successful fetch below.
  let originAdopted = Boolean(canonicalHost);
  const visited = new Set();

  const sitemapUrls = await discoverSitemapUrls(canonicalHost ?? domain, {
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
  const tv = { done: false };
  const ddcApi = { done: false };
  const deolApi = { done: false };
  const rm = { done: false };
  const dvPlat = siteInfo.get(domain)?.platform;
  // Motive joins that list for the same reason: it renders no inventory in
  // HTML at all and publishes its Algolia config on the homepage, so a
  // ridemotive rooftop whose queue starts at a sitemap VDP shell would spend
  // its whole budget on pages with nothing in them.
  if (!dvPlat || ["unknown", "dealervenom", "overfuel", "team-velocity", "ridemotive"].includes(dvPlat))
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

  // dealr.cloud walks its one /inventory SRP (?page=N answered server-side).
  // Seeded up front for a known-dealrcloud site, else recognised from the first
  // dealr page the crawl fetches.
  let dealrSeeded = false;
  function seedDealr() {
    if (dealrSeeded) return;
    dealrSeeded = true;
    const seeds = dealrSeeds(origin).filter((u) => !visited.has(u));
    queue.unshift(...seeds);
    report.notes.push("dealrcloud: seeded SRP");
  }
  if (siteInfo.get(domain)?.platform === "dealrcloud") seedDealr();

  // AutoManager WebManager: one /view-inventory SRP, ten cars a page, plain
  // ?page=N. Nothing on the site is JSON-LD, so the SRP is the only door.
  let amSeeded = false;
  function seedAutoManager() {
    if (amSeeded) return;
    amSeeded = true;
    const seeds = autoManagerSeeds(origin).filter((u) => !visited.has(u));
    queue.unshift(...seeds);
    report.notes.push("automanager: seeded SRP");
  }
  if (siteInfo.get(domain)?.platform === "automanager") seedAutoManager();

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
    // The per-domain clock (see DOMAIN_CAP_MIN). Checked here with the other
    // early exits so it catches the pages that never reach the bottom of the
    // loop — timeouts and robots-disallowed `continue` past it — which are
    // exactly the slow ones this cap exists for.
    if (domainCapAt && Date.now() > domainCapAt) {
      report.stoppedEarly = `${DOMAIN_CAP_MIN}-minute per-domain cap after ${report.fetched} pages`;
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

    // Where the site actually lives. A registry domain that redirects to
    // another host serves its cars only from that host, and every URL built on
    // the registry domain is dead: columbia-preowned.com/inventory/{slug}
    // answers 404 while the identical path on rustydrewingpreowned.com (where
    // its homepage lands) answers 200. That URL is what a shopper clicks, so
    // it is not allowed to be a guess. probe.mjs records the canonical host,
    // but rows probed before it did have none — this picks the redirect up
    // from the first page that answers, whenever the probe's field is absent.
    // Only the front door is allowed to move the origin: a redirect on some
    // deep page could be a one-off (a retired VDP bouncing to a group site),
    // and adopting that would rewrite every other URL on the strength of it.
    if (!originAdopted && url === `${origin}/`) {
      originAdopted = true;
      try {
        const landed = new URL(res.finalUrl).origin;
        if (landed !== origin) {
          origin = landed;
          report.notes.push(`origin: ${domain} redirects to ${new URL(landed).host}`);
        }
      } catch {}
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

    // Motive (app.ridemotive.com) renders no inventory in HTML — every car on
    // the site comes from one global Algolia index, and the client config plus
    // this rooftop's dealer id sit inline in every page. Pull the rooftop's
    // slice of the index and finish; there is nothing for the HTML walk to
    // find afterwards.
    if (!rm.done && isRideMotive(res.body)) {
      const cfg = rideMotiveConfig(res.body);
      if (cfg) {
        rm.done = true;
        const before = report.evs.length;
        const { vehicles, complete, found } = await pullRideMotiveApi(cfg, origin);
        for (const v of vehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "ridemotive";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `ridemotive: ${found} in index for dealer ${cfg.dealerId}, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
        );
        // A partial or failed pull must never certify a complete crawl, or
        // db-sync would delist cars we merely failed to finish fetching.
        if (!complete) report.stoppedEarly = "ridemotive partial pull";
        queue.length = 0;
        break;
      }
    }

    // Team Velocity serves its whole lot from an open API keyed by the account/
    // campaign ids inline in every page. Pull it and finish. Each car is
    // attributed to its OWN vdp host, because one account can be a dealer group
    // (dublinacura's account 80283 serves cars under dublinhonda.com); the crawl
    // certifies complete only when every car sits on the crawled domain — a
    // group spans rooftops, so it stays truncated and recheck retires per VIN.
    if (!tv.done) {
      const ids = teamVelocityApiIds(res.body);
      if (ids) {
        tv.done = true;
        const before = report.evs.length;
        const { vehicles: tvVehicles, complete, found } = await pullTeamVelocityApi(ids);
        let offDomain = false;
        for (const v of tvVehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          const vdp = v.offers?.url;
          if (!vdp) continue; // no per-VIN page → nothing recheck could retire
          let host;
          try {
            host = new URL(vdp).host.replace(/^www\./, "");
          } catch {
            continue;
          }
          if (host !== domain.replace(/^www\./, "")) offDomain = true;
          let rec = normalize(v, { sourceUrl: vdp, dealerDomain: host });
          rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "team-velocity";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `team-velocity-api: ${found} used, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"}${offDomain ? ", group" : ""})`
        );
        // Complete only for a true single rooftop; a group spans domains, so its
        // absence-from-this-query can't license db-sync to delist anyone.
        if (!complete || offDomain) report.stoppedEarly = "team-velocity api (group or partial)";
        queue.length = 0;
        break;
      }
    }

    // Dealer.com storefronts serve their whole lot from a same-origin inventory
    // API — full records (odometer, trim, the price stack, the owning rooftop's
    // address), an exact totalCount, and no per-car VDP. On the first page that
    // carries the site config, pull the lot through the API and finish: this is
    // what the SRP page-walk and the VDP follows below used to do, in a handful
    // of calls instead of one per car. If the API doesn't answer (an older
    // template with no widget endpoint), fall through to the HTML extractor.
    if (!ddcApi.done) {
      const cfg = dealerComApiConfig(res.body);
      if (cfg) {
        ddcApi.done = true;
        const before = report.evs.length;
        const { vehicles, ddcByVin, complete, found, ok } = await pullDealerComApi(cfg, origin);
        if (ok) {
          for (const v of vehicles) {
            const cls = classifyEv(v);
            if (!cls.isEv) continue;
            let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
            // enrichFromDdc reruns the shared price resolve and merges the DDC
            // fields, exactly as the HTML path does — so the number and shape
            // that reach the row are identical to a VDP fetch's.
            if (rec.vin && ddcByVin.has(rec.vin)) rec = enrichFromDdc(rec, ddcByVin.get(rec.vin));
            if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
            rec.evKind = cls.kind;
            rec.evConfidence = cls.confidence;
            rec.fromVdp = true;
            report.evs.push(rec);
          }
          if (report.evs.length > before) report.vehiclePages++;
          report.notes.push(
            `dealercom-api: ${found} in lot, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
          );
          // A partial or failed pull must never certify a complete crawl, or
          // db-sync would delist cars we merely failed to finish fetching.
          if (!complete) report.stoppedEarly = "dealercom-api partial pull";
          queue.length = 0;
          break;
        }
        // ok=false: the endpoint never answered. Leave the HTML extractor below
        // to handle this domain rather than certifying an empty API pull.
        report.notes.push("dealercom-api: no response, falling back to HTML");
      }
    }

    // DealerOn's Cosmos storefront renders no inventory in HTML — a spaCosmos
    // shell fetches its cars from a same-origin JSON endpoint keyed by the
    // dealerId/pageId inline in the page's tagging block. On the first SRP that
    // reveals them, pull both the used and new lots through the API and finish:
    // full VehicleCards (odometer, trim, the price stack), an exact TotalCount,
    // no per-car VDP. Falls through to the HTML extractor if the API is silent.
    if (!deolApi.done && isDealerOnApi(res.body)) {
      const lots = await dealerOnLots(res.body, res.finalUrl, origin);
      // dealerOnLots fetches the sibling search page (used↔new) for its pageId;
      // count that request so coverage accounting stays honest.
      report.fetched++;
      if (lots.length) {
        deolApi.done = true;
        const before = report.evs.length;
        const { vehicles, complete, found, ok } = await pullDealerOnApi(lots, origin);
        if (ok) {
          for (const v of vehicles) {
            const cls = classifyEv(v);
            if (!cls.isEv) continue;
            let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
            if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
            rec.evKind = cls.kind;
            rec.evConfidence = cls.confidence;
            rec.fromVdp = true;
            rec.platform = "dealeron";
            report.evs.push(rec);
          }
          if (report.evs.length > before) report.vehiclePages++;
          report.notes.push(
            `dealeron-api: ${found} in ${lots.length} lot(s), ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`
          );
          if (!complete) report.stoppedEarly = "dealeron-api partial pull";
          queue.length = 0;
          break;
        }
        report.notes.push("dealeron-api: no response, falling back to HTML");
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
    if (!dealrSeeded && isDealrCloud(res.body)) seedDealr();
    if (!amSeeded && isAutoManager(res.body)) seedAutoManager();
    const dealerFire = extractDealerFire(res.body);
    const dealerFireRooftops = dealerFire.size ? extractDealerFireDealers(res.body) : [];
    const overfuel = overfuelVehicles(res.body, res.finalUrl);
    const overfuelVins = new Set(overfuel.map((v) => v.vehicleIdentificationNumber));
    // On dealr.cloud pages the platform records REPLACE the generic JSON-LD:
    // dealr's own Car node carries no VIN, so keeping both would emit the same
    // car twice — once VIN-keyed, once URL-keyed — and the VIN-less twin would
    // survive the byVin dedupe as a phantom listing.
    const dealrVs = dealrVehicles(res.body, res.finalUrl);
    const autoManager = autoManagerVehicles(res.body, res.finalUrl);
    const vehicles = [
      ...(dealrVs.length ? dealrVs : extractVehicles(res.body)),
      ...extractDrivewayVehicles(res.body),
      ...dcsVehicles,
      ...dealerFireVehicles(res.body, res.finalUrl),
      ...overfuel,
      ...autoManager,
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
    // And dealr.cloud, whose pager is markup markers rather than hrefs.
    if (dealrVs.length > 1) {
      const nextDealr = dealrNextPageUrl(res.body, res.finalUrl);
      if (nextDealr && !visited.has(nextDealr)) queue.unshift(nextDealr);
    }
    // Overfuel SRPs page with rel=next ("/…/page/2"). Jump it ahead of the
    // sitemap so the whole ItemList is walked before budget runs out.
    if (overfuel.length) {
      const nextOf = overfuelNextPageUrl(res.body, res.finalUrl);
      if (nextOf && !visited.has(nextOf)) queue.unshift(nextOf);
    }
    // AutoManager's pager is a plain ?page=N link list; jump it ahead of the
    // sitemap for the same reason as the others — ten cars a page means an EV
    // is routinely on page 5.
    if (autoManager.length) {
      const nextAm = autoManagerNextPageUrl(res.body, res.finalUrl);
      if (nextAm && !visited.has(nextAm)) queue.unshift(nextAm);
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
  while (next < domains.length && Date.now() < DEADLINE_AT) {
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
// Write the crawl's output as it stands. Called on a timer while the workers
// run (a checkpoint) and once when they finish, so a shard that is killed —
// by its deadline or a harder job-timeout — still leaves its night's work on
// disk for the upload step to grab, instead of losing it all to an
// end-of-run write that never happened. Guarded so a checkpoint and the final
// write can't interleave two writers on the same file.
// crawledAt lets db-sync tell the DB when these rows were observed, so a
// replayed snapshot can't masquerade as fresh evidence (migration 0013).
let writing = false;
let lastColisting = [];
async function writeOutput() {
  if (writing) return undefined;
  writing = true;
  try {
    await mkdir(new URL("./out/", import.meta.url), { recursive: true });
    const byVin = new Map();
    // Count the copies this dedupe is about to discard, before it discards
    // them. This crawl is now the ONLY lane that can see one VIN on two
    // rooftops — merge-shards' remaining producer is the OEM locator, one
    // domain per lane — so without this, vin_colisting stays empty and every
    // "this car moved between dealers" claim loses its guardrail. See
    // lib/colisting.mjs. Rebuilt from allEvs on each checkpoint, exactly like
    // byVin beside it, so a checkpoint and the final write agree.
    const colisted = colistingAccumulator();
    for (const ev of allEvs) {
      const key = ev.vin ?? `${ev.dealerDomain}:${ev.sourceUrl}`;
      const prev = byVin.get(key);
      if (!prev || richness(ev) > richness(prev)) byVin.set(key, ev);
      colisted.add(ev);
    }
    await writeFile(new URL("./out/listings.json", import.meta.url), JSON.stringify([...byVin.values()], null, 2));
    for (const r of reports) r.crawledAt ??= new Date().toISOString();
    await writeFile(new URL("./out/report.json", import.meta.url), JSON.stringify(reports, null, 2));
    // Unindented on purpose, same as merge-shards: transport, not reading.
    const colisting = colisted.pairs();
    await writeFile(new URL("./out/colisting-pairs.json", import.meta.url), JSON.stringify(colisting));
    lastColisting = colisting;
    return byVin.size;
  } finally {
    writing = false;
  }
}

// Checkpoint every two minutes. unref() so the timer never keeps the process
// alive on its own once the workers are done.
const checkpoint = setInterval(() => { writeOutput().catch(() => {}); }, 120_000);
checkpoint.unref?.();
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, domains.length) }, worker));
clearInterval(checkpoint);

const unique = await writeOutput();
if (Number.isFinite(DEADLINE_AT) && reports.length < domains.length) {
  console.error(
    `crawl: stopped at the ${DEADLINE_MIN}-minute deadline after ${reports.length}/${domains.length} domains — ` +
    `wrote what's crawled; the rest are picked up next run`
  );
}
console.error(`\n${unique} unique EV listings → scraper/out/listings.json`);
// Said out loud for the same reason merge-shards says it: on a slice of any
// size this number is normally in the hundreds, and a zero is far more likely
// to mean this counter broke than that no group syndicated a car tonight.
console.error(
  `crawl: ${lastColisting.length} VINs listed on more than one domain across ` +
  `${colistedDomainCount(lastColisting)} domains → scraper/out/colisting-pairs.json`
);
