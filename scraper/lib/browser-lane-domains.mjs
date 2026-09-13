// Which registry rooftops the browser crawl (.github/workflows/browser-crawl
// .yml) owns, and how one run's list is cut into parts and rotated.
//
// A "browser-lane rooftop" is a working registry row whose platform crawl.mjs
// dispatches to a real Chrome (its BROWSER_LANES table) — the vendors whose
// firewalls answer lib/http.mjs's plain client with a block page on every
// path and let a plain headless Chrome in (lib/browser.mjs has the policy
// line). probe.mjs labels them by DNS, so the label is the marker; on
// 2026-09-13 every one of the 2,110 working dealerinspire rows and 63 porsche
// rows also carried probe.browser=true, and no other working row did.
//
// dealercenter is a browser lane in crawl.mjs and is deliberately NOT here:
// the vendor's own robots.txt, readable only through Chrome, disallows the
// inventory JSONP and the pager the lane read (lib/platforms/dealercenter.mjs,
// 2026-09-05), so every one of its 138 working rooftops answers
// "robots_disallowed" in zero loads — the 2026-09-13 07:11 rolling run did
// exactly that on 112 of them. A visit that reads nothing and certifies
// nothing is not worth a runner slot; those cars are the nightly browser
// recheck's (recheck-browser.mjs, one robots-allowed VDP at a time).
export const BROWSER_LANE_PLATFORMS = ["dealerinspire", "porsche"];

/** Sorted, de-duplicated domains of the working rooftops on the browser
 *  lanes. Sorted so membership is stable between runs and a rooftop's place
 *  in the list depends on the registry, not on the order it was added. */
export function browserLaneDomains(registry, { platforms = BROWSER_LANE_PLATFORMS } = {}) {
  const want = new Set(platforms);
  const out = new Set();
  for (const s of registry?.sites ?? []) {
    if (s?.status === "working" && want.has(s.platform) && s.domain) out.add(s.domain);
  }
  return [...out].sort();
}

/** The run's key: which half-day it is. Two scheduled runs a day get two
 *  different keys, and a dispatched run on the same half-day gets the same
 *  one, so re-running a run repeats its order. */
export function runKey(date = new Date()) {
  return Math.floor(date.getTime() / (12 * 3_600_000));
}

/**
 * The list rotated to a start that moves by roughly the golden ratio of its
 * length each run. crawl.mjs works its list in order and a run that hits its
 * deadline drops the TAIL, so a fixed order would drop the same rooftops for
 * ever — the rolling crawl's day-of-year rotation exists for the same reason
 * (rolling-crawl.yml, "ROTATED BY DAY"). A golden-ratio stride is used rather
 * than a day count because consecutive keys then start far apart and never
 * settle into a cycle that leaves a fixed band unread.
 */
export function rotateForRun(list, key) {
  const n = list.length;
  if (!n) return [];
  const frac = (key * 0.6180339887498949) % 1;
  const off = Math.floor(((frac + 1) % 1) * n) % n;
  return [...list.slice(off), ...list.slice(0, off)];
}

/** Part i of n: every n-th rooftop, so parts are the same size and two
 *  heavy group sites next to each other in the alphabet land in different
 *  jobs (the cohort crawl's rule). */
export function partOf(list, i, n) {
  if (!(n > 0) || i < 0 || i >= n) return [];
  return list.filter((_, k) => k % n === i);
}
