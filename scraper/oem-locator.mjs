#!/usr/bin/env node
// Pull national EV inventory from OEM find-inventory locators.
//   node oem-locator.mjs [--brands chevrolet,gmc,cadillac,hyundai,kia] [--out out]
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
//   GM (chevrolet/gmc/cadillac/buick) — open JSON API, ~24.7k EVs → lib/oem/gm.mjs
//   Hyundai — open JSON API (no auth token, just a Referer/Origin), one
//             nationwide POST, ~5.2k BEVs → lib/oem/hyundai.mjs
//   Kia    — open JSON API (isInitialRequest resolves dealers server-side),
//            one call per BEV series from the US center, ~7.4k BEVs (plus a
//            separate CPO endpoint not yet tapped) → lib/oem/kia.mjs
//   Tesla  — Akamai 403 on the inventory API itself (robots.txt is 200 and
//            permits /inventory; the block is bot management, not policy).
//            Off-limits: we do not work around bot detection.
//   Ford   — legacy shop.ford.com aemservices API retired (404); the new
//            ford.com/inventory results route is Akamai 403 to non-browser
//            clients while its landing page is 200. Same verdict as Tesla.
import { mkdir, writeFile } from "node:fs/promises";
import { richness } from "./lib/normalize.mjs";
import { GM_BRANDS, CARBRAVO, pullGmBrand, pullCarBravo } from "./lib/oem/gm.mjs";
import { HYUNDAI, HYUNDAI_CPO, pullHyundai, pullHyundaiCpo } from "./lib/oem/hyundai.mjs";
import { KIA, pullKia } from "./lib/oem/kia.mjs";
import { NISSAN, NISSAN_CPO, pullNissan, pullNissanCpo } from "./lib/oem/nissan.mjs";

// One registry of pullers keyed by brand. Each entry is a thunk returning a
// crawl.mjs-shaped report; new OEM families plug in here without touching the
// pull/merge/output plumbing below.
const log = (m) => console.error(`── ${m}`);
const PULLERS = {
  ...Object.fromEntries(GM_BRANDS.map((b) => [b.key, { domain: b.domain, run: () => pullGmBrand(b, { log }) }])),
  [CARBRAVO.key]: { domain: CARBRAVO.domain, run: () => pullCarBravo({ log }) },
  [HYUNDAI.key]: { domain: HYUNDAI.domain, run: () => pullHyundai({ log }) },
  [HYUNDAI_CPO.key]: { domain: HYUNDAI_CPO.domain, run: () => pullHyundaiCpo({ log }) },
  [KIA.key]: { domain: KIA.domain, run: () => pullKia({ log }) },
  [NISSAN.key]: { domain: NISSAN.domain, run: () => pullNissan({ log }) },
  [NISSAN_CPO.key]: { domain: NISSAN_CPO.domain, run: () => pullNissanCpo({ log }) },
};

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const OUT_DIR = flag("--out", "out");
const wanted = flag("--brands", "chevrolet,gmc,cadillac,carbravo,hyundai,hyundai-cpo,kia,nissan,nissan-cpo").split(",").map((s) => s.trim().toLowerCase());
const selected = wanted.filter((k) => PULLERS[k]);
if (!selected.length) {
  console.error(`oem-locator: no known brands in "${wanted}" (have: ${Object.keys(PULLERS).join(",")})`);
  process.exit(1);
}

// Pulls live on different hosts, so running them in parallel stays polite — the
// per-host 1.1s interval is enforced inside politePostJson.
const reports = await Promise.all(
  selected.map((k) =>
    PULLERS[k].run().catch((e) => ({
      domain: PULLERS[k].domain, kind: "oem-locator", fetched: 0, vehiclePages: 0, itemListVdps: 0,
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
  // observation stamp for db-sync's stale-evidence guard (migration 0013)
  rep.crawledAt ??= new Date().toISOString();
}

await mkdir(new URL(`./${OUT_DIR}/`, import.meta.url), { recursive: true });
await writeFile(new URL(`./${OUT_DIR}/listings.json`, import.meta.url), JSON.stringify([...byVin.values()], null, 2));
await writeFile(new URL(`./${OUT_DIR}/report.json`, import.meta.url), JSON.stringify(reports, null, 2));
console.error(`\n${byVin.size} unique locator EVs → ${OUT_DIR}/listings.json`);

// Zero rows across every brand means the platform moved or the network died —
// fail loudly so CI shows red instead of quietly uploading an empty shard.
if (!byVin.size) process.exit(1);
