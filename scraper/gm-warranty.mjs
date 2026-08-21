#!/usr/bin/env node
// Ask GM what THIS car's battery warranty actually is.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// Every used EV on the site was being told its cohort's warranty terms. For
// one family of cars that answer is not merely vague, it is wrong: recall
// 21V-560 replaced the battery pack in 2017-2019 Chevrolet Bolt EVs, and
// 21V-650 extended the programme to 2020-2022 Bolt EV/EUV. GM's own warranty
// administration bulletin (MC-10217072, July 2022) says a pack fitted under
// that recall carries a fresh 8-year/100,000-mile Service Replacement Parts
// Limited Warranty and that "the replacement parts warranty term begins the
// date and mileage at the time of battery replacement."
//
// So the clock restarts, and the site had no idea. The 2017 Bolt that prompted
// this had its pack replaced on 2021-12-23 at 34,374 miles: covered to
// 2029-12-23 or 134,374 miles, against original terms that died in Feb 2025 at
// 100,014. Two more checked the same way came back replaced too, one of them
// covered to 2030 at 121,731 miles. Quoting the original terms understates a
// repaired car; computing expiry from them, as this site briefly did, prints a
// dead warranty over a live one.
//
// ── Why it's cheap ─────────────────────────────────────────────────────────
//
// GM's owner centre answers per VIN with no sign-in. It renders as an Angular
// SPA, and docs/ENRICHMENT-SCHEMA.md concluded from that that ingest would
// need a headless browser; it does not. The SPA calls two plain JSON endpoints
// that serve the same data to an ordinary GET (verified from Node, no cookies,
// no Akamai challenge, no token):
//
//   /ownercenter/api/vin/{VIN}/warranties  — every coverage on the car, each
//        with start/expiry date AND start/expiry mileage. This is the only
//        source on the site that knows a car's IN-SERVICE DATE, which is what
//        actually starts a warranty and which no dealer feed or VIN decode
//        carries.
//   /ownercenter/api/{VIN}/gfas           — field actions and recalls, with
//        the GM program number, which is what distinguishes a replaced pack
//        (N212343880/881) from a software flash (N212343883). NHTSA cannot:
//        its public API takes no VIN, and its web lookup shows only
//        UNREPAIRED recalls, so a clean result there is equally consistent
//        with a new pack and with nothing having been done.
//
// Control-tested before building: a 2026 Sierra EV returns warranties and no
// replacement line (right — not a Bolt), and a Tesla VIN returns HTTP 500
// (right — not a GM vehicle). A negative here is a real negative.
//
// ── What is stored, and what is deliberately not ───────────────────────────
//
// Dates and mileages only. The portal also returns a "status" of Active or
// Expired, computed against the moment of the request — a value that changes
// on its own. Migration 0025 made `listings.payload` equality the test for
// whether a row needs rewriting, so a self-changing field in the payload would
// rewrite every Bolt every night for nothing. The comparison against today
// happens at render, in web/lib/listings/warranty.ts.

import { readFile, writeFile } from "node:fs/promises";
import { fetchWithRetry } from "./lib/retry.mjs";

const LISTINGS = new URL("./out/listings.json", import.meta.url);
const CACHE = new URL("./registry/gm-warranty.json", import.meta.url);

const BASE = "https://experience.gm.com/ownercenter/api";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
// One request per 1.2s, serial, same politeness the crawler runs under. The
// whole target set is a few thousand VINs on the first pass and only newly
// seen ones after that, so there is no reason to lean on this host.
const PACE_MS = 1200;

// GM's own world manufacturer identifiers. A VIN outside these is not a GM
// vehicle and the endpoint would 500 on it, so it is never asked.
const GM_WMI = /^(1G|2G|3G|5G|6G|KL|W0L|LSG)/;

// The pack-replacement programmes. 880 replaces modules and 881 replaces the
// whole pack; 883 is a software flash and resets nothing, which is exactly why
// "recall complete" on its own is not an answer.
const PACK_PROGRAMS = new Set(["N202311730", "N202311731", "N212343880", "N212343881", "N212345940"]);

const BATTERY_WTY = /propulsion battery|battery limited part|drive motor battery/i;
const REPLACEMENT_WTY = /battery limited part/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

async function getJson(label, url) {
  // Short waits, unlike the database's ladder (retry.mjs's default 30/120/
  // 240s, sized to outlast Supabase's ~2-minute OOM recovery cycle): this is
  // a per-VIN call to an external OEM endpoint whose own documented behavior
  // is to answer 500 for "not a GM vehicle" (see the control test above) —
  // that is the endpoint's normal answer, not evidence of an outage worth a
  // multi-minute retry. vpic-enrich.mjs and nhtsa-battery.mjs already made
  // this same call for their own external APIs; this one had been left on
  // the default. On 2026-08-21 (run 32474806496) that default ladder is what
  // actually starved db-sync: 21 VINs in one run each burned the full 390s
  // (30+120+240) before falling back to the exact same "no coverage" answer
  // a short wait would have reached in seconds, costing over two hours of
  // pure waiting inside the 90-minute job whose only job is to reach
  // Supabase. The final fallback behavior on a real 500 is unchanged either
  // way (readCoverage(null) below still caches it as unavailable) — shortening
  // the wait only removes wasted time, it does not change what gets recorded.
  const res = await fetchWithRetry(
    label,
    () =>
      fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", "X-Crawler": "VoltcheckBot (+https://voltcheck.net/crawler)" },
        signal: AbortSignal.timeout(20_000),
      }),
    { waits: [5, 15] }
  );
  // 500 is this endpoint's answer for "not a GM vehicle" — a real negative,
  // cached like any other so it is asked once and not again.
  if (res.status === 500) return null;
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.json();
}

