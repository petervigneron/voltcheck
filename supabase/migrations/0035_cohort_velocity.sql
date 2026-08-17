-- "How fast does this model leave the market?" — measured, but not yet spoken.
--
-- SHIPS DARK. Nothing in web/ reads this view, and it carries no anon grant.
-- It exists so that when a surface does ship, the read is a keyed lookup
-- against a few hundred rows instead of a scan of listings: 0020 established
-- what happens otherwise (a per-request aggregate over listings pushed
-- recent_sales() past anon's statement timeout and the sales box silently
-- vanished), and the timeout anon actually runs under is 3 seconds, not the
-- 8 that 0020's comment quotes.
--
-- ── The measurement, and why it is split by AUTHORITY ──────────────────────
--
-- The raw signal is listings.delisted_at: a car that was in inventory and is
-- no longer. Counting that per cohort is one GROUP BY. The reason this
-- migration is mostly prose is that the naive version of that count is a
-- LANE ARTEFACT WEARING DEMAND'S CLOTHES.
--
-- Two different mechanisms set delisted_at, and they retire cars on different
-- evidence, at different speeds, with different failure modes:
--
--   locator  — rows on the OEM-locator domains recheck deliberately skips.
--              Their only retirement path is ingest_listings' complete-crawl
--              rule (0002): the lane certifies truncated:false, and every VIN
--              on that domain absent from the pull is delisted THAT NIGHT.
--              Fast, total, and it fires on the whole domain at once.
--   recheck  — everything else: dealer-site rows, plus the OEM lanes whose
--              rows carry real dealer VDPs (audi-network, ford-blue-advantage,
--              honda-prologue, hyundai-cpo). recheck_listings (0004/0025)
--              fetches each car's own page and needs TWO consecutive misses
--              before it sets delisted_at, so these rows retire at least a day
--              later than a locator row would for the same real-world event.
--              (A complete dealer-domain crawl can also retire them, so this
--              label means "recheck-covered", not "recheck-only".)
--
-- Measured on prod 2026-08-17, and the reason the split is not optional: the
-- "fastest-selling" cohorts came out as exactly the locator-lane ones (2023
-- EQS: 15 of 69 gone in 7 days) and the "stalest" as exactly the dealer-site
-- ones (2023 ID.4: 160 live, 0 gone). That is not demand. That is one lane
-- delisting nightly on completeness while the other's delist job was DOWN
-- 08-15 → 08-17. Ranking those two lanes against each other would have put a
-- lane split on the site with a shopper-facing story attached to it.
--
-- So authority is part of the KEY, not a column you may sum over. A cohort
-- that lives in both lanes gets two rows, and they are two different
-- measurements of two different things.
--
--   FORBIDDEN, and there is no honest way to do it later: comparing,
--   ranking, averaging or summing across delist_authority. Any surface built
--   on this view either states which lane it is describing, or shows one lane.
--
--   FORBIDDEN: calling any of this "sold". delisted_at means the car left
--   the feed we were watching. It also fires on a dealer swapping platforms,
--   a locator dropping a car from its index, a crawl that certified
--   completeness it did not have, and a wholesale transfer between rooftops.
--   A sibling session is calibrating how much of the delist signal is
--   actually a retail sale; until that lands, the only phrase this view
--   supports is "left the market". Not "sold", not "sold in 7 days", and not
--   a hedged "likely sold" — a hedge on a guess is still a guess (house rule).
--
--   TAINTED WINDOW: recheck was broken 2026-08-15 → 08-17, so recheck-
--   authority delists in that stretch were never recorded. Any read taken
--   before 2026-08-24 has that outage inside its 7-day window, and before
--   2026-09-14 inside its 28-day window, and understates the recheck lane
--   in exactly the direction that makes dealer inventory look stale. The
--   view carries computed_at so a reader can tell which window it got.
--
-- ── Lanes with NO delist authority are excluded outright ───────────────────
--
-- nissan-new and nissan-cpo are the hole in the two-way split. Both are
-- synthetic covering-grid domains marked truncated:true ALWAYS (so 0002's
-- complete-crawl rule never delists them) AND both sit in recheck's skip set,
-- because the Nissan VDP echoes the VIN out of its own URL and would read
-- alive forever. Net: nothing in the database can ever set delisted_at on a
-- Nissan locator row. Their gone counts are structurally zero — not slow, not
-- measured, absent — and a zero that cannot become non-zero is the most
-- convincing wrong number this view could produce.
--
-- REJECTED: a third authority value ('none') carrying nulls. A label invites
-- a surface to render it, and the row would exist solely to be filtered out
-- correctly by every future reader forever. Matching nothing is honest: the
-- rows do not exist. Keep this list in sync when a lane's completeness
-- contract changes — the failure mode is a cohort that can never sell.
--
-- ── New cars are excluded, not given their own columns ─────────────────────
--
-- Every count here is used + certified. A new car leaving a locator's index
-- is a delivery or an allocation reshuffle, not a used-market event, and this
-- site answers used-market questions. The concrete damage from mixing them:
-- the cohort key is VIN(1-8) + model year, which does NOT separate new stock
-- from used stock of the same year — so on a 2026 cohort, new-inventory churn
-- (~36k of the ~39k locator rows are new) would be doing the talking about
-- the handful of used cars a shopper is actually looking at.
--
-- REJECTED: emitting new_live_n / new_gone_7d alongside. Sharing a row is an
-- invitation to sum the two, and the sum has no referent. If "how fast does
-- new inventory turn" ever becomes a question worth answering, it gets its
-- own view with its own comment about what a delivery is.
--
-- A missing condition counts as USED, mirroring web/lib/listings/match.ts:81,
-- which has always read `condition === "used" || "certified" || !condition`.
-- This is load-bearing, not tidiness: scraper/ingest.mjs's condition() returns
-- undefined whenever neither the feed nor the URL says, which is most of the
-- dealer-site lane. Requiring an explicit 'used' would empty the recheck
-- authority and leave a view that is 100% locator rows — the exact bias this
-- migration exists to expose.
--
-- ── What is deliberately NOT here ──────────────────────────────────────────
--
-- No minimum-cohort floor and no rate/percentage column. The measurement
-- lives in the database and the POLICY (how few cars is too few to speak
-- about, what fraction counts as fast) stays next to the surface, the same
-- division 0022 drew between ev_cohort_trim_spread and comps.ts. Raw counts
-- can be re-judged; a baked-in threshold cannot.
--
-- A sharper attribution is available later if it is ever worth it:
-- listing_events records a 'delisted' row per VIN with the run that did it,
-- so a future version could attribute each delisting to the job that fired
-- rather than inferring it from the domain. Domain inference is used here
-- because it is exactly what recheck itself keys on, so the two can only
-- disagree if recheck's skip set drifts from the copy below — which the
-- control query at the bottom checks.
--
-- ── APPLY-TIME HAZARD ──────────────────────────────────────────────────────
-- This migration must NOT recreate or alter live_listings_feed. That view has
-- been OWNER-RIGHTS (security_invoker = false) since 0026, and 0028's first
-- application recreated it with security_invoker = true, which killed every
-- anon feed read with "permission denied for table listing_seen" and dropped
-- the site to its bundled snapshot for ~10 minutes. Nothing below touches it.
-- refresh_vin_variants() is likewise replaced with CREATE OR REPLACE carrying
-- 0028's full body forward verbatim plus one refresh — never dropped, never
-- trimmed to "just the new bit".

