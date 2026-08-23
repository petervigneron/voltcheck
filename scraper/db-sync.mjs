#!/usr/bin/env node
// web/data/scraped-listings.json → Supabase, via the ingest_listings RPC
// (supabase/migrations/0001_init.sql). Plain Node, no dependencies.
//
// Credentials come from scraper/.env (gitignored), in either mode:
//   SUPABASE_URL=https://<project-ref>.supabase.co
// Mode A (direct RPC, needs the service/secret key):
//   SUPABASE_SERVICE_ROLE_KEY=...
// Mode B (ingest gateway — the deployed supabase/functions/ingest holds the
// service key server-side; the scraper holds only a scoped token):
//   SUPABASE_ANON_KEY=...        (legacy anon JWT — passes the gateway's JWT check)
//   SUPABASE_INGEST_TOKEN=...    (minted at deploy; rotation = redeploy)
// With no .env this exits 0 quietly, so nightly.sh works unchanged before
// the database exists. The JSON file remains the web app's fallback either
// way — this script adds persistence, it replaces nothing.
import { readFile, stat, writeFile } from "node:fs/promises";
import { markTrimSuspects } from "./lib/trim-suspect.mjs";
import { loadTrimOverrides, applyTrimOverrides } from "./lib/trim-overrides.mjs";
import { fetchWithRetry } from "./lib/retry.mjs";
import { laneOf, OEM_LOCATOR_DOMAINS } from "./lib/oem-lane-domains.mjs";
import { readSnapshot } from "./lib/snapshot.mjs";

