-- Cars no longer listed in the last 30 days, at their last asking price, for
-- the free "asking vs similar cars" band (web/lib/listings/similarBand.ts).
--
-- Owner, 2026-11-18: "four live cars on the site seems unnecessary if we
-- carry information about recent cars." We do: a delisted row keeps its last
-- price_usd and mileage, and vin_trend_key (0077) keeps the trim key and
-- pack identity the publisher gave the car while it was live, which are the
-- two facts the band's same-car guards need. This table puts them in one
-- place the feed publisher can read in pages.
--
-- Why 30 days and no staleness adjustment. Measured 2026-11-18 over every
-- used car delisted in the last 60 days, against today's live median of its
-- own VIN 1-8 + model year (mileage-adjusted, cohorts of 8+ live cars):
--
--   delisted   cars    median vs live   spread (MAD)
--   0-7 d      9,512   -1.0%            4.6%
--   8-14 d     8,863   -0.7%            4.6%
--   15-30 d   21,008   -0.2%            4.6%
--   31-45 d   19,585   +0.2%            4.8%
--   46-60 d   21,914   +0.6%            5.0%
--   live      60,384    0               4.4%
--
-- Inside 30 days a recent ask sits at or a little under today's asks (cars
-- that leave are the cheaper ones), which only makes a "below" harder to
-- earn. Past 30 days the market's drift has carried them above today's
-- asks, where they would make a live car look cheaper than it is — a false
-- bargain — so they are not kept. The reader applies the same 30-day cut, so
-- a refresh that fails for days cannot stretch the window.
--
-- Stored, not a view: delisted_at has no index (the live partial indexes
-- exclude delisted rows by design), so any read of "delisted in the last 30
-- days" is a pass over the whole listings table. Doing that once a day here
-- costs what refresh_model_selling_speed (0120) already costs; doing it in
-- every publish, or behind anon's 3-second limit, does not work (a 2-row
-- read of delisted_listings_recent timed out on 2026-11-18).
--
-- Service role only: the publisher reads it with its own key. Nothing here
-- is published as rows — the public artifact carries one coarse band per
-- live car and no peer price.

create table if not exists similar_recent_asks (
  vin          text        primary key,
  year         integer     not null,
  mileage      integer     not null,
  price_usd    integer     not null,
  condition    text,
  drive        text,
  trim_key     text,
  identity     text,
  delisted_at  timestamptz not null,
  refreshed_at timestamptz not null default now()
);

alter table similar_recent_asks enable row level security;
revoke all on similar_recent_asks from public, anon, authenticated;
grant select on similar_recent_asks to service_role;

comment on table similar_recent_asks is
  'Cars delisted in the last 30 days at their last ask, with the trim key and pack identity they had while live (vin_trend_key). Refilled daily by refresh_similar_recent_asks(); read by web/scripts/publish-feed.mjs for the free asking-vs-similar band. Service role only.';

create or replace function refresh_similar_recent_asks()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _n integer;
begin
  -- The same admission rules buildAskIndex applies to a live peer (driven
  -- mileage, no disclosed buyback or branded title); the junk-price floor is
  -- applied by the reader with the site's own hasRealPrice.
  create temp table _recent on commit drop as
  select upper(l.vin) as vin, l.year, l.mileage, l.price_usd::int as price_usd,
         l.condition, l.payload ->> 'drive' as drive,
         tk.trim_key, tk.identity, l.delisted_at
  from listings l
  left join vin_trend_key tk on tk.vin = upper(l.vin)
  where l.delisted_at > now() - interval '30 days'
    and l.year is not null
    and l.mileage between 2000 and 200000
    and l.price_usd > 0
    and coalesce(l.buyback_disclosed, false) = false
    and coalesce(l.branded_title_disclosed, false) = false;

  select count(*) into _n from _recent;
  if _n = 0 then
    return 0;   -- a sick day: keep yesterday's rows (the reader's 30-day cut still applies)
  end if;

  delete from similar_recent_asks where true;
  insert into similar_recent_asks (vin, year, mileage, price_usd, condition, drive, trim_key, identity, delisted_at)
  select vin, year, mileage, price_usd, condition, drive, trim_key, identity, delisted_at from _recent
  on conflict (vin) do nothing;
  return _n;
end;
$$;

revoke all on function refresh_similar_recent_asks() from public, anon, authenticated;

-- After refresh_model_selling_speed (09:20), the other daily pass over
-- listings, and clear of the 08:00 and 20:00 publishes.
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-similar-recent-asks';
select cron.schedule(
  'refresh-similar-recent-asks',
  '40 9 * * *',
  $$select refresh_similar_recent_asks()$$
);

select refresh_similar_recent_asks();