create materialized view ev_cohort_velocity as
with base as (
  select upper(substring(l.vin, 1, 8)) as vin8,
         l.year as model_year,
         -- MUST MIRROR OEM_LOCATOR_DOMAINS in scraper/recheck.mjs, which is
         -- assembled from the per-lane exports in scraper/lib/oem/*.mjs
         -- (gm: GM_BRANDS + CARBRAVO, hyundai: HYUNDAI.domain, kia, nissan,
         -- bmw, mercedes, stellantis, genesis, vw, enterprise). KEEP IN SYNC
         -- when a lane is added or its recheck posture changes — the same
         -- standing obligation 0028 carries for its sampled-lane list, and
         -- the same failure shape: a new locator lane silently labelled
         -- 'recheck' would put crawl-completeness delists into the bucket a
         -- surface believes was verified per-VIN.
         --
         -- NOT in this list, on purpose: audi-network, ford-blue-advantage,
         -- honda-prologue, hyundai-cpo. Those are OEM lanes too, but their
         -- rows carry real dealer VDPs and recheck does verify them per VIN,
         -- so their authority genuinely is 'recheck'.
         case when l.dealer_domain in (
                'buick.com', 'cadillac.com', 'carbravo.com', 'chevrolet.com',
                'gmc.com',                            -- gm.mjs
                'hyundaiusa.com',                     -- hyundai.mjs (new pull)
                'kia.com',                            -- kia.mjs (new + CPO)
                'bmwusa.com',                         -- bmw.mjs
                'mbusa.com',                          -- mercedes.mjs
                'dodge.com', 'fiatusa.com', 'jeep.com', -- stellantis.mjs
                'genesis.com',                        -- genesis.mjs
                'vw.com',                             -- vw.mjs
                'enterprisecarsales.com'              -- enterprise.mjs
              ) then 'locator' else 'recheck' end as delist_authority,
         l.make,
         l.model,
         l.delisted_at
  from listings l
  where l.vin is not null and length(l.vin) = 17
    and l.year is not null
    and l.dealer_domain is not null
    -- No delist authority at all — see the header. These would read as
    -- permanently unsellable inventory.
    and l.dealer_domain not in ('nissan-new', 'nissan-cpo')
    -- Used + certified only; a null condition is used (match.ts:81).
    and coalesce(lower(l.condition), 'used') in ('used', 'certified')
)
select vin8,
       model_year,
       delist_authority,
       -- Same min() convention ev_price_model uses: the cohort key already
       -- pins make and model, so any member's copy is the cohort's.
       min(make)  as make,
       min(model) as model,
       (count(*) filter (where delisted_at is null))::int as live_n,
       -- Windows are relative to REFRESH time, not read time. 7d is the
       -- shortest window that survives a single missed nightly (the lane has
       -- missed several: 08-14 → 08-17); 28d is four of those, long enough
       -- for a slow cohort to register a first departure at all. Both are
       -- shorter than the archive, which only starts 2026-08-11 — until
       -- ~2026-09-08, gone_28d is "everything we have ever seen leave",
       -- not a settled 28-day rate.
       (count(*) filter (where delisted_at >= now() - interval '7 days'))::int  as gone_7d,
       (count(*) filter (where delisted_at >= now() - interval '28 days'))::int as gone_28d,
       -- Stamped so a reader can tell how old the windows are, and whether
       -- they still overlap the 08-15 → 08-17 recheck outage. It moves on
       -- every refresh, so REFRESH CONCURRENTLY diffs every row as changed
       -- rather than a handful — irrelevant at a few hundred rows, and worth
       -- reconsidering only if this view ever grows by an order of magnitude.
       now() as computed_at
from base
group by 1, 2, 3
-- A cohort that is entirely gone and gone long ago is archive, not velocity.
-- Without this the row count grows forever as delisted rows accumulate and
-- every added row is all-zeros.
having count(*) filter (where delisted_at is null) > 0
    or count(*) filter (where delisted_at >= now() - interval '28 days') > 0;

-- Required for refresh ... concurrently (so the nightly never blocks a
-- reader mid-render), and it is the lookup key besides.
create unique index ev_cohort_velocity_key
  on ev_cohort_velocity (vin8, model_year, delist_authority);

-- NO anon grant, deliberately — the 0007 posture: the anon role may read
-- exactly what the public site publishes and nothing else, and today the
-- site publishes nothing from this view. The grant decision belongs to the
-- migration that ships the surface, at which point it is a real decision:
-- these counts are derived from the delisted archive, which 0007 classes as
-- archive rather than showroom, so the likely answer is that the surface
-- reads it server-side through an owner-rights view (how 0028 handled
-- listing_freshness) rather than that anon gets a table grant.

comment on materialized view ev_cohort_velocity is
  'Per VIN(1-8) + model year + delist authority: how many used/certified cars are live and how many left the feed in the last 7 and 28 days. delist_authority is part of the key because the two lanes retire cars on different evidence at different speeds (locator = complete-crawl, same night; recheck = two consecutive per-VIN misses) — counts MUST NOT be compared, ranked, summed or averaged across it. "Left the market", never "sold": delisted_at also fires on platform swaps, index drops and wholesale transfers. Reads before 2026-09-14 have the 08-15 to 08-17 recheck outage inside the 28-day window and understate the recheck lane. Refreshed nightly by refresh_vin_variants(); computed_at stamps the refresh.';

-- ── Refresh ────────────────────────────────────────────────────────────────
-- 0028's function carried forward verbatim with a fourth refresh and count
-- appended. Extending the one nightly call rather than adding a second, for
-- 0022's reason: the inventory-derived tables must never be able to drift a
-- day apart from each other. Still security definer (the matviews are owned
-- by postgres, the caller is not), still revoked from the public roles, still
-- returns the jsonb counts scraper/refresh-variants.mjs logs.
create or replace function refresh_vin_variants()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently vin_variant_observed;
  refresh materialized view concurrently ev_cohort_trim_spread;
  refresh materialized view concurrently listing_freshness;
  refresh materialized view concurrently ev_cohort_velocity;
  return jsonb_build_object(
    'refreshed',   (select count(*) from vin_variant_observed),
    'trim_spread', (select count(*) from ev_cohort_trim_spread),
    'freshness',   (select count(*) from listing_freshness),
    'velocity',    (select count(*) from ev_cohort_velocity)
  );
end;
$$;

revoke execute on function refresh_vin_variants() from public, anon, authenticated;

-- ── Validation, to run at apply time ───────────────────────────────────────
-- There is no staging database (CLAUDE.md) and no local Postgres server, so
-- none of this ran against production data. It DID run against real Postgres:
-- supabase/verify.mjs's embedded PGlite, all migrations applied in order, then
-- synthetic rows covering every branch below. What that run proved, on
-- fixtures, not on prod:
--   - one cohort listed on both an mbusa.com and a dealer domain produces TWO
--     rows, correctly split, with the counts landing on the right side;
--   - the 7d/28d boundaries hold (a row delisted 90 days ago is in neither);
--   - three condition='new' rows delisted yesterday are invisible in gone_7d,
--     and a condition=null row delisted 2 days ago IS counted (match.ts:81);
--   - hyundai-cpo lands in 'recheck', nissan-new/nissan-cpo produce no rows;
--   - the all-gone-long-ago cohort is dropped by the HAVING;
--   - refresh_vin_variants() returns four counts and its CONCURRENTLY
--     refreshes all succeed against the new unique index;
--   - ev_cohort_velocity has zero grants of any kind, and
--     live_listings_feed's reloptions are still security_invoker=false.
-- What fixtures cannot tell you is row count, lane balance and whether the
-- domain list still matches the crawler. That is what these are for.
--
-- 1. Shape. Expect a few hundred rows, split across BOTH authorities. One
--    authority missing means the domain list above is wrong — most likely
--    the condition filter (if 'recheck' is empty, null conditions are being
--    dropped) or a lane rename (if 'locator' is empty).
--
-- select delist_authority,
--        count(*)      as cohorts,
--        sum(live_n)   as live,
--        sum(gone_7d)  as gone_7d,
--        sum(gone_28d) as gone_28d,
--        max(computed_at) as computed_at
-- from ev_cohort_velocity
-- group by 1 order by 1;
--
-- 2. CONTROL for the nissan exclusion. The claim is "these two lanes have no
--    delist path at all", and a negative like that has to be tested, not
--    assumed. Expect exactly 0. A non-zero result means a lane's completeness
--    contract or recheck posture changed and the exclusion above is now
--    hiding real data.
--
-- select count(*) from listings
-- where dealer_domain in ('nissan-new', 'nissan-cpo') and delisted_at is not null;
--
-- 3. CONTROL for the domain list. Every live dealer_domain, labelled, so the
--    'locator' side can be eyeballed against scraper/recheck.mjs's set. Any
--    OEM domain sitting on the 'recheck' side that is not one of
--    audi-network / ford-blue-advantage / honda-prologue / hyundai-cpo is a
--    drift bug.
--
-- select case when dealer_domain in (
--          'buick.com','cadillac.com','carbravo.com','chevrolet.com','gmc.com',
--          'hyundaiusa.com','kia.com','bmwusa.com','mbusa.com','dodge.com',
--          'fiatusa.com','jeep.com','genesis.com','vw.com','enterprisecarsales.com'
--        ) then 'locator' else 'recheck' end as authority,
--        dealer_domain, count(*) filter (where delisted_at is null) as live_n
-- from listings group by 1, 2 having count(*) filter (where delisted_at is null) > 0
-- order by 1, 3 desc limit 40;
--
-- 4. The refresh path, which is the only thing that runs this view again.
--    Expect the jsonb to gain a 'velocity' key and the other three counts to
--    be unchanged from last night's refresh-variants log line.
--
-- select refresh_vin_variants();
--
-- 5. Sanity on the honesty claim itself: the fastest cohorts in each lane,
--    side by side but NOT ranked against each other. If the locator side is
--    the only one with movement, the recheck lane is still catching up from
--    the 08-15 to 08-17 outage and no surface should be built off this yet.
--
-- select * from ev_cohort_velocity
-- where gone_7d > 0 order by delist_authority, gone_7d desc limit 20;
