#!/usr/bin/env node
// Rebuilds web/data/scraped-listings.json — the snapshot the site serves when
// Supabase cannot answer — from a full walk of live_listings_feed.
//
//   node refresh-fallback.mjs                     # walk, check, write
//   node refresh-fallback.mjs --dry-run           # walk, check, write NOTHING
//   node refresh-fallback.mjs --out /tmp/x.json   # write there, not to the snapshot
//   FEED_LANES=2 node refresh-fallback.mjs        # the gentle walk, for a busy box
//
// Exit 0 = a snapshot was written (or, under --dry-run, would have been).
// Exit 1 = it refused. The snapshot on disk is untouched, which is always the
//          safe half of this script's decision: a stale fallback is a known
//          quantity, and a wrong one is the 2026-08-16 / 2026-08-21 incident.
//
// WHY THIS EXISTS
//
// Only a WHOLE-FLEET run may write that file. ingest.mjs rewrites it with
// whatever it just processed, so nightly.yml owned it by being the only thing
// that ever crawled everything at once, and rolling-crawl.yml refuses to touch
// it for exactly that reason (its own header says so: a slice's copy would
// shrink the fallback to ~2,000 cars). Now that the whole-fleet crawl is coming
// out of nightly.yml, the file has no owner at all — and it was already three
// days stale and 42% short when this was written: 58,730 rows committed on
// 2026-08-19 against a live feed of 100,446. 58,730 is not an anonymous number
// in this repo. It is the figure in CLAUDE.md, in db.ts's catch, in the index
// route's refusal and in feed-shard-check.mjs, because that snapshot divided
// across six shards is the ~9,788 rows/shard that hid 34,000 cars for most of
// 2026-08-21.
//
// So the snapshot needs a producer that does not depend on anybody crawling the
// whole world in one night. The database already holds exactly that: the same
// rows, already deduplicated, already delisted, already enriched.
//
// WHY NOT THE CDN, WHICH IS FREE
//
// CLAUDE.md says "don't point full-feed scripts at Supabase when
// voltcheck.net/api/index/0-5 already serve the same rows off Vercel's CDN for
// free," and that rule is right — but it does not reach this file, because the
// shards do NOT serve the same rows. They serve a display projection.
// /api/index/[shard] returns packIndex(CardRow[]) (web/lib/listings/pack.ts):
// the browse grid's precomputed card, which is a different type from Listing
// and is deliberately narrow — "70k+ of these ship to every first-time visitor
// … a field added here costs 71,000 copies on the wire" (card.ts).
//
// Measured, not assumed. The union of row keys over all 16,716 rows of the
// live /api/index/0 on 2026-08-22 was:
//
//   am as b bb c cd ct d f g hp i k kw l lo m n o p q rm st tr ts y
//
// Mapped back through pack.ts that is: id, year, make, model, title, price,
// mileage, condition, drive, body, city, state, lat/lon, image, trim, kwh,
// range, heat pump, listedOn, the two price-comparison claims and the fact
// chips. What the fallback's consumers need and that list does not contain:
//
//   sourceUrl      the link to the dealer's own page — on every one of the
//                  58,730 rows in today's snapshot, and rendered by
//                  app/listing/[id]/page.tsx
//   dealerDomain   also 100% present today; source.ts's absolutizeImages()
//                  resolves root-relative photo paths against it
//   dealerName     93.9%
//   sellerType     100%, and the detail page renders it
//   vin            100% (id is its lowercase form, so the VIN itself survives —
//                  but nothing else on this list does)
//   zip            72.5%, and it is what the distance filter is built on
//   exteriorColor  99.9%   interiorColor 54.4%   stockNumber 36.6%
//   images         11.5% (the gallery)          previousOwners, photoChecks
//   vpicBatteryKwh 18.1% — the version discriminator the enrichment layer
//                  reads; the shard carries the ANSWER (kwh) but not the input,
//                  so rebuilding a card from a rebuilt Listing cannot reproduce
//                  it
//   optionCodes, trimSuspect, campaignCheck/batteryCoverage detail
//
// Expanding the packed form into Listing[] would therefore publish a detail
// page with no dealer, no link, no gallery, no colours and no distance — and
// it would do it silently, with every row present and every request 200. That
// is the exact failure shape this file's history is made of, so the answer is
// the house rule's: matching nothing is honest, matching the wrong thing is
// not. The CDN is not a source for this file.
//
// (The narrowing is also, separately, no longer even useful for the browse
// grid: since 049f41b /api/index/[shard] THROWS rather than serving a fallback
// read, so the snapshot's remaining production job is the listing detail page
// during an outage — findInSnapshot() in source.ts — which is the fattest
// consumer of the three, not the thinnest.)
//
// WHAT IT COSTS, AND WHY THAT IS AFFORDABLE ONCE A WEEK
//
// A full walk is ~231 requests, ~122 MB decompressed and ~27 MB on the wire
// (measured 2026-08-22, refresh-site.yml's header carries the arithmetic).
// Weekly that is ~117 MB/month against the 5 GB free egress quota — about 2%.
// Daily would be ~0.8 GB/month, which is a fifth of the quota spent making a
// FALLBACK fresher, and the fallback is by definition not what anyone is
// reading when things work. The site's own freshness is refresh-site.yml's job
// and runs twice a day; this is the copy of last resort.
//
// The other reason for weekly is that the result is a blob in git, and GitHub
// blocks a push containing any file over 100 MB. That was a live collision
// course while the file was plain JSON: at 727 bytes a row it reached the
// ceiling at ~144,000 cars, and coverage is the mission. It is now written as a
// gzip+base64 envelope (lib/snapshot.mjs), 97 bytes a row — 9.3 MB at the live
// feed's 100,446 rows instead of 70 MB, with the ceiling out at ~1,083,000
// cars. See SIZE_WARN_BYTES / SIZE_REFUSE_BYTES below: this script now refuses
// to write a file git could not push, so the ceiling stays a decision made here
// rather than a rejected push in some unrelated workflow days later.
//
// WHAT IT WRITES, AND WHAT IT DELIBERATELY LEAVES OUT
//
// The `payload` column and nothing else — the same object ingest.mjs writes, so
// every existing reader (recheck.mjs's OEM cross-check, price-audit.mjs,
// nhtsa-battery.mjs, supabase/verify.mjs, web/tests/find-listing.test.ts) sees
// the shape it already expects. The rows are unchanged by compression: the
// envelope is a container, not a projection, and encodeSnapshot round-trips
// them before returning. Narrowing the shape was considered and measured — the
// honest saving is 3% (only `id` is redundant, being vin.toLowerCase() on every
// row), and anything bigger means deleting a field a shopper sees on the detail
// page. lib/snapshot.mjs's header carries that table and the rejected options.
//
// It does NOT add the history columns db.ts layers on top of payload
// (firstSeenAt, lastSeenAt, prevPriceUsd, priceChangedAt, buybackDisclosed,
// brandedTitleDisclosed, listedOn), even though that would make the snapshot a closer copy of what
// fetchListingsFromDb() returns, and that refusal is load-bearing: db-sync.mjs
// reads THIS PATH and pushes it back into listings.payload. firstSeenAt and
// lastSeenAt move on their own every night, so putting them in the payload
// would break migration 0025's invariant that payload-equal implies row-equal —
// every row's payload would differ every night and the sync would go back to
// rewriting the whole table nightly, which is the write amplification 0025 and
// 0042 were built to end. Keeping the file byte-shaped like ingest's output
// means the worst a stray db-sync can do with it is re-push rows the database
// already has. (The cost is that days-on-lot goes quiet on the detail page
// during an outage. Going quiet is the correct failure here, and the historical
// snapshot never carried those fields either, so nothing regresses.)
//
// Rows come out VIN-ascending, which the walk gives for free. ingest.mjs wrote
// them in crawl order, so the first run after this lands is one enormous diff
// and every run after it is a small one.
//
// WHAT IT REFUSES TO DO
//
//   * Run against a db.ts whose walk shape has moved. Same assertion
//     walk-gate.mjs makes, for the same reason: a snapshot built from a
//     different query than the site's is not a copy of the site's feed.
//   * Write a walk that came back short of the count the database itself
//     reports. This is the silent short read — every request 200, the cars
//     simply not there (2026-08-21) — and it is undetectable without the count.
//   * Write a snapshot more than SHRINK_TOLERANCE smaller than the one it
//     replaces. A snapshot that silently shrinks is the incident this file has
//     caused twice; --force overrides, loudly, for the day inventory genuinely
//     falls off a cliff.
//   * Write anything if any bucket errored, or if any row lacks id/vin.
//
// It does NOT refuse on the CDN cross-check, and that is deliberate rather than
// an omission. The check is here (CDN_TOLERANCE) because it is one cheap
// request and it is worth knowing, but it is advisory: the walk has already
// been validated against the database's own exact count, so when the two
// disagree the thing that is wrong is the CDN — a cache up to a day stale, or
// poisoned. Refusing then would block a correct snapshot because a different
// system is sick. The authority on the CDN's own consistency is
// feed-shard-check.mjs, which compares all six shards against /api/index/first
// and POSTs /api/revalidate when they disagree, and which already runs every
// six hours in feed-audits.yml. Duplicating it here would give it a second,
// weaker home.
import { readFile, writeFile, stat } from "node:fs/promises";
import { encodeSnapshot, decodeSnapshot } from "./lib/snapshot.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const SNAPSHOT = new URL("../web/data/scraped-listings.json", import.meta.url);
const OUT = arg("--out", null);
const CDN_BASE = arg("--base", "https://voltcheck.net").replace(/\/$/, "");

