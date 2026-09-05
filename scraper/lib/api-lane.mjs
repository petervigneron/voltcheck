// When a platform's inventory API has had its turn.
//
// The dealer.com and DealerOn lanes in crawl.mjs read a rooftop's whole lot
// from a same-origin JSON endpoint, and they used to retire themselves the
// moment a page revealed the site config — before the pull had said anything.
// So one 429 or 503 cost the rest of the visit: the domain fell through to the
// page-budgeted HTML walk, which on a big lot cannot reach every car.
// irvinebmw.com did exactly that on 2026-09-05. Its crawl filed
// "dealercom-api: no response, falling back to HTML", walked its 80 pages, and
// never reached WB543CF09TCX29713 — a 2026 iX xDrive45 sitting in the API's
// own 528-car lot, which the same config pulled cleanly on the next request.
//
// Two attempts. A second try costs one request when the endpoint is genuinely
// absent (an older template with no widget), and buys back a whole rooftop
// when the silence was a rate limit — which is the commoner cause by far.
export const API_LANE_TRIES = 2;

/** True once this lane must stop asking: it answered, or it has used its
 *  attempts. `tries` counts attempts already made, this one included. */
export function apiLaneDone({ ok, tries, max = API_LANE_TRIES }) {
  return Boolean(ok) || tries >= max;
}
