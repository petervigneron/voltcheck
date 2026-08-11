import type { Listing } from "./types";

// Server-side read of live listings from Supabase (PostgREST), with the
// bundled JSON as fallback (see source.ts). Plain fetch, no client library:
// the query is one GET and the anon key is read-only under RLS.
//
// Env (web/.env.local locally, project env vars on Vercel):
//   SUPABASE_URL=https://<project-ref>.supabase.co
//   SUPABASE_ANON_KEY=...   (anon/publishable key — safe for read-only use)
// Both absent → dbConfigured() is false and the app serves the bundled JSON.

const PAGE = 1000;
const REVALIDATE_SECONDS = 300; // data changes nightly; 5 min staleness is fine

interface DbRow {
  payload: Listing;
  first_seen_at: string;
  last_seen_at: string;
  listing_price_history: { price_usd: number; observed_at: string }[];
}

export function dbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

/** All live (non-delisted) listings, or null when the DB is unconfigured or
 *  unreachable — the caller falls back to the bundled JSON. */
export async function fetchListingsFromDb(): Promise<Listing[] | null> {
  if (!dbConfigured()) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY!;
  const select = "payload,first_seen_at,last_seen_at,listing_price_history(price_usd,observed_at)";
  try {
    const rows: DbRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const res = await fetch(
        `${base}/rest/v1/listings?select=${encodeURIComponent(select)}&delisted_at=is.null&order=vin.asc`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Range: `${from}-${from + PAGE - 1}`,
          },
          next: { revalidate: REVALIDATE_SECONDS },
        }
      );
      if (!res.ok) throw new Error(`PostgREST ${res.status}`);
      const page = (await res.json()) as DbRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows.map((r) => ({
      ...r.payload,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      priceHistory: (r.listing_price_history ?? [])
        .map((h) => ({ priceUsd: h.price_usd, observedAt: h.observed_at }))
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
    }));
  } catch (err) {
    console.error("[listings] Supabase read failed — serving bundled JSON fallback:", err);
    return null;
  }
}
