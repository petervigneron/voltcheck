import type { Listing } from "./types";
import { hasRealPrice } from "./price";
import { SHARDS } from "./pack";
import { SITEMAP_SHARDS } from "../sitemap";

// Server-side reads from Supabase (PostgREST), with the bundled JSON as
// fallback (see source.ts). Plain fetch, no client library: the queries are
// GETs and the anon key is read-only under RLS.
//
// Egress discipline (free plan, 2026-08-14 incident): the bulk read uses the
// live_listings_feed view (migration 0011) — payload minus `description`,
// which is ~45% of payload bytes and renders only on the detail page. The
// detail page fetches its one row, description and price history included,
// via fetchListingDetailFromDb. All requests ask for gzip explicitly (the
// wire is what Supabase bills; ~3.7x smaller).
//
// Cache cadence (2026-08-17 incident, 33 GB against the 5 GB/mo quota): the
// data changes once a day — nightly sync, price audit, recheck — but an
// hourly revalidate re-walked the ~13 MB feed 24 times a day at best, and in
// practice ~78 times, because pages over the 2 MB entry ceiling fell out of
// the data cache and every shard render re-walked around them. Measured from
// edge logs: 13,466 walk pages/day ≈ 1.2 GB/day. The fix lives at the ROUTE
// layer: the index routes cache their output a full DAY, and nightly.yml's
// last step POSTs /api/revalidate — which expires them the moment the data
// actually changed — then warms them, so the one walk happens at night. The
// fetch-level revalidate/tags below are kept for whatever the platform cache
// can hold, but they are NOT what carries this in production: a full walk is
// ~175 MB of stringified entries and evicts itself from the Vercel Data
// Cache (measured 2026-08-17, every re-render re-walked, tails included);
// the in-process memo below is what lets one walk serve all seven warm
// renders. The day TTLs are only the backstop for a lost signal — the site
// is never fresher than the pipeline and never staler than a day. After any
// out-of-cycle db-sync, send that same POST (see the route file for the
// secret's shape) or accept up to a day of staleness.
//
// Env (web/.env.local locally, project env vars on Vercel):
//   SUPABASE_URL=https://<project-ref>.supabase.co
//   SUPABASE_ANON_KEY=...   (anon/publishable key — safe for read-only use)
// Both absent → dbConfigured() is false and the app serves the bundled JSON.

// PostgREST caps any response at 1000 rows regardless of the range asked for —
// asking for more returns 1000 and no error, so a bigger page size buys nothing
// and hides the shortfall. But the binding limit is smaller than that and comes
// from our side: Next refuses to store a fetch-cache entry over 2 MB
// (node_modules/next/dist/server/lib/incremental-cache/index.js, "items over
// 2MB can not be cached"). A full page of the W bucket — BMW/Mercedes/Audi/VW,
// the fattest payloads at ~1.07 kB a row — measured 2,402,435 bytes as an entry
// and silently stopped being cached once inventory grew enough to fill those
// pages. Every other bucket was still inside the limit, several of them only
// just: at 1000 rows K and Y sat within 20% of it.
//
// Uncached is not merely slower: /api/index renders six shards off this same
// walk and relies on the data cache to make that one database read an hour.
// An over-limit page is refetched by every shard, and because the walk is
// keyset-paginated W's nine full pages come back one after another — nine
// sequential uncached round trips on the critical path of every revalidation,
// against the free-plan instance. Observed locally at 43-109 s per shard.
//
// 500 puts the worst bucket at ~1.2 MB of entry, 43% under the ceiling, with
// room for payloads to grow by three quarters before it matters. It costs
// ~175 requests per walk instead of ~108 — but they are cacheable, so the
// database sees them once an hour instead of the fat ones six times.
const PAGE = 500;
// The bulk feed: a day, expired early by /api/revalidate (see header).
const FEED_REVALIDATE_SECONDS = 86400;
// Per-VIN reads (detail page, cohort) stay hourly: a few dozen small
// requests a day, and the detail page is where an out-of-cycle price
// correction should show up without waiting for tomorrow.
const REVALIDATE_SECONDS = 3600;
// Every fetch that reads listings data carries this tag; one
// revalidateTag(FEED_CACHE_TAG) in /api/revalidate expires them all.
export const FEED_CACHE_TAG = "feed";

