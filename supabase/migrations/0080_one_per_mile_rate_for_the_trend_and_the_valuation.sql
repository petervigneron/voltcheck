-- One per-mile rate per cohort, used by the trend and the valuation alike.
--
-- The owner's own car, 2026-09-09: the /worth headline said $25,200 and the
-- trend chart under it ended at $21,640, for the same 2023 Ioniq 5 SEL AWD
-- at 61,000 miles, from the same 229 listings. The whole gap was the
-- mileage rate. The headline moves asking prices to the shopper's odometer
-- on ev_price_model's usd_per_mile (0014/0021: the last 18 months of
-- Washington sales, guarded), about −$0.05/mi for that cohort. The trend
-- (0064, kept by 0077) fitted its OWN rate in a CTE here — every sale of
-- the cohort since 2019 on one regression — and got −$0.19/mi. Measured:
-- restricted to 2026 sales the same regression gives −$0.07/mi. The extra
-- was three years of the used-EV market falling, read as mileage, because
-- 2023 sales sat at 10k miles and $35k and 2026 sales at 20k miles and
-- $26k. The 13 listed SEL AWDs over 50k miles ask a median $24,555; the
-- gentle rate was right and the steep one was a bug.
--
-- So price_trend_day_rows now reads the rate from ev_price_model and never
-- fits one. Same fallback as value.ts (−0.09 where the cohort has no fit or
-- a non-negative one), same slope_from_sales meaning. The archive since
-- 2026-08-15 is rebuilt through rebuild_price_trend_ask_day(_day), one day
-- per call (each day is a scan of listing_price_display as of that close;
-- ~1-3 s), then rebuild_price_trend_site_daily() re-chains the site index.
-- "Two implementations of the same number" is how the two surfaces drifted;
-- this leaves one.

create or replace function price_trend_day_rows(_day date)
returns table (
  level text, cohort text, model_year int, cond text, day date, n int,
  price_usd int, p25_usd int, p75_usd int, median_odometer int,
  usd_per_mile numeric, slope_from_sales boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with s as (
    select distinct on (p.vin) p.vin, p.price_usd
    from listing_price_display p
    where p.observed_at <= ((_day + 1)::timestamp at time zone 'UTC')
    order by p.vin, p.observed_at desc
  ),
  -- THE rate: ev_price_model's, the one the valuation and the cards use.
  slope as (
    select vin8, model_year, usd_per_mile::numeric as s
    from ev_price_model
  ),
  cars as (
    select upper(substring(l.vin, 1, 8))                                                 as vin8,
           lower(l.make) || ' ' || regexp_replace(lower(l.model), '[^a-z0-9+]', '', 'g') as model_key,
           l.year                                                                          as model_year,
           case when l.condition = 'new' then 'new' else 'used' end                        as cond,
           s.price_usd::numeric                                                            as price,
           nullif(l.mileage, 0)::numeric                                                   as odo,
           coalesce(sl.s < 0, false)                                                       as slope_from_sales,
           case when sl.s < 0 then sl.s else -0.09 end                                     as slope,
           tk.trim_key,
           tk.identity
    from s
    join listings l using (vin)
    left join slope sl on sl.vin8 = upper(substring(l.vin, 1, 8)) and sl.model_year = l.year
    left join vin_trend_key tk on tk.vin = upper(l.vin)
    where l.year is not null
      and s.price_usd between 1000 and 500000
      and l.first_seen_at <= ((_day + 1)::timestamp at time zone 'UTC')
      and (l.delisted_at is null or l.delisted_at > ((_day + 1)::timestamp at time zone 'UTC'))
  ),
  keyed as (
    select 'vin8'::text as level, vin8 as cohort, model_year, cond, odo, slope, slope_from_sales,
           case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
    from cars
    union all
    select 'model', model_key, model_year, cond, odo, slope, slope_from_sales,
           case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
    from cars
    union all
    select 'trim', vin8 || '|' || trim_key || '|' || identity, model_year, cond, odo, slope, slope_from_sales,
           case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
    from cars
    where trim_key is not null and identity is not null
  )
  select level, cohort, model_year, cond, _day,
         count(*)::int,
         round(percentile_cont(0.5)  within group (order by adj))::int,
         round(percentile_cont(0.25) within group (order by adj))::int,
         round(percentile_cont(0.75) within group (order by adj))::int,
         round(percentile_cont(0.5)  within group (order by odo))::int,
         round(avg(slope)::numeric, 4),
         bool_and(slope_from_sales)
  from keyed
  where adj > 0 and (cond = 'new' or odo is not null)
  group by 1, 2, 3, 4
$$;

comment on function price_trend_day_rows(date) is
  'One closed day of ev_price_trend_ask_daily at every level (vin8, model, trim), from listing_price_display and listings as of that day''s close, each car moved to 40,000 miles on ev_price_model''s usd_per_mile (0080: the same rate the valuation uses; −0.09 fallback). The single place a day is computed.';

create or replace function rebuild_price_trend_ask_day(_day date)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _n int;
begin
  delete from ev_price_trend_ask_daily where day = _day;
  insert into ev_price_trend_ask_daily
    (level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
     median_odometer, usd_per_mile, slope_from_sales)
  select level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
         median_odometer, usd_per_mile, slope_from_sales
  from price_trend_day_rows(_day);
  get diagnostics _n = row_count;
  return _n;
end;
$$;

revoke all on function rebuild_price_trend_ask_day(date) from public, anon, authenticated;
grant execute on function rebuild_price_trend_ask_day(date) to service_role;

comment on function rebuild_price_trend_ask_day(date) is
  'Recomputes one closed day of ev_price_trend_ask_daily in place (delete that day, insert from price_trend_day_rows). Service role only. Call rebuild_price_trend_site_daily() after a run of days.';
