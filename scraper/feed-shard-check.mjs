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
// A generous tolerance (SHORTFALL_TOLERANCE below) is deliberate: sync-guard's
// lastGoodCounts is a snapshot from whenever the last sync ran, and
// recheck's sold-signal (and ordinary organic churn) keeps moving the true
// count in between — this is a sanity check for "is this the same order of
// inventory", not a byte-exact reconciliation. It is also one-directional and
// refuses to judge a baseline past its own shelf life; both of those are
// 2026-08-24 and both are argued at the constants.
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
//   node feed-shard-check.mjs [--base https://voltcheck.net] [--skip-sitemaps]
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
import { isPlaceholderVin } from "./lib/vin-placeholder.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = (arg("--base", "https://voltcheck.net")).replace(/\/$/, "");
// How far BELOW sync-guard's last stable read the served total may sit. One
// direction only, and that is the fix, not a loosening. Every incident this
// comparison was built for serves FEWER cars than the database holds: 58,730
// standing in for ~100,300 (2026-08-16 and 2026-08-21). Serving MORE than the
// last known-good count is not that shape at all -- it is the database having
// grown since the last sync, which on this project is fast and normal. On
// 2026-08-24 a healthy 130,011-car feed was measured against a 27.8-hour-old
// 103,526 and reported as "the poisoned-cache shape", 25.6% apart, because
// the comparison used Math.abs and could not tell growth from loss.
const SHORTFALL_TOLERANCE = 0.1;
// The one failure shape that serves MORE than the baseline: the first live-DB
// deploy doubled 8,133 cars when shard membership was positional rather than
// keyed on the car's own id (web/app/api/index/[shard]/route.ts). Keyed
// membership retired that, and the shard-balance check above would see a
// lopsided version of it, so this is a backstop for a uniform doubling and is
// set where only a doubling can reach it -- not where ordinary growth can.
const OVERCOUNT_TOLERANCE = 0.9;
// sync-guard's own expectedEveryHours. Past this the baseline is not a
// yardstick any more: a disagreement cannot be told apart from a yardstick
// that stopped moving, and guessing between them is what produced the false
// alarm above. Nothing goes unreported by abstaining -- audit-status-check
// alarms on a stale sync-guard BY NAME, and that is the check which owns the
// question "did sync-guard run?". This one owns "is the served feed right?".
const BASELINE_MAX_AGE_HOURS = 27;
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
// Vercel will not return a cold-rendered response bigger than this, and that
// cap has now bitten twice with nothing warning first. 2026-08-24: six shards
// of 21,585 rows answered 413 CONTENT_TOO_LARGE on a cold render — deployments
// holding a cache entry revalidated fine, fresh ones could not warm at all, so
// the site looked healthy right up until the next deploy. The first anyone
// knew was live-price-audit failing with "shard 1 HTTP 413".
//
// The sitemap lane has warned about its own 50,000-URL cap since it was
// written (web/lib/sitemap.ts). The index lane had no equivalent, so the only
// detector was production. This is that equivalent, and it lives here because
// this script already fetches all 24 bodies — the measurement is free.
//
// Measured, not estimated from the row count: the cap is on the serialised
// response and rows are not uniform (2.65 MB across ~5,480 rows on
// 2026-08-24, but that ratio moves with trim names and photo lists).
const SHARD_BYTES_CAP = 4_500_000;
// Warn with room to act. At 70% a 24-shard feed calls for attention around
// 157,000 cars, against 131,671 live on 2026-08-24 — roughly 19% of growth of
// notice, which is a deliberate raise of SHARDS rather than an incident.
const SHARD_BYTES_WARN_AT = 0.7;
// Keep in step with web/lib/listings/pack.ts SHARDS (this lane can't import
// TS). 6 → 24 on 2026-08-24: a cold shard render is capped at ~4.5 MB and a
// six-way split of 129k cars was 7.1 MB — pack.ts's comment has the incident.
const SHARDS = Array.from({ length: 24 }, (_, i) => i);
// Keep in step with web/lib/sitemap.ts SITEMAP_SHARDS — a separate count from
// the index shards. 6 → 12 on 2026-08-24, for the same ~4.5 MB cold-render
// cap (each sitemap shard measured 3.6 MB at 129k cars). Only the
// cache-clearing warm loop uses this; the sitemap AUDIT reads robots.txt
// instead, deliberately (see the note above it).
const SITEMAP_SHARD_PATHS = Array.from({ length: 12 }, (_, i) => `/sitemap/${i}.xml`);

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

