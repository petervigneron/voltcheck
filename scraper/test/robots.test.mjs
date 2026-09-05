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

// Query rules bind, and the target is pathname + search — until 2026-08-31
// only the pathname was tested, so `Disallow: /*?*` (AutoRevo's default
// robots, verbatim on 14 of its 16 cohort rooftops) and Gateway Classic
// Cars' `Disallow: /*?` / `Allow: /*?page=` pair were silently ignored on
// every host that used them. Found on the AutoRevo lane build; fetchPage's
// callers see the refusal as robots_disallowed, and crawl.mjs records it as
// truncation rather than certifying a walk it did not make.
test("query rules bind: /*?* closes the pager, and Allow /*?page= re-opens exactly one key", () => {
  const autorevo = { allow: [], disallow: ["/paymentcalculator/", "/map/show/", "/*?*"] };
  assert.equal(robotsRulesAllow(autorevo, "/vehicles"), true);
  assert.equal(robotsRulesAllow(autorevo, "/vehicles?page=2"), false);
  const gateway = { allow: ["/*?page=", "/*&page="], disallow: ["/*?"] };
  assert.equal(robotsRulesAllow(gateway, "/vehicles?page=2"), true);
  assert.equal(robotsRulesAllow(gateway, "/vehicles?make=ford"), false);
});

// A walled host's robots.txt, read by another client. lib/browser.mjs seeds
// the cache with what Chrome was served when the plain fetch got a firewall
// page instead; from then on the site's own rules bind every check. Pinned
// against DealerCenter's actual file (jordanmotors.co/robots.txt, read in
// Chrome 2026-09-05): the inventory JSONP the lane used to capture and the
// pager it followed are both disallowed, the SRP itself is not. This is the
// measurement that closed lib/platforms/dealercenter.mjs.
import { robotsEntry, seedRobots } from "../lib/http.mjs";

const DEALERCENTER = `User-agent: *
Disallow: /_tracking/*
Disallow: /dealercenter/tracking.html
Disallow: /inv-scripts/*
Disallow: /inv-scripts-v2/*
Disallow: /*?fuel_type=
Disallow: /*&fuel_type=
Disallow: /*?sort_by=
Disallow: /*&sort_by=
Disallow: /*?page_no=
Disallow: /*&page_no=
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

User-agent: GPTBot
User-agent: PerplexityBot
Disallow: /
`;

test("a robots.txt seeded from the browser replaces the wall's empty rules and binds", () => {
  seedRobots("dealercenter.test", DEALERCENTER);
  const rules = robotsEntry("dealercenter.test");
  assert.equal(rules.status, 200);
  assert.equal(rules.via, "browser");
  assert.equal(robotsRulesAllow(rules, "/inventory/"), true, "the SRP is allowed");
  assert.equal(robotsRulesAllow(rules, "/inventory/?page_no=2"), false, "the pager is not");
  assert.equal(robotsRulesAllow(rules, "/inv-scripts-v2/inv/vehicles?vc=a&ps=10&pn=0"), false, "the inventory JSONP is not");
  assert.equal(robotsRulesAllow(rules, "/inventory/?fuel_type=ELECTRIC"), false, "nor any facet");
  assert.equal(robotsRulesAllow(rules, "/wp-admin/admin-ajax.php"), true, "the explicit Allow still wins");
});

test("a robots.txt the browser could not read either keeps the RFC 9309 reading: no rules", () => {
  seedRobots("walled.test", "", 403);
  const rules = robotsEntry("walled.test");
  assert.equal(rules.status, 403);
  assert.deepEqual([rules.allow, rules.disallow], [[], []]);
  assert.equal(robotsRulesAllow(rules, "/anything?page_no=2"), true);
});

test("robotsEntry is undefined for a host nobody has asked about", () => {
  assert.equal(robotsEntry("never-asked.test"), undefined);
});
