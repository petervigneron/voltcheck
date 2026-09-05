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
import { extractTeamVelocity, enrichFromTeamVelocity, teamVelocityApiIds, teamVelocityRegistryIds, pullTeamVelocityApi } from "./lib/platforms/teamvelocity.mjs";
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
import { isRideMotive, rideMotiveConfig, pullRideMotiveApi, isMotiveChallenge } from "./lib/platforms/ridemotive.mjs";
import {
  isAutoManager,
  autoManagerSeeds,
  autoManagerVehicles,
  autoManagerNextPageUrl,
} from "./lib/platforms/automanager.mjs";
import {
  isAutoDealersDigital,
  autoDealersDigitalSeeds,
  autoDealersDigitalEntries,
  autoDealersDigitalVehicles,
  autoDealersDigitalCardCount,
  autoDealersDigitalNextPageUrl,
} from "./lib/platforms/autodealersdigital.mjs";
import { isWayneReaves, pullWayneReaves } from "./lib/platforms/waynereaves.mjs";
import {
  isOneAudi,
  oneAudiSrpUrls,
  oneAudiSeeds,
  oneAudiVehicles,
  oneAudiTruncated,
} from "./lib/platforms/oneaudi.mjs";
import {
  isAutoFunds,
  autoFundsNeedsVdp,
  pullAutoFunds,
  enrichFromAutoFunds,
} from "./lib/platforms/autofunds.mjs";
import {
  isMotorcarSites,
  motorcarSeeds,
  motorcarEntries,
  motorcarVehicles,
  motorcarNextPageUrl,
} from "./lib/platforms/motorcarsites.mjs";
import { isDealerSync, pullDealerSync } from "./lib/platforms/dealersync.mjs";
import { isRecharged, isRechargedOrigin, pullRecharged } from "./lib/platforms/recharged.mjs";
import { isEverCars, isEverCarsOrigin, pullEverCars } from "./lib/platforms/evercars.mjs";
import { isVehica, pullVehica } from "./lib/platforms/vehica.mjs";
import {
  isDealerSpike,
  dealerSpikeSeeds,
  dealerSpikeVehicles,
  dealerSpikeNextPageUrl,
} from "./lib/platforms/dealerspike.mjs";
import { isAutoCorner, pullAutoCorner, autoCornerNeedsVdp, enrichFromAutoCorner } from "./lib/platforms/autocorner.mjs";
import {
  isDealerAccelerate,
  dealerAccelerateSeeds,
  dealerAccelerateEntries,
  dealerAccelerateNextPageUrl,
  isDealerAccelerateSold,
} from "./lib/platforms/dealeraccelerate.mjs";
import { isEBizAutos, ebizAutosOrigins, pullEBizAutos } from "./lib/platforms/ebizautos.mjs";
import { pullDealerInspire } from "./lib/platforms/dealerinspire.mjs";
import { isChapmanChoice, isChapmanChoiceOrigin, pullChapmanChoice } from "./lib/platforms/chapmanchoice.mjs";
import { pullDealerCenter } from "./lib/platforms/dealercenter.mjs";
import { pullPorsche } from "./lib/platforms/porsche.mjs";
import { closeBrowser } from "./lib/browser.mjs";
import { withWall, sealReport } from "./lib/wall.mjs";
import {
  isDealerFront,
  dealerFrontSeeds,
  dealerFrontVehicles,
  dealerFrontNextPageUrl,
} from "./lib/platforms/dealerfront.mjs";
import { isDealerClick, dealerClickSeeds, dealerClickVehicles } from "./lib/platforms/dealerclick.mjs";
import {
  isAutoRevo,
  autoRevoSeeds,
  autoRevoEntries,
  autoRevoVehicles,
  autoRevoNextPageUrl,
  autoRevoTruncated,
} from "./lib/platforms/autorevo.mjs";
import {
  isProMax,
  proMaxSeeds,
  proMaxVehicles,
  proMaxEntries,
  proMaxFacetSeeds,
  proMaxLotCount,
} from "./lib/platforms/promax.mjs";
import { pullDealerSpikeCache, dealerSpikeVehInvUrl } from "./lib/platforms/dealerspike.mjs";

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
// The wall the whole run stops at, five minutes past --deadline-min. The
// deadline can only stop workers taking NEW domains; this ends the run
// whatever is still in flight. It has to exist because the deadline and the
// per-domain cap are both checked BETWEEN steps, so neither can end a call
// that never returns — and one call that never returns costs a rolling-crawl
// slice everything it crawled: on 2026-09-04 06:57, 39 of 48 slices were
// killed by the job timeout with 398-402 of ~400 domains already crawled and
// written to out/, one or two domains still in flight, and `Promise.all` over
// the worker pool waiting on them. A cancelled step skips the sync, so all
// 400 domains' cars were thrown away for the sake of one. Past this wall the
// run writes what it has and exits; the domains still in flight file no
// report, and a domain with no report certifies nothing to db-sync, so
// nothing is delisted for having been abandoned.
const HARD_STOP_AT = Number.isFinite(DEADLINE_AT) ? DEADLINE_AT + 5 * 60_000 : 0;
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

// Visits the wall below walked away from. They are still running — nothing
// here can cancel a call — so their sockets and timers still hold the event
// loop, and the run has to leave rather than wait for them (see the exit at
// the bottom of this file).
const walkedAwayFrom = [];

// --domain-cap-min as a bound rather than a request. crawlDealerInto checks
// the cap at the top of its walk loop, which ends a domain that is making
// slow progress but cannot end one that is not returning at all — and the
// walk is not the only thing a visit does: sitemap discovery, the platform
// API pulls and the browser lanes all run before or instead of it. Measured
// 2026-09-04: buckeyenissan.com held a worker 26 minutes under an 8-minute
// cap without printing a line. So the cap is also a clock the whole visit
// races. `report` is built up in place, so the losing race still hands back
// every car the visit had found — abandoning the call costs the pages it had
// not reached, not the ones it had.
async function crawlDealer(domain) {
  const budget = pageBudget(domain);
  const domainCapAt = DOMAIN_CAP_MIN > 0 ? Date.now() + DOMAIN_CAP_MIN * 60_000 : 0;
  const report = { domain, budget, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [] };
  const startedAt = Date.now();
  // A minute past the cap, so the graceful exits inside the walk — which
  // leave a truthful stoppedEarly and finish their page — always win the race
  // when they can. This is the net under them, not the normal path.
  const walls = [domainCapAt ? domainCapAt + 60_000 : 0, HARD_STOP_AT].filter(Boolean);
  const { finished } = await withWall(crawlDealerInto(domain, budget, domainCapAt, report), walls.length ? Math.min(...walls) : 0);
  if (finished) return report;
  walkedAwayFrom.push(domain);
  return sealReport(report, `abandoned after ${Math.round((Date.now() - startedAt) / 1000)}s without returning`);
}

