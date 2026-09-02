-- A fourth event: a shopper pressing (or unpressing) one of the rail's quick
-- filter toggles, or the same filter as a pressed button in the All-filters
-- panel. The owner (2026-09-02) wants the market's preference for TOP-LEVEL
-- filters quantified, and nothing on the site records a press today; the
-- seven toggles were chosen without evidence. This is the first-party
-- instrument for that — it says nothing until there is traffic, and it is
-- accumulating when there is.
--
-- Props carried (web/lib/events.ts, app/api/events/route.ts allowlist):
--   key, value   the filter key and the value pressed ("maxMiles", "60000")
--   on           true = pressed, false = unpressed
--   surface      "rail" or "panel"
--   scoped       true when a search term, make or model was already set —
--                a press inside one model is a different question from a
--                press on the whole market
--   n, of        what the toggle would leave, out of how many (rail only;
--                a press that keeps 93% of cars is a different signal from
--                one that keeps 18%)
-- No listing ref: the event is about the filter, not a car.
alter table events drop constraint events_name_allowed;
alter table events
  add constraint events_name_allowed
  check (name in ('listing_saved', 'listing_unsaved', 'dealer_click', 'filter_toggled'));