// The VIN space, split so the pages can be walked in parallel. Buckets that hold
// no cars cost one empty request; the alphabet is deliberately the full 36 rather
// than the 33 characters VINs may legally use, because a feed that ignores the
// standard should still be read, not skipped.
const BUCKETS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
// Overridable because 8 lanes is also a load spike: when the database is
// already struggling (post-sync churn on the small instance), a deploy's only
// path to a clean build is walking gently — FEED_LANES=2 halves-twice the
// concurrency at the cost of build time. Default unchanged.
const LANES = Math.max(1, Number(process.env.FEED_LANES) || 8);

interface FeedRow {
  vin: string;
  payload: Listing;
  first_seen_at: string;
  last_seen_at: string;
  prev_price_usd: number | null;
  price_changed_at: string | null;
  buyback_disclosed: boolean;
  listed_on: string | null;
}

interface DetailRow {
  payload: Listing;
}

export function dbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

// One transient 5xx must not decide what shoppers see for the next hour.
// 2026-08-16: three production deploys in a row shipped the bundled-JSON
// fallback to the browse grid because a single count request 500d while the
// nightly sync had the database under load — stale inventory, and the buyback
// gate silently absent. The walk makes ~60 requests across 8 lanes; at that
// volume a lone 500 is weather, not an outage, so it gets the scraper's
// medicine (a short retry ladder) instead of tripping the fallback.
const RETRY_DELAYS_MS = [2000, 6000];
async function fetchWithRetry(url: string, init: RequestInit & { next?: { revalidate: number; tags?: string[] } }) {
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

function headers(): Record<string, string> {
  const key = process.env.SUPABASE_ANON_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Encoding": "gzip",
  };
}

// One walk shared by every render in this process for ten minutes. Two
// distinct problems, one memo:
//   - Production: the fetch-level data cache does NOT hold the walk on
//     Vercel — ~175 MB of stringified entries per walk blows the Data
//     Cache's allowance and evicts itself (measured 2026-08-17: every route
//     re-render re-walked, tail pages included). The seven index bodies are
//     warmed by sequential curls that land on the same warm lambda, so this
//     memo is what turns seven renders into one walk.
//   - Dev: the fetch cache is cold on every restart and each shard route
//     walks independently — measured 2026-08-17 at ~4,300 feed pages
//     (~0.4 GB of the free plan's 5 GB/mo) in one day from one machine.
// Ten minutes is long enough to bridge a warm-up sequence and short enough
// that a lambda outliving the nightly revalidate can serve at most ten
// stale minutes — the routes themselves cache a day, so the memo's TTL is
// never the user-visible staleness.
const WALK_MEMO_MS = 10 * 60 * 1000;
let walkMemo: { at: number; promise: Promise<Listing[] | null> } | null = null;

