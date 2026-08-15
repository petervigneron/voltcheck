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

const PAGE = 1000;
const REVALIDATE_SECONDS = 3600;

interface FeedRow {
  payload: Listing;
  first_seen_at: string;
  last_seen_at: string;
  prev_price_usd: number | null;
  price_changed_at: string | null;
}

interface DetailRow {
  payload: Listing;
  listing_price_history: { price_usd: number; observed_at: string }[];
}

export function dbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
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
  const feedUrl = `${base}/rest/v1/live_listings_feed?select=payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at&order=vin.asc`;
  try {
    // One cheap request for the row count, then every page in parallel — the
    // sequential page-after-page loop was ~16 round-trips of serial latency,
    // the bulk of a 2s TTFB. If the count drifts before the next revalidate
    // the last page runs short or long by a few rows for an hour; harmless.
    const countRes = await fetch(feedUrl, {
      headers: { ...headers(), Range: "0-0", Prefer: "count=exact" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!countRes.ok) throw new Error(`PostgREST ${countRes.status}`);
    const total = Number(countRes.headers.get("content-range")?.split("/")[1]);
    if (!Number.isFinite(total)) throw new Error("PostgREST count missing");

    const pages = await Promise.all(
      Array.from({ length: Math.ceil(total / PAGE) }, async (_, i) => {
        const from = i * PAGE;
        const res = await fetch(feedUrl, {
          headers: { ...headers(), Range: `${from}-${from + PAGE - 1}` },
          next: { revalidate: REVALIDATE_SECONDS },
        });
        if (!res.ok) throw new Error(`PostgREST ${res.status}`);
        return (await res.json()) as FeedRow[];
      })
    );
    return pages.flat().map((r) => ({
      ...r.payload,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      prevPriceUsd: r.prev_price_usd ?? undefined,
      priceChangedAt: r.price_changed_at ?? undefined,
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
    const res = await fetch(
      `${base}/rest/v1/live_listings_feed?select=payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at&payload->>id=eq.${encodeURIComponent(
        id
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
    };
  } catch (err) {
    console.error("[listings] Supabase by-id read failed:", err);
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
