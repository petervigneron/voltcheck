# Voltcheck

The most comprehensive listings of all EVs and PHEVs for sale in the
United States — new, used, and certified. Comprehensiveness is the whole
point: every electrified vehicle on the market, not a curated subset. Live
at voltcheck.net.

Three lanes, and they are worked on independently:

| Lane | What it is |
|---|---|
| `web/` | The Next.js app. Has its own `AGENTS.md` — **read it**, this is not the Next.js you know. |
| `scraper/` | Node scripts that fill the database: dealer crawls, OEM inventory APIs, vPIC decodes, Washington title sales. Run nightly by `.github/workflows/nightly.yml`. |
| `supabase/` | Numbered migrations and the ingest edge function. |

`docs/` is gitignored on purpose — research and strategy notes stay local and
out of the public repo.

## Git: more than one session works in this tree

Several Claude sessions are often open on this repo at once, in the same
working directory. That makes staging a shared resource.

- **Stage explicit paths. Never `git add -A`, `git add .`, or `git commit -a`.**
  A broad stage sweeps up whatever another session has half-written and commits
  it under your message. This has happened repeatedly; on 2026-08-15 an
  in-progress migration was committed by an unrelated session before its own
  work was finished.
- **Check `git status` before staging, and expect to see files that aren't
  yours.** Leave them alone. Their absence from your commit is the point.
- If work is genuinely parallel and long-running, use a separate worktree
  rather than sharing this one.
- Commit messages here are a sentence describing the change from the user's
  side ("Say how many cars a search found without scrolling past 60 of them"),
  then the reasoning: what was wrong, what was measured, what was rejected and
  why. Approaches that were tried and failed are worth more words than the code.
- Branch only when asked; this project commits to `main`.

## Deploys are not automatic

Vercel is **not** hooked to git pushes here. A commit on `main` changes
nothing that a shopper can see. Deploying is a CLI step, and it is the user's
call — ask, don't assume a merge means ship.

The CLI deploys the **working tree**, not a commit — and with several sessions
sharing this tree, that means someone else's half-finished edits can ship to
shoppers under your deploy. Deploy from a clean worktree pinned to the commit
you mean to ship (`git worktree add <dir> <sha>`, copy `web/.vercel/` in, then
`vercel --prod` from its `web/`), never from this directory unless
`git status` is clean.

Every Vercel build walks the entire feed out of the one free-plan database —
the same database the survey scripts in `docs/tools/` walk, the ingest lane
writes to, and every other session's build reads. It cannot take that from
two of us at once: on 2026-08-16 three sessions ran surveys and deploys
concurrently, the Nano instance crash-looped, and five straight builds
failed or shipped the stale bundled fallback. Before deploying, check
`vercel ls` for a build already running and wait it out; don't run full-feed
scripts while any deploy is building. `FEED_LANES=2` exists for deploying
while the database is busy.

After a deploy reports Ready: **verify the domain moved** (curl voltcheck.net
for content only the new build has; one 2026-08-16 deploy stayed unaliased
until `vercel promote <deployment-url>`), then **warm the browse index** —
`curl voltcheck.net/api/index/first` and `/api/index/0` through `/5` — because
the first-paint payload and the shards render on first request rather than at
build time (deliberate: prerendering them put every deploy at the database's
mercy). Warm `first` first: it is the one the next visitor's first card waits
on.

The browse feed is cached a **day**, not an hour (the 2026-08-17 egress
incident: hourly re-walks were ~1.2 GB/day against a 5 GB/month quota).
nightly.yml's last step POSTs `voltcheck.net/api/revalidate`, which expires
the `feed` cache tag and warms the shards — the site refreshes when the data
actually changes, and at most a day later if that signal is lost. The secret
is the GitHub Actions secret `FEED_REVALIDATE_SECRET` (plaintext in the local
`docs/feed-revalidate-secret.txt`; the route pins its sha256). After any
**out-of-cycle db-sync**, send that POST yourself — until the next nightly,
shoppers are seeing yesterday's feed. And don't point full-feed scripts at
Supabase when `voltcheck.net/api/index/0`–`5` already serve the same rows off
Vercel's CDN for free.

## Database

- Migrations are numbered and append-only. Never renumber or rewrite an
  applied one; add the next number instead.
- They are applied to production directly (Supabase MCP or CLI). There is no
  staging database, so read what a migration replaces before you replace it —
  dry-run a `create view` as a temp view and diff it against the live one.
- Two materialized views are refreshed nightly by `refresh_vin_variants()`:
  `vin_variant_observed` and `ev_cohort_trim_spread`. Anything scanning
  `listings` per request will blow anon's 8-second statement timeout at
  current inventory size — materialize it and refresh it there.
- `scraper/registry/registry.json` is hand-curated. Never regenerate or
  clobber it.
- Grep **both** `web/` and `scraper/` before dropping a database function.
  Dropping one that looked unused silently killed the price-audit lane once.

## The house rule on claims

This site tells shoppers what a car is worth. Every number it prints is a
claim it has to be able to stand behind.

- Matching nothing is honest; matching the wrong thing is not. When the data
  can't support a claim, the code goes quiet — it does not guess, and it does
  not soften a guess with a hedge.
- Mark anything that isn't the manufacturer's own figure as estimated. Check a
  fact's source before surfacing it, or an aggregate quietly becomes a fact.
- Guardrails in `web/lib/listings/comps.ts` and the price-model migrations each
  exist because of a specific false claim that reached the site. Don't relax
  one without reproducing the failure it was added for; the comments name them.
- A false bargain is the most expensive error here — it costs a shopper money —
  so caution is deliberately asymmetric between "over" and "under".
- Verify negatives with a control test before reporting something as absent.