// When the last walk failed outright, so a caller that has nothing useful to
// do with a failed walk can skip starting another one.
//
// Concurrent requests already share an in-flight walk — walkMemo is assigned
// synchronously, before the promise settles — so the amplification this
// bounds is SEQUENTIAL: one failed walk per request, forever, for as long as
// the database is sick. A render that SUCCEEDS gets cached and stops asking;
// a render that throws is never cached, so it asks again on every request.
// Since 2026-08-22 the sitemap shards are exactly that kind of render (they
// refuse to publish anything but a live feed), which is a load source this
// app did not have while they were build artifacts — they cost the database
// nothing at runtime then, because they were rendered once at build. Left
// unbounded, a crawler working through six shards during an outage would pay
// for six full failed walks each pass.
//
// Sized against what a walk actually costs the database rather than a round
// number: 226 requests, measured against a 100,297-row feed (201 pages of
// PAGE=500 plus the bucket boundaries) — against an instance whose ordinary
// baseline was measured at ~20 feed-page requests an hour on a quiet day.
// The bound this actually buys, stated as measured rather than as intended.
// This is module state, so its scope is a module instance, and Next does not
// give you one instance per server: measured 2026-08-22 on `next start`, a
// listing page and /api/index/[shard] shared a cooldown (the second answered
// in 0.03s) while /sitemap/[shard] did not and walked on its own (21.7s).
// So the guarantee is "at most one failed walk per minute per module
// instance", not per server and certainly not per deployment — on Vercel,
// where concurrent requests get their own lambdas, cross-instance sharing was
// never available anyway. What that converts is the SHAPE of the load: from
// proportional to request volume, to proportional to (route bundles x
// concurrency) and capped by the clock. Measured end to end over one pass of
// three index routes, three detail pages and two sitemaps against a database
// answering 500 to everything: 114 requests before, 43 after.
//
// Why this had to move from the sitemap route into the walk itself
// (2026-08-22, while the incident was still running). The parallel session
// pulled the statement-timeout cancellations straight out of postgres_logs —
// 78 a minute at peak, bursty rather than constant, and the dominant
// cancelled statement is this file's live_listings_feed page read. Bursty is
// the signature of "a render starts a walk, the walk dies, the next request
// starts another": a render that SUCCEEDS is cached and stops asking, but a
// render that never completes caches nothing, so the next request re-walks.
// Slow database -> render times out -> nothing cached -> re-walk -> slower
// database, and nothing in the system broke that cycle.
//
// The two routes feeding it are the ones with no breaker of their own:
// /api/index/* renders, and — the amplifier — every listing detail page,
// because findListing() falls back to a FULL WALK whenever its per-VIN read
// misses (source.ts), and during an outage the per-VIN read misses every
// time. The sitemap points crawlers at 100,297 listing URLs, so a crawler
// working through them becomes a walk generator. A breaker on the sitemap
// route alone would not have touched any of this; the live deployment
// serves its sitemaps as static build artifacts and makes no runtime walk at
// all (verified: /sitemap/0.xml, 6.9 MB, 0.95s off the CDN).
//
// The cost, stated plainly: during an outage the browse shards now cache the
// 58,730-row bundled snapshot instead of timing out. That is a real
// degradation and it is the deliberate trade — it is bounded, it is
// recoverable by POSTing /api/revalidate once the database answers, and
// feed-shard-check.mjs catches it within 6 hours if nobody does. Renders
// that never complete are not recoverable by anything.
let lastWalkFailureAt = 0;
const WALK_FAILURE_COOLDOWN_MS = 60_000;

/** True when a feed walk failed within the last `withinMs`. Consulted by
 *  fetchListingsFromDb itself, and separately by the sitemap route so it can
 *  answer 503 + Retry-After rather than the 500 a thrown render would give. */
export function feedWalkFailedRecently(withinMs: number = WALK_FAILURE_COOLDOWN_MS): boolean {
  return lastWalkFailureAt > 0 && Date.now() - lastWalkFailureAt < withinMs;
}

/** Test seam: production code never calls this. */
export function __resetWalkFailureForTest(): void {
  lastWalkFailureAt = 0;
}

/** All live (non-delisted) listings — no descriptions, no price history —
 *  or null when the DB is unconfigured or unreachable, in which case the
 *  caller falls back to the bundled JSON. */
export async function fetchListingsFromDb(): Promise<Listing[] | null> {
  if (walkMemo && Date.now() - walkMemo.at < WALK_MEMO_MS) return walkMemo.promise;
  // Don't start a walk we already know will fail. This is the whole loop
  // breaker — see WALK_FAILURE_COOLDOWN_MS above for the measurements. It
  // returns null, which is the same answer the walk would have produced, so
  // the caller serves the bundled snapshot exactly as it would have anyway:
  // the render COMPLETES instead of timing out, and a render that completes
  // gets cached and stops asking.
  if (feedWalkFailedRecently()) return null;
  const memo = { at: Date.now(), promise: fetchListingsFromDbUncached() };
  walkMemo = memo;
  // A failed or fallback walk must not stick for ten minutes.
  memo.promise.then(
    (rows) => {
      if (!rows && walkMemo === memo) walkMemo = null;
    },
    () => {
      if (walkMemo === memo) walkMemo = null;
    }
  );
  return memo.promise;
}

