import type { Listing } from "./types";

// Server-side reads from Supabase (PostgREST), with the bundled JSON as
// fallback (see source.ts). Plain fetch, no client library: the queries are
// GETs and the anon key is read-only under RLS.
//
// Egress discipline (free plan, 2026-08-14 incident): the bulk read uses the
// live_listings_feed view (migration 0011) — payload minus `description`,
// which is ~45% of payload bytes and renders only on the detail page. The
// detail page fetches its one row, description and price history included,
// via fetchListingDetailFromDb. Both requests ask for gzip explicitly (the
// wire is what Supabase bills; ~3.7x smaller) and revalidate hourly — the
// data changes about once a day (nightly sync, recheck, price audit).
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
const REVALIDATE_SECONDS = 3600;

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
  listing_price_history: { price_usd: number; observed_at: string }[];
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
async function fetchWithRetry(url: string, init: RequestInit & { next?: { revalidate: number } }) {
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

/** All live (non-delisted) listings — no descriptions, no price history —
 *  or null when the DB is unconfigured or unreachable, in which case the
 *  caller falls back to the bundled JSON. */
export async function fetchListingsFromDb(): Promise<Listing[] | null> {
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
        next: { revalidate: REVALIDATE_SECONDS },
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
    const countRes = await fetchWithRetry(`${base}/rest/v1/listings?select=vin&delisted_at=is.null`, {
      headers: { ...headers(), Range: "0-0", Prefer: "count=exact" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!countRes.ok) throw new Error(`PostgREST ${countRes.status}`);
    const total = Number(countRes.headers.get("content-range")?.split("/")[1]);
    if (!Number.isFinite(total)) throw new Error("PostgREST count missing");

    const queue = BUCKETS.map((c, i) => [c, BUCKETS[i + 1]] as const);
    const collected: FeedRow[][] = [];
    await Promise.all(
      Array.from({ length: LANES }, async () => {
        for (let b; (b = queue.shift()); ) collected.push(await walk(b[0], b[1]));
      })
    );
    const rows = collected.flat();

    // Rows can be delisted between the count and the last page, so a handful
    // either way is normal drift; a real shortfall means pages went missing and
    // has to be visible in the build log, not inferred later from a make that
    // looks thin.
    if (rows.length < total * 0.99) {
      console.error(
        `[listings] SHORT READ: ${rows.length} rows of ${total} expected — the feed is being served incomplete`
      );
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
    console.error("[listings] Supabase read failed — serving bundled JSON fallback:", err);
    return null;
  }
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
      { headers: headers(), next: { revalidate: REVALIDATE_SECONDS } }
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
        { headers: headers(), next: { revalidate: REVALIDATE_SECONDS } }
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
  const select = "payload,listing_price_history(price_usd,observed_at)";
  try {
    const res = await fetch(
      `${base}/rest/v1/listings?select=${encodeURIComponent(select)}&vin=eq.${encodeURIComponent(
        vin.toUpperCase()
      )}&limit=1`,
      { headers: headers(), next: { revalidate: REVALIDATE_SECONDS } }
    );
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    const [row] = (await res.json()) as DetailRow[];
    if (!row) return null;
    return {
      description: row.payload.description,
      priceHistory: (row.listing_price_history ?? [])
        .map((h) => ({ priceUsd: h.price_usd, observedAt: h.observed_at }))
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
    };
  } catch (err) {
    console.error("[listings] Supabase detail read failed:", err);
    return null;
  }
}