async function crawlDealerInto(domain, budget, domainCapAt, report) {
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
  const af = { done: false };
  const wr = { done: false };
  const ds = { done: false };
  const rch = { done: false };
  const ec = { done: false };
  const vh = { done: false };
  const ac = { done: false };
  const eb = { done: false };
  const cc = { done: false };
  const dsc = { done: false };
  const dvPlat = siteInfo.get(domain)?.platform;
  // Motive joins that list for the same reason: it renders no inventory in
  // HTML at all and publishes its Algolia config on the homepage, so a
  // ridemotive rooftop whose queue starts at a sitemap VDP shell would spend
  // its whole budget on pages with nothing in them.
  // AutoFunds joins for the strongest version of the same reason: its SRP is
  // robots-disallowed, its pages carry no JSON-LD, and its whole lot is one
  // /rss.aspx request — but the fingerprint that authorises that request is on
  // the homepage. Without this seed an AutoFunds rooftop spends its budget on
  // sitemap VDPs it cannot read a price out of.
  // Wayne Reaves joins for the strongest version of it: EVERY path on one of
  // its hosts serves the same client-rendered shell, so a queue that starts at
  // a sitemap URL would fetch that shell over and over and never reach the
  // footer credit that authorises the one feed request.
  // And so does a site with NO SITEMAP AT ALL, whatever its label says. That
  // queue holds nothing but path guesses, so if they all miss the crawl never
  // fetches a single page of the site — audicoralsprings.com spent ten fetches
  // on ten guessed SRPs that 404'd or timed out, and its homepage, which says
  // in its <head> exactly which platform it runs, was never asked for. A row
  // whose label is stale (273 OneAudi rooftops are labelled "dealer.com"
  // because Audi's platform loads a dealer.com tag) can only ever be rescued
  // by reading that page. One extra fetch, only for sites that otherwise have
  // literally nothing to walk.
  // The four lanes added 2026-08-24 all belong on this list for the Wayne
  // Reaves reason: none of them renders its lot in HTML, all four are
  // recognised from a mark that IS on the homepage, and evercars.com in
  // particular publishes 3,913 sitemap urls of which 71% are sold cars — a
  // queue that started there would spend its whole budget reading "(Sold)".
  if (
    !dvPlat ||
    !sitemapUrls.length ||
    [
      "unknown", "dealervenom", "overfuel", "team-velocity", "ridemotive", "autofunds", "waynereaves", "oneaudi",
      "dealersync", "recharged", "evercars", "vehica",
      // The 2026-08-31 dark-tail wave: autocorner and ebizautos settle off the
      // homepage (their doors are sitemaps the homepage authorises or names a
      // host for), and the tile lanes' unlabelled rooftops are only ever
      // recognised from a page that carries the vendor's asset host.
      "autocorner", "ebizautos", "dealerclick", "dealerfront", "dealerspike", "dealeraccelerate",
      "autorevo", "promax", "chapmanchoice",
    ].includes(dvPlat)
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

  // The 2026-08-31 dark-tail tile lanes, each with one fixed SRP door:
  // Dealer Spike's generic /--inventory (?pg=N), DealerFront's /inventory/
  // (path- or query-paged by template), DealerClick's /inventory (the whole
  // lot in one page's flight payload), and DealerAccelerate's /vehicles
  // (?page=N — the one query its rooftops' robots allow).
  const tileSeeds = [
    { name: "dealerspike", seeds: () => dealerSpikeSeeds(origin) },
    { name: "dealerfront", seeds: () => dealerFrontSeeds(origin) },
    { name: "dealerclick", seeds: () => dealerClickSeeds(origin) },
    { name: "dealeraccelerate", seeds: () => dealerAccelerateSeeds(origin) },
    // AutoRevo seeds /vehicles ONLY — /new-vehicles and /certified-vehicles
    // are merchandising buckets whose "new" flag was measured false on 7 of 7
    // odometer-carrying cars (see the platform file), and a conditioned SRP
    // path would leak into publishedCondition's URL fallback.
    { name: "autorevo", seeds: () => autoRevoSeeds(origin) },
  ];
  const tileSeeded = new Set();
  function seedTileLane(name) {
    if (tileSeeded.has(name)) return;
    tileSeeded.add(name);
    const lane = tileSeeds.find((l) => l.name === name);
    const seeds = lane.seeds().filter((u) => !visited.has(u));
    if (!seeds.length) return;
    queue.unshift(...seeds);
    report.notes.push(`${name}: seeded SRP`);
  }
  for (const lane of tileSeeds) if (siteInfo.get(domain)?.platform === lane.name) seedTileLane(lane.name);

  // ProMax's SRP slug is per-rooftop and sometimes on a sister host, so it is
  // read off the homepage the way Overfuel's is. The facet fan-out (?year=N,
  // the platform's own pushState urls and its ONLY way past the 10-car render
  // cap — no pager exists, measured across every query key) is gated to the
  // first SRP that shows a bigger lot than it renders, so tecforce's 47 cars
  // cost 12 fetches, not 66.
  let pmSeeded = false;
  let pmFacetsSeeded = false;
  function seedProMax(html, pageUrl) {
    if (pmSeeded) return;
    const seeds = proMaxSeeds(html, pageUrl).filter((u) => !visited.has(u));
    if (!seeds.length) return;
    pmSeeded = true;
    queue.unshift(...seeds);
    report.notes.push(`promax: seeded ${seeds.length} SRP(s)`);
  }

  // Auto Dealers Digital: one inventory SRP, 25 cars a page, WordPress
  // /page/N/. The homepage links it but the probe's own path list never did,
  // which is the whole reason these rooftops read as "0 VIN vehicles". The
  // slug varies by rooftop (4 of 30 are not "/all-inventory/"), so the page
  // is passed in when there is one to read — same as Overfuel above.
  // Two passes, and both are needed: the blind one puts the common path in the
  // queue before anything is fetched, and the page-read one adds the rooftop's
  // own slug once a page is in hand. Collapsing them into a single latch would
  // mean a rooftop labelled in the registry never gets its slug read.
  let addSeededBlind = false;
  let addSeededFromPage = false;
  function seedAutoDealersDigital(html) {
    if (html == null ? addSeededBlind : addSeededFromPage) return;
    if (html == null) addSeededBlind = true;
    else addSeededFromPage = true;
    const seeds = autoDealersDigitalSeeds(origin, html).filter((u) => !visited.has(u) && !queue.includes(u));
    if (!seeds.length) return;
    queue.unshift(...seeds);
    report.notes.push(`autodealersdigital: seeded ${seeds.length} SRP(s)`);
  }
  if (siteInfo.get(domain)?.platform === "autodealersdigital") seedAutoDealersDigital();

  // Motorcar Marketing: one /vehicle_listings/all/vehicles SRP, ten cars a
  // page, ?page_number=N. The rooftops are subdomains of the VENDOR
  // (amgmotorsllc.motorcarsites.com), and the sitemap the walk would otherwise
  // lean on does not exist — /sitemap.xml is empty on these hosts — so without
  // this seed the crawl has no door at all.
  let mcsSeeded = false;
  function seedMotorcar() {
    if (mcsSeeded) return;
    mcsSeeded = true;
    const seeds = motorcarSeeds(origin).filter((u) => !visited.has(u));
    queue.unshift(...seeds);
    report.notes.push("motorcarsites: seeded SRP");
  }
  if (siteInfo.get(domain)?.platform === "motorcarsites") seedMotorcar();
  // OneAudi: the two /en/inventory/{new,used}/ pages are the only door — no
  // sitemap, no ItemList, no car in the markup — and each serves 48 cars in a
  // serialized-state block. The electrified families are then asked for by
  // name off the facet list the first page publishes (see the platform file);
  // that second wave is seeded from the page itself, not guessed here.
  let oaSeeded = false;
  function seedOneAudi() {
    if (oaSeeded) return;
    oaSeeded = true;
    const seeds = oneAudiSrpUrls(origin).filter((u) => !visited.has(u));
    queue.unshift(...seeds);
    report.notes.push(`oneaudi: seeded ${seeds.length} SRP(s)`);
  }
  if (siteInfo.get(domain)?.platform === "oneaudi") seedOneAudi();

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

  // Team Velocity serves its whole lot from an open API keyed by the account/
  // campaign ids inline in every page. Pull it and finish. Each car is
  // attributed to its OWN vdp host, because one account can be a dealer group
  // (dublinacura's account 80283 serves cars under dublinhonda.com); the crawl
  // certifies complete only when every car sits on the crawled domain — a
  // group spans rooftops, so it stays truncated and recheck retires per VIN.
  // `via` names where the ids came from: the page, or the registry pin for a
  // rooftop whose page is walled (see the header of lib/platforms/teamvelocity.mjs).
  async function pullTeamVelocity(ids, via) {
    tv.done = true;
    const before = report.evs.length;
    const { vehicles: tvVehicles, complete, found } = await pullTeamVelocityApi(ids);
    report.fetched++;
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
      `team-velocity-api (${via} ids): ${found} used, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"}${offDomain ? ", group" : ""})`
    );
    // Complete only for a true single rooftop; a group spans domains, so its
    // absence-from-this-query can't license db-sync to delist anyone.
    if (!complete || offDomain) report.stoppedEarly = "team-velocity api (group or partial)";
    queue.length = 0;
  }

  // THE BROWSER LANES. Dealer Inspire, DealerEProcess and DealerCenter reject
  // lib/http.mjs's client on every path and let a real Chrome in; their
  // robots files allow us (see lib/browser.mjs for the policy line). The
  // platform label is set by probe.mjs from the rooftop's DNS (lib/vendor-dns
  // .mjs), because the homepage the fingerprint would read is a firewall
  // page. Each lane returns raw JSON-LD-shaped nodes, classified and
  // normalized here exactly like a page's own JSON-LD; the walk below is
  // skipped — every page it would fetch is the same firewall page. A lane
  // that could not finish (browser missing, a VDP unread) leaves the report
  // truncated so db-sync never reads its silence as a delisting.
  // Porsche joined this table 2026-09-05. Its wall is Vercel Attack Challenge
  // Mode, which answers 429 (not 403) with a JS proof-of-work — so 77 of the
  // registry's 106 "http-429" rows were one platform being challenged, not a
  // hundred rooftops being busy, and `transient` re-probed them nightly for
  // ever. Plain headless Chrome passes it with nothing patched.
  // DealerEProcess is deliberately NOT in this table: its VDPs answer the
  // Cloudflare JS challenge to plain headless Chrome on 9 of 10 loads
  // (measured 2026-09-02, themountainhyundai.com), and passing that means
  // disguising the browser, which is the line lib/browser.mjs draws. The lane
  // file stays, parked, with the measurement in its header.
  const BROWSER_LANES = { dealerinspire: pullDealerInspire, dealercenter: pullDealerCenter, porsche: pullPorsche };
  if (BROWSER_LANES[dvPlat]) {
    const before = report.evs.length;
    // The lane gets the same clock and budget the walk below would have had;
    // without them a Dealer Inspire rooftop ran 60–160 Chrome loads and the
    // 2026-09-03 06:52 rolling run lost every slice to its job timeout.
    // …and a hard stop five minutes past the crawl's own deadline, whatever
    // the domain cap says: a rooftop that starts at minute 17.9 with an
    // 8-minute cap and one 2-minute load in flight ends at minute 28, which
    // is the slice job's timeout to the minute (measured 2026-09-03 20:52
    // run: 28 of 48 slices cancelled with two domains in flight).
    const laneDeadline = [domainCapAt || 0, HARD_STOP_AT].filter(Boolean).length ? Math.min(...[domainCapAt || 0, HARD_STOP_AT].filter(Boolean)) : 0;
    const r = await BROWSER_LANES[dvPlat](origin, { deadlineAt: laneDeadline, maxLoads: budget });
    report.fetched += r.requests ?? 0;
    for (const v of r.vehicles ?? []) {
      const cls = classifyEv(v);
      if (!cls.isEv) continue;
      const offer = Array.isArray(v.offers) ? v.offers[0] : v.offers;
      let rec = normalize(v, { sourceUrl: offer?.url || v.url || origin, dealerDomain: domain });
      if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
      rec.evKind = cls.kind;
      rec.evConfidence = cls.confidence;
      rec.fromVdp = dvPlat !== "dealercenter"; // DI/DEP nodes are the VDP's own; DealerCenter's is the lot record
      rec.platform = dvPlat;
      report.evs.push(rec);
    }
    if (report.evs.length > before) report.vehiclePages++;
    report.notes.push(
      `${dvPlat} (browser): ${r.found ?? 0} in lot, ${r.candidates != null ? `${r.candidates} candidate(s), ` : ""}${report.evs.length - before} EV(s) admitted in ${r.requests ?? 0} browser load(s)${r.why ? ` — ${r.why}` : ""}`,
    );
    if (!r.ok || !r.complete) report.stoppedEarly = `${dvPlat} browser lane ${r.why ?? (r.ok ? "partial" : "failed")}`;
    queue.length = 0;
  }

  // A walled Team Velocity rooftop never serves the page the ids sit on, so
  // the walk below would spend its budget on Akamai's "Access Denied". Its
  // ids are pinned in registry/team-velocity-ids.json; ask the API and skip
  // the walk. The walled host is never fetched.
  {
    const pinned = teamVelocityRegistryIds(domain);
    if (pinned) await pullTeamVelocity(pinned, "registry");
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
    let res = await fetchPage(url);
    report.fetched++;
    // Motive's edge challenge answers 200 on any of its rooftops' hostnames
    // (see isMotiveChallenge in the platform file). Ask again, slower, twice;
    // a page still challenged poisons the visit's completeness below rather
    // than reading as a dealer with no cars.
    for (const backoffMs of [3000, 8000]) {
      if (!isMotiveChallenge(res.body)) break;
      await new Promise((r) => setTimeout(r, backoffMs));
      res = await fetchPage(url);
      report.fetched++;
    }
    if (isMotiveChallenge(res.body)) {
      report.errors.push(`motive-challenge ${url}`);
      // Never let a challenged walk certify completeness — a complete 0-car
      // visit at a live Motive rooftop is a delisting instruction to db-sync.
      report.stoppedEarly = "motive edge challenge";
      continue;
    }
    if (res.status === "robots_disallowed") {
      if (dcs.srp.has(url)) dcs.failed = true;
      // A page robots refuses is a page this crawl did not see — and since
      // the URL is already shifted off the queue, continuing silently lets
      // the queue drain and the walk read as complete. That is a delisting
      // instruction for every car behind the refused page (an AutoRevo
      // rooftop whose robots close its own pager holds 480 of 530 cars past
      // page one). Refusal costs coverage; it must never cost honesty.
      report.stoppedEarly = `robots disallows ${url}`;
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
        const { vehicles, complete, found } = await pullRideMotiveApi(cfg, origin, { deadlineAt: domainCapAt || 0 });
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

    // AutoFunds / DealerWebsites: the whole lot is one /rss.aspx request, and
    // it is the ONLY door — these rooftops robots-disallow /inventory.aspx and
    // publish no JSON-LD anywhere, which is why they sat in
    // needs-investigation scoring "0 VIN vehicles in 12 fetches". The feed
    // carries no price, fuel or condition, so the pull follows the VDP of each
    // car that could be electrified (and only those: 3 of 41 on
    // greenlightautocorona.com) before anything is classified.
    if (!af.done && isAutoFunds(res.body)) {
      af.done = true;
      const before = report.evs.length;
      const { ok, vehicles, factsByVin, found, requests, vdpFailures } = await pullAutoFunds(origin, {
        keep: (v) => autoFundsNeedsVdp(v, classifyEv(v).isEv),
      });
      // The feed and the VDP follows are real requests against the dealer.
      report.fetched += requests;
      if (ok) {
        for (const v of vehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          rec = enrichFromAutoFunds(rec, factsByVin.get(rec.vin));
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          // Only a car whose VDP actually answered was read from its own page.
          rec.fromVdp = factsByVin.has(rec.vin);
          rec.platform = "autofunds";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `autofunds: ${found} in feed, ${report.evs.length - before} EV(s) admitted in ${requests} request(s)`
        );
        // A car whose VDP did not answer has no price, and ingest drops a row
        // with no price at all — so the VIN set this run can certify has a hole
        // in it, and db-sync must not read that hole as "sold".
        if (vdpFailures) report.stoppedEarly = `autofunds: ${vdpFailures} VDP(s) unread`;
        queue.length = 0;
        break;
      }
      // No feed (an older template, or the path moved). Leave the HTML walk to
      // this domain rather than certifying an empty pull.
      report.notes.push("autofunds: no feed at /rss.aspx, falling back to HTML");
    }

    // AutoCorner: the same shape as AutoFunds with the sitemap for a feed. Its
    // JSON endpoint is robots-disallowed (/cgi-bin/) and never asked; the
    // sitemap lists every VDP with the VIN leading the slug, and only cars
    // that could be electrified earn a VDP fetch for price and details.
    if (!ac.done && isAutoCorner(res.body)) {
      ac.done = true;
      const before = report.evs.length;
      const { ok, vehicles, factsByVin, found, requests, vdpFailures } = await pullAutoCorner(origin, {
        keep: (v) => autoCornerNeedsVdp(v, classifyEv(v).isEv),
      });
      report.fetched += requests;
      if (ok) {
        for (const v of vehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          rec = enrichFromAutoCorner(rec, factsByVin.get(rec.vin));
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = factsByVin.has(rec.vin);
          rec.platform = "autocorner";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `autocorner: ${found} in sitemap, ${report.evs.length - before} EV(s) admitted in ${requests} request(s)`,
        );
        // The autofunds rule: an unread VDP leaves a priceless car ingest
        // drops, so the VIN set has a hole db-sync must not read as "sold".
        if (vdpFailures) report.stoppedEarly = `autocorner: ${vdpFailures} VDP(s) unread`;
        queue.length = 0;
        break;
      }
      report.notes.push("autocorner: sitemap did not answer, falling back to HTML");
    }

    // Chapman Automotive's group site: the sitemap lists every vehicle page
    // across its 17 stores and each page carries a Car node (see the lane's
    // header). Sitemap + candidate VDPs, the AutoCorner shape.
    if (!cc.done && (isChapmanChoice(res.body) || isChapmanChoiceOrigin(origin))) {
      cc.done = true;
      const before = report.evs.length;
      const { ok, vehicles, found, candidates, requests, vdpFailures } = await pullChapmanChoice(origin);
      report.fetched += requests;
      if (ok) {
        for (const v of vehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          const offer = Array.isArray(v.offers) ? v.offers[0] : v.offers;
          let rec = normalize(v, { sourceUrl: offer?.url || v.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          rec.fromVdp = true;
          rec.platform = "chapmanchoice";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(`chapmanchoice: ${found} in sitemap, ${candidates} candidate(s), ${report.evs.length - before} EV(s) admitted in ${requests} request(s)`);
        if (vdpFailures) report.stoppedEarly = `chapmanchoice: ${vdpFailures} VDP(s) unread`;
        queue.length = 0;
        break;
      }
      report.notes.push("chapmanchoice: sitemap did not answer, falling back to HTML");
    }

    // eBizAutos: the registry domain is a shell — the inventory lives on a
    // host the shell references (usually {slug}.ebizautos.com, sometimes a
    // second custom domain), whose sitemap enumerates every VDP with the VIN
    // and the platform's new/used token in the slug. The pull walks that
    // sitemap and fetches candidate VDPs, whose complete Vehicle JSON-LD the
    // generic extractor reads. Cars stay attributed to the registry domain;
    // their sourceUrl is the vendor-host VDP, which is what recheck asks.
    if (!eb.done && isEBizAutos(res.body)) {
      const ebOrigins = ebizAutosOrigins(res.body, origin);
      if (ebOrigins.length) {
        eb.done = true;
        const before = report.evs.length;
        const { ok, vehicles, found, requests, vdpFailures } = await pullEBizAutos(ebOrigins);
        report.fetched += requests;
        if (ok) {
          for (const v of vehicles) {
            const cls = classifyEv(v);
            if (!cls.isEv) continue;
            const offer = Array.isArray(v.offers) ? v.offers[0] : v.offers;
            let rec = normalize(v, { sourceUrl: offer?.url || v.url || origin, dealerDomain: domain });
            if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
            rec.evKind = cls.kind;
            rec.evConfidence = cls.confidence;
            // Only candidates were read from their own page; a slug-only node
            // never classifies as an EV without also being a candidate.
            rec.fromVdp = true;
            rec.platform = "ebizautos";
            report.evs.push(rec);
          }
          if (report.evs.length > before) report.vehiclePages++;
          report.notes.push(
            `ebizautos: ${found} in sitemap, ${report.evs.length - before} EV(s) admitted in ${requests} request(s)`,
          );
          if (vdpFailures) report.stoppedEarly = `ebizautos: ${vdpFailures} VDP(s) unread`;
          queue.length = 0;
          break;
        }
        report.notes.push("ebizautos: no inventory host answered, falling back to HTML");
      }
    }

    // Dealer Spike's older generation: the SRP shell names a cached JS file
    // that IS the whole lot (/imglib/Inventory/cache/{id}/VehInv.js — 120
    // records, 120 VINs on robertstruck.com). One request, then done.
    if (!dsc.done) {
      const vehInv = dealerSpikeVehInvUrl(res.body, res.finalUrl);
      if (vehInv) {
        dsc.done = true;
        const before = report.evs.length;
        const { ok, vehicles, found, complete, requests } = await pullDealerSpikeCache(origin, res.body, res.finalUrl);
        report.fetched += requests;
        if (ok) {
          for (const v of vehicles) {
            const cls = classifyEv(v);
            if (!cls.isEv) continue;
            const rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
            if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
            rec.evKind = cls.kind;
            rec.evConfidence = cls.confidence;
            // The cache record IS the platform's whole card; there is no
            // richer server-rendered page behind it to fetch.
            rec.fromVdp = true;
            rec.platform = "dealerspike";
            report.evs.push(rec);
          }
          if (report.evs.length > before) report.vehiclePages++;
          report.notes.push(
            `dealerspike-cache: ${found} in feed, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`,
          );
          if (!complete) report.stoppedEarly = "dealerspike-cache partial pull";
          queue.length = 0;
          break;
        }
        report.notes.push("dealerspike-cache: feed did not answer, falling back to HTML");
      }
    }

    // Wayne Reaves: one request is the whole lot, and it is the only door —
    // every path on the host serves the same client-rendered shell, so an HTML
    // walk here fetches the same 272 KB page twelve times. The feed carries
    // the rooftop's SOLD gallery alongside its live cars (31 of 136 records
    // across the six rooftops sampled); the extractor drops those, and the
    // note reports both numbers so a shrinking lot is legible.
    if (!wr.done && isWayneReaves(res.body)) {
      wr.done = true;
      const before = report.evs.length;
      const { ok, vehicles, found, requests } = await pullWayneReaves(origin);
      report.fetched += requests;
      if (ok) {
        for (const v of vehicles) {
          const cls = classifyEv(v);
          if (!cls.isEv) continue;
          let rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
          if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
          rec.evKind = cls.kind;
          rec.evConfidence = cls.confidence;
          // normalize() does not carry a CPO flag off the vehicle node — every
          // platform sets it on the RECORD, the way dealercom.mjs and
          // dealeron-api.mjs do. The feed's `certified` is a boolean, so it
          // rides here rather than being lost between the two shapes.
          if (v.certified) rec.certified = true;
          // The feed record IS the car — colours, engine, odometer, gallery,
          // description. There is no richer page behind it to fetch.
          rec.fromVdp = true;
          rec.platform = "waynereaves";
          report.evs.push(rec);
        }
        if (report.evs.length > before) report.vehiclePages++;
        report.notes.push(
          `waynereaves: ${vehicles.length} live of ${found} records, ${report.evs.length - before} EV(s) admitted`,
        );
        queue.length = 0;
        break;
      }
      report.notes.push("waynereaves: feed did not answer, falling back to HTML");
    }

    // The four used-EV-specialist lanes of 2026-08-24. They share a shape:
    // each rooftop renders no inventory in HTML, each has exactly one door,
    // and each door returns the whole lot — so a successful pull ENDS the
    // crawl for that domain, the way the Motive and Wayne Reaves blocks above
    // do. A pull that came back short leaves `stoppedEarly` set, because
    // db-sync must never read an unfinished read as cars that sold.
    //
    // Every one of them abstains on condition or reads a machine token; none
    // of them claims certification, because on three of the four the only
    // "certified" on the page is the retailer's own inspection badge.
    let laneFinished = false;
    for (const lane of [
      // DealerSync: /Inventory/Search, paged by absolute offset.
      { state: ds, name: "dealersync", detect: isDealerSync, pull: () => pullDealerSync(origin) },
      // Recharged: one tRPC search endpoint, cursor-paged.
      {
        state: rch,
        name: "recharged",
        detect: (html) => isRecharged(html) || isRechargedOrigin(origin),
        pull: () => pullRecharged(origin),
      },
      // Ever: the /cars page server-renders its own search result; the page
      // size rides in a JSON-encoded `f` parameter. Its /api is
      // robots-disallowed and stays that way.
      {
        state: ec,
        name: "evercars",
        detect: (html) => isEverCars(html) || isEverCarsOrigin(origin),
        pull: () => pullEverCars(origin),
      },
      // Vehica (WordPress theme): the cars are a custom post type, so
      // WordPress's own REST API is the feed.
      { state: vh, name: "vehica", detect: isVehica, pull: () => pullVehica(origin) },
    ]) {
      if (lane.state.done || !lane.detect(res.body)) continue;
      lane.state.done = true;
      const before = report.evs.length;
      const { ok, vehicles, found, complete, requests } = await lane.pull();
      // The feed requests are real requests against the dealer.
      report.fetched += requests ?? 0;
      if (!ok) {
        report.notes.push(`${lane.name}: feed did not answer, falling back to HTML`);
        continue;
      }
      for (const v of vehicles) {
        const cls = classifyEv(v);
        if (!cls.isEv) continue;
        const rec = normalize(v, { sourceUrl: v.offers?.url || origin, dealerDomain: domain });
        if (rec.vdpUrl) rec.vdpUrl = abs(rec.vdpUrl, origin) ?? rec.vdpUrl;
        rec.evKind = cls.kind;
        rec.evConfidence = cls.confidence;
        // The feed record IS the car — colours, odometer, gallery, price.
        // There is no richer page behind it that this lane fetches.
        rec.fromVdp = true;
        rec.platform = lane.name;
        report.evs.push(rec);
      }
      if (report.evs.length > before) report.vehiclePages++;
      report.notes.push(
        `${lane.name}: ${found} in feed, ${vehicles.length} live, ${report.evs.length - before} EV(s) admitted (${complete ? "complete" : "partial"})`,
      );
      if (!complete) report.stoppedEarly = `${lane.name} partial pull`;
      queue.length = 0;
      laneFinished = true;
      break;
    }
    // Only a lane that actually pulled ends the crawl here. Falling through on
    // an empty queue would skip the rest of THIS iteration — the extraction of
    // the page already in hand — on the last page of an ordinary HTML walk.
    if (laneFinished) break;

    // Team Velocity serves its whole lot from an open API keyed by the account/
    // campaign ids inline in every page. Pull it and finish. Each car is
    // attributed to its OWN vdp host, because one account can be a dealer group
    // (dublinacura's account 80283 serves cars under dublinhonda.com); the crawl
    // certifies complete only when every car sits on the crawled domain — a
    // group spans rooftops, so it stays truncated and recheck retires per VIN.
    if (!tv.done) {
      const ids = teamVelocityApiIds(res.body);
      if (ids) {
        await pullTeamVelocity(ids, "page");
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
        const { vehicles, ddcByVin, complete, found, ok } = await pullDealerComApi(cfg, origin, { deadlineAt: domainCapAt || 0 });
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
        const { vehicles, complete, found, ok } = await pullDealerOnApi(lots, origin, { deadlineAt: domainCapAt || 0 });
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
    if (isDealerSpike(res.body)) seedTileLane("dealerspike");
    if (isDealerFront(res.body)) seedTileLane("dealerfront");
    if (isDealerClick(res.body)) seedTileLane("dealerclick");
    if (isDealerAccelerate(res.body)) seedTileLane("dealeraccelerate");
    if (isAutoRevo(res.body)) seedTileLane("autorevo");
    if (!pmSeeded && isProMax(res.body)) seedProMax(res.body, res.finalUrl);
    if (!addSeededFromPage && isAutoDealersDigital(res.body)) seedAutoDealersDigital(res.body);
    if (!mcsSeeded && isMotorcarSites(res.body)) seedMotorcar();
    if (!oaSeeded && isOneAudi(res.body)) seedOneAudi();
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
    // Motorcar Marketing returns a car only on a VDP: its SRP markup is
    // per-rooftop theme and carries no VIN on half the themes, so the SRP
    // contributes LINKS and the VDP contributes the facts.
    const motorcarSites = motorcarVehicles(res.body, res.finalUrl);
    // Auto Dealers Digital pages REPLACE the generic JSON-LD reading — and do
    // so even when this returns nothing, which is why the gate is the page's
    // platform and not the record count. The VDP's own schema.org node says
    // `itemCondition: NewCondition` on 85 of the 87 used cars measured, and
    // carries an offers.price for cars whose page prints "POR", so the
    // generic reader is not a safe fallback here: it is the exact thing being
    // guarded against. A car this returns nothing for is one that is SOLD or
    // has no VIN, and neither may be picked up on the way past.
    const addPage = isAutoDealersDigital(res.body);
    const addVehicles = addPage ? autoDealersDigitalVehicles(res.body, res.finalUrl) : [];
    // Its SRP is an ItemList in everything but the markup: one link per car,
    // and enough of the tile beside it to say whether the car could be
    // electrified. Feeding those through the same bridge as a real ItemList
    // (below) is what lets this platform reuse the EV filter and the VDP
    // follow rather than grow its own. Cars the rooftop has already sold are
    // dropped here — the platform leaves them in the lot for months (116 of
    // AMG Motors' 156, 179 of allautospecialist's 183), and a sold car is not
    // a listing.
    const mcsEntries = motorcarEntries(res.body, res.finalUrl).filter((e) => !e.sold);
    // Auto Dealers Digital's SRP is the same shape of not-quite-ItemList, and
    // the sold filter matters more here than anywhere: 50 of the 87 cars on
    // the three rooftops measured are already sold and still on the page.
    const addEntries = addPage ? autoDealersDigitalEntries(res.body, res.finalUrl).filter((e) => !e.sold) : [];
    const oneAudi = oneAudiVehicles(res.body);
    const oneAudiVins = new Set(oneAudi.map((v) => v.vehicleIdentificationNumber));
    // The 2026-08-31 tile lanes. Dealer Spike and DealerFront pages carry no
    // JSON-LD, so their tile readers are additive; DealerClick's reader IS the
    // page's JSON-LD, one unescape away.
    const dealerSpike = dealerSpikeVehicles(res.body, res.finalUrl);
    const dealerSpikeVins = new Set(dealerSpike.map((v) => v.vehicleIdentificationNumber));
    const dealerFrontVs = dealerFrontVehicles(res.body, res.finalUrl);
    const dealerFrontVins = new Set(dealerFrontVs.map((v) => v.vehicleIdentificationNumber));
    const dealerClickVs = dealerClickVehicles(res.body, res.finalUrl);
    const dealerClickVins = new Set(dealerClickVs.map((v) => v.vehicleIdentificationNumber));
    // DealerAccelerate needs two gates on the GENERIC reading, both measured
    // (2026-08-31): its SRP JSON-LD yields VIN-less, url-less nodes that all
    // collapse to one dealerDomain:sourceUrl key (the automanager phantom),
    // and a SOLD car's VDP keeps its Vehicle node with the price it sold at —
    // on the rooftops that don't delete the node outright, availability is
    // the only tell. So on this platform's pages the generic extraction is
    // suppressed on SRPs (entries drive the walk) and on sold VDPs.
    const daPage = isDealerAccelerate(res.body);
    const daEntriesAll = daPage ? dealerAccelerateEntries(res.body, res.finalUrl) : [];
    const daEntries = daEntriesAll.filter((e) => !e.sold);
    // A VDP on this platform is /vehicles/{id}/{slug} (craftsportsjdm mounts
    // at /inventory/); SRPs never carry the numeric segment. The distinction
    // is load-bearing: every VDP also shows a related-vehicles rail, so
    // "the page has entries" reads every VDP as an SRP and suppressed the one
    // page that holds the car — showdownauto's Model 3 came back 0 that way
    // on the first smoke crawl. A VDP is suppressed only when the platform
    // itself marks the car sold; an SRP always is (its JSON-LD is VIN-less
    // and collapses to one phantom record — see the platform file).
    const daVdp = daPage && /\/\d+\/[^/]+\/?$/.test(new URL(res.finalUrl).pathname);
    const daSuppressed = daPage && (daVdp ? isDealerAccelerateSold(res.body, res.finalUrl) : daEntriesAll.length > 0 || isDealerAccelerateSold(res.body, res.finalUrl));
    // AutoRevo and ProMax REPLACE the generic reading on their pages, both
    // measured (2026-08-31): an AutoRevo VDP's makesOffer.itemOffered Car
    // parses generically but price-less (and with the falsified per-car "new"
    // flag), so it would compete with the priced tile record for the same
    // VIN; a ProMax page's nodes parse generically but url-less, so every car
    // on the page keys to the search page itself.
    const arPage = isAutoRevo(res.body);
    const arVehicles = arPage ? autoRevoVehicles(res.body, res.finalUrl) : [];
    const arEntries = arPage ? autoRevoEntries(res.body, res.finalUrl).filter((e) => !e.sold) : [];
    const pmPage = isProMax(res.body);
    const pmVehicles = pmPage ? proMaxVehicles(res.body, res.finalUrl) : [];
    const pmEntries = pmPage ? proMaxEntries(res.body, res.finalUrl) : [];
    const vehicles = [
      ...(dealrVs.length
        ? dealrVs
        : addPage
          ? addVehicles
          : arPage
            ? arVehicles
            : pmPage
              ? pmVehicles
              : daSuppressed
                ? []
                : extractVehicles(res.body)),
      ...extractDrivewayVehicles(res.body),
      ...dcsVehicles,
      ...dealerFireVehicles(res.body, res.finalUrl),
      ...overfuel,
      ...autoManager,
      ...motorcarSites,
      ...oneAudi,
      ...dealerSpike,
      ...dealerFrontVs,
      ...dealerClickVs,
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
      if (rec.vin && oneAudiVins.has(rec.vin)) rec.platform = "oneaudi";
      if (rec.vin && overfuelVins.has(rec.vin)) rec.platform = "overfuel";
      if (rec.vin && dealerSpikeVins.has(rec.vin)) rec.platform = "dealerspike";
      if (rec.vin && dealerFrontVins.has(rec.vin)) rec.platform = "dealerfront";
      if (rec.vin && dealerClickVins.has(rec.vin)) rec.platform = "dealerclick";
      if (daPage) rec.platform = "dealeraccelerate";
      if (arPage) rec.platform = "autorevo";
      if (pmPage) rec.platform = "promax";
      if (dealerFire.size) rec = enrichFromDealerFire(rec, dealerFire, dealerFireRooftops);
      report.evs.push(rec);
      // A OneAudi VDP is client-rendered per car and carries no state a
      // parser can read — fetched live on audicary.com, the page 200s and
      // oneAudiVehicles() finds nothing in it. The SRP record is already the
      // whole car (odometer, trim, price, gallery), so following its link
      // would spend the budget to learn nothing and could trip the crawl's
      // own "no vehicle records in N pages" floor. The link is still what
      // the listing points a shopper at; it is just not fetched.
      if (rec.vin && oneAudiVins.has(rec.vin)) continue;
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
    // Dealer Spike pages with ?pg=N on its fixed /--inventory door. To the
    // FRONT like AutoManager's: 20 units a page, and the pager must be read
    // from the real <ol> — the page ships a commented-out twin that always
    // claims 100 pages, and an overshot ?pg= clamps to the last page with a
    // 200 (both in the platform file's header).
    if (dealerSpike.length) {
      const nextDs = dealerSpikeNextPageUrl(res.body, res.finalUrl);
      if (nextDs && !visited.has(nextDs)) queue.unshift(nextDs);
    }
    // DealerFront pages path-style (/inventory/page/N/) on its WordPress
    // template — invisible to the generic ?page= href scan — and ?&page=N on
    // its portal template.
    if (dealerFrontVs.length) {
      const nextDf2 = dealerFrontNextPageUrl(res.body, res.finalUrl);
      if (nextDf2 && !visited.has(nextDf2)) queue.unshift(nextDf2);
    }
    // DealerAccelerate pages with ?page=N — the one query key its rooftops'
    // robots allow. To the BACK, the Motorcar reason: gateway is 68 pages of
    // enumeration, and the EV VDPs this page just queued come first.
    if (daEntriesAll.length) {
      const nextDa = dealerAccelerateNextPageUrl(res.body, res.finalUrl);
      if (nextDa && !visited.has(nextDa)) queue.push(nextDa);
    }
    // AutoRevo pages with ?page=N. To the BACK (25 a page over a 530-car lot,
    // the Motorcar reason). Two honesty notes ride with it: the platform's own
    // "N matches out of M" line reports the cars a robots-closed or
    // budget-expired pager leaves unseen, and a page-one-only visit must
    // surface as truncation, not a clean walk.
    if (arPage && (arVehicles.length || arEntries.length)) {
      const missed = autoRevoTruncated(res.body);
      if (missed > 0) report.notes.push(`autorevo: ${missed} car(s) past ${res.finalUrl}`);
      const nextAr = autoRevoNextPageUrl(res.body, res.finalUrl);
      if (nextAr && !visited.has(nextAr)) queue.push(nextAr);
    }
    // ProMax has NO pager — its "next page" is a session cursor, and every
    // page-shaped query key re-serves page one (measured). The platform's own
    // ?year= filter urls are the only whole-lot enumeration; fan them out once
    // per rooftop, from the first SRP whose lot count exceeds what it renders.
    if (pmPage && pmVehicles.length && !pmFacetsSeeded) {
      const lot = proMaxLotCount(res.body);
      if (lot != null && lot > pmVehicles.length) {
        const facets = proMaxFacetSeeds(res.body, res.finalUrl).filter((u) => !visited.has(u));
        if (facets.length) {
          pmFacetsSeeded = true;
          queue.push(...facets);
          report.notes.push(`promax: lot ${lot} > ${pmVehicles.length} rendered, seeded ${facets.length} year facet(s)`);
        }
      }
    }
    // Motorcar Marketing pages with ?page_number=N. Gated on the page having
    // linked cars rather than on having yielded a vehicle record, because its
    // SRP never yields one — see motorcarVehicles above. Pushed to the BACK,
    // behind the EV VDPs the same page just queued: ten cars a page over a
    // 160-car lot is 16 pages, and jumping every one of them to the front
    // would spend the budget enumerating before fetching a single car.
    if (mcsEntries.length) {
      const nextMcs = motorcarNextPageUrl(res.body, res.finalUrl);
      if (nextMcs && !visited.has(nextMcs)) queue.push(nextMcs);
    }
    // Auto Dealers Digital pages with /page/N/. Gated on the CARD count, not
    // on addEntries, because a page of nothing but sold cars filters to zero
    // entries and is still a page one — stopping there would strand the live
    // cars behind it. To the BACK, like Motorcar's, so the EV VDPs this page
    // just queued are fetched before the walk enumerates further.
    if (addPage) {
      const cards = autoDealersDigitalCardCount(res.body);
      const nextAdd = cards ? autoDealersDigitalNextPageUrl(res.finalUrl, cards) : null;
      if (nextAdd && !visited.has(nextAdd)) queue.push(nextAdd);
    }

    // OneAudi has no next page — the SSR renders offset 0 and nothing in the
    // URL moves it. The second wave is instead a per-model-family request
    // built from the facet counts the page just published, which is the only
    // slice of the query the URL can reach. Truncation is reported rather
    // than implied: a family with more than 48 cars leaves the rest
    // unreachable, and a crawl that says nothing about that reads as a
    // complete walk.
    if (oneAudi.length) {
      const filtered = /[?&]modelFamily=/.test(res.finalUrl);
      // Only an UNfiltered SRP seeds the family wave. A filtered page
      // republishes a model-range facet of its own — the families it was
      // asked for — so seeding off one would mint a fresh URL for the same
      // cars every time the family order came back different, and `visited`
      // would never catch it.
      if (!filtered) {
        const famSeeds = oneAudiSeeds(res.body, res.finalUrl).filter((u) => !visited.has(u));
        if (famSeeds.length) queue.unshift(...famSeeds);
      } else {
        const missed = oneAudiTruncated(res.body);
        if (missed > 0) report.notes.push(`oneaudi: ${missed} car(s) past page one of ${res.finalUrl}`);
      }
    }

    // Bridge: SRP ItemList → VDP urls, EV-filtered, jump the queue.
    // DealerAccelerate's entries join because its own ItemList is unreadable
    // to the generic bridge (the url is one level down, on item.url) and
    // under-lists the page (20 of gateway's 26 rendered cars); the per-entry
    // sold flag was applied above — the live SRP legitimately shows sold cars.
    const allEntries = [...extractItemListEntries(res.body), ...mcsEntries, ...addEntries, ...daEntries, ...arEntries, ...pmEntries];
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
const inFlight = new Set();
async function worker() {
  while (next < domains.length && Date.now() < DEADLINE_AT) {
    const domain = domains[next++];
    inFlight.add(domain);
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
    inFlight.delete(domain);
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
// Never wait on the pool forever. Every worker's domain is bounded now (see
// crawlDealer's wall), but "bounded" is a claim about code I can read, and
// what this step is actually for is the calls I cannot — an fs read that
// never settles, a Playwright handle that never resolves, whatever the next
// one turns out to be. The rolling crawl's whole slice rides on this process
// EXITING so its sync step can run, so the process gets a wall of its own
// and honours it whatever is still in flight.
const pool = Promise.all(Array.from({ length: Math.min(CONCURRENCY, domains.length) }, worker));
const abandoned = (await withWall(pool, HARD_STOP_AT)).finished ? [] : [...inFlight];
clearInterval(checkpoint);

const unique = await writeOutput();
if (walkedAwayFrom.length) {
  console.error(
    `crawl: walked away from ${walkedAwayFrom.length} visit(s) that stopped returning — ` +
    `${walkedAwayFrom.join(", ")}. Each filed a truncated report holding the cars it had already ` +
    `found, so none of them can delist anything.`
  );
}
if (abandoned.length) {
  console.error(
    `crawl: hard stop ${DEADLINE_MIN + 5} minutes in with ${abandoned.length} domain(s) still in flight — ` +
    `${abandoned.join(", ")}. They file no report at all, so nothing of theirs is certified or delisted; ` +
    `everything the other ${reports.length} crawled is written and ships.`
  );
}
if (Number.isFinite(DEADLINE_AT) && reports.length < domains.length) {
  console.error(
    `crawl: stopped at the ${DEADLINE_MIN}-minute deadline after ${reports.length}/${domains.length} domains — ` +
    `wrote what's crawled; the rest are picked up next run`
  );
}
// Bounded, because closing is the last thing between a written out/ and the
// sync step that ships it: a Chrome that will not close must not be able to
// hold the process the way a domain that would not return used to.
await withWall(closeBrowser().catch(() => {}), Date.now() + 20_000);
console.error(`\n${unique} unique EV listings → scraper/out/listings.json`);
// Said out loud for the same reason merge-shards says it: on a slice of any
// size this number is normally in the hundreds, and a zero is far more likely
// to mean this counter broke than that no group syndicated a car tonight.
console.error(
  `crawl: ${lastColisting.length} VINs listed on more than one domain across ` +
  `${colistedDomainCount(lastColisting)} domains → scraper/out/colisting-pairs.json`
);
// Everything is on disk and said out loud. Abandoned work is still holding
// sockets, timers and possibly a browser page open, and node does not exit
// while it does — so a run that walked away from anything would sit here
// until the orphan happened to finish, which is the 34-minute job timeout
// again with the output already written. Leaving IS the fix; there is
// nothing left in this process anyone is waiting for.
// Exit 0: a run that walked away from a rooftop still succeeded, and a
// non-zero here would fail the step and skip the sync — losing the 400
// domains all over again, for a different reason. The write callback is the
// flush: stderr to a CI log is a pipe, and pipe writes are asynchronous, so
// exiting straight after the console.error above can cut the very lines that
// say what was abandoned.
if (abandoned.length || walkedAwayFrom.length) process.stderr.write("", () => process.exit(0));
