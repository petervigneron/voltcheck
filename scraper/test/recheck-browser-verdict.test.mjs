import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBrowserRecheck, goneUrlReason, selectResidue } from "../lib/recheck-browser-verdict.mjs";
import { challengeMarks, wallMarks } from "../lib/challenge-page.mjs";

const VIN = "1FT6W1EV2PWG58901";
const VDP = `https://www.bonifacehierschevrolet.com//inventory/${VIN}?utm_source=autotrader.com`;

const page = (body) => `<!doctype html><html><head><title>2023 Ford F-150 Lightning</title></head><body>${body}</body></html>`;
const filler = "<div>".repeat(60) + "a lot of markup so the body is not blank" + "</div>".repeat(60);

test("the VIN on the page is the car still being sold", () => {
  const r = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 200, finalUrl: VDP, body: page(`${filler}<span>VIN: ${VIN}</span>`) });
  assert.deepEqual(r, { verdict: "alive", reason: "vin-on-page" });
});

// The four redirect shapes seen on 2026-09-12, one test each.
test("dealer.com's missing-vehicle handler is the site saying the car is gone", () => {
  const landed = "https://www.bonifacehierschevrolet.com/inventory/used-2023-ford-f-150-lightning/missing-vehicle/";
  const r = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 200, finalUrl: landed, body: page(filler) });
  assert.deepEqual(r, { verdict: "softGone", reason: "missing-vehicle" });
});

test("a missing-vehicle page that still echoes the VIN is not read as alive", () => {
  // The handler keeps the dead VDP's slug, so the VIN is on the page that
  // exists to say the car is not. URL shape is checked before the body.
  const landed = `https://www.example.com/inventory/used-2023-ford-f-150-lightning-${VIN.toLowerCase()}/missing-vehicle/`;
  const r = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 200, finalUrl: landed, body: page(`${filler}${VIN}`) });
  assert.equal(r.verdict, "softGone");
});

test("DealerOn bounces a dead VDP to its new- or used-vehicles list", () => {
  for (const path of ["/new-vehicles/", "/used-vehicles/"]) {
    const r = classifyBrowserRecheck({
      vin: VIN,
      url: `https://www.example.com/used-vehicles/2023-ford-f-150-lightning-${VIN}`,
      status: 200,
      finalUrl: `https://www.example.com${path}`,
      body: page(filler),
    });
    assert.deepEqual(r, { verdict: "softGone", reason: "redirect-inventory" }, path);
  }
});

test("Team Velocity flags the car in the query and keeps the URL", () => {
  const url = `https://www.example.com/inventory/${VIN}`;
  const r = classifyBrowserRecheck({ vin: VIN, url, status: 200, finalUrl: `${url}?vehicleStatus=unavailable`, body: page(filler) });
  assert.deepEqual(r, { verdict: "softGone", reason: "status-unavailable" });
});

test("a bounce to the homepage is a strike", () => {
  const r = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 200, finalUrl: "https://www.bonifacehierschevrolet.com/", body: page(filler) });
  assert.deepEqual(r, { verdict: "softGone", reason: "redirect-home" });
});

test("a 404 is a strike, never a hard delist", () => {
  const r = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 404, finalUrl: VDP, body: page("Page not found") });
  assert.deepEqual(r, { verdict: "softGone", reason: "http-404" });
});

test("a Cloudflare challenge is not a verdict about a car", () => {
  const body = "<html><head><title>Just a moment…</title></head><body><div id=\"challenge-running\"></div></body></html>";
  const r = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 403, finalUrl: VDP, body });
  assert.equal(r.verdict, "none");
  assert.match(r.reason, /^challenge:/);
});

test("a challenge served with a redirect to the homepage still concludes nothing", () => {
  const body = "<html><head><title>Just a moment...</title></head><body>cf-chl-</body></html>";
  const r = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 200, finalUrl: "https://www.example.com/", body });
  assert.equal(r.verdict, "none");
});

