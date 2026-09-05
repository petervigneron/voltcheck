import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RIVIAN, decodeTurboStream, pdpUrl, toRecord } from "../lib/oem/rivian.mjs";
import { parseRobots, robotsRulesAllow } from "../lib/http.mjs";

// rivian.com/robots.txt as read on 2026-09-05. The whole lane rests on one
// reading of one rule — that `disallow: /api/` is a prefix and does not reach
// /configurations/api/ — so that reading is pinned here rather than left to a
// comment. If a future edit widens the matcher, or someone "fixes" the rule
// text, this fails instead of the crawler quietly fetching a disallowed URL.
const RIVIAN_ROBOTS = `user-agent: *
allow: /
disallow: /404
disallow: /api/
disallow: /experience/r1t
disallow: /experience/r1s
disallow: /trip-visualizer
disallow: /auth/api/
disallow: /account/api/
disallow: /demo-drive/api/
disallow: /experience/api/
disallow: /quad/api/
disallow: /root/api/
sitemap: https://rivian.com/sitemap.xml
host: rivian.com`;

test("Rivian's robots.txt allows every path this lane reads", () => {
  const rules = parseRobots(RIVIAN_ROBOTS);
  for (const path of [
    "/configurations/api/v1/shop/search",
    "/configurations/api/v1/vehicle-ruleset",
    "/configurations/inventory/pre-owned/be7dcb258b46840b057a25a0a30a0189/build",
    "/configurations/inventory/pre-owned/be7dcb258b46840b057a25a0a30a0189/build.data",
    "/configurations/list?INVENTORY_TYPE=PRE_OWNED_VEHICLE",
  ]) {
    assert.equal(robotsRulesAllow(rules, path), true, `${path} should be allowed`);
  }
});

test("Rivian's robots.txt still disallows the GraphQL gateway this lane refuses to read", () => {
  const rules = parseRobots(RIVIAN_ROBOTS);
  for (const path of [
    "/api/gql/orders/graphql",
    "/api/gql/gateway/graphql",
    "/api/gql/content/graphql",
    "/api/datahub/v1/analytics/publish",
    "/account/api/anything",
  ]) {
    assert.equal(robotsRulesAllow(rules, path), false, `${path} must stay disallowed`);
  }
});

