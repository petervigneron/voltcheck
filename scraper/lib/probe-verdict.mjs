// The pieces of probe.mjs's verdict that are worth testing on their own:
// which failures are the site's answer and which are ours, how a seeded
// sample is drawn, and how the api-host leads come back out of spaSignals.
//
// The distinction they serve is in probe.mjs's header. Short version: "0 VIN
// vehicles in 12 fetches" used to mean both "this site has no extractable
// inventory" and "this site never answered us", and a row written off the
// second way is indistinguishable from a dead end forever after.

/** A failed fetch → what it says.
 *
 *  "blocked" and "gone" are the site's own answer and repeat on a retry: a
 *  403/401/451 is a refusal, a robots disallow is a stated policy, a 404/410
 *  at the front door is a domain that no longer serves a dealership.
 *
 *  "transient" is everything that a slower second attempt routinely turns into
 *  a 200 — 429 and 5xx, and fetchPage's non-numeric `error:*` returns, which
 *  are its timeout and its network errors. These are usually about how hard we
 *  were pushing, not about the site: steponeauto.com scored 0 at concurrency
 *  16 with 1,761 cars on the lot.
 *
 *  "other" is a 3xx/4xx that is neither — rare, and not evidence either way,
 *  so the caller treats it as an answer rather than a reason to retry. */
export function failureKind(status) {
  if (typeof status !== "number") return status === "robots_disallowed" ? "blocked" : "transient";
  if (status === 403 || status === 401 || status === 451) return "blocked";
  if (status === 404 || status === 410) return "gone";
  if (status === 429 || status >= 500) return "transient";
  return "other";
}

/** A wall that answers 200.
 *
 *  F5 Distributed Cloud's bot management serves its interstitial with a 200
 *  and a three-kilobyte body: `<title>Client Challenge</title>`, assets under
 *  a `/_fs-ch-…/` path, and a script that has to run before anything else is
 *  served. Nothing about the response is a status code, so failureKind never
 *  saw it and the row came back "0 VIN vehicles, 0 sitemap urls" —
 *  indistinguishable from a dealer with no inventory online, which is the
 *  exact confusion this module exists to end. Three rows in a seeded random
 *  400 of the written-off pile were this (faithsford.com, hondaoflisle.com,
 *  lincolnofmansfield.com, 2026-08-23), all of them live franchise stores.
 *
 *  It is a REFUSAL, so it is recorded as one and not worked around: the house
 *  rule is that a challenge is a wall (see lib/http.mjs's header — no
 *  challenge-solving, owner's decision).
 *
 *  Matched on the title plus the vendor's own path prefix together. The title
 *  alone is three common words and a dealer could legitimately publish it. */
export function isBotChallenge(html) {
  if (typeof html !== "string" || html.length > 20000) return false;
  if (/<title>\s*Client Challenge\s*<\/title>/i.test(html) && /\/_fs-ch-[A-Za-z0-9]/.test(html)) return true;
  // Motive's edge challenge: same contract (HTTP 200, page is a wall). The
  // TITLE TAG or the vendor's own challenge path — prose merely mentioning
  // the phrase stays a normal page, same reasoning as F5 above.
  return /<title>\s*Checking your browser - reCAPTCHA\s*<\/title>/i.test(html) || /recaptcha\/challengepage/i.test(html);
}

/** spaSignals packs its hosts into one "api-hosts:a+b+c" token. Unpack it so
 *  the registry row can carry a list and api-leads.mjs can stop regexing
 *  hosts back out of an English sentence (finding #1 of its own header). */
export function apiHostsFrom(signals) {
  const raw = (signals ?? []).find((s) => typeof s === "string" && s.startsWith("api-hosts:"));
  return raw ? raw.slice("api-hosts:".length).split("+").map((h) => h.trim()).filter(Boolean) : [];
}

/** A reproducible shuffle (mulberry32), so a sample of the written-off pile
 *  can be quoted with its seed and drawn again. The pile is ordered by how it
 *  was discovered — whole states arrive together — so taking the first N
 *  measures one corner of it and calls the answer general. */