// Thresholds for "the walk came back short," reused verbatim from
// scraper/lib/sync-guard-logic.mjs rather than re-guessed: that file
// calibrated them from this pipeline's own logged history (ordinary
// night-over-night churn measured at 1.0-2.4%; the 2026-08-21 incident this
// guard exists for dropped the whole feed ~32%, from ~87,082 confirmed
// listings to the 58,741 that got served and cached). GLOBAL sits far above
// real drift and far below a real incident on purpose. WARN is worth a
// human's attention; FAIL means don't trust this read.
export const SHORT_READ_WARN_DROP = 0.08;
export const SHORT_READ_FAIL_DROP = 0.15;

export type FeedReadVerdict = "ok" | "warn" | "fail";

/** How short a walk came back against the count taken moments before it,
 *  classified against the calibration above. `total === null` means the
 *  count guard itself failed (already handled by the caller as "serve
 *  unvalidated") — there is nothing to classify against, so this reports
 *  "ok" rather than inventing a verdict from no data. */
export function classifyFeedRead(rowCount: number, total: number | null): FeedReadVerdict {
  if (total === null || total <= 0) return "ok";
  const drop = (total - rowCount) / total;
  if (drop >= SHORT_READ_FAIL_DROP) return "fail";
  if (drop >= SHORT_READ_WARN_DROP) return "warn";
  return "ok";
}

// The escape hatch for a read we do not want to keep: a FAIL-level short
// read, or a fall-back to the bundled snapshot. The render still completes
// and its rows are still returned — throwing here would trip the exact
// "flapping to stale fallback" failure this file's callers were built to
// avoid (2026-08-16: a single failed request flipped three straight deploys
// to the bundled JSON snapshot while every other read was healthy). Serving
// a suspect read once is the acceptable half of that tradeoff; letting it
// sit as the day-long cached truth (FEED_REVALIDATE_SECONDS, the routes'
// own `revalidate = 86400`) is not.
//
// HOW MUCH THIS ACTUALLY BUYS — measured 2026-08-22, because the comment
// that used to be here overstated it. Next refuses revalidateTag/
// revalidatePath during a static render, and BOTH of this hatch's callers
// are `dynamic = "force-static"` routes:
//
//   Dynamic server usage: Route /api/index/[shard] couldn't be rendered
//   statically because it used `revalidateTag feed`   (digest DYNAMIC_SERVER_USAGE)
//
// so the call throws, the catch below swallows it, and nothing is expired.
// Reproduced on /api/index/[shard] and /sitemap/[shard] against a database
// that was genuinely answering PostgREST 500s. Deferring the call with
// `after()` does not help — the static-generation store is still in scope
// when the callback runs (also measured). There is no way to expire a route
// cache from inside the render that filled it; only an outside caller can,
// which is what /api/revalidate is.
//
// So this hatch is live insurance for any future DYNAMIC caller, and today
// it is a no-op. What actually catches a poisoned cache is, in order:
//   1. the FEED FALLBACK / SHORT READ lines below, in the function log;
//   2. the sitemap refusing to publish at all on a non-live feed
//      (app/sitemap/[shard]/route.ts) — a throw is not cached, so each
//      request retries and the shard heals itself the moment the database
//      does;
//   3. scraper/feed-shard-check.mjs, every 6 hours, which compares the
//      shards' actual ROW COUNTS against what /api/index/first reports and
//      against sync-guard's last confirmed database count, and POSTs
//      /api/revalidate to clear the bad entry when they disagree.
// (2) and (3) are the load-bearing ones. Do not let this comment drift back
// into implying (1)+this hatch is a fix.
//
// Dynamic import, not a top-level one: revalidateTag/revalidatePath rely on
// a request-scoped store Next only sets up while actually handling a Route
// Handler or Server Action request — a context a plain script or test never
// has. A top-level import would also make this module unloadable outside
// Next's own bundler resolution.
let escapeFeedCache: (shardCount: number) => void | Promise<void> = async (shardCount) => {
  try {
    const { revalidateTag, revalidatePath } = await import("next/cache");
    revalidateTag(FEED_CACHE_TAG, { expire: 0 });
    revalidatePath("/api/index/first");
    for (let s = 0; s < shardCount; s++) revalidatePath(`/api/index/${s}`);
    // The sitemap shards render off this same walk and cache for the same
    // day (app/sitemap/[shard]/route.ts). A suspect read that reaches them
    // publishes a URL list to a crawler, which is a slower and stickier kind
    // of wrong than a thin browse page — expire them together.
    for (let s = 0; s < SITEMAP_SHARDS; s++) revalidatePath(`/sitemap/${s}.xml`);
  } catch (err) {
    console.error(
      "[listings] SUSPECT READ: could not schedule an early revalidate (best-effort, not fatal — see the note above):",
      err
    );
  }
};