/** Byte size of the body fetchJson last parsed — see SHARD_BYTES_CAP. */
let lastBodyBytes = 0;

async function fetchJson(path, timeoutMs = 30_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Read as text and measure it, rather than trusting content-length, which
    // is absent on a chunked response and wrong on a compressed one. The
    // parse is what .json() would have done anyway.
    const text = await res.text();
    lastBodyBytes = Buffer.byteLength(text);
    return JSON.parse(text);
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

// The rows' own ids, for the placeholder scan below. Same three accepted
// shapes as rowCount, and the same reason: this check must not be the thing
// that breaks on a wire-format change.
function shardIds(body) {
  const rows = Array.isArray(body) ? body : body?.r ?? body?.rows;
  return Array.isArray(rows) ? rows.map((r) => r?.i ?? r?.id).filter(Boolean) : [];
}

const shardRows = new Map();
const shardBytes = new Map();
// A "VIN" that is a dealer's inventory-system placeholder — 0N0RDER3333333857
// and four like it were live on 2026-09-02, each with its own listing page and
// sitemap entry, for cars that have not been built. ingest.mjs drops them now
// (lib/vin-placeholder.mjs), so this is the standing check that the next DMS
// with a spelling nobody has seen doesn't quietly repeat it. The shard bodies
// are already downloaded and parsed here, so it costs nothing.
const placeholders = [];
for (const shard of SHARDS) {
  try {
    const body = await fetchJson(`/api/index/${shard}`, 120_000);
    const n = rowCount(body);
    if (n === null) throw new Error("unexpected shape");
    shardRows.set(shard, n);
    shardBytes.set(shard, lastBodyBytes);
    for (const id of shardIds(body)) if (isPlaceholderVin(id)) placeholders.push(id);
    console.log(`feed-shard-check: /api/index/${shard} answered — ${n} rows, ${(lastBodyBytes / 1e6).toFixed(2)} MB`);
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
        `the ${SHARDS.length} shards hold ${summed} rows between them but /api/index/first reports ${firstTotal} — ` +
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
// --skip-sitemaps: check the INDEX lane only. For the callers that run before
// the sitemaps have been warmed, which since 2026-08-28 is every caller inside
// nightly.yml except publish-feed's own.
//
// The sitemaps are the one surface with no artifact lane — they still render
// off a full feed walk — and publish-feed is now what warms them, as the last
// job in the night. nightly.yml's earlier checks therefore meet sitemaps from
// the PREVIOUS publish while `first` already answers from the new artifact,
// and comparing the two generations is not a health question, it is a clock
// question. Measured on the 2026-08-28 nightly: 135,753 sitemap URLs against
// 147,610 live listings, reported as "a crawler is being told about 11,857
// fewer cars than the site has". Nothing was wrong — an hour later, once
// publish-feed had warmed them, the same twelve shards held 144,232 URLs
// against 144,211 live listings. A check that fires every night on a
// generation gap is the same false alarm this file exists to prevent, so the
// sitemap half now runs where the sitemaps are actually fresh.
const SKIP_SITEMAPS = process.argv.includes("--skip-sitemaps");

let sitemapUrls = 0;
let robots = "";
if (SKIP_SITEMAPS) {
  console.log("feed-shard-check: --skip-sitemaps — index lane only (publish-feed checks the sitemaps once it has warmed them)");
}
try {
  if (!SKIP_SITEMAPS) {
    robots = await fetchText("/robots.txt", 30_000);
    if (!robots.trim()) throw new Error("empty body");
    console.log("feed-shard-check: /robots.txt answered");
  }
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
  const at = Date.parse(status.lastGoodCounts?.at ?? "");
  const ageHours = Number.isFinite(at) ? (Date.now() - at) / 3_600_000 : Infinity;
  if (!(typeof known === "number" && known > 0)) {
    console.log("feed-shard-check: no prior sync-guard count to compare against yet (first run, or sync-guard hasn't recorded one)");
  } else if (ageHours > BASELINE_MAX_AGE_HOURS) {
    // Deliberately not a problem: see BASELINE_MAX_AGE_HOURS. Failing here
    // would report a stopped pipeline as a bad feed, and -- because a problem
    // calls clearPoisonedCache() -- would dump and re-render the whole browse
    // cache every six hours to "repair" a feed that was never wrong.
    console.log(
      `feed-shard-check: NOT judging served total ${firstTotal} against sync-guard's ${known} — that baseline is ` +
        `${ageHours.toFixed(0)}h old (max ${BASELINE_MAX_AGE_HOURS}h). A gap this could show would be indistinguishable ` +
        "from a yardstick that stopped moving. audit-status-check owns whether sync-guard is still running."
    );
  } else if (firstTotal < known * (1 - SHORTFALL_TOLERANCE)) {
    const short = (100 * (known - firstTotal)) / known;
    problems.push(
      `served total ${firstTotal} is ${short.toFixed(1)}% SHORT of sync-guard's last known-good ${known} ` +
        `(tolerance ${(SHORTFALL_TOLERANCE * 100).toFixed(0)}%), measured ${ageHours.toFixed(0)}h ago. This is the ` +
        "poisoned-cache shape: a shard rendered and cached a snapshot thinner than what the database was last " +
        "confirmed to hold."
    );
  } else if (firstTotal > known * (1 + OVERCOUNT_TOLERANCE)) {
    problems.push(
      `served total ${firstTotal} is ${((100 * (firstTotal - known)) / known).toFixed(1)}% ABOVE sync-guard's last ` +
        `known-good ${known} from ${ageHours.toFixed(0)}h ago — too far to be growth. The shape that does this is ` +
        "cars served twice (see the shard route's note on positional membership)."
    );
  } else {
    const d = (100 * (firstTotal - known)) / known;
    console.log(
      `feed-shard-check: served total ${firstTotal} sits ${d >= 0 ? "+" : ""}${d.toFixed(1)}% against sync-guard's ` +
        `${known} from ${ageHours.toFixed(0)}h ago — within tolerance`
    );
  }
}

// Payload headroom. Ordered before the tail so a shard that is over the cap
// joins `problems` and a shard merely approaching it does not.
const warnings = [];
if (shardBytes.size) {
  const [biggest, bytes] = [...shardBytes.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
  const pct = (100 * bytes) / SHARD_BYTES_CAP;
  if (bytes > SHARD_BYTES_CAP) {
    problems.push(
      `shard ${biggest} is ${(bytes / 1e6).toFixed(2)} MB, past the ${(SHARD_BYTES_CAP / 1e6).toFixed(1)} MB ` +
        "cold-render cap. It is still being SERVED because its cache entry already exists — but no fresh " +
        "deployment can warm it, so the next deploy ships a browse grid that 413s. Raise SHARDS in " +
        "web/lib/listings/pack.ts and every consumer that keeps step with it (this file, live-price-audit.mjs, " +
        "the warm loops in nightly.yml and refresh-site.yml)."
    );
  } else if (bytes > SHARD_BYTES_CAP * SHARD_BYTES_WARN_AT) {
    warnings.push(
      `the largest shard (${biggest}) is ${(bytes / 1e6).toFixed(2)} MB — ${pct.toFixed(0)}% of the ` +
        `${(SHARD_BYTES_CAP / 1e6).toFixed(1)} MB cold-render cap. Raise SHARDS in web/lib/listings/pack.ts ` +
        "(and its keep-in-step consumers) before it gets there; past the cap, fresh deployments cannot warm " +
        "the browse grid at all."
    );
  } else {
    console.log(
      `feed-shard-check: largest shard ${biggest} is ${(bytes / 1e6).toFixed(2)} MB, ${pct.toFixed(0)}% of the ` +
        `${(SHARD_BYTES_CAP / 1e6).toFixed(1)} MB cold-render cap`
    );
  }
}
// Deliberately a warning and not a problem, despite being a false claim on a
// live page: the `problems` path calls clearPoisonedCache(), and re-rendering
// the route would serve the same row back. The cache is not what is wrong. The
// fix is upstream and by hand — decide the VINs are placeholders, then
// retire-listings.mjs (migration 0043) takes them out.
if (placeholders.length) {
  warnings.push(
    `${placeholders.length} listing(s) in the browse feed carry a VIN that is an inventory-system ` +
      "placeholder rather than a VIN, so the site is describing a specific car, at a specific dealer, " +
      "for a specific price, that does not exist: " +
      placeholders.slice(0, 10).join(", ") +
      (placeholders.length > 10 ? ` (+${placeholders.length - 10} more)` : "") +
      ". ingest.mjs already refuses these, so a row here is either older than that filter or a spelling " +
      "lib/vin-placeholder.mjs does not know. Retire them with retire-listings.mjs, and add the spelling."
  );
}
for (const w of warnings) console.error(`::warning::feed-shard-check: ${w}`);

if (problems.length) {
  for (const p of problems) console.error(`::error::feed-shard-check: ${p}`);
  await clearPoisonedCache();
  await recordRun("feed-shard-health", { result: "fail", detail: problems.join("; ").slice(0, 300), expectedEveryHours: 8 });
  process.exit(1);
}
await recordRun("feed-shard-health", {
  // A warning is recorded as one. The job stays green — "raise SHARDS soon" is
  // not an incident — but it must not read as an unqualified ok in the file a
  // human checks to see whether anything needs doing.
  result: warnings.length ? "warn" : "ok",
  detail:
    `total ${firstTotal}; shards ${SHARDS.map((s) => shardRows.get(s) ?? "?").join("/")}; sitemap URLs ${sitemapUrls}` +
    (warnings.length ? `; ${warnings.join("; ")}` : ""),
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
  // Repair only against a database that can actually serve the re-render.
  // 2026-08-25: this function used to fire unconditionally, which meant a
  // problem CAUSED by a sick database (dead shards from a half-finished warm)
  // triggered a global expiry plus a 36-path re-warm against that same sick
  // database — a repair that cannot succeed, and whose cost is not zero: the
  // warm loop is ~8 full feed walks' worth of renders (measured that day,
  // when exactly such a burst re-drained the instance's disk IO budget
  // minutes after it had recovered). Expiring is also not free for GOOD
  // entries: they survive as stale-while-revalidate (the throw-retains
  // semantics in web/app/api/index/[shard]/route.ts), but every later request
  // then queues another doomed render behind them. So: same gate the warm
  // paths in refresh-site.yml and nightly.yml apply — the count answers and a
  // fat feed page clears 1.5 s — and if the database is not up to it, skip
  // the repair and say so. Nothing goes unreported by skipping: this
  // function's caller still exits 1, so the run is red either way, and the
  // cache heals on its TTL or the next healthy run's repair.
  const gate = await dbCanServeAWalk();
  if (!gate.ok) {
    console.log(
      `feed-shard-check: NOT clearing the cache — the database cannot serve the re-render (${gate.why}). ` +
        "Expiring now would convert bad shards into a repair that cannot succeed; the alarm above still fires."
    );
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
    for (const path of ["/api/index/first", ...SHARDS.map((s) => `/api/index/${s}`), ...SITEMAP_SHARD_PATHS]) {
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

/** The same two readings refresh-site.yml's "Can the database serve a walk?"
 *  step takes, because they earn their keep the same way: the count proves
 *  PostgREST is answering at all, and a FAT feed page (db.ts's own column
 *  list — a thin select can be served from an index on a box the real walk
 *  dies on) under the nightly's 1.5 s ceiling proves it can move real pages.
 *  Credentials absent counts as "cannot": an unverifiable database is not a
 *  safe target for a 36-path re-render, and the no-repair path already
 *  reports loudly. */
async function dbCanServeAWalk() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, why: "no SUPABASE_URL/SUPABASE_ANON_KEY in the environment" };
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const count = await fetch(`${url}/rest/v1/listings?select=vin&delisted_at=is.null`, {
      headers: { ...headers, Range: "0-0", Prefer: "count=exact" },
      signal: AbortSignal.timeout(20_000),
    });
    if (count.status !== 200 && count.status !== 206) return { ok: false, why: `count answered HTTP ${count.status}` };
    const sel = "vin,payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at,buyback_disclosed,listed_on";
    const t0 = Date.now();
    const page = await fetch(
      `${url}/rest/v1/live_listings_feed?select=${sel}&order=vin.asc&limit=500&vin=gte.W`,
      { headers, signal: AbortSignal.timeout(20_000) }
    );
    await page.arrayBuffer();
    const secs = (Date.now() - t0) / 1000;
    if (page.status !== 200 || secs > 1.5) {
      return { ok: false, why: `fat feed page answered HTTP ${page.status} in ${secs.toFixed(2)}s (ceiling 1.5s)` };
    }
    return { ok: true, why: `count ok, fat page ${secs.toFixed(2)}s` };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}
