#!/usr/bin/env node
// Validate registry rows with status "discovered" (from the weekly Overpass
// sweep) and promote the ones our extractors actually work on. Cheap by
// design: ≤8 fetches per site. Runs in nightly.sh before the crawl, so a
// domain discovered Sunday is contributing listings by the next night —
// no human in the loop.
//
//   node probe.mjs [--limit N] [--concurrency N] [--sample N --seed S]
//                  [--domains-file cohort.txt]
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
//
// SAYING WHICH KIND OF NOTHING
//
// "0 VIN vehicles in 12 fetches" was one sentence for two completely
// different findings: a site that answered every request and genuinely has no
// extractable inventory, and a site that never really answered. The second
// kind is common and it is ours, not theirs — steponeauto.com was scored 0 at
// concurrency 16 while holding 1,761 cars, and three of the six Remora
// rooftops timed out on the homepage in one pass and served fine in the next.
// A row written off that way looks identical to a real dead end forever.
//
// So every probe now records a structured `probe` object on the row beside the
// prose note, and its `verdict` is the distinction:
//
//   working     — VIN'd inventory extracted. Promoted.
//   empty       — every fetch answered, nothing carried a VIN. A real verdict,
//                 and it comes in two shapes the `why` field separates:
//                 nothing-to-walk (no sitemap, no ItemList — no way IN) and
//                 the plain kind (we read real pages and found no VIN).
//   transient   — something did not answer: a network error, a timeout, a 429
//                 or a 5xx. Says nothing about the site yet.
//   blocked     — the site refused us on purpose (403, robots).
//   gone        — 404/410 at the front door.
//
// A `transient` row is then re-probed IN SERIES at the end of the run, before
// any verdict is written, because concurrency is the most likely cause: the
// retry costs one extra pass over the few rows that need it and it is what
// turns "we hammered them" back into an answer. Only the retry's verdict is
// recorded. Pass --no-retry to skip it.
//
// One narrow shape of `empty` joins that retry: a walk that completed while
// the homepage yielded no fingerprint, no signal and no ItemList — because on
// platforms whose config rides inline in a big payload (Motive), a page
// fetched under load can 200 with the payload missing, and the probe then
// scores a perfectly working rooftop "answered, no VIN". Ten of ten such
// rows promoted on a serial re-probe (2026-08-24); the rule and both sides of
// its measurement are blindEmpty() in lib/probe-verdict.mjs.
//
// How wide "transient" should be was measured rather than argued, and the
// first answer was wrong — see lib/probe-verdict.mjs. On a seeded random 150
// of the pile (seed 20260823) the original rule produced 85 transient rows and
// a serial re-probe of all 85 rescued zero, because 73 of them were the
// nothing-to-walk kind, which is stable. Narrowed to "something failed to
// answer", the requeue population goes from ~57% of the pile to ~9%.
//
// The structured object also carries the api-host leads as a LIST rather than
// only inside the prose, so api-leads.mjs can stop parsing sentences, and the
// canonical host when the registry's domain redirects to a different one —
// which is its own silent failure: furymotors.net has no sitemap and no
// inventory paths, saintpaul.furymotors.com (where it redirects) has 848 URLs,
// and probing the registry domain's origin found neither.
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
import { extractTeamVelocity, teamVelocityApiIds, countTeamVelocityApi } from "./lib/platforms/teamvelocity.mjs";
import { extractDrivewayVehicles } from "./lib/platforms/driveway.mjs";
import { extractDcsVehicles, isDealerCarSearch, DCS_SRP_PATH } from "./lib/platforms/dealercarsearch.mjs";
import { dealerFireVehicles } from "./lib/platforms/dealerfire.mjs";
import { fingerprint } from "./lib/fingerprint.mjs";
import { isDealerVenom, extractDealerVenomConfig, countDealerVenom } from "./lib/platforms/dealervenom.mjs";
import { overfuelVehicles, overfuelSeeds, isOverfuel, overfuelApiConfig, countOverfuelApi } from "./lib/platforms/overfuel.mjs";
import { dealrVehicles, DEALR_SRP_PATH } from "./lib/platforms/dealrcloud.mjs";
import { autoManagerVehicles, AUTOMANAGER_SRP_PATH } from "./lib/platforms/automanager.mjs";
import {
  isAutoDealersDigital,
  autoDealersDigitalSeeds,
  autoDealersDigitalEntries,
  autoDealersDigitalVehicles,
  autoDealersDigitalCardCount,
  autoDealersDigitalNextPageUrl,
  ADD_SRP_PATH,
} from "./lib/platforms/autodealersdigital.mjs";
import { isRideMotive, rideMotiveConfig, countRideMotiveApi } from "./lib/platforms/ridemotive.mjs";
import { isAutoFunds, countAutoFunds } from "./lib/platforms/autofunds.mjs";
import {
  isMotorcarSites,
  isRetiredRooftop,
  motorcarEntries,
  motorcarVehicles,
  motorcarNextPageUrl,
  MOTORCAR_SRP_PATH,
} from "./lib/platforms/motorcarsites.mjs";
import { isOneAudi, oneAudiVehicles, ONEAUDI_SRP_PATHS } from "./lib/platforms/oneaudi.mjs";
import { isWayneReaves, countWayneReaves } from "./lib/platforms/waynereaves.mjs";
import { isDealerSync, countDealerSync, DEALERSYNC_SRP_PATH } from "./lib/platforms/dealersync.mjs";
import { isRecharged, isRechargedOrigin, countRecharged } from "./lib/platforms/recharged.mjs";
import { isEverCars, isEverCarsOrigin, countEverCars, EVERCARS_SRP_PATH } from "./lib/platforms/evercars.mjs";
import { isVehica, countVehica } from "./lib/platforms/vehica.mjs";
import {
  isDealerSpike,
  dealerSpikeVehicles,
  countDealerSpikeCache,
  DEALERSPIKE_SRP_PATH,
  DEALERSPIKE_OLD_SRP_PATH,
} from "./lib/platforms/dealerspike.mjs";
import { isAutoRevo, autoRevoVehicles, autoRevoEntries, AUTOREVO_SRP_PATH } from "./lib/platforms/autorevo.mjs";
import { isProMax, proMaxSeeds, proMaxVehicles } from "./lib/platforms/promax.mjs";
import { isAutoCorner, countAutoCorner } from "./lib/platforms/autocorner.mjs";
import { isDealerAccelerate, dealerAccelerateEntries, DEALERACCELERATE_SRP_PATH } from "./lib/platforms/dealeraccelerate.mjs";
import { isEBizAutos, ebizAutosOrigins, countEBizAutos } from "./lib/platforms/ebizautos.mjs";
import { isDealerFront, dealerFrontVehicles, DEALERFRONT_SRP_PATH } from "./lib/platforms/dealerfront.mjs";
import { isDealerClick, dealerClickVehicles, DEALERCLICK_SRP_PATH } from "./lib/platforms/dealerclick.mjs";
import { discoverSitemapUrls, rank, dedupe, SRP_PATHS } from "./lib/sitemap.mjs";
import { spaSignals, countVinUrls } from "./lib/spa-signals.mjs";
import {
  failureKind,
  apiHostsFrom,
  seededShuffle,
  emptyOrTransient,
  blindEmpty,
  isBotChallenge,
  botWall,
  walledOut,
} from "./lib/probe-verdict.mjs";

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
// --match <regex>: probe only rows whose domain or notes match, tested against
// the domain and the notes (case-insensitive). This is the scoped re-probe an
// extractor improvement calls for — re-check just the leads a new/fixed lane
// covers (e.g. --match 'teamvelocityportal|dealr\.cloud') instead of walking
// the whole written-off pile, which is both cheaper and higher-yield.
const MATCH = strFlag("--match", null);
const matchRe = MATCH ? new RegExp(MATCH, "i") : null;
// --domains-file <path>: probe exactly the domains listed in a file (one per
// line, blank lines and #comments ignored), whatever their status. --match can
// only reach rows whose own notes already name the platform, and a cohort
// found by asking the sites themselves — the AutoFunds rooftops were found by
// one request to /rss.aspx each — is named by a list, not by a regex over
// prose written before anyone knew what they ran. An explicit list is a
// deliberate target, so it overrides --status rather than intersecting it.
const DOMAINS_FILE = strFlag("--domains-file", null);
const domainList = DOMAINS_FILE
  ? new Set(
      (await readFile(DOMAINS_FILE, "utf-8"))
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase())
        .filter((l) => l && !l.startsWith("#")),
    )
  : null;