/** Test seam only: swap the cache-escape side effect for a spy and get back
 *  a function that restores the real one. Production code never calls this. */
export function __setFeedCacheEscapeForTest(fn: (shardCount: number) => void | Promise<void>): () => void {
  const prev = escapeFeedCache;
  escapeFeedCache = fn;
  return () => {
    escapeFeedCache = prev;
  };
}

// Exported (only fetchListingsFromDb is meant to be called in production —
// this skips the ten-minute memo) so a test can drive one walk at a time
// without fighting module-level shared state.
export async function fetchListingsFromDbUncached(): Promise<Listing[] | null> {
  if (!dbConfigured()) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const feedUrl = `${base}/rest/v1/live_listings_feed?select=vin,payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at,buyback_disclosed,listed_on&order=vin.asc&limit=${PAGE}`;

  // Each page asks for the thousand VINs *after* the last one it saw, rather
  // than for a numbered slice. The offset form asked the database to build the
  // whole sorted feed and then count 40,000 rows into it — with a price-history
  // lookup per row along the way — so the deep pages ran past the statement
  // timeout. At 39k cars 53 of those in parallel stayed just inside the limit;
  // at 52k, 32 of them died, the whole read was abandoned, and the site quietly
  // served the bundled snapshot instead: no Kia or Hyundai locator inventory,
  // 39,047 cars where there were 52,833. Keyed on VIN, each page is an index
  // range scan on the primary key and costs the same as the first.
  const walk = async (lo: string, hi: string | undefined): Promise<FeedRow[]> => {
    const range = `&vin=gte.${lo}` + (hi ? `&vin=lt.${hi}` : "");
    const rows: FeedRow[] = [];
    let after: string | undefined;
    for (;;) {
      const res = await fetchWithRetry(`${feedUrl}${range}${after ? `&vin=gt.${after}` : ""}`, {
        headers: headers(),
        next: { revalidate: FEED_REVALIDATE_SECONDS, tags: [FEED_CACHE_TAG] },
      });
      if (!res.ok) throw new Error(`PostgREST ${res.status}`);
      const body = await res.text();
      // Crossing the cache ceiling is silent — the page just stops being
      // stored and every shard refetches it, which is how the last one went
      // unnoticed until a shard render was taking a minute and a half. Next
      // measures the entry JSON.stringify'd, which escapes every quote in the
      // body and comes out ~1.32x its size (measured: 500 W rows are 907,932
      // bytes of body, 1000 were the 2,402,435-byte entry Next rejected), so
      // the ceiling lands at ~1.59 MB of body. Warn at 1.3 MB, four fifths of
      // the way there and still in time to drop PAGE.
      if (body.length > 1_300_000) {
        console.warn(
          `[listings] feed page ${lo}-${hi ?? "end"} is ${body.length} bytes — close to the 2MB fetch-cache ceiling; lower PAGE (currently ${PAGE})`
        );
      }
      const page = JSON.parse(body) as FeedRow[];
      rows.push(...page);
      if (page.length < PAGE) return rows;
      after = page[page.length - 1].vin;
    }
  };

  try {
    // The expected total, asked for up front so the read can be checked against
    // it. A short read is the failure mode that hides: every request answers
    // 200, the cars just aren't there.
    // Counted on the BASE table, not the view. The view's price-history join
    // exists for the payload pages; a count through it pays the whole
    // aggregation just to produce one integer, and on 2026-08-16 that was the
    // single request whose failure kept flipping builds to the JSON fallback
    // while plain page reads were healthy. `delisted_at is null` is the
    // view's own predicate, so the number is the same by construction.
    // Same tag and TTL as the pages: the count is the short-read guard, so
    // it must always be the same vintage as the pages it checks. In practice
    // it re-fetches every render anyway — PostgREST answers a Range request
    // 206, and Next only caches 200s — which is also why its failure must
    // not be fatal: the count is a GUARD on the walk, not part of it. On
    // 2026-08-16 this was the request whose failure kept flipping builds to
    // the stale bundled fallback while every page read was healthy. If the
    // guard itself is unreachable after retries, say so loudly and serve the
    // walk unvalidated — fresh-but-unchecked beats provably stale.
    let total: number | null = null;
    try {
      const countRes = await fetchWithRetry(`${base}/rest/v1/listings?select=vin&delisted_at=is.null`, {
        headers: { ...headers(), Range: "0-0", Prefer: "count=exact" },
        next: { revalidate: FEED_REVALIDATE_SECONDS, tags: [FEED_CACHE_TAG] },
      });
      if (!countRes.ok) throw new Error(`PostgREST ${countRes.status}`);
      const n = Number(countRes.headers.get("content-range")?.split("/")[1]);
      if (!Number.isFinite(n)) throw new Error("PostgREST count missing");
      total = n;
    } catch (err) {
      console.error("[listings] count request failed — serving the walk without the short-read check:", err);
    }

    const queue = BUCKETS.map((c, i) => [c, BUCKETS[i + 1]] as const);
    const collected: FeedRow[][] = [];
    await Promise.all(
      Array.from({ length: LANES }, async () => {
        for (let b; (b = queue.shift()); ) collected.push(await walk(b[0], b[1]));
      })
    );
    const rows = collected.flat();

    // Rows can be delisted between the count and the last page, so a handful
    // either way is normal drift (the calibration above already builds that
    // in); a real shortfall means pages went missing and has to be visible,
    // not inferred later from a make that looks thin. Serving this render is
    // still correct either way — see escapeFeedCache's comment for why FAIL
    // doesn't throw at request time — but FAIL must not let this become the
    // cached truth for the next 86,400 seconds the way it did tonight. The
    // one place it DOES throw is a production build (refuseDuringBuild),
    // where the read becomes a permanent artifact instead of a cache entry.
    const verdict = classifyFeedRead(rows.length, total);
    if (verdict !== "ok") {
      console.error(
        `[listings] SHORT READ (${verdict.toUpperCase()}): ${rows.length} rows of ${total} expected — the feed is being served incomplete`
      );
    }
    if (verdict === "fail") {
      refuseDuringBuild(
        `the feed walk came back ${rows.length} rows of ${total} expected`
      );
      await escapeFeedCache(SHARDS);
    }

    return rows.map((r) => ({
      ...r.payload,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      prevPriceUsd: r.prev_price_usd ?? undefined,
      priceChangedAt: r.price_changed_at ?? undefined,
      buybackDisclosed: r.buyback_disclosed || undefined,
      listedOn: r.listed_on ?? undefined,
    }));
  } catch (err) {
    // A build refusal raised above is not a read failure to be recovered
    // from — it is the deliberate stop. Let it out unrelabelled.
    if (err instanceof BuildFeedRefusal) throw err;
    // Reached only when the database IS configured (checked at the top) and
    // still did not answer — so the caller is about to serve the committed
    // snapshot, 58,730 cars standing in for ~100,300, with every request
    // returning 200. That is the 2026-08-16 incident: three production
    // deploys in a row shipped it to the browse grid and looked clean.
    //
    // Serving it is still right for a shopper-facing render — an outage
    // should not black out the site, and this file's own history (the
    // "flapping to stale fallback" note on escapeFeedCache) is what a throw
    // here would recreate. So the fallback gets the same treatment a
    // FAIL-level short read gets: served once, and named unmistakably in the
    // log. The log line is deliberately not the old
    // "serving bundled JSON fallback" — that phrasing read like a routine
    // degradation and sat unremarked through the 2026-08-16 and 2026-08-21
    // incidents.
    //
    // Note what this does NOT do: it does not stop the render from being
    // cached for the day. escapeFeedCache is a no-op from a force-static
    // route (see its comment — measured, not assumed). The callers that can
    // refuse are the ones that do: the sitemap publishes nothing on a
    // non-live feed, and feed-shard-check.mjs catches a poisoned browse
    // cache within 6 hours and clears it through /api/revalidate.
    lastWalkFailureAt = Date.now();
    refuseDuringBuild("the feed walk fell back to the committed snapshot");
    console.error(
      "[listings] FEED FALLBACK: Supabase read failed — serving the bundled JSON snapshot, which is NOT live inventory:",
      err
    );
    await escapeFeedCache(SHARDS);
    return null;
  }
}

