#!/usr/bin/env node
// Grow the registry from data the OEM locator lanes already fetched.
//
//   node harvest-dealers.mjs [path/to/listings.json] [--write]
//
// Six locator lanes link each car to a VDP on the selling dealer's own
// website (measured on the 2026-08-15 snapshot: Honda 485 distinct dealer
// hosts, Hyundai 437+197, Ford Blue Advantage 322, Audi 246, BMW 204, Kia
// 150). Each of those hosts is a franchise rooftop we could be crawling for
// its used inventory — the exact class the license-roll reconciliation
// (docs/DEALER-LICENSE-ROLLS.md) showed we hold only ~28% of. The listing
// row alongside the URL carries the rooftop's name, city, state and zip, so
// a registry entry costs zero additional fetches.
//
// New hosts are appended as status "discovered", which is the existing
// contract with probe.mjs: nothing joins the crawl on this script's say-so;
// the probe validates each site's own pages first, exactly as it does for
// OSM- and state-roster-discovered rows. Existing rows are never modified —
// this script only ever appends, because the registry is hand-curated and a
// harvest that "corrected" it would be the clobbering CLAUDE.md forbids.
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const listingsPath = args.find((a) => !a.startsWith("--")) ?? new URL("./out/listings.json", import.meta.url);

const regUrl = new URL("./registry/registry.json", import.meta.url);
const raw = await readFile(regUrl, "utf-8");
const registry = JSON.parse(raw);
// The registry must survive this script byte-identical apart from the
// appended rows. If it no longer round-trips (hand edit with different
// formatting, merge artifact), appending would rewrite every line as a side
// effect — refuse instead.
if (JSON.stringify(registry, null, 2) !== raw) {
  console.error("harvest-dealers: registry does not round-trip JSON.stringify(…, 2) — refusing to append");
  process.exit(1);
}

const known = new Set();
for (const s of registry.sites) {
  const d = s.domain.replace(/^www\./, "");
  known.add(d);
  known.add(d.replace(/\.(com|net|org|us|biz|info)$/, ""));
}

// Hosts that appear as VDP targets but are not dealer rooftops: the OEM
// storefronts themselves (their inventory is already a lane; crawling them
// as "dealers" would double-count), plus aggregators with their own lanes.
const NOT_A_ROOFTOP =
  /(^|\.)(ford|fordblueadvantage|lincoln|chevrolet|cadillac|gmc|buick|carbravo|gm|kia|hyundaiusa|genesis|honda|acura|hondacerti\w*|toyota|lexus|nissanusa|infinitiusa|bmwusa|miniusa|mbusa|mercedes-benz|audiusa|vw|volkswagen|porsche|jeep|dodge|ram(trucks)?|chrysler|fiatusa|stellantis|subaru|mazdausa|volvocars|polestar|rivian|lucidmotors|tesla|driveway|carvana|carmax|autotrader|cargurus|cars|edmunds|kbb|truecar|shift|vroom)\.(com|net|us)$/i;

const listings = JSON.parse(await readFile(listingsPath, "utf-8"));
const seen = new Map(); // host -> {name, city, state, zip, lane, count}
let rowsScanned = 0;
for (const l of listings) {
  rowsScanned++;
  let host;
  try {
    host = new URL(l.vdpUrl ?? l.sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    continue;
  }
  if (!host.includes(".") || NOT_A_ROOFTOP.test(host)) continue;
  // A lane's own synthetic domain (hyundai-cpo) never parses as a URL host
  // here because vdpUrl points at the real page; dealerDomain does not.
  const prev = seen.get(host);
  if (prev) {
    prev.count++;
    // Prefer a record that names the dealer over one that doesn't.
    if (!prev.name && l.dealerName) Object.assign(prev, pick(l));
    continue;
  }
  seen.set(host, { ...pick(l), lane: l.dealerDomain, count: 1 });
}
function pick(l) {
  return { name: l.dealerName || undefined, city: l.city || undefined, state: l.state || undefined, zip: l.zip || undefined };
}

const today = new Date().toISOString().slice(0, 10);
const additions = [];
for (const [host, info] of [...seen.entries()].sort()) {
  if (known.has(host)) continue;
  const where = [info.city, info.state].filter(Boolean).join(", ");
  additions.push({
    domain: host,
    name: info.name ?? "Dealership Website",
    kind: "rooftop",
    platform: "unknown",
    robots: "unknown",
    status: "discovered",
    notes: `Discovered via OEM locator VDP host (lane ${info.lane}, ${info.count} listing(s)${where ? `, ${where}` : ""}) ${today}`,
    ...(info.city || info.state || info.zip ? { location: { city: info.city, state: info.state, zip: info.zip } } : {}),
  });
}

console.error(
  `harvest-dealers: ${rowsScanned} listings → ${seen.size} distinct dealer hosts, ` +
    `${seen.size - additions.length} already in registry, ${additions.length} new`
);
if (!additions.length) process.exit(0);

if (WRITE) {
  registry.sites.push(...additions);
  await writeFile(regUrl, JSON.stringify(registry, null, 2));
  console.error(`harvest-dealers: appended ${additions.length} discovered rows`);
} else {
  console.error("dry run (--write to append). New hosts:");
  for (const a of additions) console.error(`  ${a.domain}  ${a.name}  ${a.location?.state ?? ""}`);
}
