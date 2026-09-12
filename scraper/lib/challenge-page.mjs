// Is this body a wall rather than a page?
//
// These regexes were browser-wall-check.mjs's. They move here because they
// have a second consumer since 2026-09-12: recheck-browser.mjs, whose whole
// job is to turn a real browser's reading of a dealer VDP into a delisting
// verdict, and which must never read a wall as evidence about a car. Two
// copies of this list would fork, and the night one of them went stale a
// Cloudflare interstitial would start striking cars off the site.
//
// A wall is a wall: this file never solves one (lib/http.mjs's header has the
// owner's ruling), it only names it so the caller can stop.
//
// AMBIENT vs WALL, and why the split exists.
//
// The second consumer needed a sharper question than the first. browser-wall-
// check prints its marks for a human to read, so a loose match costs nothing;
// recheck-browser GATES A VERDICT on the answer, so a loose match costs a car
// its reading. Measured 2026-09-12 on three of the first twenty residue pages:
// `/cdn-cgi/challenge-platform/` — Cloudflare's invisible bot-management
// beacon — is injected into ORDINARY responses, not just interstitials. The
// three pages carrying it were haciendaford.com's live VDP (912 KB, the VIN in
// the body, the car's own title), fivestarforddallas.com's real 404 and
// audinaples.com's real 404. Reading that token as a challenge threw away one
// true "still listed" and two true strikes, and two such reads on one host
// would have dropped the rest of that host's cars for the night.
//
// Turnstile is in the same class for the same reason: a dealer's contact form
// can embed one on a perfectly ordinary VDP.
//
// So `wallMarks` is the conclusive half — the markers that only appear when
// the wall has REPLACED the page — and `challengeMarks` stays the union, which
// is what the diagnostic wants.
const WALL = [
  [/Attention Required!?\s*\|\s*Cloudflare/i, "cf-attention-required"],
  [/Just a moment…|Just a moment\.\.\./i, "cf-just-a-moment"],
  [/<form[^>]+id=["']challenge-form["']|cf-chl-|__cf_chl_|id=["']challenge-running["']/i, "cf-challenge-form"],
  [/Access Denied[\s\S]{0,200}Reference\s*#?\d/i, "akamai-access-denied"],
  [/Pardon Our Interruption|distil_r_captcha|_Incapsula_/i, "other-interstitial"],
];

const AMBIENT = [
  [/\/cdn-cgi\/challenge-platform\//i, "cf-bot-beacon"],
  [/challenges\.cloudflare\.com\/turnstile/i, "cf-turnstile"],
];

/** The page IS a wall: every marker here replaces the content it guards. */
export function wallMarks(body) {
  const src = String(body ?? "");
  return WALL.filter(([re]) => re.test(src)).map(([, name]) => name);
}

/** Everything a human diagnosing a walled rooftop wants named, including the
 *  signals that sit on ordinary pages. Not a verdict — see wallMarks. */
export function challengeMarks(body) {
  const src = String(body ?? "");
  return [...WALL, ...AMBIENT].filter(([re]) => re.test(src)).map(([, name]) => name);
}

export function pageTitle(body) {
  const m = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(String(body ?? ""));
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}