/**
 * A build must never bake a feed read it cannot stand behind.
 *
 * Nothing in this app reads the feed during `next build` any more — the
 * browse index shards and the sitemap shards both render on first request
 * (app/api/index/[shard]/route.ts, app/sitemap/[shard]/route.ts), each for
 * the same reason: a prerender that walks the database puts every deploy at
 * the database's mercy, and four builds died that way on 2026-08-22. This is
 * the tripwire for re-introducing that coupling by accident.
 *
 * It fires only in the build phase, where a bad read becomes a permanent
 * artifact rather than a cache entry the next request replaces. In that
 * situation there is no good "serve it anyway": a deploy that quietly ships
 * the snapshot as if it were live inventory is exactly the failure the log
 * line above was supposed to prevent and didn't, because a green build reads
 * as a healthy one. Failing loudly is the honest outcome — CLAUDE.md's rule
 * is that a claim we cannot stand behind does not get made.
 */
class BuildFeedRefusal extends Error {}

function refuseDuringBuild(what: string): void {
  if (process.env.NEXT_PHASE !== "phase-production-build") return;
  throw new BuildFeedRefusal(
    `[listings] BUILD ABORTED: ${what}. Something in this build prerenders the live feed — it should not; ` +
      "the feed-reading routes render on first request on purpose (see app/api/index/[shard]/route.ts). " +
      "Shipping this build would bake incomplete inventory into a deploy that looks clean."
  );
}

