-- The series a car drew BEFORE its current seller, for the chart to draw in
-- grey.
--
-- 0061's listing_prior_site names the site a car was listed on before its
-- current one and that site's last price. The owner (2026-09-03) ruled that
-- none of this is written as a sentence: the chart shows the drops before
-- this listing, the break where that listing went away, and the new price,
-- all as values, nothing shopper-facing to write. So the chart needs the
-- earlier series, not only its last point.
--
-- "Earlier series" is every non-null-domain row that is NOT the current
-- dealer's, up to the delist, chained by 0048's full rule (provenance match
-- or same source with no methodology transition between, AND same domain).
-- Not one domain: 1FT6W3L78RWG27106's drops ($47,230 > $43,924 > $41,581)
-- were written under hobsongm.com and its last listing under hobsoncdjr.com,
-- a sister site at the same price. The chain keeps hobsongm.com's three
-- steps and drops the cross-domain hobsoncdjr.com rows, which carried no
-- new price anyway. Because the segment can span domains, the page draws it
-- unlabelled: grey is "before this listing", blue is this one.
--
-- prior_price_usd and prior_last_seen_at (the last raw price any earlier
-- domain showed, and when) repeat on every row so the page can check the
-- chain ends at that price without a second read; when it does not (a
-- provenance-dropped last step), the page draws only that last point.
--
-- Read per VIN by the detail page; the vin filter pushes through
-- listing_prior_site's laterals, measured ~0.4 s on anon.
create or replace view listing_prior_site_series
with (security_invoker = false) as
with mine as (
  select s.vin, s.prior_domain, s.delisted_at, s.prior_price_usd, s.prior_last_seen_at,
         p.price_usd, p.observed_at, p.dealer_domain as dom,
         p.provenance as prov, coalesce(r.source, '?') as src
  from listing_prior_site s
  join listings l on l.vin = s.vin
  join listing_price_history p
    on p.vin = s.vin
   and p.dealer_domain is not null
   and p.dealer_domain <> l.dealer_domain
   and p.price_usd > 0
   and p.observed_at <= s.delisted_at
  left join ingest_runs r on r.id = p.run_id
),
h as (
  select *,
         lag(observed_at) over w as prev_at,
         lag(src) over w as prev_src,
         lag(prov) over w as prev_prov,
         lag(dom) over w as prev_dom
  from mine
  window w as (partition by vin order by observed_at)
)
select vin, prior_domain, delisted_at, price_usd, observed_at, prior_price_usd, prior_last_seen_at
from h
where prev_at is null
   or ( (case
           when prov is not null and prev_prov is not null then prov = prev_prov
           else src = prev_src
                and not exists (select 1 from price_methodology_transitions t
                                where t.at > prev_at and t.at <= observed_at)
         end)
        and dom = prev_dom );

grant select on listing_prior_site_series to anon, authenticated;
