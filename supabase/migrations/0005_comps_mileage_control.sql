-- Only claim a price comparison we have actually controlled for mileage.
--
-- The owner asked whether older sales make current listings look cheap.
-- Measured: raw quarterly medians for a 2023 Ioniq 5 fell 32% over 18
-- months — but holding mileage constant, the same car's median moves only
-- ~3% across 3/6/12/24-month windows, and not monotonically. So the
-- apparent collapse is mostly ODOMETER ACCUMULATION (the cars selling later
-- have more miles), not the market falling. Window length turns out not to
-- be the problem; mileage control is.
--
-- 0003 dropped mileage entirely when the exact-year band was thin, so 27.7%
-- of listings were compared against cars with unknown mileage. This adds an
-- intermediate tier that widens the mileage band to +/-50% before giving up
-- on it, and returns mileageControlled so the page can decline to assert
-- "listed below market" on a comparison that hasn't earned it.

create or replace function wa_price_comps(
  _make text,
  _model text,
  _year int,
  _mileage int default null,
  _months int default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _since date := (now() - make_interval(months => _months))::date;
  _r jsonb;
  _band numeric;
begin
  -- Tiers 1 and 1b: same model year, mileage within 25% then 50%.
  if _mileage is not null and _mileage > 0 then
    foreach _band in array array[0.25, 0.50] loop
      select stats into _r from (
        select jsonb_build_object(
          'n', count(*),
          'median', percentile_cont(0.5) within group (order by sale_price)::int,
          'p25', percentile_cont(0.25) within group (order by sale_price)::int,
          'p75', percentile_cont(0.75) within group (order by sale_price)::int,
          'medianOdometer', percentile_cont(0.5) within group (order by odometer)::int,
          'basis', case when _band = 0.25 then 'year_and_mileage' else 'year_and_mileage_wide' end,
          'mileageControlled', true,
          'yearLow', _year, 'yearHigh', _year, 'months', _months
        ) as stats, count(*) as c
        from wa_ev_sales
        where lower(make) = lower(_make) and lower(model) = lower(_model)
          and model_year = _year and sale_date >= _since
          and odometer between (_mileage * (1 - _band)) and (_mileage * (1 + _band))
      ) t where c >= 5;
      if _r is not null then return _r; end if;
    end loop;
  end if;

  -- Tier 2: same model year, any mileage. Informative, but not a like-for-
  -- like comparison — flagged so the page says so.
  select stats into _r from (
    select jsonb_build_object(
      'n', count(*),
      'median', percentile_cont(0.5) within group (order by sale_price)::int,
      'p25', percentile_cont(0.25) within group (order by sale_price)::int,
      'p75', percentile_cont(0.75) within group (order by sale_price)::int,
      'medianOdometer', percentile_cont(0.5) within group (order by odometer)::int,
      'basis', 'year', 'mileageControlled', false,
      'yearLow', _year, 'yearHigh', _year, 'months', _months
    ) as stats, count(*) as c
    from wa_ev_sales
    where lower(make) = lower(_make) and lower(model) = lower(_model)
      and model_year = _year and sale_date >= _since
  ) t where c >= 5;
  if _r is not null then return _r; end if;

  -- Tier 3: model year within one, any mileage.
  select stats into _r from (
    select jsonb_build_object(
      'n', count(*),
      'median', percentile_cont(0.5) within group (order by sale_price)::int,
      'p25', percentile_cont(0.25) within group (order by sale_price)::int,
      'p75', percentile_cont(0.75) within group (order by sale_price)::int,
      'medianOdometer', percentile_cont(0.5) within group (order by odometer)::int,
      'basis', 'year_range', 'mileageControlled', false,
      'yearLow', _year - 1, 'yearHigh', _year + 1, 'months', _months
    ) as stats, count(*) as c
    from wa_ev_sales
    where lower(make) = lower(_make) and lower(model) = lower(_model)
      and model_year between _year - 1 and _year + 1 and sale_date >= _since
  ) t where c >= 5;

  return _r;
end;
$$;

grant execute on function wa_price_comps(text, text, int, int, int) to anon, authenticated;
