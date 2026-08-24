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
// 2026-08-22, the check that was missing: this script asked whether each
// shard ANSWERED, never how many cars it answered with. On 2026-08-21 five
// shards served ~9,800 rows each where ~16,700 was right — 34,000 cars
// invisible for most of a day, HTTP 200 throughout, and this script green
// the whole time. Reproduced locally 2026-08-22: with the database returning
// PostgREST 500s the browse route falls back to the committed snapshot in
// web/data/scraped-listings.json, 58,730 rows, which divided across six
// shards is 9,788 each. That is almost certainly what the 9,800 was. So the
// shards' row counts are now checked three ways — against each other,
// against what /api/index/first says the total is, and (as before) against
// what sync-guard last confirmed the database holds.
//
// The sitemaps are checked here too, because as of 2026-08-22 they are no
// longer build artifacts: they render on first request and cache for a day
// (web/app/sitemap/[shard]/route.ts), which took deploys out of the
// database's hands and put the sitemaps into the same
// "what got cached, and was it right?" question the index shards live in.
//
//   node feed-shard-check.mjs [--base https://voltcheck.net]
//
// Exit 0 = every shard answered, with a plausible number of rows in it, and
//          the reported total is plausible.
// Exit 1 = a shard failed to answer, came back short, or the reported total
//          is implausible next to sync-guard's last known-good count.
//
// With FEED_REVALIDATE_SECRET in the environment, a detected problem also
// POSTs /api/revalidate before exiting: a poisoned route cache cannot be
// cleared from inside the render that filled it (web/lib/listings/db.ts's
// escapeFeedCache comment has the measurements), so an outside caller is the
// only thing that can, and this script runs every 6 hours where the day-long
// TTL is the only other way out. It still exits 1 — repairing it is not the
// same as it not having happened.
import { readStatus, recordRun } from "./lib/audit-status.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = (arg("--base", "https://voltcheck.net")).replace(/\/$/, "");
const TOLERANCE = 0.1; // 10% either side of sync-guard's last stable read
// How far the shards' summed row count may sit from the total /api/index/first
// reports. These are seven bodies off the same walk, revalidated together and
// warmed in one pass, so in the healthy case they agree exactly; the slack is
// only for a shard whose day-long TTL rolled over on its own between the two
// reads. The failure this catches is 40%-scale, so 3% is generously wide and
// still nowhere near it.
const SUM_TOLERANCE = 0.03;
// A single shard against the even split. Membership is an FNV-1a hash of the
// car's id, so real shards land within a percent or so of total/SHARDS; 25%
// only fires when a shard is a different vintage from its siblings — the
// 2026-08-21 shape exactly.
const SHARD_BALANCE_TOLERANCE = 0.25;
// Keep in step with web/lib/listings/pack.ts SHARDS (this lane can't import
// TS). 6 → 24 on 2026-08-24: a cold shard render is capped at ~4.5 MB and a
// six-way split of 129k cars was 7.1 MB — pack.ts's comment has the incident.
const SHARDS = Array.from({ length: 24 }, (_, i) => i);

async function fetchText(path, timeoutMs = 60_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

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

// The packed wire format (web/lib/listings/pack.ts): { v, t, h, r } with the
// rows in `r`. The older plain-array and { rows } shapes are still accepted so
// this check can't be the thing that breaks on a format change — but an
// unrecognisable body is a problem, not a zero.
function rowCount(body) {
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body?.r)) return body.r.length;
  if (Array.isArray(body?.rows)) return body.rows.length;
  return null;
}

const shardRows = new Map();
for (const shard of SHARDS) {
  try {
    const body = await fetchJson(`/api/index/${shard}`, 120_000);
    const n = rowCount(body);
    if (n === null) throw new Error("unexpected shape");
    shardRows.set(shard, n);
    console.log(`feed-shard-check: /api/index/${shard} answered — ${n} rows`);
  } catch (e) {
    problems.push(`/api/index/${shard}: ${e.message}`);
  }
}

// The row-count checks. Only run when every shard answered: with one missing
// there is already a problem reported above, and a sum short by one shard's
// worth would just be a second, derived way of saying it.
if (shardRows.size === SHARDS.length) {
  const summed = [...shardRows.values()].reduce((a, b) => a + b, 0);
  if (firstTotal != null && firstTotal > 0) {
    const diff = Math.abs(summed - firstTotal) / firstTotal;
    if (diff > SUM_TOLERANCE) {
      problems.push(
        `the six shards hold ${summed} rows between them but /api/index/first reports ${firstTotal} — ` +
          `${(diff * 100).toFixed(1)}% apart (tolerance ${(SUM_TOLERANCE * 100).toFixed(0)}%). ` +
          `${Math.abs(firstTotal - summed)} cars are missing from what a shopper's browse grid can actually see, ` +
          "with every endpoint answering 200. Shard counts: " +
          SHARDS.map((s) => `${s}=${shardRows.get(s)}`).join(" ")
      );
    } else {
      console.log(`feed-shard-check: shards sum to ${summed} rows, agreeing with /api/index/first's ${firstTotal}`);
    }
  }
  // And the per-shard balance, which catches one stale shard even in the case
  // where the arithmetic happens to come out.
  const even = summed / SHARDS.length;
  if (even > 0) {
    const off = SHARDS.filter((s) => Math.abs(shardRows.get(s) - even) / even > SHARD_BALANCE_TOLERANCE);
    if (off.length) {
      problems.push(
        `shard${off.length > 1 ? "s" : ""} ${off.join(", ")} ${off.length > 1 ? "are" : "is"} more than ` +
          `${(SHARD_BALANCE_TOLERANCE * 100).toFixed(0)}% off the even split (${Math.round(even)} rows each) — ` +
          "membership is a hash of the car's id, so real shards do not diverge like this; this is a shard cached " +
          "from a different feed than its siblings. Shard counts: " +
          SHARDS.map((s) => `${s}=${shardRows.get(s)}`).join(" ")
      );
    }
  }
}

