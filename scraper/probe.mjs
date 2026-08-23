#!/usr/bin/env node
// Validate registry rows with status "discovered" (from the weekly Overpass
// sweep) and promote the ones our extractors actually work on. Cheap by
// design: ≤8 fetches per site. Runs in nightly.sh before the crawl, so a
// domain discovered Sunday is contributing listings by the next night —
// no human in the loop.
//
//   node probe.mjs [--limit N] [--concurrency N] [--sample N --seed S]
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
//   empty       — every fetch answered, nothing carried a VIN. A real verdict.
//   transient   — something did not answer: a network error, a timeout, a 429
//                 or 5xx, or a homepage that arrived with no sitemap and no
//                 links to try. Says nothing about the site yet.
//   blocked     — the site refused us on purpose (403, robots).
//   gone        — 404/410 at the front door.
//
// A `transient` row is then re-probed IN SERIES at the end of the run, before
// any verdict is written, because concurrency is the most likely cause: the
// retry costs one extra pass over the few rows that need it and it is what
// turns "we hammered them" back into an answer. Only the retry's verdict is
// recorded. Pass --no-retry to skip it (the measurement runs did, to count how
// many rows the retry actually rescues).
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
import { isRideMotive, rideMotiveConfig, countRideMotiveApi } from "./lib/platforms/ridemotive.mjs";
import { discoverSitemapUrls, rank, dedupe, SRP_PATHS } from "./lib/sitemap.mjs";
import { spaSignals, countVinUrls } from "./lib/spa-signals.mjs";
import { failureKind, apiHostsFrom, seededShuffle, emptyOrTransient } from "./lib/probe-verdict.mjs";

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

const regUrl = new URL("./registry/registry.json", import.meta.url);
const registry = JSON.parse(await readFile(regUrl, "utf-8"));
const matched = registry.sites
  .filter((s) => s.status === STATUS)
  .filter((s) => !VERDICT || s.probe?.verdict === VERDICT)
  .filter((s) => !matchRe || matchRe.test(s.domain) || matchRe.test(s.notes ?? ""));
const candidates = SAMPLE
  ? seededShuffle(matched, SEED).slice(0, SAMPLE)
  : matched.slice(0, LIMIT);
if (SAMPLE) console.error(`probe: seeded sample of ${candidates.length} from ${matched.length} "${STATUS}" rows (seed ${SEED})`);
if (!candidates.length) {
  console.error(
    `probe: no "${STATUS}"${VERDICT ? ` [${VERDICT}]` : ""}${MATCH ? ` sites matching /${MATCH}/` : " sites"} awaiting validation`,
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
    // Team Velocity SRPs server-render Vehicle JSON-LD, but only on this path —
    // the sitemap-ranked guesses spent the budget before reaching it on all 13
    // cohort rooftops (2026-08-16).
    "team-velocity": ["/inventory/used", "/inventory/new"],
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
      failures.push({ url, status: String(res.status), kind: failureKind(res.status) });
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
      if (vdp.status !== 200 || !vdp.body) {
        failures.push({ url: e.url, status: String(vdp.status), kind: failureKind(vdp.status) });
        continue;
      }
      const found = [
        ...extractVehicles(vdp.body),
        ...extractDrivewayVehicles(vdp.body),
        ...extractDcsVehicles(vdp.body, vdp.finalUrl),
        ...dealerFireVehicles(vdp.body, vdp.finalUrl),
        ...dealrVehicles(vdp.body, vdp.finalUrl),
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

  // Which kind of nothing — see lib/probe-verdict.mjs for why "answered but
  // had nothing to walk" counts as transient.
  const transientFailures = failures.filter((f) => f.kind === "transient");
  const verdict = emptyOrTransient({ failures, sitemapUrls: sitemapUrls.length, itemListEntries });

  site.status = "needs-investigation";
  site.notes = (
    `${site.notes ?? ""} | probe ${today}: ${verdict === "transient" ? "no answer" : "0 VIN vehicles"} in ${fetched} fetches ` +
    `(${itemListEntries} ItemList entries, ${sitemapUrls.length} sitemap urls, ${transientFailures.length} failed fetches, ` +
    `platform ${site.platform}) — ${leads}`
  ).trim();
  setVerdict(site, verdict, {
    fetched,
    vehicles: 0,
    itemList: itemListEntries,
    sitemapUrls: sitemapUrls.length,
    // Which of the two transient shapes this was, so a later sweep can tell a
    // row that timed out from one that answered and had nothing to walk —
    // they are not equally likely to turn into a promotion, and the split is
    // how anyone finds that out.
    ...(verdict === "transient" ? { why: transientFailures.length ? "failed-fetch" : "nothing-to-walk" } : {}),
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
const transient = candidates.filter((s) => s.probe?.verdict === "transient");
if (transient.length && !NO_RETRY) {
  console.error(`probe: re-probing ${transient.length} transient row(s) at concurrency ${RETRY_CONCURRENCY}`);
  const before = new Map(transient.map((s) => [s.domain, s.probe.verdict]));
  // Roll the note back to what it said before this run, so a retried row ends
  // up with ONE note for tonight rather than two. The registry is a
  // hand-curated file people read; the first attempt's note would say the same
  // thing as the second's and only the second is the answer. The evidence for
  // both is in the structured field.
  for (const s of transient) s.notes = notesBefore.get(s.domain);
  await runPool(transient, RETRY_CONCURRENCY);
  for (const s of transient) if (s.probe) s.probe.retried = true;
  const rescued = transient.filter((s) => s.status === "working").length;
  const settled = transient.filter((s) => s.probe?.verdict === "empty").length;
  console.error(
    `probe: retry rescued ${rescued} to working, settled ${settled} as empty, ${transient.length - rescued - settled} still transient (of ${before.size})`,
  );
}

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
  if (p.probe) site.probe = p.probe;
}
await writeFile(regUrl, JSON.stringify(fresh, null, 2));
const counts = fresh.sites.reduce((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});
const verdicts = candidates.reduce((a, s) => ((a[s.probe?.verdict ?? "none"] = (a[s.probe?.verdict ?? "none"] ?? 0) + 1), a), {});
console.error(`probe: this run's verdicts ${JSON.stringify(verdicts)}`);
console.error(`probe: done — registry now ${JSON.stringify(counts)}`);