// Wrapped, because NO .env FILE IS A SUPPORTED STATE — it is the normal state
// on CI, where the workflow supplies SUPABASE_URL and SUPABASE_ANON_KEY as step
// env instead. An unguarded readFile of scraper/.env is what took down both the
// completeness audit and the EV-rules audit the first time they ran in CI
// (aa0abff).
try {
  for (const line of (await readFile(new URL("./.env", import.meta.url), "utf-8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON } = process.env;
if (!SUPABASE_URL || !ANON) {
  // Not the "inconclusive, exit 0" the report-only audits answer with. Silence
  // here would leave the old snapshot in place while the workflow went green,
  // which is how a file goes three days stale without anyone noticing — the
  // thing this script was written for.
  console.error("refresh-fallback: no SUPABASE_URL / SUPABASE_ANON_KEY — cannot walk the feed, so refusing to claim a refresh.");
  process.exit(1);
}
const BASE = SUPABASE_URL.replace(/\/$/, "");

// The anon key on purpose: PostgREST puts a short statement timeout on anon
// that a management-API or psql session does not have, and the site reads as
// anon. A snapshot the site's own credentials could not have fetched is not a
// copy of what the site serves.
const H = { apikey: ANON, authorization: `Bearer ${ANON}`, "accept-encoding": "gzip" };

// db.ts's shape. Verified against it at startup rather than copied and hoped
// over — see assertSameShapeAsDb().
const PAGE = 500;
const BUCKETS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SELECT = "vin,payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at,buyback_disclosed,branded_title_disclosed,listed_on";
const LANES = Math.max(1, Number(process.env.FEED_LANES) || 8);
const FEED_URL = `${BASE}/rest/v1/live_listings_feed?select=${SELECT}&order=vin.asc&limit=${PAGE}`;

// How short is too short against the count taken seconds earlier. walk-gate's
// number and walk-gate's reasoning, not sync-guard's percentages: those are
// calibrated for night-over-night churn, and 8% of this feed is ~8,000 cars —
// wide enough to pass the very incident this guard exists for. 50 rows absorbs
// what can genuinely change while a walk runs and still fails a real short read
// by three orders of magnitude.
const SHORT_READ_SLACK_ROWS = 50;

// How much smaller than its predecessor a snapshot may be. Wider than
// sync-guard's 8%/15% because this file is refreshed WEEKLY, so a week of
// ordinary churn (measured at 1.0-2.4% a night, mostly offsetting) sits under
// it, and far below the 42% and 32% drops that are what an incident actually
// looks like here.
const SHRINK_TOLERANCE = 0.10;

// The CDN cross-check's slack. Generous because /api/index/first is cached a
// full day and refreshed twice (refresh-site.yml), so it legitimately lags the
// database. Advisory only — see the header.
const CDN_TOLERANCE = 0.10;

// GitHub refuses any push containing a file over 100 MB — a hard block, not a
// warning — and this file is committed. That used to be a live collision
// course: at 727 bytes a row compact the snapshot hit the ceiling at ~144,000
// cars, and coverage is the mission, so the number only goes up.
//
// It is now written as a gzip+base64 envelope (lib/snapshot.mjs, which carries
// the measurements and why the alternatives were rejected). At 97 bytes a row
// the ceiling moved to roughly 1,083,000 cars, past any plausible US EV+PHEV
// inventory. These two guards are what keep it that way if something regresses
// — a codec change, a payload that stops compressing, a field that arrives
// carrying per-row entropy.
//
// The REFUSAL is the point, and it is what "a decision, not a red push" means
// concretely: the script declines to write a file git could not push, says the
// arithmetic, and leaves the previous snapshot in place. A `git push` rejected
// with GH001 in some other workflow, days later, is the failure mode this
// avoids — it is remote from the cause, it blocks whatever else that push was
// carrying, and there is nothing useful to do about it at that point. 90 MB
// leaves room under the limit for the commit that carries it.
const SIZE_WARN_BYTES = 60 * 1024 * 1024;
const SIZE_REFUSE_BYTES = 90 * 1024 * 1024;
const GITHUB_FILE_LIMIT = 100 * 1024 * 1024;

/** This script's whole claim is "these are the rows the site would have read".
 *  Nothing else makes that true: db.ts is TypeScript in web/ and this is .mjs
 *  in scraper/, a lane boundary the repo otherwise keeps clean, so they cannot
 *  share a module without crossing it. Read db.ts, extract its shape, fail hard
 *  on any difference. Unreadable counts as a difference. (walk-gate.mjs carries
 *  its own copy of this check for its own copy of the walk; both are pinned to
 *  db.ts, so neither can drift from the site without failing loudly, which is
 *  what actually matters — they cannot drift from each other while both agree
 *  with the one file that decides.) */
async function assertSameShapeAsDb() {
  let src;
  try {
    src = await readFile(new URL("../web/lib/listings/db.ts", import.meta.url), "utf-8");
  } catch (err) {
    return [`cannot read web/lib/listings/db.ts (${err.code ?? err.message}) — cannot confirm this walk matches the site's`];
  }
  const found = {
    select: src.match(/live_listings_feed\?select=([^&`]+)/)?.[1],
    page: src.match(/^const PAGE = (\d+);/m)?.[1],
    buckets: src.match(/^const BUCKETS = "([^"]+)"/m)?.[1],
  };
  const mine = { select: SELECT, page: String(PAGE), buckets: BUCKETS.join("") };
  const drift = [];
  for (const [k, v] of Object.entries(found)) {
    if (v === undefined) drift.push(`could not find db.ts's ${k} — its shape moved, so this walk can no longer be shown to mirror the site's`);
    else if (v !== mine[k]) drift.push(`${k} has drifted from db.ts.\n    db.ts:            ${v}\n    refresh-fallback: ${mine[k]}`);
  }
  return drift;
}

// db.ts's retry ladder, for the reason it has one: across ~231 requests a lone
// 5xx is weather, not an outage.
const RETRY_DELAYS_MS = [2000, 6000];
async function fetchWithRetry(url, init) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500 || attempt >= RETRY_DELAYS_MS.length) return res;
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}

/** The expected count, so a walk that "succeeds" while quietly returning half
 *  the feed still fails. db.ts's shape exactly: the `listings` TABLE rather
 *  than the view (the view's price-history join costs the whole aggregation to
 *  produce one integer), carrying the view's own `delisted_at is null` so the
 *  number is the same by construction. Range 0-0 and NO `limit`: a `limit`
 *  alongside the Range makes PostgREST answer without a content-range total,
 *  which silently disables the whole check. */
async function liveCount() {
  const res = await fetchWithRetry(`${BASE}/rest/v1/listings?select=vin&delisted_at=is.null`, {
    headers: { ...H, range: "0-0", prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}`);
  const n = Number(res.headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(n)) throw new Error("no content-range total");
  return n;
}

/** How many rows the snapshot currently on disk holds, or null if there isn't
 *  one. Parsed and released before the walk starts: both copies in memory at
 *  once is ~200 MB of objects for nothing. */
async function previousRowCount() {
  try {
    // decodeSnapshot, not JSON.parse: since 2026-08-22 the file on disk is a
    // gzip+base64 envelope, and a bare parse sees an object where it expects
    // an array. The decoder accepts the legacy plain array too, and validates
    // the envelope's own row count, so truncation still fails loudly here.
    const rows = decodeSnapshot(await readFile(SNAPSHOT, "utf-8"));
    return rows.length;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`the snapshot on disk is unreadable (${err.message}) — refusing to replace what cannot be compared`);
  }
}

const problems = [];

const drift = await assertSameShapeAsDb();
if (drift.length) {
  for (const d of drift) console.error(`refresh-fallback: ${d}`);
  console.error("refresh-fallback: refusing to build a snapshot from a walk that may not be the site's. Fix the drift above, then re-run.");
  process.exit(1);
}

let previous = null;
try {
  previous = await previousRowCount();
  console.error(previous === null
    ? "refresh-fallback: no snapshot on disk yet — the shrink guard has nothing to compare against this run"
    : `refresh-fallback: the snapshot on disk holds ${previous} rows`);
} catch (e) {
  console.error(`refresh-fallback: ${e.message}`);
  process.exit(1);
}

const t0 = Date.now();
let expected = null;
try {
  expected = await liveCount();
  console.error(`refresh-fallback: database reports ${expected} live listings; walking them in ${LANES} lane${LANES === 1 ? "" : "s"}`);
} catch (e) {
  // db.ts treats its own count failure as non-fatal — fresh-but-unchecked beats
  // provably stale for a render that has to answer something. This has no such
  // obligation and takes the opposite side: without the count, "the walk
  // finished" only means no request errored, and the incident this exists for
  // was a walk where none did.
  problems.push(`could not read the live count (${e.message}) — a short read cannot be detected without it`);
}

// Each bucket is [lo, hi), and the LAST one deliberately has no upper bound so
// the tail beyond "Z" is walked rather than dropped. Rows are collected per
// bucket and concatenated in bucket order at the end, which is VIN-ascending by
// construction — the lanes finish out of order, the file must not.
const collected = new Array(BUCKETS.length).fill(null).map(() => []);
const queue = BUCKETS.map((c, i) => [i, c, BUCKETS[i + 1]]);
let qi = 0;
let pages = 0;
let bytes = 0;
let errors = 0;
async function lane() {
  while (qi < queue.length) {
    const [idx, lo, hi] = queue[qi++];
    const range = `&vin=gte.${lo}` + (hi ? `&vin=lt.${hi}` : "");
    let after = "";
    const out = collected[idx];
    for (;;) {
      let res;
      try {
        res = await fetchWithRetry(`${FEED_URL}${range}${after ? `&vin=gt.${after}` : ""}`, { headers: H });
      } catch (err) {
        errors++;
        problems.push(`bucket ${lo}: ${err.message} after ${out.length} rows`);
        break;
      }
      pages++;
      if (!res.ok) {
        errors++;
        problems.push(`bucket ${lo}: HTTP ${res.status} after ${out.length} rows`);
        break;
      }
      const text = await res.text();
      bytes += text.length;
      let rows;
      try {
        rows = JSON.parse(text);
      } catch {
        errors++;
        problems.push(`bucket ${lo}: unparseable body after ${out.length} rows`);
        break;
      }
      if (!Array.isArray(rows)) {
        errors++;
        problems.push(`bucket ${lo}: PostgREST returned ${text.slice(0, 120)}`);
        break;
      }
      // Only the payload is kept — see the header on why the history columns
      // are deliberately left behind.
      for (const r of rows) out.push(r.payload);
      if (rows.length < PAGE) break;
      after = rows[rows.length - 1].vin;
    }
    process.stderr.write(errors ? "!" : ".");
  }
}
await Promise.all(Array.from({ length: LANES }, () => lane()));
process.stderr.write("\n");
const listings = collected.flat();
const seconds = Number(((Date.now() - t0) / 1000).toFixed(1));

if (expected !== null && listings.length < expected - SHORT_READ_SLACK_ROWS) {
  problems.push(
    `the walk returned ${listings.length} rows against the ${expected} the database says are live — ` +
      `${expected - listings.length} missing. Every request answered; the cars simply were not there. ` +
      "This is the silent short read, or a read that landed mid-write."
  );
}

// Every row must be identifiable, because both of the snapshot's own consumers
// look rows up by one of these: source.ts's findInSnapshot() matches on `id`,
// and web/tests/find-listing.test.ts asserts every id is VIN-shaped. Control
// test on the file this replaces, 2026-08-22: 58,730 of 58,730 carry both, and
// id === vin.toLowerCase() on every one — zero exceptions — so a row without
// them is a defect, not a shape this pipeline has ever produced.
const unidentifiable = listings.filter((l) => !l?.id || !l?.vin).length;
if (unidentifiable) {
  problems.push(`${unidentifiable} row(s) came back with no id or no vin — the snapshot is looked up by both, so a row without them can never be served`);
}

if (previous !== null && listings.length < previous * (1 - SHRINK_TOLERANCE)) {
  const drop = ((previous - listings.length) / previous) * 100;
  const msg =
    `the walk holds ${listings.length} rows where the snapshot on disk holds ${previous} — ` +
    `${drop.toFixed(1)}% smaller (tolerance ${(SHRINK_TOLERANCE * 100).toFixed(0)}%). ` +
    "A snapshot that silently shrinks is what hid 34,000 cars for a day, twice.";
  if (FORCE) console.error(`::warning::refresh-fallback: ${msg} --force given, writing it anyway.`);
  else problems.push(`${msg} Re-run with --force if inventory really fell this far.`);
}

// Advisory, never fatal — see the header for why the site's own cache does not
// get a vote on a walk the database has already confirmed.
try {
  const res = await fetch(`${CDN_BASE}/api/index/first`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = (await res.json())?.total;
  if (typeof total !== "number") throw new Error("no numeric .total");
  const diff = Math.abs(listings.length - total) / total;
  if (total > 0 && diff > CDN_TOLERANCE) {
    console.error(
      `::warning::refresh-fallback: the walk holds ${listings.length} rows but ${CDN_BASE}/api/index/first reports ${total} — ` +
        `${(diff * 100).toFixed(1)}% apart. The walk agreed with the database's own count, so this is the SITE's cache ` +
        "disagreeing, not the snapshot: it is stale, or poisoned. feed-shard-check.mjs is the check that decides which."
    );
  } else {
    console.error(`refresh-fallback: ${CDN_BASE}/api/index/first reports ${total}, agreeing with the walk's ${listings.length}`);
  }
} catch (e) {
  console.error(`refresh-fallback: could not cross-check against ${CDN_BASE}/api/index/first (${e.message}) — advisory only, carrying on`);
}

// The compressed envelope, via the codec every reader shares. It round-trips
// the rows before returning, so a codec that would have written an
// undecodable snapshot throws here rather than at 3am on the outage path.
//
// Serialised even under --dry-run: a dry run whose reported size is an
// estimate is a dry run that cannot tell you the thing the size guards below
// are for, and the encode costs about a second.
const body = encodeSnapshot(listings);
const size = Buffer.byteLength(body);
const rawSize = Buffer.byteLength(JSON.stringify(listings));
const perRow = size / Math.max(1, listings.length);
const ceiling = Math.floor(GITHUB_FILE_LIMIT / perRow);

// The arithmetic, every run, not only near the edge — this is the number that
// decides when this file needs a decision again, and it should be readable in
// a green run's log rather than reconstructed from an incident.
console.error(
  `refresh-fallback: ${(size / 1048576).toFixed(1)} MB on disk holding ${(rawSize / 1048576).toFixed(1)} MB of JSON ` +
    `(${perRow.toFixed(0)} B/row compressed, ${(rawSize / Math.max(1, listings.length)).toFixed(0)} B/row raw). ` +
    `GitHub's ${GITHUB_FILE_LIMIT / 1048576} MB file limit arrives at about ${ceiling.toLocaleString()} cars.`
);

if (size > SIZE_REFUSE_BYTES) {
  problems.push(
    `the snapshot would be ${(size / 1048576).toFixed(1)} MB, over this script's ${SIZE_REFUSE_BYTES / 1048576} MB ceiling. ` +
      `GitHub refuses any push containing a file over ${GITHUB_FILE_LIMIT / 1048576} MB, so writing this would not fail here — ` +
      "it would fail as a rejected push in whatever workflow next tried to commit anything, days from now and nowhere near " +
      `the cause. At ${perRow.toFixed(0)} bytes a row the limit is ~${ceiling.toLocaleString()} cars and this run holds ` +
      `${listings.length.toLocaleString()}. The snapshot on disk is unchanged and the site's fallback still works; what is ` +
      "needed is a decision about the format (lib/snapshot.mjs's header has the options and what each was measured to cost), " +
      "not a bigger number here."
  );
} else if (size > SIZE_WARN_BYTES) {
  console.error(
    `::warning::refresh-fallback: the snapshot is ${(size / 1048576).toFixed(1)} MB, past the ${SIZE_WARN_BYTES / 1048576} MB ` +
      `mark. At ${perRow.toFixed(0)} bytes a row GitHub's ${GITHUB_FILE_LIMIT / 1048576} MB file limit arrives at about ` +
      `${ceiling.toLocaleString()} cars, and this run holds ${listings.length.toLocaleString()}. Compression already bought ` +
      "this file an order of magnitude, so getting here again means something regressed — check that the envelope is still " +
      `being written (${(rawSize / Math.max(1, size)).toFixed(1)}x compression this run; it was 7.5x when built) before ` +
      `reaching for a narrower shape. This script REFUSES at ${SIZE_REFUSE_BYTES / 1048576} MB rather than writing a file git cannot push.`
  );
}

// stdout stays exactly one machine-readable line; the narration is on stderr.
const report = {
  rows: listings.length, expected, previous, pages, errors, seconds,
  mb: Number((bytes / 1048576).toFixed(1)),
  bytes: size,
  uncompressedBytes: rawSize,
  lanes: LANES,
  wrote: false,
  dryRun: DRY,
};

if (problems.length) {
  console.log(JSON.stringify({ ...report, ok: false }));
  for (const p of problems) console.error(`::error::refresh-fallback: ${p}`);
  console.error(`refresh-fallback: REFUSED — ${pages} pages in ${seconds}s. The snapshot on disk is unchanged.`);
  process.exit(1);
}

const dest = OUT ? new URL(`file://${OUT.startsWith("/") ? OUT : `${process.cwd()}/${OUT}`}`) : SNAPSHOT;
if (DRY) {
  console.log(JSON.stringify({ ...report, ok: true }));
  console.error(
    `refresh-fallback: DRY RUN — would have written ${listings.length} rows (~${(size / 1048576).toFixed(1)} MB) ` +
      `over ${pages} pages in ${seconds}s. Nothing written.`
  );
  process.exit(0);
}
await writeFile(dest, body);
const written = (await stat(dest)).size;
console.log(JSON.stringify({ ...report, wrote: true, bytes: written, ok: true }));
console.error(
  `refresh-fallback: wrote ${listings.length} rows (${(written / 1048576).toFixed(1)} MB) to ${dest.pathname} ` +
    `over ${pages} pages in ${seconds}s${previous === null ? "" : `, replacing ${previous} rows`}.`
);
process.exit(0);
