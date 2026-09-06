#!/usr/bin/env node
// The pre-deploy gate CLAUDE.md's deploy procedure asks for: a REAL walk of
// live_listings_feed, run from outside the site so a failure costs nothing.
//
//   node walk-gate.mjs                 # 8 lanes, what db.ts does by default
//   FEED_LANES=2 node walk-gate.mjs    # the gentle setting, for a busy box
//
// Exit 0 = the walk cleared AND returned the full row count. Deploy.
// Exit 1 = it did not. DO NOT DEPLOY. A fresh deployment has no previous ISR
// entry to fall back on, so warming one against a sick database serves 500s on
// the browse grid until a walk completes.
//
// WHY A PAGE IS NOT ENOUGH (2026-08-22, cost a poisoned cache): 35 of 36
// VIN-bucket pages answered in ~0.3s, the deploy went ahead, and
// /api/index/first then rendered for 249 seconds and cached the bundled
// fallback anyway. The instance's latency is bimodal under CPU/IO starvation,
// so single pages say nothing about whether ~226 sequential ones can clear.
//
// AND WHY IT SELECTS THE FAT COLUMNS. An earlier version of this script
// selected `vin` alone, which made it a false gate one level up — it replaced
// "a page answered" with "a lighter walk answered". Measured head to head on a
// healthy quiet box, one 500-row bucket page: `select=vin` returns ~15 KB and
// can be served from an index; the real select list returns 485-630 KB
// (~1.06 kB a row, matching nightly.yml's payload measurement) and touches the
// heap for every row — EXPLAIN put it at 7,475 buffers against 3,102. That
// heap read is the SAME reason the cheap COUNT is a false gate for the walk.
// On a healthy box both shapes pass; on a struggling one the cheap shape
// clears while the real walk dies, which is the only case this gate exists
// for. So the shape constants below must stay in step with
// web/lib/listings/db.ts — and since a comment saying so is a comment nobody
// reads, assertSameShapeAsDb() below makes drift a hard failure.
//
// WHY IT HAD TO LIVE HERE. CLAUDE.md has required this check since the
// incident, but the repo never contained it: it existed only as a local file
// under the gitignored docs/, so every session either improvised its own or
// skipped the gate — which is the same as not having the rule. A mandatory
// check only one machine can run is a convention, not a gate.
//
// COST, and the one rule about it: a full walk moves ~117 MB of payload
// (gzipped on the wire, less). That is fine before a deploy and is the same
// read the warm does moments later. It is NOT fine on a schedule — hourly
// re-walks were the 2026-08-17 egress incident, ~1.2 GB/day against a
// 5 GB/month quota, and concurrent full-feed reads were the 2026-08-16
// crash-loop. DO NOT put this in nightly.yml, feed-audits.yml, or a cron.
// For the same reason it does NOT record to registry/audit-status.json the
// way its neighbours do: everything recorded there is judged against an
// expectedEveryHours by audit-status-check.mjs, so registering an irregular,
// human-triggered run would turn the feed-audits lane red whenever nobody
// happened to deploy. A check that cries wolf is a check nobody reads.
import { readFile } from "node:fs/promises";

