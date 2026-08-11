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

## Vercel — LIVE (2026-08-11)

Production: **https://voltcheck-mu.vercel.app** (project `voltcheck`, hobby
plan, deployed via CLI from `web/`; CLI re-authenticated through the device
flow). `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set for Production and
Preview; the service key is NOT a Vercel variable — it exists only inside
the edge function runtime. Verified: live page renders the DB inventory and
Supabase's API logs show the request from the Vercel render.

The site reads the DB at request time (5-minute revalidate), so nightly
crawls update the live site with no redeploys. Deploys are CLI-based
(`npx vercel deploy --prod` from `web/`); connecting the GitHub repo in the
Vercel dashboard later would enable auto-deploy on push, and needs a
signed-in github.com browser session (optional).

## Re-verifying the schema after changes

`supabase/verify.mjs` runs the exact migration file against an embedded
Postgres (PGlite) and simulates nightly runs:

```
cd supabase && npm install && node verify.mjs
```
