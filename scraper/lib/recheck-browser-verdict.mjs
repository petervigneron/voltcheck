// What a real browser's reading of a dealer VDP is allowed to conclude.
//
// THE RESIDUE THIS EXISTS FOR (measured 2026-09-12)
//
// recheck.mjs asks each live listing's own dealer page whether the car is
// still there. About 19,700 of ~106,000 pages a night answer 403 or time out
// to the plain fetch, so those cars get no verdict at all. For the four
// marketplace-fed lanes (ford-blue-advantage, honda-prologue, hyundai-cpo,
// audi-network) lib/recheck-oem-crosscheck.mjs now strikes a car the
// marketplace's own sweep has stopped listing, which retires most of that
// pile. What is left is the residue: the marketplace STILL lists the car, the
// dealer's own page cannot be read by fetch, and in a real browser the page
// turns out to be a "missing vehicle" redirect. 18 of 24 sampled that day
// were gone — the owner's example, 1FT6W1EV2PWG58901 at
// bonifacehierschevrolet.com, answers 403 to fetch and does not exist on the
// real site. ~2,200 live rows sit in that position.
//
// WHAT THIS MODULE REFUSES TO CONCLUDE, AND WHY
//
// The cross-check exists because a per-VDP text read has a MEASURED
// false-negative rate on exactly these four domains: template variance and
// JS-rendering quirks produce an occasional "the VIN is not in this page"
// that an unrelated fetch a night later reverses, and 94-100% of these
// domains' delistings came from that reading. Every car this module looks at
// is one the marketplace still lists — i.e. one whose "gone" verdict recheck
// would OVERRIDE. So a browser read has to be better evidence than the fetch
// read, not the same evidence with Chrome's user-agent on it.
//
// REJECTED, therefore: striking on "the page answered 200 at the VDP's own
// URL and the VIN is not in the body". That is the fetch rule verbatim, it is
// the rule the cross-check was built to outvote, and a client-rendered page
// that simply had not painted yet reads exactly like it. It returns "none"
// here. What earns a strike is POSITIVE evidence that the page about this car
// is gone: the site itself redirected the VDP to its missing-vehicle handler,
// to an inventory index, or to its homepage, or answered 404. Those are the
// site's own statement, not our parse of one.
//
// And never a HARD delist. dealer.com's missing-vehicle handler is a 200, and
// so is DealerOn's bounce to /used-vehicles/ — a browser read cannot produce
// the 404/410 that 0004 retires a car on immediately. Every gone verdict here
// is a soft strike, so it still takes two consecutive nights to delist.
//
// A challenge page is not a verdict (the same rule crawl.mjs and recheck.mjs
// apply to Motive's 200-with-a-reCAPTCHA), and neither is a blank body. Note
// `wallMarks`, not `challengeMarks`: Cloudflare's bot-management beacon sits
// on ordinary pages, and reading it as a wall cost three of the first twenty
// residue pages their verdict. lib/challenge-page.mjs has the measurement.
import { wallMarks } from "./challenge-page.mjs";
import { isMotiveChallenge } from "./platforms/ridemotive.mjs";
import { RECHECK_CROSSCHECK_DOMAINS, isPerVinPage } from "./recheck-oem-crosscheck.mjs";

// Paths a dealer site bounces a dead VDP to. Matched as a WHOLE path (after
// collapsing doubled and trailing slashes), never as a prefix: "/used-vehicles"
// is an index, "/used-vehicles/2023-ford-f-150-lightning-1FT…" is a car.
const INDEX_PATHS = new Set([
  "/",
  "/inventory",
  "/inventory/index.htm",
  "/inventory/new",
  "/inventory/used",
  "/inventory/certified",
  "/new-vehicles",
  "/used-vehicles",
  "/certified-vehicles",
  "/all-inventory",
  "/new-inventory",
  "/used-inventory",
  "/pre-owned-vehicles",
  "/new-cars",
  "/used-cars",
  "/cars-for-sale",
  "/vehicles",
  "/showroom",
  "/searchnew.aspx",
  "/searchused.aspx",
  "/searchall.aspx",
  "/new",
  "/used",
]);

