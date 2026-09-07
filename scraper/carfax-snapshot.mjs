#!/usr/bin/env node
// Read the title brand off the Carfax Snapshot each dealer publishes for its
// used cars, and cache it. Why, what is read and what is not, and the one
// switch, are in lib/carfax-snapshot.mjs; this file is the target selection,
// the pacing and the cache, in the shape of vdp-notes.mjs.
//
// Runs in rolling-crawl.yml per slice, after vdp-notes (which harvests keys
// off the VDPs it reads) and before ingest (which carries titleBrand into the
// payload). One host, so lib/http.mjs's per-host interval makes this serial
// at ~1 request per 1.1 s whatever --concurrency says; --limit is the
// budget, and a capped slice ships what it read and leaves the rest for the
// next sweep.

import { readFile, writeFile } from "node:fs/promises";
import { politeGetJson } from "./lib/http.mjs";
import { parseSnapshot, snapshotUrl, needsSnapshot } from "./lib/carfax-snapshot.mjs";

const LISTINGS = new URL("./out/listings.json", import.meta.url);
const CACHE = new URL("./registry/carfax-snapshot.json", import.meta.url);
const RUN = new URL("./out/carfax-snapshot-run.json", import.meta.url);

if (/^(off|0|false|no)$/i.test(process.env.CARFAX_SNAPSHOT ?? "")) {
  console.error("carfax-snapshot: switched off (CARFAX_SNAPSHOT); no request made, cached brands still apply");
  process.exit(0);
}

// A title brand is a DMV record and does not go away; a clean car can gain
// one. 45 days keeps the steady state to new arrivals plus a slow re-check.
const REFRESH_DAYS = 45;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const LIMIT = arg("--limit", Infinity);

const listings = JSON.parse(await readFile(LISTINGS, "utf-8"));
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE, "utf-8"));
} catch {
  /* first run */
}
const today = new Date().toISOString().slice(0, 10);
const refreshCutoff = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString().slice(0, 10);

const targets = [];
const seen = new Set();
for (const l of listings) {
  const vin = String(l.vin ?? "").toUpperCase();
  if (seen.has(vin)) continue;
  if (!needsSnapshot(l, { cached: cache[vin], refreshCutoff })) continue;
  seen.add(vin);
  targets.push(l);
}
const work = targets.slice(0, LIMIT);
console.error(
  `carfax-snapshot: ${targets.length} used/CPO cars with a published snapshot key and no fresh answer, doing ${work.length} this run`,
);

let read = 0;
let clean = 0;
let errors = 0;
for (const l of work) {
  const vin = String(l.vin).toUpperCase();
  const { status, json } = await politeGetJson(snapshotUrl(l.carfaxSnapshotKey), { headers: { referer: `https://${l.dealerDomain ?? ""}/` } });
  if (status !== 200 || !json) {
    // Not an answer about the car. Left uncached so it is retried, and
    // counted so a host that has stopped answering shows up in the summary.
    errors++;
    continue;
  }
  const { titleBrand } = parseSnapshot(json);
  cache[vin] = { brand: titleBrand ?? null, checkedAt: today };
  if (titleBrand) read++;
  else clean++;
  if ((read + clean) % 100 === 0) await writeFile(CACHE, JSON.stringify(cache, null, 1));
}
await writeFile(CACHE, JSON.stringify(cache, null, 1));
await writeFile(RUN, JSON.stringify({ at: new Date().toISOString(), targets: targets.length, did: work.length, read, clean, errors })).catch(() => {});

// Re-apply the whole cache, not just this run's answers, so a car keeps its
// brand on every run without being asked again.
let applied = 0;
const brands = new Map();
for (const l of listings) {
  const hit = cache[String(l.vin ?? "").toUpperCase()];
  if (!hit?.brand) continue;
  l.titleBrand = hit.brand;
  applied++;
  brands.set(hit.brand, (brands.get(hit.brand) ?? 0) + 1);
}
await writeFile(LISTINGS, JSON.stringify(listings, null, 1));
console.error(
  `carfax-snapshot: ${read} branded, ${clean} clean, ${errors} unanswered; ${applied} listings carry a title brand` +
    (brands.size ? ` — ${[...brands].map(([b, n]) => `${b}: ${n}`).join(", ")}` : "") +
    ". buyback_disclosed / branded_title_disclosed (0070) read it at write time.",
);
if (work.length && errors === work.length) {
  console.error("::warning::carfax-snapshot: every request went unanswered this run — the host may have stopped answering; nothing was cached as clean");
}
