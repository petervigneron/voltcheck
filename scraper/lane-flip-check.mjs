#!/usr/bin/env node
// How many cars are about to change which seller owns them — measured before
// the ingest that changes them.
//
//   node lane-flip-check.mjs [listingsFile]     (default: out/listings.json)
//
// WHY THIS EXISTS. `listings.dealer_domain` looks like a fact about a car and
// is not one. A car offered both on a dealer's own site and through a
// manufacturer's national locator is ONE row — vin is the primary key — and
// that row's dealer_domain is whatever ingested LAST. rolling-crawl.yml writes
// dealer-sourced rows every 30 minutes; nightly.yml's locator sweep writes
// manufacturer-sourced rows once. So the label oscillates, and the two lanes'
// populations swing by thousands for reasons that have nothing to do with
// coverage.
//
// Observed 2026-08-23, an off-cycle nightly whose locator sweep ran without a
// matching fresh dealer crawl:
//
//   15:54Z  total 103,526   oem 53,462   dealer 50,064
//   16:55Z  total 103,591   oem 58,166   dealer 45,425
//
// +4,704 / -4,639 while the total moved 65 and the whole sync created 98 new
// rows. Nothing appeared, nothing vanished; ~4,700 cars changed sides.
//
// WHY THAT MATTERS, twice over:
//
//   1. sync-guard checks the lanes SEPARATELY, so one lane collapsing cannot
//      hide behind a healthy total — that is the 87,082 -> 58,741 shape it was
//      built for. But its thresholds are applied to this label. A lane that
//      routinely swings 9% from write ordering either cries wolf or, worse,
//      makes a real collapse look like ordinary churn.
//   2. recheck SKIPS OEM-locator rows — 48,336 of them on 2026-08-23. recheck
//      is the only thing that notices a car has sold off a dealer's lot. So a
//      car that flips into the locator lane stops having its dealer page
//      checked, and its removal falls to the locator feed noticing instead —
//      and four of those lanes are always-truncated by design and cannot
//      delist at all.
//
// This script does not fix either. It measures, so the size of the problem is
// a number in audit-status.json rather than something a human has to notice.
// It is READ-ONLY and it never fails a run: it is an instrument, and an
// instrument that can stop the pipeline is a liability.
//
// WHERE IT RUNS: nightly.yml only, immediately before ingest — the one moment
// the database still holds the PREVIOUS owner of every VIN this run is about
// to claim. Deliberately NOT in rolling-crawl.yml, which fires 48 times a day:
// the walk below is ~3 MB of vin+dealer_domain, which is nothing once a night
// and ~4 GB a month against a 5 GB quota at slice cadence.
import { readFile } from "node:fs/promises";
import { OEM_LOCATOR_DOMAINS } from "./lib/oem-lane-domains.mjs";
import { recordRun } from "./lib/audit-status.mjs";

async function loadEnv(url) {
  try {
    const text = await readFile(url, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {} // no .env file is a supported state (CI supplies env directly)
}
await loadEnv(new URL("./.env", import.meta.url));

async function finish(result, detail) {
  console.error(`lane-flip-check: ${detail}`);
  await recordRun("lane-flip-check", { result, detail, expectedEveryHours: 27 });
  process.exit(0); // never fails the run; see the header
}

const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON } = process.env;
if (!SUPABASE_URL || !ANON) await finish("inconclusive", "no Supabase credentials — nothing measured");

const file = new URL(`./${process.argv[2] ?? "out/listings.json"}`, import.meta.url);
let incoming;
try {
  incoming = JSON.parse(await readFile(file, "utf-8"));
} catch {
  await finish("inconclusive", `no ${process.argv[2] ?? "out/listings.json"} — nothing to compare`);
}
if (!Array.isArray(incoming) || incoming.length === 0) {
  await finish("inconclusive", "the incoming listings file is empty — nothing to compare");
}

// Keyset, not Range/OFFSET — see recheck.mjs's note. Two narrow columns, so
// this is ~3 MB rather than the ~110 MB a payload walk moves.
const base = SUPABASE_URL.replace(/\/$/, "");
const stored = new Map();
try {
  for (let after = ""; ; ) {
    const url =
      `${base}/rest/v1/listings?select=vin,dealer_domain&delisted_at=is.null` +
      (after ? `&vin=gt.${encodeURIComponent(after)}` : "") +
      "&order=vin.asc&limit=1000";
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    const page = await res.json();
    for (const r of page) stored.set(r.vin, r.dealer_domain);
    if (page.length < 1000) break;
    after = page[page.length - 1].vin;
  }
} catch (e) {
  // The database being unreadable is not this script's business to escalate;
  // the steps that actually publish have their own gates.
  await finish("inconclusive", `could not read the live domains (${e.message}) — nothing measured`);
}

const lane = (d) => (OEM_LOCATOR_DOMAINS.has(d) ? "oem" : "dealer");
const counts = { unchanged: 0, newVin: 0, "dealer->oem": 0, "oem->dealer": 0, "dealer->dealer": 0, "oem->oem": 0 };
const fromDomains = new Map();
for (const ev of incoming) {
  const vin = ev?.vin?.toUpperCase();
  if (!vin || !ev.dealerDomain) continue;
  const was = stored.get(vin);
  if (was === undefined) { counts.newVin++; continue; }
  if (was === ev.dealerDomain) { counts.unchanged++; continue; }
  counts[`${lane(was)}->${lane(ev.dealerDomain)}`]++;
  fromDomains.set(was, (fromDomains.get(was) ?? 0) + 1);
}

const crossLane = counts["dealer->oem"] + counts["oem->dealer"];
const sameLane = counts["dealer->dealer"] + counts["oem->oem"];
console.error(
  `lane-flip-check: ${incoming.length} incoming records against ${stored.size} live rows — ` +
  `${counts.unchanged} keep their seller, ${counts.newVin} are new VINs`
);
console.error(
  `lane-flip-check: ${crossLane} CROSS-LANE flips ` +
  `(${counts["dealer->oem"]} dealer→locator, ${counts["oem->dealer"]} locator→dealer), ` +
  `${sameLane} rooftop-to-rooftop within a lane`
);
for (const [d, n] of [...fromDomains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.error(`  ${String(n).padStart(6)} losing the label from ${d}`);
}

// A warn, not a fail: this is a known property of the data model, not an
// incident. It is here so the number is recorded every night and a change in
// it is visible without anyone going looking.
await finish(
  crossLane > 0 ? "warn" : "ok",
  `${crossLane} cross-lane flips (${counts["dealer->oem"]} dealer→locator, ` +
  `${counts["oem->dealer"]} locator→dealer), ${sameLane} within-lane, ` +
  `${counts.newVin} new VINs, ${counts.unchanged} unchanged`
);
