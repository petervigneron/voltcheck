#!/usr/bin/env node
// Merge sharded crawl outputs back into the canonical out/ files.
//   node merge-shards.mjs [shardsDir]   (default: out/shards)
//
// The nightly workflow crawls the registry in N parallel matrix jobs, each
// writing its own out/listings.json + out/report.json; this stitches them
// together with the same dedupe rule crawl.mjs applies within a single run
// (VIN-keyed, richest record wins). Reports concatenate: db-sync's delist
// logic keys off per-domain `truncated === false`, so a shard that died
// simply certifies nothing — its domains are skipped, not delisted.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { richness } from "./lib/normalize.mjs";

const shardsDir = new URL(`./${process.argv[2] ?? "out/shards"}/`, import.meta.url);

let dirs = [];
try {
  dirs = (await readdir(shardsDir, { withFileTypes: true })).filter((d) => d.isDirectory());
} catch {
  console.error(`merge-shards: ${shardsDir.pathname} does not exist`);
  process.exit(1);
}

const byVin = new Map();
const reports = [];
let shardsRead = 0;
for (const d of dirs) {
  let listings, report;
  try {
    listings = JSON.parse(await readFile(new URL(`./${d.name}/listings.json`, shardsDir), "utf-8"));
    report = JSON.parse(await readFile(new URL(`./${d.name}/report.json`, shardsDir), "utf-8"));
  } catch (e) {
    console.error(`merge-shards: skipping ${d.name}: ${e.message}`);
    continue;
  }
  shardsRead++;
  reports.push(...report);
  for (const ev of listings) {
    if (!ev) continue;
    const key = ev.vin ?? `${ev.dealerDomain}:${ev.sourceUrl}`;
    const prev = byVin.get(key);
    if (!prev || richness(ev) > richness(prev)) byVin.set(key, ev);
  }
}

if (!shardsRead) {
  console.error("merge-shards: no shard outputs found — refusing to write empty results");
  process.exit(1);
}

await mkdir(new URL("./out/", import.meta.url), { recursive: true });
await writeFile(new URL("./out/listings.json", import.meta.url), JSON.stringify([...byVin.values()], null, 2));
await writeFile(new URL("./out/report.json", import.meta.url), JSON.stringify(reports, null, 2));
const complete = reports.filter((r) => r.truncated === false).length;
console.error(
  `merge-shards: ${shardsRead} shards → ${byVin.size} unique listings, ${reports.length} domain reports (${complete} complete)`
);
