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
//
// The dedupe destroys a signal worth more than the record it discards. When
// one VIN turns up on several dealer domains the same night — 8,564 VINs on
// the night of 2026-08-17, 2,988 of them across true rooftops once the OEM
// locator lanes are set aside — the losing copies are dropped, and with them
// the evidence that those rooftops share inventory. That is a dealer-GROUP
// edge: 580 rooftops on that one night clustered into ~180 recognizable
// ownership groups (Herb Chambers, Lithia, McGovern, Koons). It is also the
// guardrail every future "this car moved between dealers" claim needs —
// naive move detection against the same night's data false-positives at
// roughly 200:1 on group syndication, because a group listing one car on
// twelve of its own sites looks exactly like eleven moves.
//
// So the losers are counted before they are thrown away, into
// out/colisting-pairs.json: only multi-domain VINs, and per sighting only the
// domain and the price — enough to build the graph and to see a group's price
// spread across its own rooftops, and nothing else. The dedupe itself is
// untouched; this is a second pass over the same records, not a change to
// which one wins. scraper/colisting-sync.mjs ships the file (migration 0036),
// and verify-colisting.mjs is the test.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { richness } from "./lib/normalize.mjs";
import { colistingAccumulator, colistedDomainCount } from "./lib/colisting.mjs";

const shardsDir = new URL(`./${process.argv[2] ?? "out/shards"}/`, import.meta.url);

let dirs = [];
try {
  dirs = (await readdir(shardsDir, { withFileTypes: true })).filter((d) => d.isDirectory());
} catch {
  console.error(`merge-shards: ${shardsDir.pathname} does not exist`);
  process.exit(1);
}

const byVin = new Map();
// Moved to lib/colisting.mjs on 2026-08-23 so the dealer crawl can use the
// same counter — see that file for why having only one copy, in this lane,
// meant vin_colisting never held a row.
const colisted = colistingAccumulator();
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

    colisted.add(ev);
  }
}

if (!shardsRead) {
  console.error("merge-shards: no shard outputs found — refusing to write empty results");
  process.exit(1);
}

await mkdir(new URL("./out/", import.meta.url), { recursive: true });
await writeFile(new URL("./out/listings.json", import.meta.url), JSON.stringify([...byVin.values()], null, 2));
await writeFile(new URL("./out/report.json", import.meta.url), JSON.stringify(reports, null, 2));

// Multi-domain VINs only. A single-rooftop VIN is the overwhelming majority
// and carries no edge, so writing it would cost ~60k rows a night to say
// nothing. Sorted (VINs, then domains within a VIN) so two runs over the same
// shards produce byte-identical files and a diff means the inventory moved.
// Written unindented on purpose — this file is transport, not something a
// human reads, and the indentation was ~40% of its bytes.
const colisting = colisted.pairs();
await writeFile(new URL("./out/colisting-pairs.json", import.meta.url), JSON.stringify(colisting));

const complete = reports.filter((r) => r.truncated === false).length;
const colistedDomains = { size: colistedDomainCount(colisting) };
console.error(
  `merge-shards: ${shardsRead} shards → ${byVin.size} unique listings, ${reports.length} domain reports (${complete} complete)`
);
console.error(
  `merge-shards: ${colisting.length} VINs listed on more than one domain across ${colistedDomains.size} domains → out/colisting-pairs.json`
);