/** The coverage actually in force on this car's battery, replacement first. */
function readCoverage(warranties) {
  const rows = (warranties?.data ?? []).filter((w) => BATTERY_WTY.test(w.description ?? ""));
  if (!rows.length) return undefined;
  const replacement = rows.find((w) => REPLACEMENT_WTY.test(w.description));
  const original = rows.find((w) => !REPLACEMENT_WTY.test(w.description));
  // A replacement pack's warranty supersedes the original outright — it starts
  // later and runs longer on both clocks. Where there is none, the original
  // stands, and its start date is the in-service date.
  const live = replacement ?? original;
  if (!live?.startDate || !live?.expirationDate) return undefined;
  return {
    startDate: live.startDate,
    startMileage: num(live.startMileage),
    expiresDate: live.expirationDate,
    expiresMileage: num(live.endMileage),
    inServiceDate: original?.startDate,
    fromReplacement: Boolean(replacement),
  };
}

/** Which pack programme, if any, this VIN has completed. */
function readCampaign(gfas, coverage) {
  const rows = gfas?.data?.gfas ?? [];
  const pack = rows.find((g) => PACK_PROGRAMS.has(g.gfaNumber) || PACK_PROGRAMS.has(g.currentBusinessUnitInfo?.alternateGfaNbr));
  // The warranty record is the stronger evidence and the one with a date on
  // it: a replacement parts warranty exists only because a pack was fitted.
  // The campaign list names which programme did it.
  if (!coverage?.fromReplacement) return undefined;
  return {
    packReplaced: true,
    packReplacedDate: coverage.startDate,
    odometerAtReplacement: coverage.startMileage,
    gmProgramNumber: pack?.gfaNumber,
  };
}

const listings = JSON.parse(await readFile(LISTINGS, "utf-8"));
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE, "utf-8"));
} catch {
  /* first run */
}

// Used GM cars only. A new car's warranty is its model year's, unstarted, and
// the whole point of the lookup is history the car has accumulated.
const targets = new Map();
for (const l of listings) {
  const vin = String(l.vin ?? "").toUpperCase();
  if (vin.length !== 17 || !GM_WMI.test(vin)) continue;
  if (String(l.condition ?? "").toLowerCase() === "new") continue;
  targets.set(vin, l);
}

// --limit bounds a night's work so the first pass can spread over several
// runs instead of holding the pipeline for an hour. Cached VINs are never
// re-asked, so the backlog drains and then stays drained.
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const fresh = [...targets.keys()].filter((v) => !cache[v]).slice(0, LIMIT);
const backlog = [...targets.keys()].filter((v) => !cache[v]).length;
console.error(
  `gm-warranty: ${targets.size} used GM VINs, ${backlog} not yet checked, doing ${fresh.length} this run`
);

const today = new Date().toISOString().slice(0, 10);
let ok = 0;
let none = 0;
for (const [i, vin] of fresh.entries()) {
  try {
    const warranties = await getJson(`warranties ${vin}`, `${BASE}/vin/${vin}/warranties`);
    const coverage = readCoverage(warranties);
    // The campaign list is only asked for when the warranty record already
    // says a pack was fitted, since that is the only case it can add anything
    // to (which programme did it). Halves the requests this host sees.
    let gfas = null;
    if (coverage?.fromReplacement) {
      await sleep(PACE_MS);
      gfas = await getJson(`gfas ${vin}`, `${BASE}/${vin}/gfas`);
    }
    // checkedAt is bookkeeping and stays in this cache, never in the listing
    // payload — see the note at the top about payload equality.
    cache[vin] = coverage
      ? { coverage, campaign: readCampaign(gfas, coverage), checkedAt: today }
      : { unavailable: true, checkedAt: today };
    if (coverage) ok++;
    else none++;
  } catch (err) {
    // Left uncached so the next run retries it: an error is not an answer.
    console.error(`gm-warranty: ${vin} failed: ${err.message}`);
  }
  if ((i + 1) % 100 === 0) {
    console.error(`gm-warranty: ${i + 1}/${fresh.length}`);
    await writeFile(CACHE, JSON.stringify(cache, null, 1));
  }
  await sleep(PACE_MS);
}

await writeFile(CACHE, JSON.stringify(cache, null, 1));

// Re-inject the whole cache, not just tonight's fetches, so a listing keeps
// its coverage on every run without being asked again.
let applied = 0;
let replaced = 0;
for (const l of listings) {
  const hit = cache[String(l.vin ?? "").toUpperCase()];
  if (!hit?.coverage) continue;
  l.batteryCoverage = hit.coverage;
  if (hit.campaign) l.campaignCheck = hit.campaign;
  applied++;
  if (hit.coverage.fromReplacement) replaced++;
}
await writeFile(LISTINGS, JSON.stringify(listings, null, 1));
console.error(
  `gm-warranty: ${ok} fetched, ${none} with no battery coverage on file; ${applied} listings carry coverage, ${replaced} on a replacement pack`
);
