-- What cars like this one actually CLOSED at, as a band — the low end of the
-- /worth range (owner, 2026-09-09: "show the sales range and label the
-- retail number ... transaction prices and dealer asking prices").
--
-- The page had been printing one number, the dealer retail estimate, under
-- "what's my car worth", and the owner — offered $19,200 by Carvana for a
-- car the page valued at $25,200 — read it as an overstatement. It was: the
-- retail figure is real, but a seller asks what they will GET, and
-- Washington's title records answer that in the only honest form, a range.
-- For his cohort this year the records are two populations, dealer sales at
-- $24k+ and a lower group at $18–22k that is private sales and trade-ins;
-- the record carries no seller field, so the lower quartile is the
-- defensible "transactions" end and the dealer asking median the other.
--
-- Aggregates only, over the cohort (VIN 1-8 + model year), the last twelve
-- months, and ±30,000 miles of the shopper's odometer; each sale moved to
-- that odometer on ev_price_model's rate (0080: the ONE rate every surface
-- uses; −0.09 where the cohort has none). Raw wa_ev_sales reads stay revoked
-- for anon (0007); this returns five numbers, never rows. The web side
-- enforces the eight-sale floor (value.ts MIN_SOLD_N) and deflates to the
-- national level (WA_OVER_NATIONAL), the same two rules the sold band runs.
create or replace function cohort_sales_band(_vin8 text, _model_year int, _odometer int)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with rate as (
    select case when m.usd_per_mile < 0 then m.usd_per_mile::numeric else -0.09 end as r,
           (m.usd_per_mile < 0) as from_fit
    from (select null) x
    left join ev_price_model m on m.vin8 = upper(_vin8) and m.model_year = _model_year
  ),
  s as (
    select w.sale_price + (select r from rate) * (_odometer - w.odometer) as adj
    from wa_ev_sales w
    where substring(w.vin_prefix, 1, 8) = upper(_vin8)
      and w.model_year = _model_year
      and w.transaction_type = 'Original Title'
      and w.sale_date >= current_date - interval '12 months'
      and w.odometer between greatest(2000, _odometer - 30000) and least(200000, _odometer + 30000)
      and w.sale_price between 5000 and 130000
  )
  select jsonb_build_object(
    'n', count(*),
    'p25', round((percentile_cont(0.25) within group (order by adj))::numeric),
    'median', round((percentile_cont(0.5) within group (order by adj))::numeric),
    'p75', round((percentile_cont(0.75) within group (order by adj))::numeric),
    'usdPerMile', (select r from rate),
    'slopeFromSales', coalesce((select from_fit from rate), false))
  from s
  where adj > 0
$$;

revoke all on function cohort_sales_band(text, int, int) from public;
grant execute on function cohort_sales_band(text, int, int) to anon, authenticated, service_role;

comment on function cohort_sales_band(text, int, int) is
  'Quartiles of what a VIN(1-8)+model-year cohort closed at in Washington over the last 12 months within ±30k miles of _odometer, each sale moved to _odometer on ev_price_model''s rate. Aggregates only. The low end of the /worth range (0081); attribute WA DOL / ODbL where rendered.';