test("Cloudflare's bot-management beacon on an ordinary page is not a wall", () => {
  // Measured 2026-09-12: haciendaford.com's live VDP (912 KB, the car's own
  // title, the VIN in the body) and two real 404s all carried
  // /cdn-cgi/challenge-platform/. Reading it as a challenge threw away one
  // true confirmation and two true strikes.
  const beacon = '<script src="/cdn-cgi/challenge-platform/h/b/scripts/jsd/abc/main.js"></script>';
  assert.deepEqual(wallMarks(beacon), []);
  assert.deepEqual(challengeMarks(beacon), ["cf-bot-beacon"]);
  const live = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 200, finalUrl: VDP, body: page(`${filler}${beacon}VIN ${VIN}`) });
  assert.deepEqual(live, { verdict: "alive", reason: "vin-on-page" });
  const gone = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 404, finalUrl: VDP, body: page(`${filler}${beacon}`) });
  assert.deepEqual(gone, { verdict: "softGone", reason: "http-404" });
});

test("a Turnstile widget in a dealer's contact form is not a wall either", () => {
  const form = '<div class="cf-turnstile" data-sitekey="x"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>';
  assert.deepEqual(wallMarks(form), []);
  assert.ok(challengeMarks(form).includes("cf-turnstile"));
});

test("a blank body, a robots refusal and a dead host all conclude nothing", () => {
  assert.equal(classifyBrowserRecheck({ vin: VIN, url: VDP, status: 200, finalUrl: VDP, body: "" }).verdict, "none");
  assert.equal(classifyBrowserRecheck({ vin: VIN, url: VDP, status: "robots_disallowed", finalUrl: VDP, body: null }).verdict, "none");
  assert.equal(classifyBrowserRecheck({ vin: VIN, url: VDP, status: "error:TimeoutError", finalUrl: VDP, body: null }).verdict, "none");
  assert.equal(classifyBrowserRecheck({ vin: VIN, url: VDP, status: "browser_unavailable", finalUrl: VDP, body: null }).verdict, "none");
});

test("200 at the VDP with no VIN in it is the fetch rule, and is NOT a strike here", () => {
  // The reading lib/recheck-oem-crosscheck.mjs exists to outvote on these four
  // domains: a client-rendered page that had not painted looks exactly like
  // this. Only the site's own redirect or 404 earns a strike.
  const r = classifyBrowserRecheck({ vin: VIN, url: VDP, status: 200, finalUrl: VDP, body: page(filler) });
  assert.deepEqual(r, { verdict: "none", reason: "no-vin" });
});

test("a 403 or a 5xx proves nothing", () => {
  assert.deepEqual(classifyBrowserRecheck({ vin: VIN, url: VDP, status: 403, finalUrl: VDP, body: page(filler) }), { verdict: "none", reason: "http-403" });
  assert.deepEqual(classifyBrowserRecheck({ vin: VIN, url: VDP, status: 503, finalUrl: VDP, body: page(filler) }), { verdict: "none", reason: "http-503" });
});

test("an inventory path the request ASKED for is not a redirect", () => {
  // Landing where you aimed says nothing; only the site moving you does.
  assert.equal(goneUrlReason("https://www.example.com/used-vehicles/", "https://www.example.com/used-vehicles/"), null);
  assert.equal(goneUrlReason("https://example.com/used-vehicles", "https://www.example.com/used-vehicles/"), null);
});

test("an index path is matched whole, never as a prefix of a car's URL", () => {
  const car = "https://www.example.com/used-vehicles/2023-ford-f-150-lightning-1FT6W1EV2PWG58901/";
  assert.equal(goneUrlReason("https://www.example.com/inventory/1FT6W1EV2PWG58901", car), null);
});

