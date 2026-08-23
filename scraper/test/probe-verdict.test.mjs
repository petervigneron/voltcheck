import { test } from "node:test";
import assert from "node:assert/strict";
import { failureKind, apiHostsFrom, seededShuffle, emptyOrTransient } from "../lib/probe-verdict.mjs";
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

test("emptyOrTransient calls a walk empty only when everything answered", () => {
  assert.equal(emptyOrTransient({ failures: [], sitemapUrls: 400, itemListEntries: 0 }), "empty");
  assert.equal(emptyOrTransient({ failures: [{ kind: "gone" }], sitemapUrls: 12, itemListEntries: 0 }), "empty");
  assert.equal(
    emptyOrTransient({ failures: [{ kind: "transient" }], sitemapUrls: 400, itemListEntries: 30 }),
    "transient",
  );
  // A homepage that answered and offered nothing to walk is not a finding
  // about the site — it is the shape a site has when served under load.
  assert.equal(emptyOrTransient({ failures: [], sitemapUrls: 0, itemListEntries: 0 }), "transient");
  assert.equal(emptyOrTransient(), "transient");
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
