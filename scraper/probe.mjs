#!/usr/bin/env node
// Validate registry rows with status "discovered" (from the weekly Overpass
// sweep) and promote the ones our extractors actually work on. Cheap by
// design: ≤8 fetches per site. Runs in nightly.sh before the crawl, so a
// domain discovered Sunday is contributing listings by the next night —
// no human in the loop.
//
//   node probe.mjs [--limit N] [--concurrency N]
//
// Politeness is enforced per host inside fetchPage, so probing different
// dealers concurrently is free speed — the 1.1s spacing still applies to
// each individual site. The nightly limit keeps any single night's fan-out
// bounded now that the registry holds hundreds of state-sourced dealers.
//
// Promotion bar: at least one schema.org Vehicle record with a VIN must
// extract from the site's own pages. A site that merely loads stays
// "discovered" is re-classified "needs-investigation" with evidence — never
// promoted on vibes.
import { readFile, writeFile } from "node:fs/promises";
import { fetchPage } from "./lib/http.mjs";
import { extractVehicles, extractItemListEntries } from "./lib/jsonld.mjs";
import { extractDdcVehicles } from "./lib/platforms/dealercom.mjs";
import { extractDealerOn } from "./lib/platforms/dealeron.mjs";

// DealerOn ships two templates and only the older one has an sdDataLayer to
// read a VIN out of; the current one carries its cars as data-dotagging
// attributes. Reading `?.vehicle?.vin` alone made every dotagging site look
// like it had no extractable inventory, which is how they got probed as
// failures and then crawled without odometers.
function dealerOnVins(html) {
  const d = extractDealerOn(html);
  if (!d) return [];
  return [d.vehicle?.vin, ...d.dotagging.keys()].filter(Boolean);
}
import { extractTeamVelocity } from "./lib/platforms/teamvelocity.mjs";
import { extractDrivewayVehicles } from "./lib/platforms/driveway.mjs";
import { extractDcsVehicles, isDealerCarSearch, DCS_SRP_PATH } from "./lib/platforms/dealercarsearch.mjs";
import { dealerFireVehicles } from "./lib/platforms/dealerfire.mjs";
import { fingerprint } from "./lib/fingerprint.mjs";
import { isDealerVenom, extractDealerVenomConfig, countDealerVenom } from "./lib/platforms/dealervenom.mjs";
import { overfuelVehicles, overfuelSeeds, isOverfuel, overfuelApiConfig, countOverfuelApi } from "./lib/platforms/overfuel.mjs";
import { isDealr, countDealr } from "./lib/platforms/dealr.mjs";
import { discoverSitemapUrls, rank, dedupe, SRP_PATHS } from "./lib/sitemap.mjs";
import { spaSignals, countVinUrls } from "./lib/spa-signals.mjs";

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
function strFlag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const LIMIT = flag("--limit", 120);
const CONCURRENCY = flag("--concurrency", 6);
// Nightly probes the fresh "discovered" rows. --status needs-investigation
// re-sweeps the written-off pile instead — worth doing after an extractor or
// detector improves, since those verdicts date from whatever the probe knew
// at the time.
const STATUS = strFlag("--status", "discovered");

const regUrl = new URL("./registry/registry.json", import.meta.url);
const registry = JSON.parse(await readFile(regUrl, "utf-8"));
const candidates = registry.sites.filter((s) => s.status === STATUS).slice(0, LIMIT);
if (!candidates.length) {
  console.error(`probe: no "${STATUS}" sites awaiting validation`);
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);

