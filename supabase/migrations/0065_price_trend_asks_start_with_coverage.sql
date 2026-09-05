-- The daily asking-price archive starts 2026-08-15, the first day the crawl
-- had real coverage, not 2026-08-12, the first day it had any.
--
-- 0064's backfill wrote 08-12 to 08-14 from a crawl that was still filling:
-- 12 cohorts cleared the floor on 08-13 and 70 on 08-14, against 160 on
-- 08-15 and ~490 by September. For a popular cohort those days pass the
-- n ≥ 4 floor on a handful of cars — the 2021 Model 3 read $28,001 on four
-- listings on 08-12, $31,312 on twenty the next day, then ~$29,400 on 300 a
-- day from 08-16 on — and the chart prints its FIRST figure in bold, so a
-- shopper read "+4.7% in three weeks" off a series that was flat. The n is
-- printed too, but the house rule is that a number the data cannot stand
-- behind is not printed at all. The floor is per cohort; the crawl's
-- coverage on a given day is a fact about every cohort at once, so the
-- start date is where it belongs.

delete from ev_price_trend_ask_daily where day < date '2026-08-15';

create or replace function advance_price_trend_ask_daily(_max_days int default 3)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _day   date;
  _at    timestamptz;
  _done  int    := 0;
  _rows  bigint := 0;
  _n     bigint;
begin
  select coalesce(max(day) + 1, date '2026-08-15') into _day from ev_price_trend_ask_daily;
  while _day < (now() at time zone 'UTC')::date and _done < _max_days loop
    _at := ((_day + 1)::timestamp at time zone 'UTC');
    insert into ev_price_trend_ask_daily
      (level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
       median_odometer, usd_per_mile, slope_from_sales)
    with s as (
      select distinct on (p.vin) p.vin, p.price_usd
      from listing_price_display p
      where p.observed_at <= _at
      order by p.vin, p.observed_at desc
    ),
    slope as (
      select substring(vin_prefix, 1, 8) as vin8, model_year,
             count(*) as n_fit, regr_slope(sale_price::numeric, odometer::numeric) as s
      from wa_ev_sales
      where transaction_type = 'Original Title'
        and odometer between 2000 and 200000
        and sale_price between 5000 and 130000
        and sale_date >= date '2019-01-01'
      group by 1, 2
    ),
    cars as (
      select upper(substring(l.vin, 1, 8))                                                 as vin8,
             lower(l.make) || ' ' || regexp_replace(lower(l.model), '[^a-z0-9+]', '', 'g') as model_key,
             l.year                                                                          as model_year,
             case when l.condition = 'new' then 'new' else 'used' end                        as cond,
             s.price_usd::numeric                                                            as price,
             nullif(l.mileage, 0)::numeric                                                   as odo,
             coalesce(sl.n_fit >= 8 and sl.s < 0, false)                                     as slope_from_sales,
             case when sl.n_fit >= 8 and sl.s < 0 then sl.s else -0.09 end                   as slope
      from s
      join listings l using (vin)
      left join slope sl on sl.vin8 = upper(substring(l.vin, 1, 8)) and sl.model_year = l.year
      where l.year is not null
        and s.price_usd between 1000 and 500000
        and l.first_seen_at <= _at
        and (l.delisted_at is null or l.delisted_at > _at)
    ),
    keyed as (
      select 'vin8'::text as level, vin8 as cohort, model_year, cond, odo, slope, slope_from_sales,
             case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
      from cars
      union all
      select 'model', model_key, model_year, cond, odo, slope, slope_from_sales,
             case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
      from cars
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
    group by 1, 2, 3, 4;
    get diagnostics _n = row_count;
    _rows := _rows + _n;
    _done := _done + 1;
    _day  := _day + 1;
  end loop;
  return jsonb_build_object('view', 'ev_price_trend_ask_daily', 'days', _done, 'rows', _rows,
                            'through', (select max(day) from ev_price_trend_ask_daily));
end;
$$;
