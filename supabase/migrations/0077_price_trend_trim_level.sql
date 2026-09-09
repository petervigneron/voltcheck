-- The daily asking-price trend learns the level the cards already price on:
-- VIN prefix + trim + pack identity. A 2023 F-150 Lightning Platinum ER is
-- no longer drawn against every 2023 Lightning.
--
-- ── What the owner saw (2026-09-09) ────────────────────────────────────────
--
-- "An ER Lightning Platinum does not have a mileage adjusted price of
-- $30,000." It does not. The trend tables (0064) hold two levels: the model
-- pool (make + folded model + year) and the VIN 1-8 cohort. For a 2023
-- Lightning the VIN prefix separates ER from SR (1FT6W1EV / 1FTVW1EV are
-- ER, 1FTVW1EL is SR) and stops there: inside 1FT6W1EV today, Platinum lists
-- at a median $57,400 (n=55), Lariat $47,000, XLT $46,000, Pro $43,100. The
-- page then moved that pooled median along the slope to the truck's own
-- odometer and printed it as the truck's trend. Everything the site has
-- decoded about the truck — the trim it stands behind (lib/listings/
-- trimClaim.ts + specTrim), the pack identity from its enrichment row
-- (packIdentity) — reaches the browse card's "similar listings" figure
-- (comps.ts keys peers on `vin8+year|TRIMKEY` and refuses a mixed identity)
-- and never reached the trend. This migration gives the trend that key.
--
-- ── The key, and where it comes from ───────────────────────────────────────
--
-- The trim classifier is TypeScript (trimClaim decides whether a feed's
-- trim can be stood behind — a Chevrolet store's "Pro" Lightning with Lariat
-- content in the prose is not a Pro; specTrim normalizes the spelling), and
-- the pack identity is the enrichment corpus. Neither can be re-derived in
-- SQL, and the trim column on `listings` is the feed's raw word ("USED 2023
-- FORD F-150 LIGHTNING XLT 4 DOOR CREW CAB SHORT BED TRUCK" is a real
-- value). So the key is computed where the cards compute it and written
-- here: `vin_trend_key` (vin → trim_key, identity), upserted by the feed
-- publisher (web/scripts/publish-feed.mjs) from the same buildCardIndex
-- walk that builds the grid, through upsert_vin_trend_keys(). Only changed
-- rows are written. Cars delisted since the archive began (54,099 on
-- 2026-09-09) were keyed once by web/scripts/backfill-trend-keys.mjs so the
-- history has the same key as the present.
--
-- The trim-level cohort is `vin8|TRIMKEY|identity`, the same three facts
-- comps.ts needs before it will quote a peer figure. A car without a
-- claimable trim or without an enrichment identity has no trim-level row
-- and is served at the VIN or model level as before — matching nothing is
-- honest, matching the wrong thing is not.
--
-- ── Mechanics ──────────────────────────────────────────────────────────────
--
-- The day's computation moves out of advance_price_trend_ask_daily() into
-- price_trend_day_rows(_day), one function for all three levels, so the
-- advance and the history backfill (backfill_price_trend_trim_level) cannot
-- compute a day two ways. The advance is otherwise 0065's body. price_trend()
-- gains _trim_key and _identity and picks the finest level that clears the
-- n ≥ 4 floor: trim, then vin8, then model. Its 4-argument form is dropped
-- (two overloads would be ambiguous to PostgREST).
--
-- Order in the night: refresh-variants (the advance, in finalize-audits)
-- runs BEFORE publish-feed writes the keys, so a car first seen on day D is
-- keyed at D's publish and enters the trim level from the advance of closed
-- day D, run the night after. A day's lag on entry, no lag on the level.
--
-- ── FORBIDDEN (0057/0061/0064's rules stand) ────────────────────────────────
--
--   Quoting a day without its n. Calling asks anything but asking prices.
--   Drawing the current day. Serving a trim-level series whose cohort key
--   mixes identities — the key carries the identity so it cannot.

create table vin_trend_key (
  vin        text        primary key,
  trim_key   text,
  identity   text,
  updated_at timestamptz not null default now()
);

comment on table vin_trend_key is
  'Per-VIN key for the trend''s trim level (0077): the trim the site stands behind (trimClaim + specTrim, uppercased) and the enrichment pack identity (packIdentity), written by publish-feed.mjs from the same walk that builds the grid. Null trim_key or identity = no trim-level row for the car.';

revoke all on vin_trend_key from public, anon, authenticated;

create or replace function upsert_vin_trend_keys(_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _n int;
begin
  insert into vin_trend_key (vin, trim_key, identity)
  select upper(r ->> 'vin'), nullif(r ->> 'trim_key', ''), nullif(r ->> 'identity', '')
  from jsonb_array_elements(_rows) r
  where length(r ->> 'vin') = 17
  on conflict (vin) do update
    set trim_key = excluded.trim_key, identity = excluded.identity, updated_at = now()
    where (vin_trend_key.trim_key, vin_trend_key.identity) is distinct from (excluded.trim_key, excluded.identity);
  get diagnostics _n = row_count;
  return _n;
end;
$$;

revoke all on function upsert_vin_trend_keys(jsonb) from public, anon, authenticated;
grant execute on function upsert_vin_trend_keys(jsonb) to service_role;

comment on function upsert_vin_trend_keys(jsonb) is
  'Writes [{vin, trim_key, identity}] into vin_trend_key, touching only rows whose key changed. Service role only; called by web/scripts/publish-feed.mjs nightly and by backfill-trend-keys.mjs once.';

-- One day of the archive, all three levels. 0065's computation, with the
-- trim level added as a third branch of `keyed`.
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
           case when sl.n_fit >= 8 and sl.s < 0 then sl.s else -0.09 end                   as slope,
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
    -- The level the cards price on: VIN prefix + the trim we stand behind +
    -- the pack identity. Cars missing either fact have no row here.
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

revoke all on function price_trend_day_rows(date) from public, anon, authenticated;

comment on function price_trend_day_rows(date) is
  'One closed day of ev_price_trend_ask_daily at every level (vin8, model, trim — 0077), from listing_price_display and listings as of that day''s close. The single place a day is computed; the advance and the trim backfill both insert from it.';

create or replace function advance_price_trend_ask_daily(_max_days int default 3)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _day   date;
  _done  int    := 0;
  _rows  bigint := 0;
  _n     bigint;
  _site  bigint;
begin
  select coalesce(max(day) + 1, date '2026-08-15') into _day from ev_price_trend_ask_daily;
  while _day < (now() at time zone 'UTC')::date and _done < _max_days loop
    insert into ev_price_trend_ask_daily
      (level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
       median_odometer, usd_per_mile, slope_from_sales)
    select level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
           median_odometer, usd_per_mile, slope_from_sales
    from price_trend_day_rows(_day);
    get diagnostics _n = row_count;
    _rows := _rows + _n;
    _done := _done + 1;
    _day  := _day + 1;
  end loop;
  _site := rebuild_price_trend_site_daily();
  return jsonb_build_object('view', 'ev_price_trend_ask_daily', 'days', _done, 'rows', _rows,
                            'through', (select max(day) from ev_price_trend_ask_daily),
                            'site_days', _site);
end;
$$;

-- The archive before this migration has no trim-level rows. Fill them, a few
-- days per call (each day is ~8 s on prod), oldest first, until none remain.
create or replace function backfill_price_trend_trim_level(_max_days int default 3)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _day  date;
  _done int    := 0;
  _rows bigint := 0;
  _n    bigint;
begin
  for _day in
    select distinct d.day from ev_price_trend_ask_daily d
    where not exists (select 1 from ev_price_trend_ask_daily t where t.level = 'trim' and t.day = d.day)
    order by d.day
  loop
    exit when _done >= _max_days;
    insert into ev_price_trend_ask_daily
      (level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
       median_odometer, usd_per_mile, slope_from_sales)
    select level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
           median_odometer, usd_per_mile, slope_from_sales
    from price_trend_day_rows(_day)
    where level = 'trim';
    get diagnostics _n = row_count;
    _rows := _rows + _n;
    _done := _done + 1;
  end loop;
  return jsonb_build_object('days', _done, 'rows', _rows,
    'remaining', (select count(distinct d.day) from ev_price_trend_ask_daily d
                  where not exists (select 1 from ev_price_trend_ask_daily t where t.level = 'trim' and t.day = d.day)));
end;
$$;

revoke all on function backfill_price_trend_trim_level(int) from public, anon, authenticated;
grant execute on function backfill_price_trend_trim_level(int) to service_role;

comment on function backfill_price_trend_trim_level(int) is
  'Adds level=trim rows to the days of ev_price_trend_ask_daily that have none, oldest first, _max_days per call. Run after vin_trend_key holds keys for the cars those days saw. Idempotent.';

-- The reader: the finest level that clears the floor. The 4-argument form
-- goes (PostgREST cannot pick between overloads on a JSON body).
drop function if exists price_trend(text, text, int, text);

create or replace function price_trend(
  _make text, _model text, _model_year int,
  _vin8 text default null, _trim_key text default null, _identity text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  _mkey    text := lower(coalesce(_make, '')) || ' ' || regexp_replace(lower(coalesce(_model, '')), '[^a-z0-9+]', '', 'g');
  _v8      text := upper(nullif(btrim(coalesce(_vin8, '')), ''));
  _tkey    text := upper(nullif(btrim(coalesce(_trim_key, '')), ''));
  _ident   text := nullif(btrim(coalesce(_identity, '')), '');
  _slevel  text; _scohort text;
  _alevel  text; _acohort text;
  _sales   jsonb; _asks jsonb; _site jsonb;
begin
  if _model_year is null then
    return jsonb_build_object('sales', null, 'asks', null, 'site', null);
  end if;

  if _v8 is not null and exists (
       select 1 from ev_price_trend_sales
       where level = 'vin8' and cohort = _v8 and model_year = _model_year and n >= 8) then
    _slevel := 'vin8'; _scohort := _v8;
  else
    _slevel := 'model'; _scohort := _mkey;
  end if;
  select jsonb_build_object(
           'level', _slevel,
           'stdOdometer', max(std_odometer),
           'usdPerMile', round(avg(usd_per_mile), 4),
           'slopeFromSales', bool_and(slope_from_sales),
           'points', jsonb_agg(jsonb_build_object(
              'period', period, 'n', n, 'price', price_usd, 'p25', p25_usd, 'p75', p75_usd,
              'odometer', median_odometer) order by period))
    into _sales
  from ev_price_trend_sales
  where level = _slevel and cohort = _scohort and model_year = _model_year and n >= 8;

  if _v8 is not null and _tkey is not null and _ident is not null and exists (
       select 1 from ev_price_trend_ask_daily
       where level = 'trim' and cohort = _v8 || '|' || _tkey || '|' || _ident
         and model_year = _model_year and cond = 'used' and n >= 4) then
    _alevel := 'trim'; _acohort := _v8 || '|' || _tkey || '|' || _ident;
  elsif _v8 is not null and exists (
       select 1 from ev_price_trend_ask_daily
       where level = 'vin8' and cohort = _v8 and model_year = _model_year and cond = 'used' and n >= 4) then
    _alevel := 'vin8'; _acohort := _v8;
  else
    _alevel := 'model'; _acohort := _mkey;
  end if;
  select jsonb_build_object(
           'level', _alevel,
           'stdOdometer', 40000,
           'usdPerMile', round(avg(usd_per_mile), 4),
           'slopeFromSales', bool_and(slope_from_sales),
           'points', jsonb_agg(jsonb_build_object(
              'period', day, 'n', n, 'price', price_usd, 'p25', p25_usd, 'p75', p75_usd,
              'odometer', median_odometer) order by day))
    into _asks
  from ev_price_trend_ask_daily
  where level = _alevel and cohort = _acohort and model_year = _model_year and cond = 'used' and n >= 4;

  select jsonb_build_object(
           'points', jsonb_agg(jsonb_build_object(
              'period', day, 'idx', idx, 'cohorts', cohorts, 'cars', cars) order by day))
    into _site
  from ev_price_trend_site_daily;

  return jsonb_build_object(
    'sales', case when _sales ->> 'points' is null then null else _sales end,
    'asks',  case when _asks  ->> 'points' is null then null else _asks  end,
    'site',  case when _site  ->> 'points' is null then null else _site  end);
end;
$$;

comment on function price_trend(text, text, int, text, text, text) is
  'The trend surface''s one read: {sales, asks, site}. asks is the asking price of a standard car by DAY (n ≥ 4, used, closed days only) at the finest level that clears the floor — the trim cohort (VIN 1-8 + the trim the site stands behind + pack identity, 0077) when all three were given, else the VIN cohort, else the model pool — and says which in `level`. sales is the WA sale price by quarter (n ≥ 8); site the site-wide used-car index (0072). Each series carries stdOdometer and usdPerMile so the page re-levels to the shopper''s odometer; each point carries n and median odometer. Attribute WA DOL / ODbL wherever sales render.';
