import { test } from "node:test";
import assert from "node:assert/strict";
import {
  failureKind,
  apiHostsFrom,
  seededShuffle,
  emptyOrTransient,
  blindEmpty,
  isBotChallenge,
  botWall,
  walledOut,
} from "../lib/probe-verdict.mjs";
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
  assert.equal(isBotChallenge("<title>Client Challenge</title>/_fs-ch-a" + "x".repeat(20001)), false);
  assert.equal(isBotChallenge(null), false);
});

test("Motive's reCAPTCHA interstitial is a wall, not an empty dealer", () => {
  const page = `<html><head><title>Checking your browser - reCAPTCHA</title></head><body><script src="/recaptcha/challengepage.js"></script></body></html>`;
  assert.equal(isBotChallenge(page), true);
  // The title's words alone, without the vendor path, stay a normal page.
  assert.equal(isBotChallenge("<p>Checking your browser - reCAPTCHA is annoying</p>"), false);
});

// The wall that hides the largest vendor cohort in the needs-investigation
// pile. Unlike F5's and Motive's this one answers 403 — the homepage is fine
// and only the inventory path is refused — so failureKind already calls it
// "blocked", and the question this answers is a different one: whether the
// verdict above it says "needs an extractor" or "there is no door".
test("DataDome's 403 interstitial is named, so a walled row stops reading as unbuilt", () => {
  // acheronauto.com/cars-for-sale, 2026-08-24: 778 bytes, HTTP 403.
  const dd =
    '<html lang="en"><head><title>acheronauto.com</title></head><body style="margin:0">' +
    '<p id="cmsg">Please enable JS and disable any ad blocker</p>' +
    "<script data-cfasync=\"false\">var dd={'rt':'i','cid':'AHrlqAAAAAMAvQ2FR-egaiEAzsCoFg=='," +
    "'hsh':'78E75958F5D8D06268C14F1B1AAB5B','host':'geo.captcha-delivery.com'}</script></body></html>";
  assert.equal(botWall(dd), "datadome");
  // It answers 403, so it is NOT one of the walls that masquerade as a 200.
  // isBotChallenge must keep its narrow meaning, or the front-door check would
  // start marking rows blocked on a page that is not a challenge at all.
  assert.equal(isBotChallenge(dd), false);
  // The visible sentence is generic and appears on plenty of real pages; the
  // vendor's own config object together with its captcha host is the signal.
  assert.equal(botWall('<p id="cmsg">Please enable JS and disable any ad blocker</p>'), undefined);
  assert.equal(botWall("<script>var dd = {rows: 3};</script>"), undefined);
});

test("Imperva's stub is a wall too", () => {
  // copart.com's front door, 2026-08-24: 212 bytes, HTTP 200, noindex.
  const inc =
    '<html><head><META NAME="robots" CONTENT="noindex,nofollow">' +
    '<script src="/_Incapsula_Resource?SWJIYLWA=5074a744e2e3d891814e9a2dace20bd4"></script>' +
    "<body></body></html>";
  assert.equal(botWall(inc), "imperva");
});

test("botWall names the 200-answering walls it always knew", () => {
  const f5 =
    '<html><link href="/_fs-ch-1T1wmsGaOgGaSxcX/assets/inter-var.woff2" rel="preload"/>' +
    "<title>Client Challenge</title></html>";
  assert.equal(botWall(f5), "f5");
  assert.equal(botWall("<title>Checking your browser - reCAPTCHA</title>"), "motive-recaptcha");
  assert.equal(botWall("<html>a normal dealer page</html>"), undefined);
  assert.equal(botWall(null), undefined);
});

test("walledOut reads the failure list, and one plain 403 is not a wall", () => {
  assert.equal(walledOut([{ status: "403", kind: "blocked" }]), false);
  assert.equal(walledOut([{ status: "404", kind: "gone" }, { status: "403", kind: "blocked", wall: "datadome" }]), true);
  assert.equal(walledOut([]), false);
  assert.equal(walledOut(), false);
});

test("a walled row is not requeued, because the wall repeats", () => {
  const probe = { verdict: "empty", why: "walled", wall: "datadome", sitemapUrls: 46 };
  assert.equal(blindEmpty({ domain: "acheronauto.com", platform: "unknown", probe }), false);
  // The same row WITHOUT the wall is exactly the shape blindEmpty rescues.
  assert.equal(
    blindEmpty({ domain: "acheronauto.com", platform: "unknown", probe: { verdict: "empty", sitemapUrls: 46 } }),
    true,
  );
});