// The handlers that say it outright, wherever they sit in the path. These are
// conclusive on their own — a live VDP is never served from one of them — so
// they do not need a redirect to have been observed.
const GONE_PATH_RE =
  /(^|\/)(missing[-_]vehicle|vehicle[-_]not[-_]found|inventory[-_]not[-_]found|vehicle[-_]unavailable|no[-_]longer[-_]available|sold[-_]vehicle)(\/|$)/i;

/** Host, path and query in a shape two URLs can be compared in: www dropped,
 *  doubled and trailing slashes collapsed, lower-cased. */
export function normalizeUrl(url) {
  try {
    const u = new URL(String(url));
    return {
      host: u.hostname.replace(/^www\./i, "").toLowerCase(),
      path: u.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase() || "/",
      query: u.search.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Did the site answer this VDP request with a page that is not about a car?
 * Returns the reason, or null. `requestedUrl` is only used to tell a redirect
 * from a landing: an index path the request ASKED for is not evidence of
 * anything (and is never selected as a target), while an index path the site
 * sent a per-VIN request to is the site saying the car is not there.
 */
export function goneUrlReason(requestedUrl, finalUrl) {
  const to = normalizeUrl(finalUrl);
  if (!to) return null;
  if (GONE_PATH_RE.test(to.path)) return "missing-vehicle";
  // Team Velocity keeps the VDP's own URL and flags the car in the query.
  if (/[?&]vehiclestatus=unavailable(&|$)/.test(to.query)) return "status-unavailable";
  const from = normalizeUrl(requestedUrl);
  const redirected = !from || from.host !== to.host || from.path !== to.path;
  if (!redirected || !INDEX_PATHS.has(to.path)) return null;
  return to.path === "/" ? "redirect-home" : "redirect-inventory";
}

/**
 * One browser load → one verdict.
 *
 *   { verdict: "alive" | "softGone" | "none", reason }
 *
 * `status` is lib/browser.mjs's: an HTTP number, or one of its string
 * outcomes ("robots_disallowed", "browser_unavailable", "error:…"), none of
 * which is a statement about the car.
 *
 * The VIN is looked for in the BODY only, never in the final URL. Every
 * target here was selected because its sourceUrl contains the VIN, so a
 * finalUrl test would answer "alive" for every page that did not redirect,
 * including the ones that redirect the query away and keep the path.
 */
export function classifyBrowserRecheck({ vin, url, status, finalUrl, body }) {
  const v = String(vin ?? "").toUpperCase();
  if (!v) return { verdict: "none", reason: "no-vin-requested" };
  if (typeof status !== "number") return { verdict: "none", reason: String(status ?? "no-status") };

  const marks = wallMarks(body);
  if (marks.length) return { verdict: "none", reason: `challenge:${marks.join("+")}` };
  if (body && isMotiveChallenge(body)) return { verdict: "none", reason: "challenge:motive" };

  if (status === 404 || status === 410) return { verdict: "softGone", reason: `http-${status}` };
  if (status < 200 || status >= 300) return { verdict: "none", reason: `http-${status}` };

  // Checked BEFORE the VIN: dealer.com's missing-vehicle handler keeps the
  // dead VDP's slug in the URL it lands on, and the page echoes that slug, so
  // a body test would read the VIN off the very page saying the car is gone.
  const goneUrl = goneUrlReason(url, finalUrl ?? url);
  if (goneUrl) return { verdict: "softGone", reason: goneUrl };

  if (!body || body.replace(/\s+/g, "").length < 200) return { verdict: "none", reason: "blank" };
  if (body.toUpperCase().includes(v)) return { verdict: "alive", reason: "vin-on-page" };
  // The fetch rule, deliberately not applied. See the header.
  return { verdict: "none", reason: "no-vin" };
}

/**
 * The residue, out of the rows the database handed back.
 *
 * `rows` are {vin, sourceUrl, dealerDomain, lastConfirmedAt}. A row is a
 * target when all four hold:
 *
 *   1. it is on one of the four marketplace-fed domains — the only lanes
 *      where the marketplace's own sweep is a second opinion, and the only
 *      ones whose rows carry a foreign dealer's VDP;
 *   2. its sourceUrl is a page about THIS car. A Ford Blue Advantage record
 *      with no deepLink hands over the dealer's homepage, and recheck already
 *      judges those by the sweep alone (lib/recheck-oem-crosscheck.mjs) —
 *      loading a homepage in Chrome would add a browser's cost to a reading
 *      that is a strike by construction;
 *   3. recheck has never once confirmed it, or not inside `staleDays`. A car
 *      whose page recheck reads fine every night is not the residue;
 *   4. tonight's own sweep has NOT dropped it. A car the sweep no longer
 *      lists is already being struck by recheck — spending a browser load on
 *      it buys nothing. `sweepSaysGone` answers false for a missing or short
 *      sweep, so an absent feed simply leaves everything in.
 *
 * Ordered never-confirmed first, then oldest confirmation first, then dealt
 * round-robin across hosts: lib/http.mjs paces one request per host per 1.1s,
 * so two workers on the same rooftop spend their night waiting on each other.
 */
// Two populations (2026-09-12):
//   * marketplace-lane rows (RECHECK_CROSSCHECK_DOMAINS): never confirmed, or
//     not within staleDays — the original residue;
//   * dealer-site rows (a dotted domain): neither seen by any crawl nor
//     confirmed on their own page within seenHours. Since 0090 these are
//     withheld from the site at 72 hours; this pass re-admits the live ones
//     on rooftops only a browser can read (403 to the fetch, browser lane
//     switched off) and strikes the sold ones. Nissan/Lucid's sweep-only
//     lanes and the OEM locators are not dotted and are not visited — their
//     sweeps see them nightly.
// Oldest evidence first, dealt round-robin across hosts so no one rooftop
// eats the cap.
export function selectResidue(rows, { now = Date.now(), staleDays = 7, seenHours = 48, sweepSaysGone = () => false, limit = 0 } = {}) {
  const cutoff = now - staleDays * 86_400_000;
  const seenCutoff = now - seenHours * 3_600_000;
  const keep = [];
  for (const r of rows ?? []) {
    if (!r) continue;
    const marketplace = RECHECK_CROSSCHECK_DOMAINS.has(r.dealerDomain);
    const dealerSite = !marketplace && /\./.test(String(r.dealerDomain ?? ""));
    if (!marketplace && !dealerSite) continue;
    if (!r.sourceUrl || !isPerVinPage(r.sourceUrl, r.vin)) continue;
    const at = r.lastConfirmedAt ? Date.parse(r.lastConfirmedAt) : NaN;
    if (marketplace) {
      if (Number.isFinite(at) && at >= cutoff) continue;
    } else {
      const seen = r.lastSeenAt ? Date.parse(r.lastSeenAt) : NaN;
      const latest = Math.max(Number.isFinite(at) ? at : -Infinity, Number.isFinite(seen) ? seen : -Infinity);
      if (latest >= seenCutoff) continue;
    }
    if (sweepSaysGone(String(r.vin ?? "").toUpperCase(), r.dealerDomain)) continue;
    keep.push({ ...r, confirmedAt: Number.isFinite(at) ? at : null });
  }
  keep.sort((a, b) => (a.confirmedAt ?? -1) - (b.confirmedAt ?? -1) || String(a.vin).localeCompare(String(b.vin)));

  const byHost = new Map();
  for (const r of keep) {
    const host = normalizeUrl(r.sourceUrl)?.host ?? "";
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(r);
  }
  const dealt = [];
  const queues = [...byHost.values()];
  for (let round = 0; dealt.length < keep.length; round++) {
    for (const q of queues) if (q[round]) dealt.push(q[round]);
  }
  return limit > 0 ? dealt.slice(0, limit) : dealt;
}