const residueRows = [
  { vin: "AAA", dealerDomain: "ford-blue-advantage", sourceUrl: "https://a.com/inventory/AAA", lastConfirmedAt: null },
  { vin: "BBB", dealerDomain: "ford-blue-advantage", sourceUrl: "https://a.com/inventory/BBB", lastConfirmedAt: "2026-09-11T00:00:00Z" },
  { vin: "CCC", dealerDomain: "honda-prologue", sourceUrl: "https://b.com/inventory/CCC", lastConfirmedAt: "2026-08-01T00:00:00Z" },
  { vin: "DDD", dealerDomain: "ford-blue-advantage", sourceUrl: "https://c.com/", lastConfirmedAt: null },
  { vin: "EEE", dealerDomain: "carvana.com", sourceUrl: "https://carvana.com/vehicle/EEE", lastConfirmedAt: null, lastSeenAt: "2026-09-11T06:00:00Z" },
];
const NOW = Date.parse("2026-09-12T00:00:00Z");

test("the residue is never/stale-confirmed cars on the four lanes with a page about the car", () => {
  const got = selectResidue(residueRows, { now: NOW, staleDays: 7 }).map((r) => r.vin);
  // BBB was confirmed yesterday; DDD's sourceUrl is a homepage (the sweep
  // judges those); EEE is a dealer-site row a crawl saw 18 hours ago.
  assert.deepEqual(got.sort(), ["AAA", "CCC"]);
});

test("a dealer-site car neither seen nor confirmed in 48 hours is visited; one seen yesterday is not (2026-09-12, the Mastria truck)", () => {
  const rows = [
    // crawled once by a browser lane that was then switched off, 403 to the fetch: the second truck of the night
    { vin: "1FT6W1EV7NWG11294", dealerDomain: "mastriamazda.com", sourceUrl: "https://www.mastriamazda.com/inventory/used-2022-ford-f-150-lightning-1ft6w1ev7nwg11294/", lastConfirmedAt: null, lastSeenAt: "2026-09-06T00:40:02Z" },
    { vin: "FRESH1", dealerDomain: "mastriamazda.com", sourceUrl: "https://www.mastriamazda.com/inventory/FRESH1/", lastConfirmedAt: null, lastSeenAt: "2026-09-11T12:00:00Z" },
    // confirmed on its own page two hours ago, though no crawl has seen it in a week: confirmation counts as sight
    { vin: "CONF1", dealerDomain: "somedealer.com", sourceUrl: "https://somedealer.com/inventory/CONF1", lastConfirmedAt: "2026-09-11T22:00:00Z", lastSeenAt: "2026-09-04T00:00:00Z" },
    // a sweep-only lane and an OEM locator are not dotted: never visited here
    { vin: "NIS1", dealerDomain: "nissan-new", sourceUrl: "https://nissanusa.com/x/NIS1", lastConfirmedAt: null, lastSeenAt: "2026-09-01T00:00:00Z" },
  ];
  const got = selectResidue(rows, { now: NOW, staleDays: 7 }).map((r) => r.vin);
  assert.deepEqual(got, ["1FT6W1EV7NWG11294"]);
  // the window is a parameter: at 7 days the Mastria truck is still inside it
  assert.deepEqual(selectResidue(rows, { now: NOW, staleDays: 7, seenHours: 24 * 7 }).map((r) => r.vin), []);
});

test("a car tonight's sweep has already dropped is left to recheck", () => {
  const got = selectResidue(residueRows, { now: NOW, staleDays: 7, sweepSaysGone: (vin) => vin === "AAA" }).map((r) => r.vin);
  assert.deepEqual(got, ["CCC"]);
});

test("never-confirmed first, then oldest, and consecutive targets are different hosts", () => {
  const rows = [
    { vin: "A1", dealerDomain: "hyundai-cpo", sourceUrl: "https://one.com/A1", lastConfirmedAt: null },
    { vin: "A2", dealerDomain: "hyundai-cpo", sourceUrl: "https://one.com/A2", lastConfirmedAt: null },
    { vin: "B1", dealerDomain: "audi-network", sourceUrl: "https://two.com/B1", lastConfirmedAt: "2026-08-02T00:00:00Z" },
  ];
  const got = selectResidue(rows, { now: NOW, staleDays: 7 }).map((r) => r.vin);
  assert.deepEqual(got, ["A1", "B1", "A2"]);
});

test("the cap is a cap", () => {
  const got = selectResidue(residueRows, { now: NOW, staleDays: 7, limit: 1 });
  assert.equal(got.length, 1);
});
