// From scraper/:  node --test "test/*.test.mjs"
//
// The robots matcher, pinned against the rules that make the Autotrader
// discovery lane contractually safe. Autotrader's Visitor Agreement permits
// automated extraction only "in strict conformance with the Robots Exclusion
// Protocol", so the matcher is the condition of use, not a courtesy — and
// two of the rules that matter there live in the QUERY STRING (`*keyword=`,
// `*lastExec*`), which a pathname-only match silently waves through. The
// discovery script therefore matches pathname+search through the exported
// pure evaluator; these tests are what "strict conformance" is measured
// against.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRobots, robotsRulesAllow } from "../lib/http.mjs";

// Excerpt of https://www.autotrader.com/robots.txt as fetched 2026-08-23
// (header "#28.08.25"). Only the `*` group and one named group, to prove the
// group scoping; the named group's `/rest/` and `/cars-for-sale/all-cars`
// must NOT bind us.
const ROBOTS = `#28.08.25
User-agent: Vast_Bot
User-agent: YandexBot
Disallow: /

User-agent: *
Disallow: /research/
Disallow: *keyword=
Disallow: /cars-for-sale/cbh/history/
Disallow: /rest/frontline/srp/single/aggregate
Disallow: /cars-for-sale/searchresults.xhtml*
Disallow: /cars-for-sale/svc/*
Disallow: /resources/img/
Allow: /resources/img/svgicons/*
Disallow: *zip=[zipcode]*
Disallow: *lastExec*
Disallow: /dealers/inview$
Disallow: /partial/

User-agent: AdsBot-Google
Disallow: /rest/
Disallow: /cars-for-sale/all-cars
`;

const rules = parseRobots(ROBOTS);
const allows = (url) => {
  const u = new URL(url, "https://www.autotrader.com");
  return robotsRulesAllow(rules, u.pathname + u.search);
};

test("the search pages the discovery lane reads are allowed", () => {
  assert.equal(allows("/cars-for-sale/used-cars/electric?searchRadius=0"), true);
  assert.equal(allows("/cars-for-sale/electric?firstRecord=24&searchRadius=0"), true);
  assert.equal(allows("/cars-for-sale/used-cars/plug-in-hybrid?searchRadius=0&makeCode=TOYOTA"), true);
  assert.equal(allows("/robots.txt"), true);
});

test("query-string rules bind — a keyword search is disallowed even on an allowed path", () => {
  assert.equal(allows("/cars-for-sale/electric?keyword=tesla"), false);
  assert.equal(allows("/cars-for-sale/electric?searchRadius=0&lastExec=1"), false);
  // The `[zipcode]` rule is a literal placeholder, not a pattern: a real zip
  // does not match it and the wildcard rule must not be read as "any zip=".
  assert.equal(allows("/cars-for-sale/electric?zip=30301"), true);
  assert.equal(allows("/cars-for-sale/electric?zip=[zipcode]"), false);
});

test("the JSON endpoints and legacy search forms are disallowed", () => {
  assert.equal(allows("/rest/frontline/srp/single/aggregate?x=1"), false);
  assert.equal(allows("/cars-for-sale/searchresults.xhtml?zip=1"), false);
  assert.equal(allows("/cars-for-sale/svc/listing-view-count"), false);
  assert.equal(allows("/cars-for-sale/cbh/history/123"), false);
  assert.equal(allows("/research/article/x"), false);
});

test("rules in another crawler's group do not bind the wildcard group", () => {
  // `/rest/` and `/cars-for-sale/all-cars` are only disallowed for
  // AdsBot-Google. The lane still never calls /rest/ — by policy, not because
  // robots permits it — but the matcher must report what robots says.
  assert.equal(allows("/rest/log/other"), true);
  assert.equal(allows("/cars-for-sale/all-cars"), true);
  assert.equal(rules.disallow.includes("/rest/"), false);
});

test("longest-match precedence and the $ anchor", () => {
  assert.equal(allows("/resources/img/logo.png"), false);
  assert.equal(allows("/resources/img/svgicons/x.svg"), true);
  assert.equal(allows("/dealers/inview"), false);
  assert.equal(allows("/dealers/inview/search"), true);
  assert.equal(allows("/partial/x"), false);
  // A prefix rule is a prefix rule: it does not float to mid-path.
  assert.equal(allows("/cars-for-sale/partial/x"), true);
});