// Minimal .env parser — launchd jobs carry no shell environment.
async function loadEnv(url) {
  try {
    const text = await readFile(url, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {} // no .env file is a supported state
}
await loadEnv(new URL("./.env", import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GATEWAY = process.env.SUPABASE_INGEST_TOKEN && process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || (!SERVICE_KEY && !GATEWAY)) {
  console.error("db-sync: no Supabase credentials (scraper/.env) — skipping. JSON file is still the data source.");
  process.exit(0);
}

const listings = await readSnapshot(new URL("../web/data/scraped-listings.json", import.meta.url));

// A catastrophically small feed means the crawl broke, not that the
// inventory vanished. Don't push it — a fetch failure is never evidence
// about the world. (Per-domain delisting in SQL already guards partial
// failures; this guards total ones.)
const MIN_ROWS = Number(process.env.DB_SYNC_MIN_ROWS ?? 50);
if (listings.length < MIN_ROWS) {
  console.error(`db-sync: only ${listings.length} listings (< ${MIN_ROWS}) — refusing to sync a broken crawl.`);
  process.exit(1);
}

// Whether a listing's own description contradicts its trim field — decided
// here because it needs the whole corpus AND the descriptions, and the web app
// has neither together (the browse feed drops description for egress, and the
// detail page reads one VIN). Must run on the full array, before chunking:
// chunks are per-domain, and a vocabulary learned from one dealer's inventory
// would be worthless.
const suspects = markTrimSuspects(listings);
console.error(
  `db-sync: ${suspects} of ${listings.length} listings have a trim their own description contradicts`
);

// A short, hand-verified list for exactly the cases the automated check above
// cannot see — no description at all, most often a dealer.com bulk-API pull
// (see scraper/lib/trim-overrides.mjs for how the first row, a Lightning
// wrongly fed as "Pro", was found and confirmed).
const overrides = await loadTrimOverrides();
const overridden = applyTrimOverrides(listings, overrides);
if (overridden) {
  console.error(`db-sync: ${overridden} listing(s) flagged by hand-verified trim overrides`);
}

const source = process.env.DB_SYNC_SOURCE ?? "nightly";

// Which domains did the crawler see COMPLETELY this run? Only those can
// support delisting (see supabase/migrations/0002). A report without the
// `truncated` field — older crawl.mjs, or no crawl this run — certifies
// nothing, so nothing gets delisted.
//
// observedAt = when the crawler actually SAW these rows, from the report
// entries' crawledAt stamps (earliest wins — never claim evidence fresher
// than it is). ingest_listings (0013) uses it to refuse stale overwrites:
// a snapshot replayed after a recheck can no longer resurrect the
// recheck's delistings, nor delist cars seen alive since the crawl. The
// git-committed snapshot's mtime is checkout time, not crawl time, so it
// is only the loudly-warned fallback for pre-0013 reports.
let completeDomains = [];
// Every domain this run ATTEMPTED, complete or not. The delist guard below
// needs it as its denominator: "did this run get back what these domains had"
// is a question about the domains the run was asked to crawl, not about the
// whole fleet. With one nightly crawl over everything the two are the same
// set; with the crawl split into batches they are not, and only this one
// stays meaningful.
let attemptedDomains = [];
let observedAt = null;
try {
  const reportUrl = new URL("./out/report.json", import.meta.url);
  const reports = JSON.parse(await readFile(reportUrl, "utf-8"));
  completeDomains = reports.filter((r) => r.truncated === false).map((r) => r.domain);
  attemptedDomains = reports.map((r) => r.domain).filter(Boolean);
  const times = reports.map((r) => Date.parse(r.crawledAt)).filter(Number.isFinite);
  if (times.length) observedAt = new Date(Math.min(...times)).toISOString();
} catch {
  console.error("db-sync: no crawl report found — delisting skipped for this run.");
}
if (!observedAt) {
  try {
    const { mtime } = await stat(new URL("../web/data/scraped-listings.json", import.meta.url));
    observedAt = mtime.toISOString();
    console.error(`db-sync: report has no crawledAt — falling back to snapshot mtime ${observedAt}. ` +
      "If this snapshot came from git (mtime = checkout time), stale rows may masquerade as fresh.");
  } catch {}
}
// The feed outgrew a single request (OEM-locator rows pushed it past the
// gateway's body ceiling), so it ships in chunks. Chunk boundaries MUST fall
// between dealer domains, never inside one: ingest_listings delists a
// complete domain's absent VINs per call, so splitting a domain across two
// calls would delist the second half while ingesting the first. Each chunk
// therefore carries whole domains plus exactly the completeDomains it holds
// rows for. (A complete domain with zero rows certifies nothing either way —
// the SQL requires incoming rows before delisting — so those ride chunk 1.)
//
// 2026-08-21: the 8MB target was sized for the gateway's body ceiling, not
// for ingest_listings' execution time — and those aren't the same budget.
// Diagnosed tonight's 11 straight 57014 (statement timeout) failures down to
// a specific mechanism, confirmed with EXPLAIN (ANALYZE, BUFFERS) against a
// real 8,000-row/2,016-domain chunk rolled back after measuring: `listings`
// carries three indexes partial on `delisted_at IS NULL` (listings_live_vin,
// listings_vin_prefix, listings_live_idx — each added for a real past read
// timeout, 0030/0031). Postgres's HOT-update shortcut is all-or-nothing per
// row: because relisting/delisting flips a row's membership in those three
// partial indexes, every new/relisted/delisted row forces a full write into
// all 5 indexes on `listings` instead of a cheap in-place update. Measured
// cost: the exact upsert statement took 9,160ms for a chunk whose 891
// relisted rows needed that write; dropping the three partial indexes (in a
// rolled-back transaction, to isolate the cost) cut it to 1,114ms — an 8x
// difference from those three indexes alone. That cost tracks
// (new + relisted + delisted) row counts, not chunk bytes — which is exactly
// why "chunk size doesn't correlate with failure" (a byte-capped chunk can
// still land a heavy-churn night's rows in one call). Restructuring those
// three indexes is not a same-night move (no staging database, each was
// added to fix a specific prior read-timeout incident, and merging them
// needs real testing) — so the lever here is a smaller byte target, which
// bounds worst-case churn-per-call as a side effect of bounding row count.
// 3MB (~1/3 of the old target) should bring typical chunks from the
// ~7,000-10,600 rows that took 41-96s down to something in the low
// thousands, well clear of the 60s statement_timeout even on a heavy-churn
// night. This does not fix the underlying write-amplification (see the
// proposed statement_timeout headroom migration, not yet applied pending
// sequencing) — it just keeps each call's share of it under the ceiling.
const CHUNK_BYTES = Number(process.env.DB_SYNC_CHUNK_BYTES ?? 3_000_000);
const byDomain = new Map();
for (const l of listings) {
  const d = l.dealerDomain ?? "";
  if (!byDomain.has(d)) byDomain.set(d, []);
  byDomain.get(d).push(l);
}
const completeSet = new Set(completeDomains);

// Refuse to delist a whole LANE (national OEM-locator pulls vs crawled
// dealer rooftops — scraper/lib/oem-lane-domains.mjs) whose tonight's
// "complete" coverage doesn't remotely match what was live before this sync.
// A single dealer legitimately closing out its whole (small) lot is normal;
// an entire lane — tens of thousands of rows behind one crawl or one API
// call — losing more than half its previously-live inventory overnight is a
// broken crawl/locator, not a fleet-wide sale. Same reasoning as MIN_ROWS
// above ("a catastrophically small feed means the crawl broke, not that
// inventory vanished"), scoped to a lane instead of the whole feed, and it
// only ever narrows what gets marked complete — new rows and price changes
// for that lane's domains still land, only the delisting permission is
// withheld for this run. The two lanes are checked at different granularity
// (per domain for OEM, in aggregate for dealer) — see the comment at each
// branch below for why a single approach doesn't fit both.
//
// DELIST_GUARD_MIN_COVERAGE is picked from the real churn this pipeline has
// actually logged, not a guess: two ordinary nights' own db-sync totals
// (2026-08-17, runs 32022327707/32044269696) delisted 2.4% and 1.0% of that
// night's seen rows, and the same day's recheck sold-signal delisted 2.6% of
// what it checked. A lane legitimately losing half its live inventory in one
// night has no precedent in this pipeline's history; the 2026-08-21 salvage
// came close (~28k of ~87k rows, ~32%) and was NOT real inventory loss. A
// 50% floor sits ~20x above the observed baseline churn (so it will not cry
// wolf on a normal night) and comfortably below any event seen or plausible
// here (so it catches one). Tightens as more nights accumulate real numbers
// in registry/audit-status.json.
const DELIST_GUARD_MIN_COVERAGE = Number(process.env.DELIST_GUARD_MIN_COVERAGE ?? 0.5);
const READ_KEY = process.env.SUPABASE_ANON_KEY || SERVICE_KEY;

async function liveCountForDomains(domains) {
  // domains === null means "no domain filter" (feed-wide total).
  const filter = domains ? `&dealer_domain=in.(${domains.map(encodeURIComponent).join(",")})` : "";
  const res = await fetchWithRetry(
    `db-sync: live count (${domains ? domains.length + " domains" : "total"})`,
    () =>
      fetch(`${SUPABASE_URL}/rest/v1/listings?select=vin&delisted_at=is.null${filter}`, {
        headers: { apikey: READ_KEY, Authorization: `Bearer ${READ_KEY}`, Range: "0-0", Prefer: "count=exact" },
      })
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const n = Number(res.headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(n)) throw new Error("count missing from content-range header");
  return n;
}

// liveCountForDomains puts every domain in one IN() list, which is fine for a
// batch and not for a few thousand. Summing over slices keeps the same answer
// affordable at any batch size; the slices are disjoint so the sum is exact.
const COUNT_SLICE = 250;
async function liveCountForDomainsChunked(domains) {
  let total = 0;
  for (let i = 0; i < domains.length; i += COUNT_SLICE) {
    total += await liveCountForDomains(domains.slice(i, i + COUNT_SLICE));
  }
  return total;
}

const laneReport = {};
if (READ_KEY) {
  try {
    const completeByLane = { oem: [], dealer: [] };
    for (const d of completeDomains) completeByLane[laneOf(d)].push(d);

    // OEM lane: checked PER DOMAIN, not as one aggregate. Each OEM domain is
    // its own independent API pull (chevrolet.com succeeding tells you
    // nothing about cadillac.com tonight — oem-locator.mjs's header
    // documents several brands as "truncated always" by design), and this
    // lane has few enough domains (~28, scraper/lib/oem-lane-domains.mjs)
    // that querying each complete one's own prior count is cheap. Comparing
    // instead against the WHOLE lane's prior total would have been a real
    // bug: on a night only Chevrolet reports complete, its ~2k rows against
    // the full lane's ~41k prior total reads as 5% coverage and the guard
    // would refuse to delist Chevrolet's own sold cars forever, for reasons
    // that have nothing to do with Chevrolet's own crawl quality.
    for (const domain of completeByLane.oem) {
      const incoming = byDomain.get(domain)?.length ?? 0;
      const priorLive = await liveCountForDomains([domain]);
      if (priorLive <= 0) continue; // no prior baseline for this domain yet
      const coverage = incoming / priorLive;
      const refused = coverage < DELIST_GUARD_MIN_COVERAGE;
      laneReport[domain] = { lane: "oem", incoming, priorLive, coverage, refused };
      if (refused) {
        console.error(
          `db-sync: REFUSING to delist "${domain}" — tonight's complete crawl carries ${incoming} rows against ` +
            `${priorLive} previously live (${(coverage * 100).toFixed(1)}% coverage, floor ` +
            `${(DELIST_GUARD_MIN_COVERAGE * 100).toFixed(0)}%). Marking it incomplete for this sync so nothing on ` +
            `it is delisted tonight; new rows and price changes still land.`
        );
        completeSet.delete(domain);
      }
    }

    // Dealer lane: checked in AGGREGATE across every complete rooftop
    // tonight, the opposite tradeoff from OEM above — there can be
    // thousands of independent dealer domains, so pricing a per-domain query
    // for each is not affordable, but it's also not the right granularity:
    // one dealer's whole (small) lot legitimately selling out is normal and
    // must not trip anything. A CRAWL-INFRASTRUCTURE failure wide enough to
    // matter shows up in the aggregate — it moves hundreds of domains at
    // once — while ordinary per-dealer churn across thousands of independent
    // lots washes out and never swings this total by anything close to the
    // floor. This is exactly the shape of the one real historical event
    // (git history, bd8f662a -> 8981600, 2026-08-19): the dealer lane's
    // committed snapshot went from 15,926 rows to 0 in one night because the
    // crawl itself was cancelled mid-run, not because every dealer sold out.
    const dealerDomains = completeByLane.dealer;
    if (dealerDomains.length) {
      // Denominator = what THIS RUN'S dealer domains had live before it, not
      // what the whole dealer lane had. The two are the same number on a
      // nightly crawl over every rooftop, so this does not change that case.
      // They stop being the same the moment the crawl is split into batches,
      // and then only this form is meaningful: a batch of 200 rooftops
      // carrying its own ~2k rows against the lane's ~59k prior total reads
      // as 3% coverage, trips the 50% floor, and the guard refuses to delist
      // a batch that crawled perfectly — every run, forever.
      //
      // That is not a hypothetical: it is the exact bug the OEM branch above
      // was already written to avoid, in its own words — "on a night only
      // Chevrolet reports complete, its ~2k rows against the full lane's ~41k
      // prior total reads as 5% coverage and the guard would refuse to delist
      // Chevrolet's own sold cars forever, for reasons that have nothing to
      // do with Chevrolet's own crawl quality". The dealer branch had the
      // same flaw latent; one crawl over everything just kept it hidden.
      //
      // The protection is unchanged, because the comparison is still "rows I
      // got back" against "rows these same domains had before" — scale-free.
      // A parser break that empties every SRP still shows near-zero coverage
      // against those domains' own prior counts and is still refused. What it
      // no longer does is judge a batch by inventory it was never asked to
      // crawl. Domains never attempted cannot be delisted regardless: they
      // are absent from completeDomains, and the SQL delists only within a
      // domain it was handed rows for.
      // Cost is why this is a threshold and not simply the precise form. The
      // feed carries ~7,000 live dealer domains, so naming them all costs ~29
      // count requests against the 2 the whole-lane subtraction costs — and
      // this exact count query is what returned HTTP 500 for seven minutes
      // during the 2026-08-22 incident before db-sync gave up. A batch names
      // few enough domains to price precisely; a whole-fleet run does not,
      // and for a whole-fleet run the two denominators are the same number
      // anyway. So: precise when it is affordable, subtraction when it is not,
      // and the run records which one it used.
      const dealerAttempted = attemptedDomains.filter((d) => laneOf(d) === "dealer");
      const precise = dealerAttempted.length > 0 && dealerAttempted.length <= COUNT_SLICE * 2;
      const priorLive = precise
        ? await liveCountForDomainsChunked(dealerAttempted)
        : (await liveCountForDomains(null)) - (await liveCountForDomains([...OEM_LOCATOR_DOMAINS]));
      if (priorLive > 0) {
        const incoming = dealerDomains.reduce((s, d) => s + (byDomain.get(d)?.length ?? 0), 0);
        const coverage = incoming / priorLive;
        const refused = coverage < DELIST_GUARD_MIN_COVERAGE;
        laneReport.dealer = {
          lane: "dealer",
          incoming,
          priorLive,
          domainsComplete: dealerDomains.length,
          domainsAttempted: dealerAttempted.length,
          basis: precise ? "attempted-domains" : "whole-lane",
          coverage,
          refused,
        };
        if (refused) {
          console.error(
            `db-sync: REFUSING to delist the "dealer" lane — tonight's ${dealerDomains.length} complete domain(s) ` +
              `carry ${incoming} rows against ${priorLive} previously live (${(coverage * 100).toFixed(1)}% coverage, ` +
              `floor ${(DELIST_GUARD_MIN_COVERAGE * 100).toFixed(0)}%). Marking them incomplete for this sync so ` +
              `nothing in this lane is delisted tonight; new rows and price changes still land.`
          );
          for (const d of dealerDomains) completeSet.delete(d);
        }
      }
    }
  } catch (e) {
    console.error(
      `db-sync: lane delist-coverage guard could not read prior live counts (${e.message}) — skipping the guard ` +
        "for this run. Delisting proceeds without it; this is reported so a silent skip doesn't read as a pass."
    );
    laneReport._guardError = e.message;
  }
} else {
  console.error("db-sync: no readable key for the lane delist-coverage guard — skipping it.");
  laneReport._guardError = "no readable key";
}

const chunks = [];
let cur = { rows: [], completeDomains: [], bytes: 0 };
for (const [domain, rows] of byDomain) {
  const bytes = JSON.stringify(rows).length;
  if (cur.rows.length && cur.bytes + bytes > CHUNK_BYTES) {
    chunks.push(cur);
    cur = { rows: [], completeDomains: [], bytes: 0 };
  }
  cur.rows.push(...rows);
  cur.bytes += bytes;
  if (completeSet.has(domain)) {
    cur.completeDomains.push(domain);
    completeSet.delete(domain);
  }
}
chunks.push(cur);
cur.completeDomains.push(...completeSet); // row-less complete domains: harmless, see above

// Both modes send the RPC's own parameter shape. The gateway used to get a
// friendlier {rows, source, ...} body and translate it — which meant parsing
// 7-8MB of JSON inside a Deno isolate and re-serializing it, ~100MB+ of
// transient heap per chunk. On 2026-08-16 (after the database-side OOM was
// fixed) that became the next bottleneck: back-to-back big chunks killed the
// isolate mid-request (edge 520 with an empty function log, then 503s) and
// every large chunk needed the retry ladder to land. With x-ingest-rpc the
// gateway streams this body through to PostgREST untouched.
const send = (rows, doms) => {
  const body = JSON.stringify({ _rows: rows, _source: source, _complete_domains: doms, _observed_at: observedAt });
  return SERVICE_KEY
    ? fetch(`${SUPABASE_URL}/rest/v1/rpc/ingest_listings`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body,
      })
    : fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          "x-ingest-token": process.env.SUPABASE_INGEST_TOKEN,
          "x-ingest-rpc": "ingest_listings",
          "Content-Type": "application/json",
        },
        body,
      });
};

