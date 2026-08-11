# Persistence + deploy — state of the world

Updated 2026-08-10 (evening). Supabase is LIVE; Vercel is the only step left.

## What is running now

- **Supabase project `voltcheck`** (`thyseizrqdoqjiqsodzu`, us-west-1, free tier,
  org "Dispatch"): schema from `supabase/migrations/0001_init.sql` applied;
  210 listings synced (run 1, source "initial"); security advisors clean.
  - `listings` — one row per VIN ever seen; first/last seen; delisted, never deleted.
  - `listing_price_history` — first sighting + every price change.
  - `ingest_runs` — one row per sync with counts.
- **Ingest gateway** — edge function `supabase/functions/ingest`. The scraper
  holds NO service key; it posts rows with a minted token (`scraper/.env`,
  gitignored) and the function forwards to the `ingest_listings()` RPC using
  the service key Supabase injects server-side. Verified: wrong token → 403;
  anon key calling the RPC directly → 401.
  - **Rotate the token**: generate a new one (`openssl rand -hex 32`), redeploy
    the function with it substituted for `__DEPLOY_TIME_TOKEN__`, update
    `scraper/.env`. The committed function file carries only the placeholder.
  - The alternative mode (service key in `scraper/.env` as
    `SUPABASE_SERVICE_ROLE_KEY`, direct RPC, no edge function) still works —
    db-sync.mjs prefers it when present.
- **Nightly** — `scraper/nightly.sh` runs crawl → vpic-enrich → ingest →
  db-sync. History accumulates from tonight without any further action.
- **Web** — reads Supabase server-side (`web/.env.local`), bundled JSON
  fallback on unconfigured/unreachable. Verified against the live project.
- **GitHub** — private repo `petervigneron/voltcheck`, branch `main`. No
  secrets tracked (`.env` files gitignored; only `.env.example` templates).

## Remaining: Vercel

Blocked only on a signed-in Vercel session (CLI token expired; browser not
signed in; password entry is owner-only). Once a session exists:

1. vercel.com → Add New Project → import `petervigneron/voltcheck`.
2. **Root Directory: `web/`** — the one setting that matters. Framework
   auto-detects as Next.js.
3. Environment variables (Production + Preview):
   - `SUPABASE_URL` = `https://thyseizrqdoqjiqsodzu.supabase.co`
   - `SUPABASE_ANON_KEY` = the anon key (public-by-design; in `web/.env.local`)
   The service key is NOT a Vercel variable — it exists only inside the edge
   function runtime.
4. Deploy, then verify: the live page should show the same inventory count as
   local, and Supabase's API logs (dashboard → Logs → API) should show the
   `/rest/v1/listings` GET from Vercel.

The site reads the DB at request time (5-minute revalidate), so nightly
crawls update the live site with no redeploys.

## Re-verifying the schema after changes

`supabase/verify.mjs` runs the exact migration file against an embedded
Postgres (PGlite) and simulates nightly runs:

```
cd supabase && npm install && node verify.mjs
```
