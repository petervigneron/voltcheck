-- recent_sales, banded to cars this one is actually comparable to.
--
-- Numbered 0038, not 0037: another session applied an 0037_epa_variant_catalog
-- to prod (ledger 20260818013336) while this was being written, and its file
-- is not committed yet. Migrations here are append-only, so this took the next
-- free number rather than the next one after the last file on disk.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- 0016 keyed the list on make/model and sorted this car's own VIN(1-8) cohort
-- to the front. That fixed the version problem — a Lightning Pro and a
-- Platinum no longer read as one truck at two prices — and left two others
-- untouched, because make/model is not a comparison:
--
--   GENERATION. VIN(1-8) does not separate them. Measured on the car that
--   started this: a 2023 Bolt 2LT and a 2017 Bolt Premier both carry
--   1G1FX6S0, so the 2023 sorted in as `same_variant` and sat in the list as
--   though a redesigned car with standard DC fast charging were the same
--   thing as a 2017 with the option missing.
--
--   ODOMETER. Nothing bounded it at all. A 2017 Bolt asking $11,803 with
--   137,703 miles on it was shown against 21,691- and 38,533-mile sales at
--   $15,990 and $16,000 — the same car with a third of the wear, and the
--   reader's obvious conclusion is that this one is thousands under the
--   market. That is a false bargain assembled out of true rows, and it is the
--   error this project treats as the expensive one, because a shopper acts on
--   it with their money.
--
-- ── The band ───────────────────────────────────────────────────────────────
--
-- MODEL YEAR within 2. Wide enough to hold a generation together (a 2017 Bolt
-- against 2015–2019), narrow enough that a redesign cannot cross it.
--
-- ODOMETER within the greater of 15,000 miles and 35% of this car's own. The
-- proportional term is what makes it a band rather than a rule: 15,000 miles
-- separates two nearly-new cars by thousands of dollars and separates two
-- 130,000-mile cars by almost nothing. The floor keeps low-mileage cars from
-- banding to a band of zero.
--
-- Both are skipped when the caller does not know the figure — a listing with
-- no odometer gets the year band alone rather than an empty box, which is the
-- same posture the rest of the site takes toward missing dealer data.
--
-- Measured on prod before applying: the Bolt above goes from ten rows spanning
-- 21k–103k miles and 2017–2023, to ten 2017–2018 Premiers between 91k and
-- 129k miles selling $7,000–$13,532 — against which its $11,803 ask reads as
-- what it is, near the top of the range. Yield checked across seven subjects
-- spanning 0 to 137,703 miles: every one keeps between 89 and 6,302 candidate
-- sales, so the band bounds the list without emptying it. 118 ms, well inside
-- anon's 3-second timeout (0035's correction to the older "8 second" note).
--
-- ODbL posture is unchanged from 0008 and 0016: at most 10 rows, fixed
-- ordering, no pagination, no free-form filters. The band only ever removes
-- rows, so this cannot widen what the anon key can extract.

drop function if exists recent_sales(text, text, text);

create or replace function recent_sales(
  _make text,
  _model text,
  _vin8 text default null,
  _year int default null,
  _odometer numeric default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'modelYear',    t.model_year,
    'salePrice',    t.sale_price,
    'odometer',     t.odometer,
    'saleDate',     t.sale_date,
    'variant',      t.trim,
    'sameVariant',  t.same_variant
  ) order by t.same_variant desc, t.sale_date desc, t.id desc), '[]'::jsonb)
  from (
    select s.model_year, s.sale_price, s.odometer, s.sale_date, s.id,
           v.trim,
           (_vin8 is not null and upper(substring(s.vin_prefix, 1, 8)) = upper(_vin8))
             as same_variant
    from wa_ev_sales s
    left join vin_variant v
      on v.vin8 = upper(substring(s.vin_prefix, 1, 8))
     and v.model_year = s.model_year
    where lower(s.make) = lower(_make) and lower(s.model) = lower(_model)
      -- The state's figure is a declared price; under $5,000 is dominated
      -- by family transfers, not market sales.
      and s.sale_price >= 5000
      and s.odometer is not null
      and (_year is null or abs(s.model_year - _year) <= 2)
      and (_odometer is null
           or abs(s.odometer - _odometer) <= greatest(15000, _odometer * 0.35))
    order by (_vin8 is not null and upper(substring(s.vin_prefix, 1, 8)) = upper(_vin8)) desc,
             s.sale_date desc, s.id desc
    limit 10
  ) t;
$$;

grant execute on function recent_sales(text, text, text, int, numeric) to anon, authenticated;
