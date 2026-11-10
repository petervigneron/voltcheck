// lib/visit.ts: what a page view records about where it came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { automatedAgent, visitPath, visitProps, visitRef, visitSrc } from "../lib/visit";

test("a listing's VIN leaves the path and rides as the listing ref", () => {
  assert.deepEqual(visitPath("/listing/5YJ3E1EA5RF824810"), { p: "/listing", listing: "5yj3e1ea5rf824810" });
  assert.deepEqual(visitPath("/ev/hyundai/ioniq-5/"), { p: "/ev/hyundai/ioniq-5" });
  assert.deepEqual(visitPath("/"), { p: "/" });
  assert.equal(visitPath("/" + "x".repeat(200)).p.length, 80);
});

test("the referrer is a hostname, never a URL, and never ourselves", () => {
  assert.equal(visitRef("https://www.google.com/search?q=private+words", "censusev.com"), "google.com");
  assert.equal(visitRef("https://news.ycombinator.com/item?id=1", "censusev.com"), "news.ycombinator.com");
  assert.equal(visitRef("https://www.censusev.com/ev", "censusev.com"), undefined);
  assert.equal(visitRef("https://censusev.com/ev", "www.censusev.com"), undefined);
  assert.equal(visitRef("", "censusev.com"), undefined);
  assert.equal(visitRef("android-app://com.reddit.frontpage", "censusev.com"), undefined);
  assert.equal(visitRef("not a url", "censusev.com"), undefined);
});

test("a campaign label is kept only when it is a plain label", () => {
  assert.equal(visitSrc("?utm_source=HN"), "hn");
  assert.equal(visitSrc("?ref=reddit_ev"), "reddit_ev");
  assert.equal(visitSrc("?utm_source=a&ref=b"), "a");
  assert.equal(visitSrc("?ref=someone@example.com"), undefined);
  assert.equal(visitSrc("?ref=" + "a".repeat(41)), undefined);
  assert.equal(visitSrc("?make=Tesla"), undefined);
});

test("source is recorded on the landing page only", () => {
  const base = { search: "?utm_source=hn", referrer: "https://news.ycombinator.com/", ownHost: "censusev.com" };
  assert.deepEqual(visitProps({ ...base, pathname: "/", landing: true, newClient: true }), {
    props: { p: "/", land: true, ref: "news.ycombinator.com", src: "hn", new: true },
    listing: undefined,
  });
  // The second page of the same visit: the referrer is stale, the query may
  // still be in the bar, and neither may be counted again.
  assert.deepEqual(visitProps({ ...base, pathname: "/pro", landing: false, newClient: false }).props, { p: "/pro" });
});

test("crawlers and test browsers are not visitors; real browsers are", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "VoltcheckBot/1.0 (+https://censusev.com/bot)",
    "curl/8.7.1",
    "",
  ])
    assert.equal(automatedAgent(ua), true, ua);
  assert.equal(automatedAgent(null), true);
  for (const ua of [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  ])
    assert.equal(automatedAgent(ua), false, ua);
});