export function seededShuffle(list, seed) {
  let a = (seed >>> 0) + 0x6d2b79f5;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The verdict for a walk that extracted no VIN: transient ONLY when something
 *  actually failed to answer.
 *
 *  This started out wider. "The homepage answered and then offered nothing to
 *  try — no sitemap, no ItemList" was also counted transient, on the theory
 *  that it is the shape of a front page served under load without its nav, and
 *  that being wrong in this direction only costs a re-probe.
 *
 *  Measured, and it does not hold. On a seeded random 150 of the
 *  needs-investigation pile (seed 20260823, probed at concurrency 12 and then
 *  re-probed IN SERIES), 85 rows came back transient — 73 of them of the
 *  nothing-to-walk kind — and the serial retry rescued exactly ZERO of the 85.
 *  Nothing-to-walk turns out to be stable: those rooftops answer their
 *  homepage every time and genuinely publish no sitemap and no ItemList, which
 *  is a real finding about the site (it needs a platform extractor, or it has
 *  no inventory) and not a report about our own concurrency. Labelling it
 *  transient put 73 of 150 rows into a nightly requeue that could never
 *  promote them.
 *
 *  So it is "empty" now, and the caller records why — `nothing-to-walk` versus
 *  a walk that fetched real pages and found no VIN on them. The requeue
 *  population drops from ~57% of the pile to ~9%, which is the rows where
 *  something actually did not answer: the case that DID promote on a serial
 *  retry (sarchioneofwaynesburg.com and mercedesbenzbrooklyn.com, 319 and 528
 *  vehicles, minutes after being scored as nothing at concurrency 3). */
export function emptyOrTransient({ failures = [] } = {}) {
  return failures.some((f) => f.kind === "transient") ? "transient" : "empty";
}

/** An "empty" verdict that should not be trusted without a serial second look:
 *  the walk completed, yet the homepage told us NOTHING about the site — no
 *  platform fingerprint, no client-rendered/API signal, no ItemList — while
 *  the site is plainly alive (it published a sitemap to walk).
 *
 *  Why this narrow shape is retryable when "empty" in general is not: on
 *  platforms whose inventory config rides inline in a large payload (Motive),
 *  a page fetched under concurrent load can answer 200 with that payload
 *  missing. The fingerprint and the config vanish with it, so the site scores
 *  "answered, no VIN" — a verdict, where a failed fetch would have been a
 *  retry. Measured 2026-08-24 on a 60-row seeded sample of newly discovered
 *  Motive rooftops probed at concurrency 5 (out/motive-probe-sample.json): 10
 *  came back empty with exactly this shape, and a serial re-probe promoted
 *  ALL TEN via the ridemotive extractor (out/motive-probe-retry.json —
 *  joecooperfordedmond.com alone held 1,519 vehicles). The same artifact is
 *  why motive-dealers.mjs's harvest has a --refetch pass: kuneslakeschevy.com
 *  read as "0 dealer records" under load and publishes 52 fetched alone.
 *
 *  The cost side, because widening the requeue was measured wrong once before
 *  (see emptyOrTransient above — 57% of the pile for zero rescues): this rule
 *  matches 16 of the 3,435 needs-investigation rows (0.5%, measured
 *  2026-08-24), and a false positive costs one serial re-probe that
 *  re-confirms the verdict. Each guard is load-bearing:
 *  - `why: nothing-to-walk` stays out — measured stable (73 rows, 0 rescues).
 *  - Any signal or apiHost means we READ the homepage's payload; a truncated
 *    body yields none (the 10 false empties recorded zero signals).
 *  - A known platform means the fingerprint survived, so the body was real.
 *  - `sitemapUrls` must be present: it is only recorded when the walk ran, so
 *    a homepage-level failure verdict (homeStatus, "other" kinds) stays out —
 *    those are the site's own answer and repeat on a retry. */
export function blindEmpty(site) {
  const p = site?.probe;
  if (!p || p.verdict !== "empty" || p.why === "nothing-to-walk") return false;
  if (p.sitemapUrls == null) return false;
  if ((p.signals?.length ?? 0) > 0 || (p.apiHosts?.length ?? 0) > 0 || (p.itemList ?? 0) > 0) return false;
  return !site.platform || site.platform === "unknown";
}
