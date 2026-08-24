import { test } from "node:test";
import assert from "node:assert/strict";
import { failureKind, apiHostsFrom, seededShuffle, emptyOrTransient, blindEmpty } from "../lib/probe-verdict.mjs";
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