async function probeSite(site) {
  const origin = `https://${site.domain}`;
  let fetched = 0;
  const home = await fetchPage(`${origin}/`);
  fetched++;
  if (home.status !== 200 || !home.body) {
    site.status = typeof home.status === "number" ? `http-${home.status}` : "unreachable";
    site.notes = `${site.notes ?? ""} | probe ${today}: homepage ${home.status}`.trim();
    console.error(`  ${site.domain} → ${site.status}`);
    return;
  }
  if (site.platform === "unknown" || !site.platform) site.platform = fingerprint(home.body);

  // DealerVenom serves no inventory HTML, so the SRP-guess walk below would
  // score it a failure. Confirm its Typesense index directly instead: one
  // request, and a non-empty VIN'd result promotes it — the nightly crawl's
  // dealervenom pull then reads the whole lot.
  if (isDealerVenom(home.body)) {
    const cfg = extractDealerVenomConfig(home.body);
    if (cfg) {
      const { ok, found, hasVin } = await countDealerVenom(cfg);
      if (ok && found > 0 && hasVin) {
        site.platform = "dealervenom";
        site.status = "working";
        site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: dealervenom Typesense index, ${found} vehicles`.trim();
        console.error(`  ${site.domain} → working (dealervenom, ${found})`);
        return;
      }
    }
  }

  // Overfuel serves the whole lot from an open API keyed by a dealer id inline
  // in the page. Confirm it directly — one request — rather than walking the
  // client-rendered HTML, which 404s on the franchise rooftops. The nightly
  // crawl's overfuel-api block then pulls the full inventory.
  if (isOverfuel(home.body)) {
    const cfg = overfuelApiConfig(home.body);
    if (cfg) {
      const { ok, found, hasVin } = await countOverfuelApi(cfg);
      if (ok && found > 0 && hasVin) {
        site.platform = "overfuel";
        site.status = "working";
        site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: overfuel API, ${found} vehicles`.trim();
        console.error(`  ${site.domain} → working (overfuel, ${found})`);
        return;
      }
    }
  }

  // Dealr renders no VIN'd inventory in HTML (its JSON-LD lists cars as bare
  // @type:Car with no VIN) — but it serves the whole lot from a paged JSON API.
  // Confirm that directly: one request, and a non-empty VIN'd result promotes
  // it, so the nightly crawl's dealr pull reads the whole lot.
  if (isDealr(home.body)) {
    const { ok, found, hasVin } = await countDealr(origin);
    if (ok && found > 0 && hasVin) {
      site.platform = "dealr";
      site.status = "working";
      site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: dealr API, ${found} vehicles`.trim();
      console.error(`  ${site.domain} → working (dealr, ${found})`);
      return;
    }
  }

  // When the platform is known, its own SRP goes first. The 12-fetch budget
  // covers 6 sitemap URLs plus about six guesses, and /used-inventory/
  // index.htm is guess #8 — so on a dealer.com site whose sitemap ranks six
  // useless URLs the budget expired before the one path that was certain to
  // work. Ten such sites sat in needs-investigation with live inventory
  // (smythevolvocars.com among them, found 2026-08-16).
  const PLATFORM_SRPS = {
    "dealer.com": ["/used-inventory/index.htm", "/all-inventory/index.htm"],
    dealeron: ["/searchused.aspx", "/searchnew.aspx"],
    dealercarsearch: [DCS_SRP_PATH],
    dealerinspire: ["/used-vehicles/"],
  };
  // Overfuel's SRP is a per-rooftop slug ("/used-cars-albuquerque-nm") with no
  // fixed path to guess — but the homepage links it, so read it off the page we
  // already have rather than adding it to the guess table.
  const platformFirst = [
    ...(PLATFORM_SRPS[site.platform] ?? []).map((p) => origin + p),
    ...(site.platform === "overfuel" ? overfuelSeeds(home.body, origin) : []),
  ];

  // Try SRP seeds + top-ranked sitemap inventory URLs until something
  // extracts or the fetch budget runs out.
  // Real URLs from the site's own sitemap come next — they are known to
  // exist, whereas SRP_PATHS are guesses that 404 on most platforms. (Until
  // 2026-08-11 the guesses ran first and consumed the whole fetch budget, so
  // dealer.com sites we can definitely extract were scored as failures.)
  const sitemapUrls = await discoverSitemapUrls(site.domain, { maxUrls: 400, maxSitemaps: 8 });
  const tryUrls = dedupe([
    ...platformFirst,
    ...rank(sitemapUrls).slice(0, 6),
    ...SRP_PATHS.map((p) => origin + p),
    // Dealer Car Search's one SRP path. Without it the probe can still reach
    // a DCS site through its sitemap, but a site whose sitemap is thin would
    // be written off again for want of a single request.
    origin + DCS_SRP_PATH,
  ]);

  let vehiclesWithVin = 0;
  let pagesWithVehicles = 0;
  let itemListEntries = 0;
  for (const url of tryUrls) {
    if (fetched >= 12) break;
    const res = await fetchPage(url);
    fetched++;
    if (res.status !== 200 || !res.body) continue;
    // Use the SAME extraction stack as crawl.mjs. Checking JSON-LD alone
    // scored dealer.com/DealerOn sites as failures even though the crawler
    // extracts them fine — their SRPs carry vehicles in platform globals,
    // not in schema.org markup.
    const isVin = (v) => v && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v);
    const vehicles = [
      ...extractVehicles(res.body),
      ...extractDrivewayVehicles(res.body),
      ...extractDcsVehicles(res.body, res.finalUrl),
      ...dealerFireVehicles(res.body, res.finalUrl),
      ...overfuelVehicles(res.body, res.finalUrl),
    ];
    const platformVins = [
      ...extractDdcVehicles(res.body).map((d) => d.vin),
      ...dealerOnVins(res.body),
      extractTeamVelocity(res.body)?.vin,
    ].filter(isVin);
    if (isDealerCarSearch(res.body) && site.platform !== "dealercarsearch") site.platform = "dealercarsearch";
    if (vehicles.length || platformVins.length) pagesWithVehicles++;
    vehiclesWithVin +=
      vehicles.filter((v) => isVin(v.vehicleIdentificationNumber ?? v.vin)).length + platformVins.length;
    itemListEntries += extractItemListEntries(res.body).length;
    if (vehiclesWithVin > 0) break; // bar met, stop spending requests
    // An SRP's ItemList is a list of this dealer's cars, one link each.
    // The crawler follows these to VDPs; the probe used to merely count
    // them and then declare the site a failure — which is how DealerOn
    // dealers with perfectly extractable inventory got written off.
    for (const e of extractItemListEntries(res.body).slice(0, 2)) {
      if (fetched >= 12) break;
      const vdp = await fetchPage(e.url);
      fetched++;
      if (vdp.status !== 200 || !vdp.body) continue;
      const found = [
        ...extractVehicles(vdp.body),
        ...extractDrivewayVehicles(vdp.body),
        ...extractDcsVehicles(vdp.body, vdp.finalUrl),
        ...dealerFireVehicles(vdp.body, vdp.finalUrl),
      ]
        .filter((v) => isVin(v.vehicleIdentificationNumber ?? v.vin)).length +
        extractDdcVehicles(vdp.body).map((d) => d.vin).filter(isVin).length +
        [...dealerOnVins(vdp.body), extractTeamVelocity(vdp.body)?.vin].filter(isVin).length;
      if (found > 0) {
        vehiclesWithVin += found;
        pagesWithVehicles++;
        break;
      }
    }
    if (vehiclesWithVin > 0) break;
  }

  if (vehiclesWithVin > 0) {
    site.status = "working";
    site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: ${vehiclesWithVin} VIN vehicles on ${pagesWithVehicles} page(s), platform ${site.platform}`.trim();
  } else {
    // Say WHY nothing extracted, not just that it didn't. A client-rendered
    // site with a visible data layer is a lane candidate, not a dead end —
    // enterprisecarsales.com sat here three days while its HTML published
    // the api key for a national inventory API (now lib/oem/enterprise.mjs).
    const signals = spaSignals(home.body);
    const vinUrls = countVinUrls(sitemapUrls);
    if (vinUrls > 0) signals.unshift(`vin-url-sitemap:${vinUrls}`);
    const verdict = signals.length
      ? `client-rendered or API-backed; leads: ${signals.join(", ")}`
      : "likely needs a platform extractor";
    site.status = "needs-investigation";
    site.notes = `${site.notes ?? ""} | probe ${today}: 0 VIN vehicles in ${fetched} fetches (${itemListEntries} ItemList entries, platform ${site.platform}) — ${verdict}`.trim();
  }
  console.error(`  ${site.domain} → ${site.status} (${site.platform})`);
}

// Worker pool: politeness is per-host, so probing distinct dealers in
// parallel costs them nothing and turns a multi-hour sweep into minutes.
let cursor = 0;
async function worker() {
  while (cursor < candidates.length) {
    const site = candidates[cursor++];
    try {
      await probeSite(site);
    } catch (e) {
      site.status = "unreachable";
      site.notes = `${site.notes ?? ""} | probe ${today}: ${e.name ?? "error"}`.trim();
      console.error(`  ${site.domain} → unreachable (${e.name ?? "error"})`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

// Merge-on-write: a long sweep shares this tree with other sessions (and the
// registry is hand-curated), so rewriting the file from a registry loaded
// hours ago would clobber any edit made meanwhile. Re-read at write time and
// fold in only the fields this probe actually changes, keyed by domain.
const fresh = JSON.parse(await readFile(regUrl, "utf-8"));
const probed = new Map(candidates.map((s) => [s.domain, s]));
for (const site of fresh.sites) {
  const p = probed.get(site.domain);
  if (!p) continue;
  site.status = p.status;
  site.notes = p.notes;
  site.platform = p.platform;
}
await writeFile(regUrl, JSON.stringify(fresh, null, 2));
const counts = fresh.sites.reduce((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});
console.error(`probe: done — registry now ${JSON.stringify(counts)}`);
