-- 0008 dropped wa_price_comps as "anon-executable surface nothing uses" —
-- but scraper/price-audit.mjs calls it nightly (with the anon key from CI)
-- to screen every listing price against WA sale medians. The night of the
-- drop, the audit failed 645/645 lookups and aborted; the workflow step is
-- continue-on-error, so the junk-price guard would have stayed silently
-- dead every night after.
--
-- Restore the 0005 definition verbatim (mileage-controlled tiers). The
-- listing page keeps using recent_sales from 0008; the two coexist. The
-- ODbL posture is unchanged: this ships statistics (n >= 5 groups only),
-- never rows, and raw wa_ev_sales reads remain revoked (0007).

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
