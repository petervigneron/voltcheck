import test from "node:test";
import assert from "node:assert/strict";
import { browserLaneDomains, rotateForRun, partOf, runKey } from "../lib/browser-lane-domains.mjs";
import { isDark, lastEvidenceAt, summarizeDark, DARK_AFTER_MS } from "../lib/browser-lane-dark.mjs";

const registry = {
  sites: [
    { domain: "b-di.com", status: "working", platform: "dealerinspire", probe: { browser: true } },
    { domain: "a-di.com", status: "working", platform: "dealerinspire" },
    { domain: "porsche.example", status: "working", platform: "porsche" },
    { domain: "dc.example", status: "working", platform: "dealercenter", probe: { browser: true } },
    { domain: "walled-di.com", status: "http-403", platform: "dealerinspire", probe: { browser: true } },
    { domain: "plain.com", status: "working", platform: "dealer.com" },
    { domain: "b-di.com", status: "working", platform: "dealerinspire" }, // a duplicate row
  ],
};

test("browser-lane rooftops are the working dealerinspire and porsche rows, sorted and de-duplicated", () => {
  assert.deepEqual(browserLaneDomains(registry), ["a-di.com", "b-di.com", "porsche.example"]);
});

// The lane is closed by the vendor's robots.txt (lib/platforms/dealercenter
// .mjs); a visit reads nothing, so the job does not spend a slot on it.
test("dealercenter is not a browser-crawl rooftop even when probe marked it browser", () => {
  assert.ok(!browserLaneDomains(registry).includes("dc.example"));
  assert.deepEqual(browserLaneDomains(registry, { platforms: ["dealercenter"] }), ["dc.example"]);
});

test("rotation is a permutation whose start moves between consecutive runs", () => {
  const list = Array.from({ length: 50 }, (_, i) => `d${String(i).padStart(2, "0")}.com`);
  const starts = new Set();
  for (let k = 1000; k < 1010; k++) {
    const r = rotateForRun(list, k);
    assert.deepEqual([...r].sort(), list);
    starts.add(r[0]);
  }
  assert.ok(starts.size >= 9, `ten runs should start in (nearly) ten different places, got ${starts.size}`);
  assert.deepEqual(rotateForRun([], 3), []);
});

test("parts interleave, partition the list, and are the same size within one", () => {
  const list = Array.from({ length: 23 }, (_, i) => `d${i}`);
  const parts = [0, 1, 2, 3].map((i) => partOf(list, i, 4));
  assert.deepEqual(parts.flat().sort(), [...list].sort());
  assert.deepEqual(parts[1].slice(0, 3), ["d1", "d5", "d9"]);
  assert.ok(Math.max(...parts.map((p) => p.length)) - Math.min(...parts.map((p) => p.length)) <= 1);
  assert.deepEqual(partOf(list, 4, 4), []);
});

test("the run key changes twice a day", () => {
  const k0 = runKey(new Date("2026-09-13T04:30:00Z"));
  const k1 = runKey(new Date("2026-09-13T18:30:00Z"));
  const k2 = runKey(new Date("2026-09-14T04:30:00Z"));
  assert.equal(k1, k0 + 1);
  assert.equal(k2, k0 + 2);
});

// The owner's acceptance rule: greatest(last_seen_at, coalesce(last_confirmed_at,
// last_seen_at)) < now() - 36h. Postgres's greatest() skips nulls.
test("a car is dark when its later stamp is over 36 hours old", () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  const h = 3_600_000;
  const at = (hoursAgo) => new Date(now - hoursAgo * h).toISOString();
  assert.equal(isDark({ last_seen_at: at(35) }, now), false);
  assert.equal(isDark({ last_seen_at: at(37) }, now), true);
  // an own-page confirmation counts even when the crawl has not seen it
  assert.equal(isDark({ last_seen_at: at(80), last_confirmed_at: at(10) }, now), false);
  assert.equal(isDark({ last_seen_at: at(10), last_confirmed_at: at(80) }, now), false);
  assert.equal(isDark({ last_seen_at: null, last_confirmed_at: at(40) }, now), true);
  // neither stamp: not this rule's business
  assert.equal(isDark({}, now), false);
  assert.equal(isDark(null, now), false);
  assert.equal(lastEvidenceAt({ last_seen_at: at(80), last_confirmed_at: at(10) }), now - 10 * h);
  assert.equal(DARK_AFTER_MS, 36 * h);
});

test("the summary counts dark cars and rooftops by cluster, and a fully dark rooftop", () => {
  const rows = [
    { vin: "1", dealerDomain: "x.com", dark: true },
    { vin: "2", dealerDomain: "x.com", dark: true },
    { vin: "3", dealerDomain: "y.com", dark: true },
    { vin: "4", dealerDomain: "y.com", dark: false },
    { vin: "5", dealerDomain: "z.com", dark: false },
  ];
  const s = summarizeDark(rows, (d) => (d === "z.com" ? "porsche" : "dealerinspire"));
  assert.equal(s.live, 5);
  assert.equal(s.dark, 3);
  assert.equal(s.darkRooftops, 2);
  assert.equal(s.fullyDarkRooftops, 1);
  assert.equal(s.rooftopsWithLiveRows, 3);
  assert.deepEqual(s.byPlatform.dealerinspire, { rooftops: 2, live: 4, dark: 3, darkRooftops: 2, fullyDark: 1 });
  assert.deepEqual(s.byPlatform.porsche, { rooftops: 1, live: 1, dark: 0, darkRooftops: 0, fullyDark: 0 });
  assert.equal(s.top[0].domain, "x.com");
});
