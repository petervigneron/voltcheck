-- A fifth event: a person opening a page. Until now `events` recorded what a
-- shopper DID (save, unsave, click through to a dealer, press a filter) and
-- nothing about arriving, so the site could not say how many people came in
-- a week or from where. Vercel Web Analytics counts that, but only on a
-- dashboard no script can read. The owner asked on 2026-11-10 for the site
-- to earn its keep on under an hour a week of his time; a weekly emailed
-- summary (scraper/visit-report.mjs) needs rows it can read.
--
-- Props carried (web/lib/visit.ts is the rule and tests/visit.test.ts pins it):
--   p      the path; a listing page is "/listing" and its VIN is the row's
--          `listing` column
--   land   true on the first page of a tab session
--   ref    referring HOSTNAME, landing only — never the referrer's path or
--          query, and never our own host
--   src    utm_source or ref= from the landing URL, when it is a plain label
--   new    true when the browser had no client id before this page
-- The route drops events from crawlers and headless browsers before insert.
--
-- Same abuse posture as 0027: anon may insert and nothing else; rows are
-- bounded by the existing size checks and readable only by service_role.
alter table events drop constraint events_name_allowed;
alter table events
  add constraint events_name_allowed
  check (name in ('listing_saved', 'listing_unsaved', 'dealer_click', 'filter_toggled', 'page_view'));

-- The report reads one week of one event name at a time.
create index if not exists events_name_created_idx on events (name, created_at);
