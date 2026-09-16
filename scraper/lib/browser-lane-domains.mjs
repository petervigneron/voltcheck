// Which registry rooftops each browser crawl owns — the hosted one
// (.github/workflows/browser-crawl.yml) and the residential one
// (.github/workflows/porsche-crawl.yml) — and how one run's list is cut into
// parts and rotated.
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
//
// porsche is a browser lane too, and since 2026-09-16 it is not the HOSTED
// crawl's, for a reason that is about the address the request comes from and
// nothing else. Porsche's platform runs Vercel Attack Challenge Mode, and the
// challenge is keyed on the caller's address: from a residential line the
// lane reads the lot at 200 (porscheplano.com, 2026-09-16: 174 cars in the
// lot, 45 read in 3 loads, 31 s), while from GitHub-hosted runners every
// rooftop answers 429 with x-vercel-mitigated: challenge on its FIRST load —
// 59 of the 63 working rooftops on the 2026-09-16 09:27 UTC run, the other
// four a genuine 404 the laptop reproduces, and 0 cars read on any of them,
// which is what every hosted run since 2026-09-13 has done. Solving the
// challenge is out of policy (lib/browser.mjs), so the rooftops moved to a
// self-hosted runner on a residential line (.github/workflows/porsche-crawl
// .yml) and the hosted crawl stopped spending 63 challenged loads a run on
// them.
//
// The split is a ROUTING fact, not a taxonomy: both lists are browser lanes,
// and anything measuring "the browser lanes" as a whole wants both
// (ALL_BROWSER_LANE_PLATFORMS). What BROWSER_LANE_PLATFORMS means is "what a
// hosted runner should visit", because that is what its two callers —
// browser-crawl.yml's rooftop picker and the dark measurement it takes before
// and after itself — are asking. Leaving porsche in the default would have
// put 1,077 cars no hosted run can reach into browser-crawl's own
// before/after numbers for ever.
// dealereprocess joined the hosted default 2026-09-16: one electric-SRP load
// per rooftop, 744 of 745 rooftops at 200 on the first load from a
// residential line (lib/platforms/dealereprocess.mjs); whether GitHub-hosted
// runners see the same first load is the next run's measurement.
export const BROWSER_LANE_PLATFORMS = ["dealerinspire", "dealereprocess"];

/** The browser lanes a residential self-hosted runner owns, because the
 *  vendor's wall is keyed on where the request comes from. */
export const RESIDENTIAL_LANE_PLATFORMS = ["porsche"];

/** Every browser-lane platform, whichever runner visits it. */
export const ALL_BROWSER_LANE_PLATFORMS = [...BROWSER_LANE_PLATFORMS, ...RESIDENTIAL_LANE_PLATFORMS];

/** Sorted, de-duplicated domains of the working rooftops on the given
 *  browser lanes (by default the ones a hosted runner owns). Sorted so
 *  membership is stable between runs and a rooftop's place in the list
 *  depends on the registry, not on the order it was added. */
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
