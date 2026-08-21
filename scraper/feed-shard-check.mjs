#!/usr/bin/env node
// Confirms the production CDN endpoints a shopper's browser actually reads
// (voltcheck.net/api/index/first + the numbered shards) are (a) serving at
// all and (b) reporting a total that roughly matches what sync-guard last
// confirmed straight from the database.
//
// WHY: "the feed shards timed out for shoppers today and only a human
// noticed" (2026-08-21) — nothing was polling the production endpoints
// themselves. And the (b) check exists for the OTHER half of that same
// incident: db-sync can succeed and sync-guard can even pass, but the CDN
// route renders on first request and caches its output for a full day
// (web/lib/listings/db.ts) — if that first render happens to land while a
// write is still in flight, the WRONG snapshot gets cached for a day, and
// nothing about db-sync or sync-guard having succeeded would show it. This
// script is the check for exactly that: does what shoppers are actually
// being served agree with what we know the database holds.
//
// A generous tolerance (TOLERANCE below) is deliberate: sync-guard's
// lastGoodCounts is a snapshot from whenever the last sync ran, and
// recheck's sold-signal (and ordinary organic churn) keeps moving the true
// count in between — this is a sanity check for "is this the same order of
// inventory", not a byte-exact reconciliation.
//
//   node feed-shard-check.mjs [--base https://voltcheck.net]
//
// Exit 0 = every shard answered and the reported total is plausible.
// Exit 1 = a shard failed to answer, or the reported total is implausible
//          next to sync-guard's last known-good count.
import { readStatus, recordRun } from "./lib/audit-status.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = (arg("--base", "https://voltcheck.net")).replace(/\/$/, "");
const TOLERANCE = 0.1; // 10% either side of sync-guard's last stable read

async function fetchJson(path, timeoutMs = 30_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const problems = [];
let firstTotal = null;

try {
  const first = await fetchJson("/api/index/first");
  if (typeof first.total !== "number") throw new Error("no numeric .total in /api/index/first");
  firstTotal = first.total;
  console.log(`feed-shard-check: /api/index/first answered — total ${firstTotal}`);
} catch (e) {
  problems.push(`/api/index/first: ${e.message}`);
}

for (const shard of [0, 1, 2, 3, 4, 5]) {
  try {
    const body = await fetchJson(`/api/index/${shard}`);
    if (!Array.isArray(body) && !Array.isArray(body?.rows)) throw new Error("unexpected shape");
    console.log(`feed-shard-check: /api/index/${shard} answered`);
  } catch (e) {
    problems.push(`/api/index/${shard}: ${e.message}`);
  }
}

if (firstTotal != null) {
  const status = await readStatus();
  const known = status.lastGoodCounts?.total;
  if (typeof known === "number" && known > 0) {
    const diff = Math.abs(firstTotal - known) / known;
    if (diff > TOLERANCE) {
      problems.push(
        `served total ${firstTotal} vs sync-guard's last known-good ${known} — ${(diff * 100).toFixed(1)}% apart ` +
          `(tolerance ${(TOLERANCE * 100).toFixed(0)}%). This is the poisoned-cache shape: a shard rendered and cached ` +
          "a snapshot that disagrees with what the database was last confirmed to hold."
      );
    } else {
      console.log(`feed-shard-check: served total ${firstTotal} agrees with sync-guard's ${known} (${(diff * 100).toFixed(1)}% apart)`);
    }
  } else {
    console.log("feed-shard-check: no prior sync-guard count to compare against yet (first run, or sync-guard hasn't recorded one)");
  }
}

if (problems.length) {
  for (const p of problems) console.error(`::error::feed-shard-check: ${p}`);
  await recordRun("feed-shard-health", { result: "fail", detail: problems.join("; ").slice(0, 300), expectedEveryHours: 8 });
  process.exit(1);
}
await recordRun("feed-shard-health", { result: "ok", detail: `total ${firstTotal}`, expectedEveryHours: 8 });
process.exit(0);
