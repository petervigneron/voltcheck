import { test } from "node:test";
import assert from "node:assert/strict";
import { failureKind, apiHostsFrom, seededShuffle, emptyOrTransient, blindEmpty, isBotChallenge } from "../lib/probe-verdict.mjs";
import { spaSignals } from "../lib/spa-signals.mjs";

test("failureKind separates the site's answer from our attempt", () => {
  // The site's own answer — repeats, so retrying it is just noise.
  assert.equal(failureKind(403), "blocked");
  assert.equal(failureKind("robots_disallowed"), "blocked");
  assert.equal(failureKind(404), "gone");
  assert.equal(failureKind(410), "gone");
  // Ours, or at least not settled: fetchPage returns these as strings.
  assert.equal(failureKind("error:AbortError"), "transient");
  assert.equal(failureKind("error:TypeError"), "transient");
  assert.equal(failureKind(429), "transient");
  assert.equal(failureKind(503), "transient");
  assert.equal(failureKind(520), "transient");
  assert.equal(failureKind(400), "other");
});

test("emptyOrTransient is transient only when something failed to answer", () => {
  assert.equal(emptyOrTransient({ failures: [] }), "empty");
  assert.equal(emptyOrTransient({ failures: [{ kind: "gone" }, { kind: "blocked" }] }), "empty");
  assert.equal(emptyOrTransient({ failures: [{ kind: "transient" }] }), "transient");
  assert.equal(emptyOrTransient({ failures: [{ kind: "gone" }, { kind: "transient" }] }), "transient");
  assert.equal(emptyOrTransient(), "empty");
});

test("a site that answered and offered nothing to walk is empty, not transient", () => {
  // The rule that made it transient was measured wrong: 73 of 150 sampled
  // rows had this shape and a serial re-probe rescued none of them. See
  // lib/probe-verdict.mjs.
  assert.equal(emptyOrTransient({ failures: [], sitemapUrls: 0, itemListEntries: 0 }), "empty");
});

test("blindEmpty flags only the empty whose homepage told us nothing", () => {
  // The measured false write-off (10/10 Motive rooftops, 2026-08-24): the walk
  // ran against a real sitemap, but the truncated homepage yielded no
  // fingerprint, no signal, no ItemList. This is the retryable shape.
  const motive = {
    domain: "folsomlakenissan.com",
    platform: "unknown",
    probe: { verdict: "empty", fetched: 12, vehicles: 0, itemList: 0, sitemapUrls: 281 },
  };
  assert.equal(blindEmpty(motive), true);

  // nothing-to-walk is measured stable (73 rows, 0 rescues) — stays out.
  assert.equal(
    blindEmpty({ platform: "unknown", probe: { verdict: "empty", why: "nothing-to-walk", itemList: 0, sitemapUrls: 0 } }),
    false,
  );
  // Any signal, api-host lead, or ItemList entry means we read a real payload.
  assert.equal(
    blindEmpty({ platform: "unknown", probe: { ...motive.probe, signals: ["nextjs"] } }),
    false,
  );
  assert.equal(
    blindEmpty({ platform: "unknown", probe: { ...motive.probe, apiHosts: ["api.example.com"] } }),
    false,
  );
  assert.equal(blindEmpty({ platform: "unknown", probe: { ...motive.probe, itemList: 3 } }), false);
  // A surviving fingerprint means the body was real, so the verdict is too.
  assert.equal(blindEmpty({ platform: "dealer.com", probe: motive.probe }), false);
  // Homepage-level verdicts (no walk, so no sitemapUrls) are the site's own
  // answer — a 3xx/4xx "other" repeats on retry.
  assert.equal(
    blindEmpty({ platform: "unknown", probe: { verdict: "empty", fetched: 1, homeStatus: "400" } }),
    false,
  );
  // Other verdicts have their own lanes.
  assert.equal(blindEmpty({ platform: "unknown", probe: { verdict: "transient", why: "failed-fetch" } }), false);
  assert.equal(blindEmpty({ platform: "ridemotive", probe: { verdict: "working", found: 203 } }), false);
  assert.equal(blindEmpty({ platform: "unknown" }), false);
});

test("apiHostsFrom hands back a list, so nobody has to parse the sentence", () => {
  const signals = spaSignals(
    '<html><script src="https://api.app.ridemotive.com/x"></script>' +
      '<script>fetch("https://api.example.com/graphql")</script>' +
      "<script>window.__NEXT_DATA__={}</script></html>",
  );
  const hosts = apiHostsFrom(signals);
  assert.ok(hosts.includes("api.app.ridemotive.com"), JSON.stringify(signals));
  assert.ok(hosts.includes("api.example.com"));
  assert.deepEqual(apiHostsFrom(["nextjs", "algolia"]), []);
  assert.deepEqual(apiHostsFrom(undefined), []);
});

test("seededShuffle is reproducible from the seed and keeps every row", () => {
  const list = Array.from({ length: 50 }, (_, i) => i);
  const a = seededShuffle(list, 20260823);
  const b = seededShuffle(list, 20260823);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, seededShuffle(list, 7));
  assert.deepEqual([...a].sort((x, y) => x - y), list);
  assert.deepEqual(list, Array.from({ length: 50 }, (_, i) => i)); // input untouched
});

test("a bot challenge served with a 200 is a wall, not an empty lot", () => {
  // faithsford.com's front door, 2026-08-23: F5's interstitial, 3 KB, HTTP 200.
  const challenge =
    '<!DOCTYPE html><html lang="en"><head>' +
    '<link href="/_fs-ch-1T1wmsGaOgGaSxcX/assets/inter-var.woff2" rel="preload" as="font"/>' +
    "<title>Client Challenge</title></head><body>" +
    "<noscript>JavaScript is disabled in your browser.</noscript>" +
    "<script>loadScript('/_fs-ch-1T1wmsGaOgGaSxcX/errors.js')</script></body></html>";
  assert.equal(isBotChallenge(challenge), true);
  // The title alone is three ordinary words. A dealer page that happens to
  // carry them, without the vendor's path, is not a wall.
  assert.equal(isBotChallenge("<html><head><title>Client Challenge</title></head><body>Cars</body></html>"), false);
  // Nor is a real page that merely mentions the path.
  assert.equal(isBotChallenge('<html><title>Used Cars</title><a href="/_fs-ch-x">x</a></html>'), false);
  // A full dealer homepage is far bigger than any interstitial; the size cap
  // keeps this off the hot path for the 13,000 pages that are not walls.
  // (200 KB, not the F5 page's own 3 KB: Motive's interstitial is ~20 KB and
  // has to fit under the same cap.)
  assert.equal(isBotChallenge("<title>Client Challenge</title>/_fs-ch-a" + "x".repeat(200001)), false);
  assert.equal(isBotChallenge(null), false);
});

test("Motive's reCAPTCHA interstitial is a wall, not an empty dealer", () => {
  const page = `<html><head><title>Checking your browser - reCAPTCHA</title></head><body><script src="/recaptcha/challengepage.js"></script></body></html>`;
  assert.equal(isBotChallenge(page), true);
  // The title's words alone, without the vendor path, stay a normal page.
  assert.equal(isBotChallenge("<p>Checking your browser - reCAPTCHA is annoying</p>"), false);
});