console.error(
  `db-sync: observed ${observedAt ?? "UNKNOWN (legacy: treated as now)"} — ${listings.length} rows in ${chunks.length} chunk(s): ` +
  chunks.map((c) => `${c.rows.length} rows/${(c.bytes / 1e6).toFixed(1)}MB/${c.completeDomains.length} complete`).join(", ")
);

const totals = { seen: 0, new: 0, price_changed: 0, delisted: 0, relisted: 0 };
for (const [i, chunk] of chunks.entries()) {
  // Retry transient failures — and give a crashed database time to get up.
  // The 2026-08-16 diagnosis (postgres_logs, three failed nights) that sized
  // the waits lives in lib/retry.mjs, where the whole pipeline now shares
  // one ladder instead of per-script copies: the "520 blip" was never
  // Cloudflare, it was the Nano instance OOMing under the sync's row churn,
  // and the same chunk passes after a wait that outlasts the ~2-minute
  // recovery cycle (observed: the post-crash replay cleared 4 more chunks
  // before pressure built again).
  // Replay is safe: ingest_listings upserts by VIN and derives delisting from
  // the payload it is handed, so re-sending a chunk converges to the same
  // state (it only costs an extra run id).
  const res = await fetchWithRetry(`db-sync: chunk ${i + 1}/${chunks.length}`, () =>
    send(chunk.rows, chunk.completeDomains)
  );
  if (!res.ok) {
    // A failed chunk leaves its domains un-synced and un-delisted — stale for
    // a night, never wrongly removed. Exit hard so the failure is visible.
    const detail = (await res.text()).slice(0, 500);
    console.error(`db-sync: chunk ${i + 1}/${chunks.length} FAILED — ${res.status === 0 ? "network error" : `HTTP ${res.status}`}: ${detail}`);
    process.exit(1);
  }
  const counts = await res.json();
  for (const k of Object.keys(totals)) totals[k] += counts[k] ?? 0;
  console.error(
    `db-sync: chunk ${i + 1}/${chunks.length} run ${counts.run_id} — ${counts.seen} seen, ${counts.new} new, ` +
    `${counts.price_changed} price changes, ${counts.delisted} delisted, ${counts.relisted} relisted`
  );
}
console.error(
  `db-sync: total — ${totals.seen} seen, ${totals.new} new, ` +
  `${totals.price_changed} price changes, ${totals.delisted} delisted, ${totals.relisted} relisted`
);

// Ephemeral (not committed — lives only in this job's out/), read by
// sync-guard.mjs right after this script exits. Carries this run's own
// figures forward without a second Supabase round trip: the lane guard
// above already paid for the prior-live-count reads it needed, and the RPC
// totals above are this call's own authoritative numbers, not a re-read of
// anything that could have changed underneath it.
try {
  await writeFile(
    new URL("./out/sync-totals.json", import.meta.url),
    JSON.stringify({ observedAt, source, totals, laneReport }, null, 2) + "\n"
  );
} catch (e) {
  console.error(`db-sync: could not write out/sync-totals.json (${e.message}) — sync-guard will run without this run's totals`);
}
