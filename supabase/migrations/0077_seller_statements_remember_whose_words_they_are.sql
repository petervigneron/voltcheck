-- The carried-forward statements remember whose words they are.
--
-- Owner, 2026-09-09, the day after 0076: "The sneed listings have lost the
-- repurchase tag again." They had, and 0076 is why it did not hold. The
-- nightly syncs the marketplace rows twice — db-sync at 15:57, then
-- price-audit's follow-up sync at 16:01 — and 0076's rule was "a row from a
-- DIFFERENT domain without words keeps the old words; the SAME domain without
-- words is the seller retracting them". The first echo kept Sneed's words but,
-- as last-writer-wins requires, flipped the row's dealer_domain to the
-- marketplace. The second echo then read as same-domain-without-words and
-- dropped them. 47 of Sneed's 58 cars, stripped by 16:01.
--
-- The merge now writes `statementsFrom` — the domain whose words these are —
-- whenever it carries them across a domain, and judges "the seller retracted
-- them" against THAT, not against whoever holds the row. Proven as literal
-- cases before applying:
--   first echo (sneedford → marketplace, no words)        keeps words, from=sneedford
--   second echo (marketplace → marketplace, no words)     keeps words
--   seller recrawl without words (→ sneedford, no words)  drops them
--   seller recrawl with words                             takes the new words
--   seller drops words directly (never echoed)            drops them
-- A payload that carries its own description never carries statementsFrom.
create or replace function merge_seller_statements(
  old_payload jsonb, old_domain text, new_payload jsonb, new_domain text
) returns jsonb
language sql immutable parallel safe as $$
  with o as (
    select coalesce(old_payload->>'statementsFrom', old_domain) as words_from
  )
  select case
    when old_payload is null then new_payload
    -- the row's words came from THIS domain and it now sends none: the seller
    -- changed their page, and the words go (statementsFrom goes with them)
    when (select words_from from o) is not distinct from new_domain then new_payload - 'statementsFrom'
    else (new_payload - 'statementsFrom') || jsonb_strip_nulls(jsonb_build_object(
      'description',      case when coalesce(new_payload->>'description', '') = '' then old_payload->'description' end,
      'titleBrand',       case when coalesce(new_payload->>'titleBrand', '')  = '' then old_payload->'titleBrand'  end,
      'inventoryBranded', case when new_payload->'inventoryBranded' is null     then old_payload->'inventoryBranded' end,
      -- whose words these are, so a second echo from the same copy cannot
      -- pass for the seller retracting them
      'statementsFrom',   case when coalesce(new_payload->>'description', '') = ''
                                 and coalesce(old_payload->>'description', '') <> ''
                               then to_jsonb((select words_from from o)) end
    ))
  end
$$;
