# Persistence + deploy — owner setup checklist

What exists in code (all verified locally, 2026-08-10):

- `supabase/migrations/0001_init.sql` — listings (one row per VIN, full
  history: first/last seen, delisted-not-deleted), `listing_price_history`
  (every price change logged), `ingest_runs` (one row per nightly sync), and
  the `ingest_listings()` RPC the scraper calls. Verified against a real
  embedded Postgres (`supabase/verify.mjs`): upsert by VIN, price-change
  logging, per-domain delisting (a domain whose crawl fails never
  mass-delists), relisting, junk rejection, RLS (public read, service-key-only
  write).
- `scraper/db-sync.mjs` — nightly push, wired into `nightly.sh` after
  `ingest.mjs`. Plain Node, zero dependencies, zero AI. No `scraper/.env` →
  skips quietly. Under 50 rows → refuses to sync (broken-crawl guard).
- `web/lib/listings/db.ts` — server-side read of live listings (with price
  history) from Supabase; `web/data/scraped-listings.json` remains the
  fallback whenever the DB is unconfigured or unreachable. Verified all three
  ways: DB path (mock PostgREST control test), no config, DB down.
- Listings now optionally carry `firstSeenAt` / `lastSeenAt` /
  `priceHistory` — days-on-lot and price-drop UI can be built on these.

The JSON file stays authoritative-at-ingest: the scraper still writes it
first, then mirrors it to the DB. Nothing breaks if Supabase is never set up.

## 1. Supabase (~10 min, free tier is fine)

1. Create a project at supabase.com (any region; nearest is fine).
2. SQL Editor → paste the whole of `supabase/migrations/0001_init.sql` → Run.
3. Project Settings → API: copy the Project URL, the anon/publishable key,
   and the service_role/secret key.
4. `cp scraper/.env.example scraper/.env` and fill in URL + service key.
5. `cp web/.env.example web/.env.local` and fill in URL + anon key.
6. First sync + verify:
   ```
   cd scraper && node db-sync.mjs
   ```
   Expect: `run 1 — 210 seen, 210 new, ...`. Then `npm run dev` in `web/` —
   the site should render the same inventory, now DB-served (check: stop
   the dev server, add a junk `SUPABASE_URL` to `.env.local`, restart — it
   falls back to JSON and logs the failure).

After that, the existing launchd nightly does everything: crawl → ingest →
db-sync, and history starts accumulating from day one.

## 2. Vercel (needs your account + a git repo)

- The project isn't a git repository yet. Vercel deploys from git:
  `git init` at the project root (`.gitignore` is already in place and
  keeps `.env*` out), commit, push to a private GitHub repo.
- vercel.com → New Project → import the repo → set **Root Directory to
  `web/`**. No other build config needed (stock Next.js).
- Add two environment variables in the Vercel project: `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` (anon key only — the service key never leaves
  `scraper/.env` on this Mac).
- Deploy. The deployed site reads Supabase at request time (5-min
  revalidate), so nightly local crawls show up without redeploying. The
  bundled JSON snapshot ships as the build-time fallback.

## Key hygiene

- anon/publishable key: read-only under RLS — safe in Vercel env and the
  browser-adjacent server code. It is the only key the web app ever gets.
- service_role/secret key: write access, bypasses RLS — lives only in
  `scraper/.env` on this Mac. Never in the repo, never in Vercel.
- If a key ever lands in a commit: rotate it in Supabase (Settings → API),
  fix the files, and force-push history removal is NOT enough on a public
  repo — rotation is the fix.

## Re-verifying the schema after changes

`supabase/verify.mjs` runs the exact migration file against an embedded
Postgres (PGlite) and simulates nightly runs:

```
cd supabase && npm install && node verify.mjs
```
