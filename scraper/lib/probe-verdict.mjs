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

/** The verdict for a walk that extracted no VIN.
 *
 *  `nothingToWalk` — a homepage that answered and then offered nothing to try,
 *  no sitemap and no ItemList — is counted transient rather than empty on
 *  purpose. That is the shape a site has when its front page is served under
 *  load without the nav the rest of the walk needs, and it is cheap to be
 *  wrong in this direction: the cost is one serial re-probe, where the cost of
 *  the other direction is a live lot written off permanently. */
export function emptyOrTransient({ failures = [], sitemapUrls = 0, itemListEntries = 0 } = {}) {
  const transient = failures.filter((f) => f.kind === "transient").length;
  if (transient > 0) return "transient";
  return sitemapUrls === 0 && itemListEntries === 0 ? "transient" : "empty";
}