// --verdict transient: re-probe the rows a previous run could not get an
// answer out of. This is the requeue the verdict split is for — a night's
// transient rows are re-checked on a later night at low concurrency, rather
// than sitting in needs-investigation looking exactly like a dead end.
// `retried` rows are included: a row that failed twice on Tuesday can still
// answer on Thursday, and the point of the field is that we know which rows
// those are.
const VERDICT = strFlag("--verdict", null);
// --sample N --seed S: a REPRODUCIBLE random subset of the candidates instead
// of the first N. The written-off pile is ordered by how it was discovered
// (whole states arrive together), so `--limit 150` measures one corner of it
// and calls the answer general. The seed is printed and belongs in whatever
// the sample is quoted in.
const SAMPLE = flag("--sample", 0);
const SEED = flag("--seed", 1);
// Re-probing the transient rows in series is the point of the verdict split,
// so it is on by default. --retry-concurrency raises it for a big sweep;
// --no-retry turns it off, which is only useful for measuring how much the
// retry rescues.
const RETRY_CONCURRENCY = flag("--retry-concurrency", 1);
const NO_RETRY = process.argv.includes("--no-retry");

// --sites-file <path>: probe rows from a JSON file instead of the registry,
// and write the verdicts back to that file. A discovery lane that has produced
// candidate rows needs to know whether the extractors work on them BEFORE
// anyone hand-curates them into registry.json — and the registry is a shared,
// hand-curated file that several sessions have open at once, so appending
// hundreds of unvalidated rows to it just to measure them is exactly the kind
// of write this project has been bitten by. The file may be a bare array of
// rows or a `{sites:[…]}` object; it is rewritten in the shape it arrived in.
const SITES_FILE = strFlag("--sites-file", null);
const regUrl = SITES_FILE ? new URL(SITES_FILE, `file://${process.cwd()}/`) : new URL("./registry/registry.json", import.meta.url);
const loaded = JSON.parse(await readFile(regUrl, "utf-8"));
const bareArray = Array.isArray(loaded);
const registry = bareArray ? { sites: loaded } : loaded;
const matched = domainList
  ? registry.sites.filter((s) => domainList.has(s.domain.toLowerCase()))
  : registry.sites
      .filter((s) => s.status === STATUS)
      .filter((s) => !VERDICT || s.probe?.verdict === VERDICT)
      .filter((s) => !matchRe || matchRe.test(s.domain) || matchRe.test(s.notes ?? ""));
