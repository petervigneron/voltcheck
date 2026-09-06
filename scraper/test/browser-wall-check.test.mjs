import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeMarks, pageTitle, positionalDomains } from "../browser-wall-check.mjs";

// The interstitial Cloudflare serves lib/http.mjs's plain client on every
// Dealer Inspire rooftop (2026-09-02 capture, trimmed).
const CF_ATTENTION = `<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head>
<body><h1>Sorry, you have been blocked</h1><div class="cf-error-details">Ray ID: 9a1</div></body></html>`;

const CF_MOMENT = `<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body><div id="challenge-running"></div><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>`;

const REAL_SRP = `<!DOCTYPE html><html><head>
<title>Used Toyota for Sale in Woburn | Woburn Toyota</title></head>
<body><div data-vin="5YFB4MDE8SP330318">VIN</div></body></html>`;

test("a Cloudflare block page is named, not passed off as a page", () => {
  assert.deepEqual(challengeMarks(CF_ATTENTION), ["cf-attention-required"]);
  assert.equal(pageTitle(CF_ATTENTION), "Attention Required! | Cloudflare");
});

test("the JS interstitial is caught by its title and its challenge form", () => {
  const marks = challengeMarks(CF_MOMENT);
  assert.ok(marks.includes("cf-just-a-moment"), marks.join(","));
  assert.ok(marks.includes("cf-challenge-form"), marks.join(","));
});

test("a real SRP carries no challenge mark", () => {
  assert.deepEqual(challengeMarks(REAL_SRP), []);
  assert.equal(pageTitle(REAL_SRP), "Used Toyota for Sale in Woburn | Woburn Toyota");
});

test("a missing body is not a challenge and has no title", () => {
  assert.deepEqual(challengeMarks(null), []);
  assert.equal(pageTitle(null), "");
});

test("a flag's value is never read as a domain", () => {
  assert.deepEqual(positionalDomains(["a.com", "--paths", "/used-vehicles/", "b.com"]), ["a.com", "b.com"]);
  assert.deepEqual(positionalDomains(["--domains-file", "/tmp/c.txt"]), []);
});