// The sitemaps. They render on first request now (2026-08-22), so "did the
// warm-up actually work" is a live question rather than something the build
// guaranteed. A shard that refuses to publish answers 5xx by design — the
// route will not serve a URL list built from anything but the live feed — so
// a failure here is real, not cosmetic.
//
// WHICH sitemaps, though, is read from robots.txt rather than hardcoded, and
// that is not incidental. The shard count is a property of the DEPLOYED build,
// not of this checkout: on 2026-08-22 the repo moved from three shards to six
// while production was still serving three, and a hardcoded list of six would
// have failed this audit at the next 06:15Z run for a reason that has nothing
// to do with feed health. An audit that cries wolf about its own deploy lag is
// worse than no audit — this workflow's whole premise is that a red run means
// something. robots.txt is served by whatever build is live and is the list we
// actually hand crawlers, so checking exactly it is both deploy-agnostic and a
// better question: are the URLs we are advertising real?
let sitemapUrls = 0;
let robots = "";
try {
  robots = await fetchText("/robots.txt", 30_000);
  if (!robots.trim()) throw new Error("empty body");
  console.log("feed-shard-check: /robots.txt answered");
} catch (e) {
  problems.push(`/robots.txt: ${e.message}`);
}

const advertised = [...robots.matchAll(/^\s*Sitemap:\s*(\S+)/gim)]
  .map((m) => m[1])
  .filter((u) => u.startsWith(BASE))
  .map((u) => u.slice(BASE.length));
if (robots && advertised.length === 0) {
  problems.push("robots.txt advertises no sitemaps — crawlers are being given nothing to index");
}

for (const path of advertised) {
  try {
    const xml = await fetchText(path, 120_000);
    // A <sitemapindex> lists other sitemaps, not pages: verify it is non-empty
    // but keep its <loc>s out of the page-URL total.
    if (/<sitemapindex/i.test(xml)) {
      const n = (xml.match(/<loc>/g) ?? []).length;
      if (n === 0) throw new Error("sitemap index lists no sitemaps");
      console.log(`feed-shard-check: ${path} answered — index of ${n} sitemaps`);
      continue;
    }
    const n = (xml.match(/<loc>/g) ?? []).length;
    if (n === 0) throw new Error("no <loc> entries");
    sitemapUrls += n;
    console.log(`feed-shard-check: ${path} answered — ${n} URLs`);
  } catch (e) {
    problems.push(`${path}: ${e.message}`);
  }
}
// The sitemaps carry a handful of static routes on top of the listings, so
// they should never hold FEWER URLs than there are cars. Fewer means a shard
// published a short feed to a crawler.
if (sitemapUrls > 0 && firstTotal != null && firstTotal > 0 && sitemapUrls < firstTotal * (1 - SUM_TOLERANCE)) {
  problems.push(
    `the sitemaps list ${sitemapUrls} URLs against ${firstTotal} live listings — a crawler is being told about ` +
      `${firstTotal - sitemapUrls} fewer cars than the site has`
  );
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
  await clearPoisonedCache();
  await recordRun("feed-shard-health", { result: "fail", detail: problems.join("; ").slice(0, 300), expectedEveryHours: 8 });
  process.exit(1);
}
await recordRun("feed-shard-health", {
  result: "ok",
  detail: `total ${firstTotal}; shards ${SHARDS.map((s) => shardRows.get(s) ?? "?").join("/")}; sitemap URLs ${sitemapUrls}`,
  expectedEveryHours: 8,
});
process.exit(0);

/** Expire whatever got cached, so the next request rebuilds it instead of the
 *  site sitting on a bad snapshot until its day-long TTL rolls over.
 *
 *  This is the only place that CAN do it. A render cannot expire its own route
 *  cache — Next rejects revalidateTag from inside a force-static render, which
 *  is what both the index shards and the sitemap shards are (measured
 *  2026-08-22; see web/lib/listings/db.ts's escapeFeedCache comment). So the
 *  in-app "escape hatch" is a no-op and this outside POST is the real one.
 *
 *  Best-effort by design: no secret in the environment (a local run, a fork)
 *  means the alarm above still fires and the site heals on its TTL. It never
 *  changes this script's exit code — a repaired incident is still an incident,
 *  and a workflow that went green because it fixed itself would hide exactly
 *  the recurrence a human needs to see. */
async function clearPoisonedCache() {
  const secret = process.env.FEED_REVALIDATE_SECRET;
  if (!secret) {
    console.log("feed-shard-check: FEED_REVALIDATE_SECRET unset — not clearing the cache; it heals on its 24h TTL");
    return;
  }
  try {
    const res = await fetch(`${BASE}/api/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("feed-shard-check: POSTed /api/revalidate to clear the bad cache entries; warming them now");
    for (const path of ["/api/index/first", ...SHARDS.map((s) => `/api/index/${s}`), ...SHARDS.map((s) => `/sitemap/${s}.xml`)]) {
      try {
        await fetchText(path, 300_000);
      } catch (e) {
        console.log(`feed-shard-check: warm of ${path} failed (${e.message}); its first visitor pays the render`);
      }
    }
  } catch (e) {
    console.log(`feed-shard-check: could not clear the cache (${e.message}); it heals on its 24h TTL`);
  }
}