test("no lane source names a robots-disallowed Rivian path as a URL it fetches", async () => {
  const src = await readFile(new URL("../lib/oem/rivian.mjs", import.meta.url), "utf-8");
  const code = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  assert.equal(/rivian\.com\/api\//.test(code), false, "lane code must not reference rivian.com/api/");
  assert.equal(/\/api\/gql\//.test(code), false, "lane code must not reference the GraphQL gateway");
});

test("the PDP url is the allowed inventory route, keyed by configId", () => {
  assert.equal(
    pdpUrl("be7dcb258b46840b057a25a0a30a0189"),
    "https://rivian.com/configurations/inventory/pre-owned/be7dcb258b46840b057a25a0a30a0189/build"
  );
});

test("the lane reports the real rivian.com domain, so db-sync and recheck see it as one seller", () => {
  assert.equal(RIVIAN.domain, "rivian.com");
  assert.equal(RIVIAN.make, "Rivian");
});

// The detail payload is React Router's turbo-stream: a flat array of values
// where {"_a":b} is an object whose key is at index a and value at index b.
test("decodeTurboStream resolves indexed keys and values", () => {
  const flat = [{ _1: 2 }, "root", { _3: 4 }, "vin", "7PDSGABAXRN041616"];
  assert.deepEqual(decodeTurboStream(flat), { root: { vin: "7PDSGABAXRN041616" } });
});

test("decodeTurboStream resolves arrays, the undefined sentinel and the null sentinel", () => {
  const flat = [{ _1: 2, _5: -5, _6: -7 }, "opts", [3, 4], "a", "b", "gone", "empty"];
  assert.deepEqual(decodeTurboStream(flat), { opts: ["a", "b"], gone: undefined, empty: null });
});

test("decodeTurboStream survives the cycle the payload actually contains", () => {
  // index 2's object points back at index 0 — the shape that turns a naive
  // recursive resolver into a stack overflow.
  const flat = [{ _1: 2 }, "self", { _3: 0 }, "back"];
  const out = decodeTurboStream(flat);
  assert.equal(out.self.back, out);
});

test("decodeTurboStream returns undefined for an out-of-range index rather than throwing", () => {
  assert.equal(decodeTurboStream([{ _1: 99 }, "k"]).k, undefined);
});

// ── the record's abstentions ────────────────────────────────────────────────
const NAMES = new Map([
  ["PKG-ADV", "Adventure Package"],
  ["PKG-ASC", "Ascend trim"],
  ["PKG-LCH", "Launch Edition"],
  ["MOT-401", "Quad-Motor AWD"],
  ["MOT-101", "Enduro Single-motor RWD"],
  ["MOT-999", "Some Future Motor"],
  ["EXP-LSV", "Limestone"],
  ["INT-BMP", "Black Mountain"],
]);

const car = (over = {}) => ({
  vin: "7PDSGABAXRN041616",
  model: "R1S",
  modelYear: 2024,
  configId: "be7dcb258b46840b057a25a0a30a0189",
  listingPrice: 63000,
  odometerReading: "33346",
  odometerUnit: "MILES",
  marketingOptions: [
    { groupId: "PKG", optionId: "PKG-ADV" },
    { groupId: "MOT", optionId: "MOT-401" },
    { groupId: "EXP", optionId: "EXP-LSV" },
    { groupId: "INT", optionId: "INT-BMP" },
  ],
  dcLocationDetails: { city: "Memphis", state: "TN", postalCode: "38133" },
  shopVehicleMetadata: { cloudinaryImageUrls: ["https://media.rivian.com/a.jpg"] },
  ...over,
});
const rec = (over) => toRecord(car(over), { names: NAMES });

test("a complete car becomes a complete record", () => {
  const r = rec();
  assert.equal(r.vin, "7PDSGABAXRN041616");
  assert.equal(r.year, 2024);
  assert.equal(r.make, "Rivian");
  assert.equal(r.model, "R1S");
  assert.equal(r.priceUsd, 63000);
  assert.equal(r.priceProvenance, "oem-rivian-listing-price");
  assert.equal(r.mileage, 33346);
  assert.equal(r.driveLine, "AWD");
  assert.equal(r.state, "TN");
  assert.equal(r.zip, "38133");
  assert.equal(r.dealerDomain, "rivian.com");
  assert.equal(r.evKind, "BEV");
  assert.equal(r.sourceUrl, pdpUrl("be7dcb258b46840b057a25a0a30a0189"));
});

test("trim is the maker's Trim group, with only its own leaked label suffix removed", () => {
  assert.equal(rec().trim, "Adventure");
  assert.equal(rec({ marketingOptions: [{ groupId: "PKG", optionId: "PKG-ASC" }] }).trim, "Ascend");
  assert.equal(rec({ marketingOptions: [{ groupId: "PKG", optionId: "PKG-LCH" }] }).trim, "Launch Edition");
});

test("trim abstains rather than guessing when the Trim option is one we have no name for", () => {
  assert.equal(rec({ marketingOptions: [{ groupId: "PKG", optionId: "PKG-NEW" }] }).trim, undefined);
  assert.equal(rec({ marketingOptions: [] }).trim, undefined);
});

test("Rivian is never claimed certified — the maker never says it", () => {
  assert.equal(rec().condition, "used");
  assert.equal(rec().certified, undefined);
  assert.equal(rec({ tags: ["ATTR001"] }).condition, "used");
});

test("driveline reads the motor option's own name, and abstains on one it cannot read", () => {
  assert.equal(rec({ marketingOptions: [{ groupId: "MOT", optionId: "MOT-101" }] }).driveLine, "RWD");
  // A single-motor R1T is real, so "a Rivian is always AWD" is not a default
  // this lane is allowed to fall back on.
  assert.equal(rec({ marketingOptions: [{ groupId: "MOT", optionId: "MOT-999" }] }).driveLine, undefined);
  assert.equal(rec({ marketingOptions: [] }).driveLine, undefined);
});

test("mileage is withheld when the payload states a unit that is not miles", () => {
  assert.equal(rec({ odometerUnit: "KILOMETERS" }).mileage, undefined);
  assert.equal(rec({ odometerUnit: undefined }).mileage, undefined);
  assert.equal(rec({ odometerReading: "0" }).mileage, 0);
});

test("a car with no VIN, no price, no state or an implausible year is dropped, with the reason counted", () => {
  const drops = {};
  const drop = (over) => toRecord(car(over), { names: NAMES, drops });
  assert.equal(drop({ vin: "" }), null);
  assert.equal(drop({ vin: "NOTAVIN" }), null);
  assert.equal(drop({ listingPrice: null }), null);
  assert.equal(drop({ listingPrice: 0 }), null);
  assert.equal(drop({ dcLocationDetails: { city: "Memphis" } }), null);
  assert.equal(drop({ modelYear: 1998 }), null);
  assert.equal(Object.values(drops).reduce((a, b) => a + b, 0), 6);
});

test("only https image urls the payload actually carries are published", () => {
  assert.deepEqual(rec({ shopVehicleMetadata: { cloudinaryImageUrls: ["http://x/a.jpg", null, 7] } }).images, []);
  assert.equal(rec({ shopVehicleMetadata: {} }).imageUrl, undefined);
});
