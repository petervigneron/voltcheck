-- Bring the second-geography tables under 0007's policy. They missed it.
--
-- 0007 closed anon reads on the archive and stated the reasoning: the anon
-- key is not published anywhere (every site read is server-side), but
-- Supabase's model treats that key as publishable by design, so key secrecy
-- is the wrong gate for the one asset a competitor cannot rebuild by
-- starting a crawl today. wa_ev_sales was hard-closed on exactly that
-- argument.
--
-- ca_cc4a_used_ev_sales, ct_cheapr_rebates and ev_rebate_vins were created
-- afterwards (0018) with the same blanket public-read policy 0007 had just
-- finished removing everywhere else. That is an oversight, not a considered
-- exception — the decision was already made, these three were built after
-- the meeting.
--
-- What was reachable: 14,731 California transaction prices, 27,553
-- Connecticut rebate records, and 21,942 VINs, in bulk, through PostgREST.
-- The CA table is the second real sale-price corpus in the project after
-- Washington and the survey work says that kind of data is rare; the VIN
-- list is the join key that makes it useful against live inventory. Those
-- are the moat, not the showroom.
--
-- ev_rebate_vins additionally carries the only privacy dimension of the
-- three. CC4A and CHEAPR are public-records releases, so the argument for
-- closing them is competitive; a world-readable VIN list is its own
-- question, and the safe answer is the same one.
--
-- Nothing operational changes, verified before applying: no reader in
-- either lane (web/ or scraper/) references these tables, the three loaders
-- are security definer and bypass RLS, and the nightly writes go through
-- service_role which bypasses it too. When the site does surface this data,
-- it does so the way Washington's does — a narrow security-definer RPC
-- returning a capped excerpt (recent_sales), never a REST endpoint over the
-- raw table.
--
-- Same belt-and-braces shape as 0007: drop the policy AND revoke select, so
-- the tables stay closed even if RLS were ever disabled by mistake, and a
-- caller gets a permission error rather than silently empty rows.

drop policy if exists "cc4a public read"   on ca_cc4a_used_ev_sales;
drop policy if exists "cheapr public read" on ct_cheapr_rebates;
drop policy if exists "rebate vins read"   on ev_rebate_vins;

revoke select on ca_cc4a_used_ev_sales, ct_cheapr_rebates, ev_rebate_vins
  from anon, authenticated;
