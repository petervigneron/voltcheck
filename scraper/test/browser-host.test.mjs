import { test } from "node:test";
import assert from "node:assert/strict";
import { browserAltUrl, browserTransportFailed, browserSwappedUrl } from "../lib/browser.mjs";

// The 2026-09-06 rolling run's 26 "browser lane failed" Dealer Inspire
// rooftops. probe.mjs promoted them by reading https://www.<domain> and
// recorded no canonicalHost; crawl.mjs then asked the apex, which on
// patrickhyundai.com, showmeautomall.com and bridgewaterkia.com refuses the
// TLS handshake outright. Chrome reports that as error:Error.

test("the alternate host is www when the apex was asked, and back again", () => {
  assert.equal(browserAltUrl("https://patrickhyundai.com/used-vehicles/"), "https://www.patrickhyundai.com/used-vehicles/");
  assert.equal(browserAltUrl("https://www.patrickhyundai.com/used-vehicles/"), "https://patrickhyundai.com/used-vehicles/");
  assert.equal(browserAltUrl("https://patrickhyundai.com/inventory/?_p=3"), "https://www.patrickhyundai.com/inventory/?_p=3");
  assert.equal(browserAltUrl("not a url"), null);
});

test("nothing served is worth the other host; an answer is not", () => {
  // A refused handshake, a dead host, a load that never finished.
  assert.equal(browserTransportFailed("error:Error"), true);
  assert.equal(browserTransportFailed("error:TimeoutError"), true);
  assert.equal(browserTransportFailed("error:no-response"), true);
  // Answers. A 404 is this rooftop's answer on both hosts (criswellauto.com,
  // hersonskia.com), a robots refusal is ours, and a missing browser is the
  // machine's — retrying any of them on www just doubles the cost.
  assert.equal(browserTransportFailed(200), false);
  assert.equal(browserTransportFailed(404), false);
  assert.equal(browserTransportFailed(403), false);
  assert.equal(browserTransportFailed("robots_disallowed"), false);
  assert.equal(browserTransportFailed("browser_unavailable"), false);
  assert.equal(browserTransportFailed("error:invalid-url"), false);
});

test("a host that answered on www carries every later url with it", () => {
  const map = new Map([["patrickhyundai.com", "www.patrickhyundai.com"]]);
  // The SRP pager and the VDPs the walk finds are asked at the host that
  // answered, not the one the registry names.
  assert.equal(browserSwappedUrl("https://patrickhyundai.com/used-vehicles/?_p=2", map), "https://www.patrickhyundai.com/used-vehicles/?_p=2");
  assert.equal(browserSwappedUrl("https://patrickhyundai.com/robots.txt", map), "https://www.patrickhyundai.com/robots.txt");
  // Another rooftop in the same crawl is untouched.
  assert.equal(browserSwappedUrl("https://woburntoyota.com/used-vehicles/", map), "https://woburntoyota.com/used-vehicles/");
  assert.equal(browserSwappedUrl("https://patrickhyundai.com/x", new Map()), "https://patrickhyundai.com/x");
});
