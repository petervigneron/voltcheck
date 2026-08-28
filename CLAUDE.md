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
nothing that a shopper can see. Deploying is a CLI step — and it is part of
finishing: when your work changes `web/`, deploy it (owner, 2026-08-19: "I
don't like it when you finish code and don't deploy it — hard for me to have
any idea what needs to go live"). If you genuinely can't deploy (a build
already running, database busy), say explicitly what is committed but not
yet live rather than leaving it silent.

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
`curl voltcheck.net/api/index/first`, `/api/index/trims` (the /worth trim
facets, since 2026-08-25), and `/api/index/0` through `/23` —
because the first-paint payload and the shards render on first request rather
than at build time (deliberate: prerendering them put every deploy at the
database's mercy). Warm `first` first: it is the one the next visitor's first
card waits on. **A shard answering 413 (CONTENT_TOO_LARGE) means the shard
payload has outgrown Vercel's ~4.5 MB cold-render cap again** — that is the
2026-08-24 incident (129k cars ÷ 6 shards = 7.1 MB; deployments with existing
cache entries revalidated fine, fresh ones could not warm at all; recovered
with `vercel promote <previous>`); the fix is raising SHARDS in
web/lib/listings/pack.ts and its keep-in-step consumers, never trimming the
feed. Then **warm the sitemaps** — `/sitemap/0.xml` through `/11.xml` (the
sitemap shard count is separate: web/lib/sitemap.ts SITEMAP_SHARDS, 12 since
2026-08-24, raised for the same ~4.5 MB cap) — which render on first request
for the same reason since 2026-08-22.

Then **check the shards' row counts, not their status codes.** A poisoned
shard answers 200. On 2026-08-21 five of them served ~9,800 rows each where
~16,700 was right, hiding 34,000 cars for most of a day; ~9,788 is what the
committed fallback snapshot divides into, so that is very likely what it was.
The shard counts must sum to the `total` in `/api/index/first` and sit within
a few percent of each other. `scraper/feed-shard-check.mjs` is this check, and
it runs every 6 hours in feed-audits.yml.

**Do not deploy while Supabase is erroring.** Since 2026-08-22 this is a hard
rule, not a caution, because the penalty changed: `/api/index/[shard]` now
refuses to serve a feed that fell back to the bundled snapshot (it throws on
`origin === "fallback"`, the same way the sitemap shards do). A cached shard
is protected by that — a throw leaves the previous entry in place, so a sick
database costs freshness rather than coverage — but **a fresh deployment has
no previous entry to fall back on**. Warming one against a sick database
returns 500s on the browse grid until a walk completes. The old failure was
worse but quieter: the snapshot cached for a full day, 58,730 cars standing in
for ~100,300, which is the 2026-08-16 and 2026-08-21 incident and hid 34,000
cars for most of a day. Loud and self-healing was the deliberate trade.

**"The database answers" means a full WALK, not a page.** Verified the hard
way on 2026-08-22: 35 of 36 VIN-bucket pages answered in ~0.3s, the deploy
went ahead, and `/api/index/first` then rendered for 249 seconds and cached
the snapshot anyway. A walk is ~226 sequential pages and the instance's
latency is bimodal (see the CPU/IO findings), so single pages say nothing
about whether one can clear. `scraper/walk-gate.mjs` is that walk — run it
from outside the site and deploy only if it exits 0. It walks db.ts's shape
(36 buckets, PAGE=500, keyset on `vin=gt.`, `FEED_LANES` lanes, and db.ts's
own column list — a `select=vin` walk can be served from an index and clears
on a box the real walk dies on) and checks what it returned against the count
the database itself reports, so a silent short read fails it too. Do not put
it on a schedule: it moves ~117 MB a run. If a deploy does poison the cache,
`vercel promote <previous-deployment-url>` restores it in seconds: the ISR
cache is per deployment, so the previous one still holds its warm entries.

**The browse feed is not rendered from a walk any more, so no cache lever
refreshes it.** Since 2026-08-26 `/api/index/first`, `/trims` and `/0`–`23`
serve *published artifacts* — 27 files in the public `feed` storage bucket,
written by `web/scripts/publish-feed.mjs` via `publish-feed.yml`, which
nightly.yml calls as its last job. The route falls back to walking only when
the artifact is missing or older than its 36h gate. So the grid's freshness is
the **publish cadence**, and nothing else: expiring caches re-renders the
routes, and the re-render re-reads the same artifact and serves the same
numbers.

This is worth being blunt about because it cost a day of debugging on
2026-08-28, when the grid sat at 134,080 cars against a database holding
147,581 and it read exactly like a cache that would not purge. Three fixes
were tried at the cache-tag layer and all three were beside the point:
`revalidateTag(tag, { expire: 0 })` (the 2nd arg is a cacheLife *profile* in
Next 16, not a purge), `updateTag` (500s — Next forbids it outside a Server
Action), and single-arg `revalidateTag` (the documented immediate-expiration
path). The last one *works*: the route genuinely re-renders,
`x-vercel-cache: REVALIDATED`, `age: 0`. It just re-renders the artifact. The
tells were all there and all misread — the re-render took 0.8–2.1 s where a
walk is 90–300 s, a brand-new deployment with an empty route cache showed the
same stale total, and the number only ever moved once a night. What settled it
in one command was diffing the served body against the bucket:
`curl $SUPABASE_URL/storage/v1/object/public/feed/first.json` came back
byte-identical to `curl voltcheck.net/api/index/first`. Do that first.

**After any out-of-cycle db-sync, or any crawl that lands cars outside the
nightly, dispatch the publisher — `gh workflow run publish-feed.yml`.** That
is the whole remedy: it walks once at `FEED_LANES=2` (gentle by design, ~4
min), publishes the 27 files, POSTs `/api/revalidate` and warms all 26 index
paths. A bare revalidate POST does not do it. On 2026-08-28 a manually
dispatched 2h20m rolling crawl added ~13,500 cars after the night's publish,
and they stayed invisible on the grid until the publisher was re-run.
`refresh-site.yml` (04:00/16:00 UTC) was built for the walk era and its age
gate now guards a refresh that cannot change anything; leave it, but do not
reach for it as a freshness fix.

The route cache is still a **day**, not an hour (the 2026-08-17 egress
incident: hourly re-walks were ~1.2 GB/day against a 5 GB/month quota), and
the revalidate secret is still the GitHub Actions secret
`FEED_REVALIDATE_SECRET` (plaintext in the local
`docs/feed-revalidate-secret.txt`; the route pins its sha256) — that POST is
what *warms* a republish onto the site, it is just not what *makes* one. The
**sitemaps** are the one surface still on the walk path, so they re-walk after
every revalidate and can time out on a first render (`/sitemap/0.xml` aborted
mid-warm on 2026-08-28 and answered 12,360 URLs in 0.9 s a minute later —
re-request before believing a sitemap shard is short). And don't point
full-feed scripts at Supabase when `voltcheck.net/api/index/0`–`23` already
serve the same rows off Vercel's CDN for free.

## Database

- Migrations are numbered and append-only. Never renumber or rewrite an
  applied one; add the next number instead.
- They are applied to production directly (Supabase MCP or CLI). There is no
  staging database, so read what a migration replaces before you replace it —
  dry-run a `create view` as a temp view and diff it against the live one.
- Four materialized views are refreshed nightly by `refresh_vin_variants(target)`,
  one call per view (0051): `vin_variant_observed`, `listing_freshness`,
  `ev_cohort_trim_spread`, `ev_cohort_velocity`. Anything scanning `listings`
  per request will blow anon's statement timeout — which is **3 seconds**
  (verified in pg_roles 2026-08-26; authenticated is 8s, service_role 60s; an
  earlier version of this line said 8s for anon and was wrong) — at current
  inventory size: materialize it and refresh it there.
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

## The house rule on copy

The other half of the same rule, and the one that keeps getting broken. The
value is the answer. Nothing gets a second line explaining it.

- **If there is nothing to say, print nothing.** Not a sentence reporting the
  absence. "Asking price unchanged since first seen Aug 15", "No asking-price
  history recorded for this listing" — both were deleted on 2026-08-25 for
  this. A shopper does not need to be told a thing did not happen.
- **Never restate the value in different words.** "84 kWh" does not need
  "Long Range pack" under it. "800V" does not need "697 V nominal". "Standard"
  does not need "Standard on AWD" on a row already keyed to AWD.
- **No history lessons, no trade names, no campaign IDs.** "Native NACS from
  the MY2025 facelift; 2025 cars shipped with a CCS adapter included" under a
  row reading NACS is four facts the shopper did not ask for. "NHTSA 25V482 /
  26V068" is our filing reference, not their answer.
- **A `note` on a Fact is working, not copy**, and by rule it renders nowhere
  on the page — only in the row's hover. `web/lib/enrichment/noteRule.ts` has
  the full history; `web/scripts/note-hygiene.mjs` fails CI if a component
  starts printing one. Write whatever note the research needs; no shopper
  reads it.
- Three earlier sweeps tried to keep the "good" notes and filter the rest.
  All three were re-broken by the next research tranche, and every time the
  detector was the owner opening a listing. **Do not propose a filter.** The
  answer to "does this note earn its line?" is no.
