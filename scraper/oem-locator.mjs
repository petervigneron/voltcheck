#!/usr/bin/env node
// Pull national EV inventory from OEM find-inventory locators.
//   node oem-locator.mjs [--brands chevrolet,gmc,cadillac] [--out out]
//
// Output is shaped exactly like a crawl shard (out/listings.json +
// out/report.json), so the nightly workflow uploads it as one more
// crawl-out-* artifact and merge-shards folds it in with the same VIN-keyed
// richest-record-wins dedupe. A VIN seen both here and on a dealer's own site
// resolves to the dealer-site record (richer: photos, description, VDP), and
// the locator row covers every rooftop we cannot crawl — including the ~1.5k
// bot-walled dealer domains.
//
// Per-OEM viability (probed 2026-08-15, plain Node fetch, polite identity):
//   GM (chevrolet/gmc/cadillac/buick) — open JSON API, ~24.5k EVs → lib/oem/gm.mjs
//   Tesla  — Akamai 403 on the inventory API itself (robots.txt is 200 and
//            permits /inventory; the block is bot management, not policy).
//            Off-limits: we do not work around bot detection.
//   Ford   — legacy shop.ford.com aemservices API retired (404); the new
//            ford.com/inventory results route is Akamai 403 to non-browser
//            clients while its landing page is 200. Same verdict as Tesla.
import { mkdir, writeFile } from "node:fs/promises";
import { richness } from "./lib/normalize.mjs";
import { GM_BRANDS, pullGmBrand } from "./lib/oem/gm.mjs";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const OUT_DIR = flag("--out", "out");
const wanted = flag("--brands", "chevrolet,gmc,cadillac").split(",").map((s) => s.trim().toLowerCase());
const brands = GM_BRANDS.filter((b) => wanted.includes(b.key));
if (!brands.length) {
  console.error(`oem-locator: no known brands in "${wanted}" (have: ${GM_BRANDS.map((b) => b.key).join(",")})`);
  process.exit(1);
}

// Brands live on different hosts, so parallel pulls stay polite — the
// per-host 1.1s interval is enforced inside politePostJson.
const reports = await Promise.all(
  brands.map((b) =>
    pullGmBrand(b, { log: (m) => console.error(`── ${m}`) }).catch((e) => ({
      domain: b.domain, kind: "oem-locator", fetched: 0, vehiclePages: 0, itemListVdps: 0,
      evs: [], errors: [`crash: ${e.message}`], notes: [], truncated: true,
    }))
  )
);

const byVin = new Map();
for (const rep of reports) {
  for (const ev of rep.evs) {
    const prev = byVin.get(ev.vin);
    if (!prev || richness(ev) > richness(prev)) byVin.set(ev.vin, ev);
  }
}

for (const rep of reports) {
  console.error(
    `── ${rep.domain}: ${rep.fetched} requests, ${rep.evs.length} EVs, ` +
      `${rep.errors.length} errors, ${rep.truncated ? "TRUNCATED (certifies nothing)" : "complete"}`
  );
  // evs ride out via listings.json; keep report.json compact like crawl.mjs does not — trim here.
  rep.evs = rep.evs.length;
}

await mkdir(new URL(`./${OUT_DIR}/`, import.meta.url), { recursive: true });
await writeFile(new URL(`./${OUT_DIR}/listings.json`, import.meta.url), JSON.stringify([...byVin.values()], null, 2));
await writeFile(new URL(`./${OUT_DIR}/report.json`, import.meta.url), JSON.stringify(reports, null, 2));
console.error(`\n${byVin.size} unique locator EVs → ${OUT_DIR}/listings.json`);

// Zero rows across every brand means the platform moved or the network died —
// fail loudly so CI shows red instead of quietly uploading an empty shard.
if (!byVin.size) process.exit(1);
