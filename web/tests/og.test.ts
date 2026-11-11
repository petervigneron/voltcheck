// Link previews: the line under a model's name, and the block every page
// hands to Open Graph.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hubCardLine } from "../lib/og/hubLine";
import { DEFAULT_IMAGE, openGraph, OWN_IMAGE, SITE_NAME } from "../lib/og/meta";

test("a model's card states its count with the month it was counted", () => {
  assert.equal(hubCardLine(3445, "2026-11-10"), "3,445 for sale · November 2026");
});

test("no cars, or no date for the count, is no line at all", () => {
  assert.equal(hubCardLine(0, "2026-11-10"), undefined);
  assert.equal(hubCardLine(3445, undefined), undefined);
  assert.equal(hubCardLine(3445, "not a date"), undefined);
  assert.equal(hubCardLine(Number.NaN, "2026-11-10"), undefined);
});

test("every page's block is complete, because a page's block replaces the layout's", () => {
  const og = openGraph("Tesla Model 3 for sale", "3,445 for sale", "/ev/tesla/model-3") as Record<string, unknown>;
  assert.equal(og.siteName, SITE_NAME);
  assert.equal(og.type, "website");
  assert.equal(og.url, "/ev/tesla/model-3");
  assert.equal(og.title, "Tesla Model 3 for sale");
});

test("a page with no picture of its own names the site's card, since nothing else will", () => {
  const plain = openGraph("t", "d", "/ev") as { images: unknown[] };
  assert.deepEqual(plain.images, [DEFAULT_IMAGE]);
  const car = openGraph("t", "d", "/listing/x", "https://dealer.example/car.jpg") as { images: unknown[] };
  assert.deepEqual(car.images, ["https://dealer.example/car.jpg"]);
});

test("a page whose segment has its own picture file leaves the picture out, or the default would beat the file", () => {
  assert.equal("images" in openGraph("t", "d", "/market", OWN_IMAGE), false);
});
