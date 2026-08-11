#!/usr/bin/env node
// Validate registry rows with status "discovered" (from the weekly Overpass
// sweep) and promote the ones our extractors actually work on. Cheap by
// design: ≤8 fetches per site. Runs in nightly.sh before the crawl, so a
// domain discovered Sunday is contributing listings by the next night —
// no human in the loop.
//
//   node probe.mjs [--limit N]   (default 25 sites per run, politeness cap)
//
// Promotion bar: at least one schema.org Vehicle record with a VIN must
// extract from the site's own pages. A site that merely loads stays
// "discovered" is re-classified "needs-investigation" with evidence — never
// promoted on vibes.
import { readFile, writeFile } from "node:fs/promises";
import { fetchPage } from "./lib/http.mjs";
import { extractVehicles, extractItemListEntries } from "./lib/jsonld.mjs";
import { fingerprint } from "./lib/fingerprint.mjs";
import { discoverSitemapUrls, rank, dedupe, SRP_PATHS } from "./lib/sitemap.mjs";

const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : 25;

const regUrl = new URL("./registry/registry.json", import.meta.url);
const registry = JSON.parse(await readFile(regUrl, "utf-8"));
const candidates = registry.sites.filter((s) => s.status === "discovered").slice(0, LIMIT);
if (!candidates.length) {
  console.error("probe: no discovered sites awaiting validation");
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);

for (const site of candidates) {
  const origin = `https://${site.domain}`;
  let fetched = 0;
  const home = await fetchPage(`${origin}/`);
  fetched++;
  if (home.status !== 200 || !home.body) {
    site.status = typeof home.status === "number" ? `http-${home.status}` : "unreachable";
    site.notes = `${site.notes ?? ""} | probe ${today}: homepage ${home.status}`.trim();
    console.error(`  ${site.domain} → ${site.status}`);
    continue;
  }
  if (site.platform === "unknown" || !site.platform) site.platform = fingerprint(home.body);

  // Try SRP seeds + top-ranked sitemap inventory URLs until something
  // extracts or the fetch budget runs out.
  const sitemapUrls = await discoverSitemapUrls(site.domain, { maxUrls: 400, maxSitemaps: 8 });
  const tryUrls = dedupe([
    ...SRP_PATHS.map((p) => origin + p),
    ...rank(sitemapUrls).slice(0, 4),
  ]);

  let vehiclesWithVin = 0;
  let pagesWithVehicles = 0;
  let itemListEntries = 0;
  for (const url of tryUrls) {
    if (fetched >= 8) break;
    const res = await fetchPage(url);
    fetched++;
    if (res.status !== 200 || !res.body) continue;
    const vehicles = extractVehicles(res.body);
    if (vehicles.length) pagesWithVehicles++;
    vehiclesWithVin += vehicles.filter((v) => v.vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v.vin)).length;
    itemListEntries += extractItemListEntries(res.body).length;
    if (vehiclesWithVin > 0) break; // bar met, stop spending requests
  }

  if (vehiclesWithVin > 0) {
    site.status = "working";
    site.notes = `${site.notes ?? ""} | auto-promoted by probe ${today}: ${vehiclesWithVin} VIN vehicles on ${pagesWithVehicles} page(s), platform ${site.platform}`.trim();
  } else {
    site.status = "needs-investigation";
    site.notes = `${site.notes ?? ""} | probe ${today}: 0 VIN vehicles in ${fetched} fetches (${itemListEntries} ItemList entries, platform ${site.platform}) — likely needs a platform extractor`.trim();
  }
  console.error(`  ${site.domain} → ${site.status} (${site.platform})`);
}

await writeFile(regUrl, JSON.stringify(registry, null, 2));
const counts = registry.sites.reduce((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});
console.error(`probe: done — registry now ${JSON.stringify(counts)}`);
