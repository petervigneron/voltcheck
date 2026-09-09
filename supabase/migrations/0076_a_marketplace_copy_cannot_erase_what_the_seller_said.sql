-- A marketplace copy of a car cannot erase what the seller said about it.
--
-- Owner, 2026-09-09: "The sneed trucks all lost the warning on the site today
-- ... they were gone for hours." They had. listing_price_history for Sneed's
-- Lightnings shows the sequence: at 15:42 UTC on 09-08 the Ford Blue Advantage
-- marketplace lane (dealer_domain 'ford-blue-advantage', which relays
-- Autotrader inventory and so lists Sneed's cars too) upserted the same VINs
-- with its own thinner payload — no dealer notes, a different price field —
-- and last-writer-wins on the VIN key made that the row. No description, no
-- "PART OF FORDS REACQUIRED VEHICLE BRANDED PROGRAM", no flag. At 22:26 the
-- rolling sweep re-read sneedford.com and put the dealer's words back.
-- Measured over four days: 3,309 VINs were written by both a rooftop and the
-- marketplace; 486 sit under the marketplace's domain right now, 455 of them
-- with no description where the rooftop's row had one.
--
-- The VIN key and last-writer-wins are deliberate (0048 explains the
-- co-listing world and guards the PRICE against exactly this ping-pong). This
-- migration guards the seller's STATEMENTS the same way: when the incoming
-- row comes from a different dealer_domain than the one holding the row, and
-- it carries no description / titleBrand / inventoryBranded of its own, the
-- existing values ride along. Same domain re-crawling without them means the
-- seller changed their page, and the words go. A different domain lacking
-- them means a copy that never had them, and a copy cannot unsay what the
-- seller said.
--
-- Payload equality (0025) is preserved on purpose: the churn cut compares the
-- stored payload against the MERGED incoming payload, so a marketplace echo
-- that changes nothing but the domain and price still does not rewrite the
-- row's payload needlessly on every pass.
--
-- Applied by rewriting ingest_listings in place from its live definition
-- (pg_get_functiondef), replacing exactly two anchors and refusing to run
-- if either is not found exactly once. The function is 7.8 KB and has been
-- amended by nine migrations; retyping it here would be the riskier copy.
create or replace function merge_seller_statements(
  old_payload jsonb, old_domain text, new_payload jsonb, new_domain text
) returns jsonb
language sql immutable parallel safe as $$
  select case
    when old_payload is null or old_domain is not distinct from new_domain then new_payload
    else new_payload || jsonb_strip_nulls(jsonb_build_object(
      'description',       case when coalesce(new_payload->>'description', '') = '' then old_payload->'description' end,
      'titleBrand',        case when coalesce(new_payload->>'titleBrand', '')  = '' then old_payload->'titleBrand'  end,
      'inventoryBranded',  case when new_payload->'inventoryBranded' is null      then old_payload->'inventoryBranded' end
    ))
  end
$$;

do $do$
declare
  def text;
  a1 constant text := '(l.payload is distinct from i.payload) as data_changed';
  a2 constant text := 'payload       = excluded.payload,';
  n1 int; n2 int;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ingest_listings';
  if def is null then raise exception 'ingest_listings not found'; end if;
  n1 := (length(def) - length(replace(def, a1, ''))) / length(a1);
  n2 := (length(def) - length(replace(def, a2, ''))) / length(a2);
  if n1 <> 1 or n2 <> 1 then
    raise exception 'anchors not unique: data_changed=% payload-set=% — read the live function before re-running', n1, n2;
  end if;
  def := replace(def, a1,
    '(l.payload is distinct from merge_seller_statements(l.payload, l.dealer_domain, i.payload, i.dealer_domain)) as data_changed');
  def := replace(def, a2,
    'payload       = merge_seller_statements(l.payload, l.dealer_domain, excluded.payload, excluded.dealer_domain),');
  execute def;
end
$do$;