const candidates = SAMPLE
  ? seededShuffle(matched, SEED).slice(0, SAMPLE)
  : // An explicit domain list is already the limit; truncating it to --limit
    // would silently skip the tail of a cohort someone named on purpose.
    domainList
    ? matched
    : matched.slice(0, LIMIT);
if (SAMPLE) console.error(`probe: seeded sample of ${candidates.length} from ${matched.length} "${STATUS}" rows (seed ${SEED})`);
if (domainList) {
  const missing = [...domainList].filter((d) => !matched.some((s) => s.domain.toLowerCase() === d));
  console.error(`probe: ${candidates.length} of ${domainList.size} listed domain(s) found in the registry`);
  if (missing.length) console.error(`probe: not in registry: ${missing.join(", ")}`);
}
if (!candidates.length) {
  console.error(
    domainList
      ? `probe: none of the domains in ${DOMAINS_FILE} are in the registry`
      : `probe: no "${STATUS}"${VERDICT ? ` [${VERDICT}]` : ""}${MATCH ? ` sites matching /${MATCH}/` : " sites"} awaiting validation`,
  );
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
// What each row's note said before tonight — see the retry pass at the bottom.
const notesBefore = new Map(candidates.map((s) => [s.domain, s.notes]));

// One row's verdict, written where a later run (and api-leads.mjs) can read it
// without parsing prose. Kept small on purpose: it rides in a hand-curated
// file that humans read.
function setVerdict(site, verdict, evidence) {
  site.probe = { date: today, verdict, ...evidence };
}

async function probeSite(site) {
  let origin = `https://${site.domain}`;
  let fetched = 0;
  // Failures during the walk, so a "found nothing" verdict can say whether
  // anything actually answered.
  const failures = [];
  const home = await fetchPage(`${origin}/`);
  fetched++;
  if (home.status !== 200 || !home.body) {
    const kind = failureKind(home.status);
    site.status = typeof home.status === "number" ? `http-${home.status}` : "unreachable";
    site.notes = `${site.notes ?? ""} | probe ${today}: homepage ${home.status}`.trim();
    setVerdict(site, kind === "other" ? "empty" : kind, { fetched, homeStatus: String(home.status) });
    console.error(`  ${site.domain} → ${site.status} [${kind}]`);
    return;
  }
  // A 200 that is a bot challenge is a refusal, not an empty lot. Recorded as
  // "blocked" the same way a 403 is — the walk below would otherwise spend
  // twelve fetches on the interstitial and write the row off as a dead end.
  if (isBotChallenge(home.body)) {
    site.status = "blocked";
    site.notes = `${site.notes ?? ""} | probe ${today}: bot challenge served with a 200 at the front door`.trim();
    setVerdict(site, "blocked", { fetched, why: "client-challenge" });
    console.error(`  ${site.domain} → blocked [challenge]`);
    return;
  }

  // The registry's domain is not always the origin the site actually serves
  // from: furymotors.net, bozard.com and www.billcurrie.com each 200 by
  // redirecting to a different host, and every path built on the registry
  // domain — sitemap discovery included — then found nothing (0 sitemap URLs
  // against 848, 666 and 299 at the hosts they redirect to). Follow the
  // homepage where it went. The registry domain stays the row's identity and
  // the crawl's dealer_domain; this only changes which origin we ask.
  let canonicalHost;
  try {
    const finalHost = new URL(home.finalUrl).host;
    if (finalHost && finalHost !== site.domain) {
      canonicalHost = finalHost;
      origin = new URL(home.finalUrl).origin;
    }
  } catch {}
  if (site.platform === "unknown" || !site.platform) site.platform = fingerprint(home.body);
  // OneAudi overrides a label already on the row, the way DealerCarSearch does
  // below. 273 of these rooftops sit in needs-investigation and most of them
  // were labelled "dealer.com" by an earlier fingerprint — Audi's platform
  // loads a dealer.com-named tag and some dealer.com asset hosts — so a
  // platform-first probe would go on trying /used-inventory/index.htm forever.
  if (isOneAudi(home.body) && site.platform !== "oneaudi") site.platform = "oneaudi";

  // A rooftop that has left Motorcar Marketing does not 404 and does not
  // redirect: the vendor keeps serving its own "Down For Maintenance"
  // placeholder, with a 200 and the platform's markers still on it. 111 of the
  // 149 hosts enumerated for this vendor answer that way (2026-08-24), so a
  // probe that spent its budget guessing SRP paths on them would burn ~1,300
  // requests on dealerships that no longer exist and file every one as
  // needs-investigation. Say what it is instead.
  if (isRetiredRooftop(home.body)) {
    site.platform = "motorcarsites";
    // "site-retired" joins the registry's existing site-moved / site-broken
    // family rather than inventing a new shape. The crawl lane takes only
    // status "working", so this row is simply never asked again.
    site.status = "site-retired";
    site.notes = `${site.notes ?? ""} | probe ${today}: vendor placeholder ("Down For Maintenance"), rooftop no longer hosted`.trim();
    setVerdict(site, "empty", { fetched, via: "motorcarsites-placeholder" });
    console.error(`  ${site.domain} → site-retired (motorcarsites placeholder)`);
    return;
  }

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
        setVerdict(site, "working", { fetched: fetched + 1, via: "dealervenom", found });
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
        setVerdict(site, "working", { fetched: fetched + 1, via: "overfuel", found });
        console.error(`  ${site.domain} → working (overfuel, ${found})`);
        return;
      }
    }
  }

  // Motive renders no inventory in HTML — its rooftops are the ones that kept
  // coming back "0 VIN vehicles in 12 fetches" while their whole lot sat in a
  // global Algolia index keyed by the dealer id on the page. One request
  // settles it, the same way DealerVenom/Overfuel are settled above.
  if (isRideMotive(home.body)) {
    const cfg = rideMotiveConfig(home.body);
    if (cfg) {
      const { ok, found, hasVin } = await countRideMotiveApi(cfg);
      if (ok && found > 0 && hasVin) {
        site.platform = "ridemotive";
        site.status = "working";
        site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: ridemotive Algolia index (dealer ${cfg.dealerId}), ${found} vehicles`.trim();
        setVerdict(site, "working", { fetched: fetched + 1, via: "ridemotive", found, dealerId: cfg.dealerId });
        console.error(`  ${site.domain} → working (ridemotive, ${found})`);
        return;
      }
    }
  }

  // AutoFunds / DealerWebsites: the walk below cannot reach this platform's
  // inventory at all — /inventory.aspx is robots-disallowed on its rooftops and
  // no page carries JSON-LD — which is exactly why they read "0 VIN vehicles in
  // 12 fetches" every time they were probed. Their /rss.aspx feed is the whole
  // lot in one request; settle it there, like DealerVenom/Overfuel/Motive above.
  if (isAutoFunds(home.body)) {
    const { ok, found, hasVin } = await countAutoFunds(origin);
    if (ok && found > 0 && hasVin) {
      site.platform = "autofunds";
      site.status = "working";
      site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: autofunds /rss.aspx feed, ${found} vehicles`.trim();
      setVerdict(site, "working", { fetched: fetched + 1, via: "autofunds", found });
      console.error(`  ${site.domain} → working (autofunds, ${found})`);
      return;
    }
  }

  // Wayne Reaves settles the same way, and needs to more than any of them:
  // every path on one of its hosts returns the same client-rendered shell, so
  // the walk below cannot tell /inventory from /robots.txt — 12 fetches of the
  // identical 272 KB page. Its /service/inventory/website feed is the lot.
  if (isWayneReaves(home.body)) {
    const { ok, found, live, hasVin } = await countWayneReaves(origin);
    if (ok && hasVin) {
      site.platform = "waynereaves";
      site.status = "working";
      site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: waynereaves feed, ${live} live of ${found} records`.trim();
      setVerdict(site, "working", { fetched: fetched + 1, via: "waynereaves", found: live });
      console.error(`  ${site.domain} → working (waynereaves, ${live})`);
      return;
    }
  }

  // The four used-EV-specialist lanes of 2026-08-24 settle the same way, and
  // for the same reason every row above them does: none of these rooftops
  // renders a car in HTML, so the 12-fetch walk below scores a live lot zero.
  // evercars.com is the case that proves it — six probes in a row wrote it off
  // with "0 VIN vehicles in 12 fetches … leads: nextjs" while 656 buyable EVs
  // sat behind a query parameter on the page the probe had already fetched.
  //
  // `found` is what the platform itself reports for the whole lot, so a note
  // reading "1130 vehicles" is the site's number and not a promise about how
  // many of them are live — the crawl's own note reports that split.
  for (const lane of [
    { name: "dealersync", detect: () => isDealerSync(home.body), count: () => countDealerSync(origin), label: "/Inventory/Search" },
    {
      name: "recharged",
      detect: () => isRecharged(home.body) || isRechargedOrigin(origin),
      count: () => countRecharged(origin),
      label: "tRPC vehicle.search",
    },
    {
      name: "evercars",
      detect: () => isEverCars(home.body) || isEverCarsOrigin(origin),
      count: () => countEverCars(origin),
      label: "server-rendered /cars search",
    },
    // Vehica's `found` is a first-page floor, not a lot size — see countVehica.
    { name: "vehica", detect: () => isVehica(home.body), count: () => countVehica(origin), label: "WordPress REST feed, first page of" },
    // AutoCorner settles off its sitemap — the whole lot with VINs in the
    // slugs; its JSON endpoint is robots-disallowed and never asked.
    { name: "autocorner", detect: () => isAutoCorner(home.body), count: () => countAutoCorner(origin), label: "sitemap" },
    // eBizAutos settles off the inventory HOST the shell homepage references
    // ({slug}.ebizautos.com or a second custom domain) — the registry domain
    // itself never renders a car, which is why this cohort read as empty.
    {
      name: "ebizautos",
      detect: () => isEBizAutos(home.body),
      count: () => countEBizAutos(ebizAutosOrigins(home.body, origin)),
      label: "vendor-host sitemap",
    },
    // Dealer Spike's older generation: the lot is one cached JS file the
    // /--xAllInventory shell names. Declines cleanly on a V7 rooftop, whose
    // /--inventory walk below still promotes it.
    {
      name: "dealerspike",
      detect: () => isDealerSpike(home.body),
      count: () => countDealerSpikeCache(origin),
      label: "VehInv cache",
    },
  ]) {
    if (!lane.detect()) continue;
    const { ok, found, hasVin } = await lane.count();
    fetched++;
    if (ok && found > 0 && hasVin) {
      site.platform = lane.name;
      site.status = "working";
      site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: ${lane.name} ${lane.label}, ${found} vehicles`.trim();
      setVerdict(site, "working", { fetched, via: lane.name, found });
      console.error(`  ${site.domain} → working (${lane.name}, ${found})`);
      return;
    }
  }

  // Team Velocity serves its lot from an open API keyed by ids inline in the
  // page — confirm it directly, like DealerVenom/Overfuel, rather than walking
  // the client-rendered HTML the crawl otherwise sees nothing in.
  {
    const ids = teamVelocityApiIds(home.body);
    if (ids) {
      const { ok, found, hasVin } = await countTeamVelocityApi(ids);
      if (ok && found > 0 && hasVin) {
        site.platform = "team-velocity";
        site.status = "working";
        site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: team-velocity API, ${found} vehicles`.trim();
        console.error(`  ${site.domain} → working (team-velocity, ${found})`);
        setVerdict(site, "working", { fetched: fetched + 1, via: "team-velocity", found });
        return;
      }
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
    dealrcloud: [DEALR_SRP_PATH],
    automanager: [AUTOMANAGER_SRP_PATH],
    motorcarsites: [MOTORCAR_SRP_PATH],
    // The path nothing in the guess table had: /all-inventory/ with the
    // trailing slash. Four rooftops read "0 VIN vehicles in 12 fetches" for
    // want of it while server-rendering their whole lot behind it.
    autodealersdigital: [ADD_SRP_PATH],
    // Audi's own platform publishes no sitemap and no ItemList, so these two
    // paths are the only door on the site — nothing in the guess table has
    // this shape, which is why 273 rooftops read "0 sitemap urls" forever.
    oneaudi: ONEAUDI_SRP_PATHS,
    // Team Velocity SRPs server-render Vehicle JSON-LD, but only on this path —
    // the sitemap-ranked guesses spent the budget before reaching it on all 13
    // cohort rooftops (2026-08-16).
    "team-velocity": ["/inventory/used", "/inventory/new"],
    // Fallbacks only: both lanes settle above, off the homepage, and never
    // reach this table on a healthy rooftop. They are here for the row whose
    // homepage answered without its usual markers, so the walk at least asks
    // the one path that carries cars instead of guessing /inventory.
    dealersync: [DEALERSYNC_SRP_PATH],
    evercars: [EVERCARS_SRP_PATH],
    // The 2026-08-31 tile lanes: each has one fixed door nothing in the guess
    // table covers (Dealer Spike's bare /--inventory clears the per-rooftop
    // SRP slug problem the same way OneAudi's paths do).
    dealerspike: [DEALERSPIKE_SRP_PATH, DEALERSPIKE_OLD_SRP_PATH],
    dealerfront: [DEALERFRONT_SRP_PATH],
    dealerclick: [DEALERCLICK_SRP_PATH],
    dealeraccelerate: [DEALERACCELERATE_SRP_PATH],
    autorevo: [AUTOREVO_SRP_PATH],
  };
  // Overfuel's SRP is a per-rooftop slug ("/used-cars-albuquerque-nm") with no
  // fixed path to guess — but the homepage links it, so read it off the page we
  // already have rather than adding it to the guess table.
  const platformFirst = [
    ...(PLATFORM_SRPS[site.platform] ?? []).map((p) => origin + p),
    ...(site.platform === "overfuel" ? overfuelSeeds(home.body, origin) : []),
    // ProMax's SRP slug is per-rooftop and sometimes on a sister host, read
    // off the homepage the way Overfuel's is.
    ...(isProMax(home.body) ? proMaxSeeds(home.body, origin) : []),
    // Recognised from the homepage as well as from the registry label: this
    // vendor's rooftops are subdomains of the vendor, so most of them enter
    // the registry with no platform on the row at all.
    ...(isMotorcarSites(home.body) && site.platform !== "motorcarsites" ? [origin + MOTORCAR_SRP_PATH] : []),
    // Auto Dealers Digital, recognised from the homepage as well as from the
    // label — most of these rooftops entered the registry with no platform on
    // the row. Its SRP slug is per-rooftop (4 of 30 are not "/all-inventory/",
    // and one of those four is the only page with the lot on it), so the
    // rooftop's own link is read off the homepage the way Overfuel's is.
    ...(isAutoDealersDigital(home.body) ? autoDealersDigitalSeeds(origin, home.body) : []),
  ];

  // Try SRP seeds + top-ranked sitemap inventory URLs until something
  // extracts or the fetch budget runs out.
  // Real URLs from the site's own sitemap come next — they are known to
  // exist, whereas SRP_PATHS are guesses that 404 on most platforms. (Until
  // 2026-08-11 the guesses ran first and consumed the whole fetch budget, so
  // dealer.com sites we can definitely extract were scored as failures.)
  const sitemapUrls = await discoverSitemapUrls(canonicalHost ?? site.domain, { maxUrls: 400, maxSitemaps: 8 });
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
    if (res.status !== 200 || !res.body) {
      // A refused fetch still has a body, and on the walled platforms it is
      // the wall's own interstitial. Naming it here is what lets the verdict
      // below say "we never got to look" instead of "this lot is empty".
      const wall = botWall(res.body);
      failures.push({ url, status: String(res.status), kind: failureKind(res.status), ...(wall ? { wall } : {}) });
      continue;
    }
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
      ...dealrVehicles(res.body, res.finalUrl),
      ...autoManagerVehicles(res.body, res.finalUrl),
      ...motorcarVehicles(res.body, res.finalUrl),
      ...autoDealersDigitalVehicles(res.body, res.finalUrl),
      ...oneAudiVehicles(res.body),
      ...dealerSpikeVehicles(res.body, res.finalUrl),
      ...dealerFrontVehicles(res.body, res.finalUrl),
      ...dealerClickVehicles(res.body, res.finalUrl),
      ...(isAutoRevo(res.body) ? autoRevoVehicles(res.body, res.finalUrl) : []),
      ...(isProMax(res.body) ? proMaxVehicles(res.body, res.finalUrl) : []),
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
    // Motorcar Marketing's SRP is a list of this rooftop's cars with no
    // ItemList markup and, on half its themes, no VIN — so without this the
    // probe would fetch the one page that holds the whole lot, extract
    // nothing, and write the rooftop off. Sold cars are dropped: the platform
    // keeps them listed, and a probe that promoted a rooftop on them would be
    // certifying inventory that isn't for sale.
    const mcsAll = motorcarEntries(res.body, res.finalUrl);
    const mcsEntries = mcsAll.filter((e) => !e.sold);
    // Rooftops on this platform leave sold cars in the lot, and the default
    // sort puts them first: page one of allautospecialist (183 cars) and of
    // kensmotorsportsllc (31) is TEN OUT OF TEN sold, on rooftops that plainly
    // have live inventory. Stopping at page one would write both off as empty.
    // So when a page yields cars but every one of them is sold, walk on — the
    // 12-fetch budget is the bound.
    if (mcsAll.length && !mcsEntries.length) {
      const nextSrp = motorcarNextPageUrl(res.body, res.finalUrl);
      if (nextSrp && !tryUrls.includes(nextSrp)) tryUrls.push(nextSrp);
    }
    // Auto Dealers Digital: same shape, and the same sold-first hazard, only
    // worse — 50 of the 87 cars measured across three rooftops are sold and
    // still on /all-inventory/. wildaboutcarsgarage.com's page one is 18 sold
    // out of 25. A probe that stopped at a page whose live cars all happen to
    // be sold would write off a rooftop with a lot behind it.
    const addAll = autoDealersDigitalEntries(res.body, res.finalUrl);
    const addEntries = addAll.filter((e) => !e.sold);
    if (addAll.length && !addEntries.length) {
      const nextSrp = autoDealersDigitalNextPageUrl(res.finalUrl, autoDealersDigitalCardCount(res.body));
      if (nextSrp && !tryUrls.includes(nextSrp)) tryUrls.push(nextSrp);
    }
    // DealerAccelerate: its ItemList is unreadable to the generic bridge (url
    // sits on item.url) and its SRP JSON-LD is VIN-less, so without its own
    // entries the probe fetches the one page that lists the lot, extracts
    // nothing, and writes the rooftop off. Sold entries are dropped — the
    // live SRP legitimately shows sold cars still printing their price.
    const daEntries = isDealerAccelerate(res.body)
      ? dealerAccelerateEntries(res.body, res.finalUrl).filter((e) => !e.sold)
      : [];
    // AutoRevo: some templates print no VIN on the SRP tile (johnbrothersauto
    // shows 5 of 15) — the VDP has it, so the tile links are followable.
    const arEntries = isAutoRevo(res.body)
      ? autoRevoEntries(res.body, res.finalUrl).filter((e) => !e.sold)
      : [];
    itemListEntries +=
      extractItemListEntries(res.body).length + mcsEntries.length + addEntries.length + daEntries.length + arEntries.length;
    if (vehiclesWithVin > 0) break; // bar met, stop spending requests
    // An SRP's ItemList is a list of this dealer's cars, one link each.
    // The crawler follows these to VDPs; the probe used to merely count
    // them and then declare the site a failure — which is how DealerOn
    // dealers with perfectly extractable inventory got written off.
    for (const e of [...extractItemListEntries(res.body), ...mcsEntries, ...addEntries, ...daEntries, ...arEntries].slice(0, 2)) {
      if (fetched >= 12) break;
      const vdp = await fetchPage(e.url);
      fetched++;
      if (vdp.status !== 200 || !vdp.body) {
        const vdpWall = botWall(vdp.body);
        failures.push({
          url: e.url,
          status: String(vdp.status),
          kind: failureKind(vdp.status),
          ...(vdpWall ? { wall: vdpWall } : {}),
        });
        continue;
      }
      const found = [
        ...extractVehicles(vdp.body),
        ...extractDrivewayVehicles(vdp.body),
        ...extractDcsVehicles(vdp.body, vdp.finalUrl),
        ...dealerFireVehicles(vdp.body, vdp.finalUrl),
        ...dealrVehicles(vdp.body, vdp.finalUrl),
        ...motorcarVehicles(vdp.body, vdp.finalUrl),
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
    setVerdict(site, "working", {
      fetched,
      vehicles: vehiclesWithVin,
      ...(canonicalHost ? { canonicalHost } : {}),
    });
    console.error(`  ${site.domain} → ${site.status} (${site.platform})`);
    return;
  }

  // Say WHY nothing extracted, not just that it didn't. A client-rendered
  // site with a visible data layer is a lane candidate, not a dead end —
  // enterprisecarsales.com sat here three days while its HTML published
  // the api key for a national inventory API (now lib/oem/enterprise.mjs).
  const signals = spaSignals(home.body);
  const vinUrls = countVinUrls(sitemapUrls);
  if (vinUrls > 0) signals.unshift(`vin-url-sitemap:${vinUrls}`);
  const leads = signals.length
    ? `client-rendered or API-backed; leads: ${signals.join(", ")}`
    : "likely needs a platform extractor";

  // Which kind of nothing — see lib/probe-verdict.mjs, including the measured
  // reason "answered but had nothing to walk" is NOT transient.
  const transientFailures = failures.filter((f) => f.kind === "transient");
  const verdict = emptyOrTransient({ failures });
  const nothingToWalk = sitemapUrls.length === 0 && itemListEntries === 0;
  // A named wall on the way in outranks both of the "empty" readings below.
  // carsforsale.com's rooftops publish a sitemap (so not nothing-to-walk) that
  // lists no VDP, and 403 their one inventory path with a DataDome
  // interstitial — a row that says "likely needs a platform extractor" sends
  // the next person to build something that cannot work. See botWall().
  const wall = failures.find((f) => f.wall)?.wall;

  site.status = "needs-investigation";
  site.notes = (
    `${site.notes ?? ""} | probe ${today}: ${verdict === "transient" ? "no answer" : "0 VIN vehicles"} in ${fetched} fetches ` +
    `(${itemListEntries} ItemList entries, ${sitemapUrls.length} sitemap urls, ${transientFailures.length} failed fetches, ` +
    `platform ${site.platform}) — ${wall ? `walled by ${wall} on the inventory path` : leads}`
  ).trim();
  setVerdict(site, verdict, {
    fetched,
    vehicles: 0,
    itemList: itemListEntries,
    sitemapUrls: sitemapUrls.length,
    // Two shapes of "empty" that read the same in the note and are not the
    // same finding: a site whose pages we fetched and read (needs a better
    // extractor, or has no cars) versus one that published no sitemap and no
    // ItemList, so there was never a page to read (needs a way IN). The
    // second is 73 of the 150 rows in the 2026-08-23 sample — the single
    // biggest bucket in the written-off pile, and a worklist of its own.
    ...(verdict === "empty" && wall ? { why: "walled", wall } : {}),
    ...(verdict === "empty" && !wall && nothingToWalk ? { why: "nothing-to-walk" } : {}),
    ...(verdict === "transient" ? { why: "failed-fetch" } : {}),
    ...(canonicalHost ? { canonicalHost } : {}),
    // The leads as data, not prose: api-leads.mjs ranks these hosts, and it
    // had to regex them back out of a sentence to do it (finding #1 in its
    // own header). `signals` keeps the non-host ones (nextjs, algolia…).
    ...(apiHostsFrom(signals).length ? { apiHosts: apiHostsFrom(signals) } : {}),
    ...(signals.some((s) => !s.startsWith("api-hosts:"))
      ? { signals: signals.filter((s) => !s.startsWith("api-hosts:")) }
      : {}),
    ...(failures.length ? { failures: failures.slice(0, 4) } : {}),
  });
  console.error(`  ${site.domain} → ${site.status} [${verdict}] (${site.platform})`);
}

// Worker pool: politeness is per-host, so probing distinct dealers in
// parallel costs them nothing and turns a multi-hour sweep into minutes.
async function runPool(sites, concurrency) {
  let cursor = 0;
  async function worker() {
    while (cursor < sites.length) {
      const site = sites[cursor++];
      try {
        await probeSite(site);
      } catch (e) {
        site.status = "unreachable";
        site.notes = `${site.notes ?? ""} | probe ${today}: ${e.name ?? "error"}`.trim();
        setVerdict(site, "transient", { error: e.name ?? "error" });
        console.error(`  ${site.domain} → unreachable [transient] (${e.name ?? "error"})`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, sites.length)) }, worker));
}

await runPool(candidates, CONCURRENCY);

// The retry pass. Concurrency is the leading suspect for every transient
// verdict — the whole reason the split exists — so the second attempt is
// serial by default and the row keeps only what it says. Rows that were
// already retried are not retried again: one slow pass is the point, an
// unbounded ladder is not.
//
// Blind empties ride along: an `empty` from a homepage that told us nothing
// (blindEmpty's shape) is the truncated-payload artifact until a serial pass
// says otherwise. A row the retry re-confirms keeps its empty verdict and
// gains `retried: true`, which is now the mark of an empty measured without
// our own concurrency in the frame.
const transient = candidates.filter((s) => s.probe?.verdict === "transient");
const blind = candidates.filter((s) => blindEmpty(s));
const requeue = [...transient, ...blind];
if (requeue.length && !NO_RETRY) {
  console.error(
    `probe: re-probing ${transient.length} transient + ${blind.length} blind-empty row(s) at concurrency ${RETRY_CONCURRENCY}`,
  );
  // Roll the note back to what it said before this run, so a retried row ends
  // up with ONE note for tonight rather than two. The registry is a
  // hand-curated file people read; the first attempt's note would say the same
  // thing as the second's and only the second is the answer. The evidence for
  // both is in the structured field.
  for (const s of requeue) s.notes = notesBefore.get(s.domain);
  await runPool(requeue, RETRY_CONCURRENCY);
  for (const s of requeue) if (s.probe) s.probe.retried = true;
  const rescued = requeue.filter((s) => s.status === "working").length;
  const stillTransient = requeue.filter((s) => s.probe?.verdict === "transient").length;
  console.error(
    `probe: retry rescued ${rescued} to working, settled ${requeue.length - rescued - stillTransient} as a real verdict, ${stillTransient} still transient (of ${requeue.length})`,
  );
}

// Merge-on-write: a long sweep shares this tree with other sessions (and the
// registry is hand-curated), so rewriting the file from a registry loaded
// hours ago would clobber any edit made meanwhile. Re-read at write time and
// fold in only the fields this probe actually changes, keyed by domain.
const reread = JSON.parse(await readFile(regUrl, "utf-8"));
const fresh = Array.isArray(reread) ? { sites: reread } : reread;
const probed = new Map(candidates.map((s) => [s.domain, s]));
for (const site of fresh.sites) {
  const p = probed.get(site.domain);
  if (!p) continue;
  site.status = p.status;
  site.notes = p.notes;
  site.platform = p.platform;
  if (p.probe) site.probe = p.probe;
}
await writeFile(regUrl, JSON.stringify(bareArray ? fresh.sites : fresh, null, 2));
const counts = fresh.sites.reduce((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});
const verdicts = candidates.reduce((a, s) => ((a[s.probe?.verdict ?? "none"] = (a[s.probe?.verdict ?? "none"] ?? 0) + 1), a), {});
console.error(`probe: this run's verdicts ${JSON.stringify(verdicts)}`);
console.error(`probe: done — registry now ${JSON.stringify(counts)}`);