// Wrapped, because NO .env FILE IS A SUPPORTED STATE — it is the normal state
// on CI, where the workflow supplies SUPABASE_URL and SUPABASE_ANON_KEY as
// step env instead. An unguarded readFile of scraper/.env is what took down
// both the completeness audit and the EV-rules audit the first time they ran
// in CI (fixed in aa0abff); this script is in the same lane and must not
// reintroduce it. Module-relative, not an absolute path off one machine.
try {
  for (const line of (await readFile(new URL("./.env", import.meta.url), "utf-8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON } = process.env;
if (!SUPABASE_URL || !ANON) {
  // Deliberately NOT the "inconclusive, exit 0" that audit-listings.mjs and
  // completeness-audit.mjs answer with. That is right for a report which must
  // not turn CI red for its own reasons; it is wrong for a gate, which would
  // be laundering "unknown" into "safe".
  console.error("walk-gate: no SUPABASE_URL / SUPABASE_ANON_KEY — cannot gate, so refusing to pass.");
  process.exit(1);
}
const BASE = SUPABASE_URL.replace(/\/$/, "");

// The anon key on purpose: PostgREST puts a short statement timeout on anon
// that a management-API or psql session does not have, and the site reads as
// anon. A psql timing is a different question with a different answer.
const H = { apikey: ANON, authorization: `Bearer ${ANON}`, "accept-encoding": "gzip" };

// Every shape constant here is db.ts's, verified against it at startup rather
// than copied and hoped over — see assertSameShapeAsDb().
const PAGE = 500;
const BUCKETS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SELECT = "vin,payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at,buyback_disclosed,branded_title_disclosed,listed_on";
// CLAUDE.md names FEED_LANES=2 as the way to walk while the database is busy,
// so the gate honours it exactly as db.ts does — otherwise the gentle walk you
// asked for is only gentle on one side of the deploy.
const LANES = Math.max(1, Number(process.env.FEED_LANES) || 8);
const FEED_URL = `${BASE}/rest/v1/live_listings_feed?select=${SELECT}&order=vin.asc&limit=${PAGE}`;

/** The gate's whole claim is "this is the walk the build will do". Nothing
 *  else makes that true: db.ts is TypeScript in web/ and this is .mjs in
 *  scraper/, a lane boundary the repo otherwise keeps clean, so they cannot
 *  share a module without crossing it. If db.ts gains a column and this file
 *  does not, the gate silently gets CHEAPER than the walk it certifies — which
 *  is precisely the false-gate bug the fat select list above was added to fix,
 *  and it would recur with a green exit code. So: read db.ts, extract its
 *  shape, and fail hard on any difference. Unreadable counts as a difference —
 *  a gate that cannot check must not clear. */
async function assertSameShapeAsDb() {
  const path = new URL("../web/lib/listings/db.ts", import.meta.url);
  let src;
  try {
    src = await readFile(path, "utf-8");
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
    if (v === undefined) {
      drift.push(`could not find db.ts's ${k} — its shape moved, so this gate can no longer prove it mirrors the site's walk`);
    } else if (v !== mine[k]) {
      drift.push(`${k} has drifted from db.ts.\n    db.ts:     ${v}\n    walk-gate: ${mine[k]}`);
    }
  }
  return drift;
}

// db.ts's retry ladder, for the reason it has one: across ~231 requests a lone
// 5xx is weather, not an outage, and the build would have retried it. A gate
// stricter than the build it gates blocks deploys that would have succeeded,
// and a gate nobody trusts is a gate nobody runs.
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
 *  the feed still fails the gate — the silent short read is the failure mode
 *  that hides, because every request answers 200 and the cars simply are not
 *  there (2026-08-21).
 *
 *  db.ts's shape exactly: the `listings` TABLE rather than the view (the
 *  view's price-history join costs the whole aggregation to produce one
 *  integer, and that lone request is what flipped three builds to the stale
 *  fallback on 2026-08-16), carrying the view's own `delisted_at is null`
 *  predicate so the number is the same by construction. Range 0-0 and NO
 *  `limit`: a `limit` alongside the Range makes PostgREST answer without a
 *  content-range total, which silently disables this whole check. */
async function liveCount() {
  const res = await fetchWithRetry(`${BASE}/rest/v1/listings?select=vin&delisted_at=is.null`, {
    headers: { ...H, range: "0-0", prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}`);
  const n = Number(res.headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(n)) throw new Error("no content-range total");
  return n;
}

const problems = await assertSameShapeAsDb();
if (problems.length) {
  for (const p of problems) console.error(`walk-gate: ${p}`);
  console.error("walk-gate: refusing to certify a walk that may not be the site's. Fix the drift above, then re-run.");
  process.exit(1);
}

const t0 = Date.now();
let expected = null;
try {
  expected = await liveCount();
  console.error(`walk-gate: database reports ${expected} live listings; walking them in ${LANES} lane${LANES === 1 ? "" : "s"}`);
} catch (e) {
  // db.ts treats its own count failure as non-fatal — fresh-but-unchecked
  // beats provably stale for a render that has to answer something. This gate
  // has no such obligation and takes the opposite side: without the count,
  // "the walk finished" only means no request errored, and the incident this
  // exists for was a walk where none did. Refusing costs a wait; clearing
  // wrongly costs a poisoned cache on a deployment with nothing to fall back
  // to. The retry ladder above means this is a persistent failure, not a blip.
  problems.push(`could not read the live count (${e.message}) — a short read cannot be detected without it`);
}

let total = 0;
let pages = 0;
let bytes = 0;
let errors = 0;
// Each bucket is [lo, hi), and the LAST one deliberately has no upper bound so
// the tail beyond "Z" is walked rather than dropped. Worth knowing before you
// test a short read by truncating BUCKETS: you won't get one — the shortened
// last bucket just runs open-ended to the end of the feed and the totals come
// out right. Truncate a PAGE's worth of rows instead.
const queue = BUCKETS.map((c, i) => [c, BUCKETS[i + 1]]);
let qi = 0;
async function lane() {
  while (qi < queue.length) {
    const [lo, hi] = queue[qi++];
    const range = `&vin=gte.${lo}` + (hi ? `&vin=lt.${hi}` : "");
    let after = "";
    let n = 0;
    for (;;) {
      let res;
      try {
        res = await fetchWithRetry(`${FEED_URL}${range}${after ? `&vin=gt.${after}` : ""}`, { headers: H });
      } catch (err) {
        errors++;
        problems.push(`bucket ${lo}: ${err.message} after ${n} rows`);
        break;
      }
      pages++;
      if (!res.ok) {
        errors++;
        problems.push(`bucket ${lo}: HTTP ${res.status} after ${n} rows`);
        break;
      }
      const text = await res.text();
      bytes += text.length;
      let rows;
      try {
        rows = JSON.parse(text);
      } catch {
        errors++;
        problems.push(`bucket ${lo}: unparseable body after ${n} rows`);
        break;
      }
      if (!Array.isArray(rows)) {
        errors++;
        problems.push(`bucket ${lo}: PostgREST returned ${text.slice(0, 120)}`);
        break;
      }
      n += rows.length;
      if (rows.length < PAGE) break;
      after = rows[rows.length - 1].vin;
    }
    total += n;
    process.stderr.write(errors ? "!" : ".");
  }
}
await Promise.all(Array.from({ length: LANES }, () => lane()));
process.stderr.write("\n");
const seconds = Number(((Date.now() - t0) / 1000).toFixed(1));

// How short is too short. NOT sync-guard's percentage thresholds (8%/15%) and
// not db.ts's classifyFeedRead, deliberately: those are calibrated for
// night-over-night churn, a different question a day wide, and 8% of this feed
// is ~8,000 cars — wide enough to pass the very incident this gate exists for.
// The count here is taken SECONDS before the walk, so the only honest slack is
// rows that changed while it ran. Measured twice on 2026-08-22, at 8 lanes and
// at 2: the walk and the count agreed EXACTLY, 100,435 both times. 50 rows of
// slack absorbs ordinary churn and still fails a real short read by three
// orders of magnitude — and a walk that lands mid-db-sync, thousands of rows
// adrift, fails too, which is correct: reading mid-write is how the 2026-08-21
// cache got poisoned in the first place.
const SHORT_READ_SLACK_ROWS = 50;
if (expected !== null && total < expected - SHORT_READ_SLACK_ROWS) {
  problems.push(
    `the walk returned ${total} rows against the ${expected} the database says are live — ` +
      `${expected - total} missing. Every request answered; the cars simply were not there. ` +
      "This is the silent short read, or a read that landed mid-write."
  );
}

// stdout stays exactly one machine-readable line, so a deploying session can
// capture it; the narration above and below is on stderr.
console.log(JSON.stringify({
  total, expected, pages, errors, seconds, lanes: LANES,
  mb: Number((bytes / 1048576).toFixed(1)),
  cleared: problems.length === 0,
}));

if (problems.length) {
  for (const p of problems) console.error(`walk-gate: ${p}`);
  console.error(`walk-gate: FAIL — the walk did not clear (${pages} pages, ${seconds}s). DO NOT DEPLOY.`);
  process.exit(1);
}
console.error(`walk-gate: PASS — ${total} rows over ${pages} pages in ${seconds}s, no errors. Safe to deploy.`);
process.exit(0);
