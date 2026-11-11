-- How fast each model leaves the lot: of the used cars that turned up in a
-- 30-day window, how many were no longer listed 30 days after they appeared.
--
-- Where this came from. On 2026-11-11 the owner asked whether the site could
-- tell a shopper how likely a car is to sell at its asking price. Three
-- passes at a per-car figure (docs/sell-study in the research repo) topped
-- out at a ranking score of ~0.66: whether one particular car goes in a
-- given month is mostly whether the right buyer turns up. What the same
-- data supports firmly is the aggregate — Tesla 64%, Volvo 31% — because
-- averaging removes the chance. So this is a fact about a MODEL, printed on
-- the model's page, and it is not a verdict on any car.
--
-- THE CLAIM IS "NO LONGER LISTED", NOT "SOLD". A listing also disappears
-- when a car goes to auction or moves lots, and nothing held here tells
-- those apart. Every surface must keep that wording.
--
-- Definition, each clause there because leaving it out gave a wrong number:
--   * used and certified cars, 2,000-160,000 miles, no disclosed buyback;
--   * first seen in the 30 days ending 37 days ago, so every car has had its
--     full 30 days plus the 7 below;
--   * the seller's site must have been known to us at least 14 days before
--     the car appeared. When a new seller or crawl lane is added, its whole
--     lot gets today's first_seen_at; those are old stock, not new listings
--     (19,000 of 77,000 rows in the study);
--   * "no longer listed" counts only once the listing has stayed gone 7
--     days. 53% of delisted events are followed by a relisting, 47% within
--     three days — crawl gaps, not departures. After 7 days about 6% still
--     come back. A car that vanished inside its 30 days but less than 7 days
--     ago is left out of both sides instead of guessed.
--
-- Stored, not computed per request: the query is a hash join over the whole
-- listings table and measured 9.8 s, against anon's 3 s limit. pg_cron
-- refills the table once a day at 09:20 UTC, clear of the nightly and the
-- four publish slots. One row per make + model spelling as the feed has it,
-- with the counts and not the percentage, so the page can add spellings
-- that are one model (lib/listings/modelHubs keys) before it divides, and
-- apply its own floor. A refresh that finds nothing leaves yesterday's rows.
--
-- Readable by anon: aggregates of public listings, nothing per car.

create table if not exists model_selling_speed (
  make        text    not null,   -- lower-cased
  model       text    not null,   -- as listed
  listed      integer not null,   -- cars in the window
  gone        integer not null,   -- of those, no longer listed 30 days on
  window_from date    not null,
  window_to   date    not null,
  computed_at timestamptz not null default now(),
  primary key (make, model)
);

alter table model_selling_speed enable row level security;
drop policy if exists model_selling_speed_read on model_selling_speed;
create policy model_selling_speed_read on model_selling_speed for select to anon, authenticated using (true);
grant select on model_selling_speed to anon, authenticated;

create or replace function refresh_model_selling_speed()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _from timestamptz := date_trunc('day', now()) - interval '67 days';
  _to   timestamptz := date_trunc('day', now()) - interval '37 days';
  _n    integer;
begin
  create temp table _speed on commit drop as
  with dom as (
    select dealer_domain, min(first_seen_at) as f from listings group by 1
  )
  select lower(l.make) as make, l.model,
         count(*)::int as listed,
         (count(*) filter (where l.delisted_at is not null
                             and l.delisted_at < l.first_seen_at + interval '30 days'))::int as gone
  from listings l join dom d on d.dealer_domain = l.dealer_domain
  where l.condition in ('used', 'certified')
    and l.first_seen_at >= _from and l.first_seen_at < _to
    and l.first_seen_at - d.f >= interval '14 days'
    and l.mileage between 2000 and 160000
    and coalesce(l.buyback_disclosed, false) = false
    and l.make is not null and l.model is not null
    -- Gone inside its 30 days but for less than 7: too recent to call.
    and not (l.delisted_at is not null
             and l.delisted_at < l.first_seen_at + interval '30 days'
             and l.delisted_at > now() - interval '7 days')
  group by 1, 2;

  select count(*) into _n from _speed;
  if _n = 0 then
    return 0;   -- a sick day: keep yesterday's rows
  end if;

  delete from model_selling_speed where true;
  insert into model_selling_speed (make, model, listed, gone, window_from, window_to)
  select make, model, listed, gone, _from::date, (_to - interval '1 day')::date from _speed;
  return _n;
end;
$$;

revoke all on function refresh_model_selling_speed() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'refresh-model-selling-speed';
select cron.schedule(
  'refresh-model-selling-speed',
  '20 9 * * *',
  $$select refresh_model_selling_speed()$$
);

select refresh_model_selling_speed();