/** One live listing by its site id — the detail page's row without paying for
 *  the whole feed. Null when the DB is unconfigured/unreachable or the id is
 *  unknown there (the caller falls back to the bundled JSON and samples). */
export async function fetchListingByIdFromDb(id: string): Promise<Listing | null> {
  if (!dbConfigured()) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  try {
    // Keyed on vin, not payload->>id: the id IS the lowercase VIN
    // (scraper/ingest.mjs; verified across all rows 2026-08-17), and the
    // payload-expression filter was a ~1s seq scan of the wide table on
    // every uncached detail render — the vin form is a primary-key lookup.
    // An id that isn't a VIN (sample rows) just misses here and resolves
    // through the caller's fallback scan, same as before.
    const res = await fetch(
      `${base}/rest/v1/live_listings_feed?select=payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at,buyback_disclosed,listed_on&vin=eq.${encodeURIComponent(
        id.toUpperCase()
      )}&limit=1`,
      { headers: headers(), next: { revalidate: REVALIDATE_SECONDS, tags: [FEED_CACHE_TAG] } }
    );
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    const [r] = (await res.json()) as FeedRow[];
    if (!r) return null;
    return {
      ...r.payload,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      prevPriceUsd: r.prev_price_usd ?? undefined,
      priceChangedAt: r.price_changed_at ?? undefined,
      buybackDisclosed: r.buyback_disclosed || undefined,
      listedOn: r.listed_on ?? undefined,
    };
  } catch (err) {
    console.error("[listings] Supabase by-id read failed:", err);
    return null;
  }
}

/** One listing's price-comparison cohort: every live listing whose VIN 1-8
 *  shares its ask-cohort key for this model year. The caller passes a SQL
 *  LIKE pattern over positions 1-8 (comps.ts askCohortFetchPattern) — a
 *  plain prefix for most cars, `_` wildcards where a maker spent a VIN digit
 *  on something that isn't the vehicle (Ford's GVWR class in position 4).
 *  This is the detail page's slice of the peer pool the browse index builds
 *  from the whole feed (lib/listings/peers.ts) — fetched narrow so the page
 *  keeps its one-row egress discipline instead of paying for 59k cars to
 *  price one. Postgres range-scans the vin primary key on the pattern's
 *  literal prefix and filters the rest; cohorts run a handful to a few
 *  hundred rows, well under the 1000-row page. Empty/null on failure: the
 *  page then shows no ask-side claim, which is the honest direction to fail
 *  in. */
export async function fetchCohortFromDb(vinPattern8: string, year: number): Promise<Listing[] | null> {
  if (!dbConfigured()) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  try {
    // Retried on server errors because a miss here is cached: this runs in
    // an ISR render, so one transient PostgREST 500 (they come in bursts
    // when the nightly jobs load the database) would bake a page with no
    // ask-side tile and serve it for the whole revalidate window — the
    // card-says-it, page-doesn't failure this fetch exists to prevent.
    // Observed doing exactly that on the first production render.
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(
        `${base}/rest/v1/live_listings_feed?select=vin,payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at,buyback_disclosed,listed_on&vin=like.${encodeURIComponent(
          vinPattern8.toUpperCase()
        )}*&payload->>year=eq.${year}&limit=${PAGE}`,
        { headers: headers(), next: { revalidate: REVALIDATE_SECONDS, tags: [FEED_CACHE_TAG] } }
      );
      if (res.status < 500 || attempt >= 2) break;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1) ** 2));
    }
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    const rows = (await res.json()) as FeedRow[];
    return rows.map((r) => ({
      ...r.payload,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      prevPriceUsd: r.prev_price_usd ?? undefined,
      priceChangedAt: r.price_changed_at ?? undefined,
      buybackDisclosed: r.buyback_disclosed || undefined,
      listedOn: r.listed_on ?? undefined,
    }));
  } catch (err) {
    console.error("[listings] Supabase cohort read failed:", err);
    return null;
  }
}

/** The detail-page extras for one listing: the dealer's description and the
 *  price history. Null when the DB is unconfigured, unreachable, or has no
 *  such row — the caller just renders without the extras. */
export async function fetchListingDetailFromDb(
  vin: string
): Promise<{ description?: string; priceHistory: Listing["priceHistory"] } | null> {
  if (!dbConfigured()) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const vinKey = encodeURIComponent(vin.toUpperCase());
  try {
    // History comes from listing_price_display (0040), not the raw table:
    // the raw log carries steps our own lanes manufactured by reading
    // different price fields off the same page (crawl internetPrice vs
    // recheck JSON-LD — the 08-17 recheck alone wrote 7,734 such "changes").
    // The view keeps only same-lane steps with no methodology transition
    // between them, so the sparkline can't draw a cut the dealer never made.
    // It's a windowed view PostgREST can't embed through listings, hence the
    // second request.
    const [res, histRes] = await Promise.all([
      fetch(`${base}/rest/v1/listings?select=payload&vin=eq.${vinKey}&limit=1`, {
        headers: headers(),
        next: { revalidate: REVALIDATE_SECONDS, tags: [FEED_CACHE_TAG] },
      }),
      fetch(
        `${base}/rest/v1/listing_price_display?select=price_usd,observed_at&vin=eq.${vinKey}&order=observed_at.asc`,
        { headers: headers(), next: { revalidate: REVALIDATE_SECONDS, tags: [FEED_CACHE_TAG] } }
      ),
    ]);
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    if (!histRes.ok) throw new Error(`PostgREST history ${histRes.status}`);
    const [row] = (await res.json()) as DetailRow[];
    if (!row) return null;
    const hist = (await histRes.json()) as { price_usd: number; observed_at: string }[];
    return {
      description: row.payload.description,
      // Points that aren't prices stay out of the sparkline: $0 abstains, and
      // the payment-figure artifacts that reached history before the
      // extractor guard existed ($1,996 dips on hyundaioflasvegas.com VINs,
      // 2026-08-19) would otherwise draw a price cut that never happened.
      priceHistory: hist
        .filter((h) =>
          hasRealPrice({
            priceUsd: h.price_usd,
            condition: row.payload.condition,
            year: row.payload.year,
          })
        )
        .map((h) => ({ priceUsd: h.price_usd, observedAt: h.observed_at }))
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
    };
  } catch (err) {
    console.error("[listings] Supabase detail read failed:", err);
    return null;
  }
}
