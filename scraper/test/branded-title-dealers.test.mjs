import test from "node:test";
import assert from "node:assert/strict";
import { inventoryBrandedFor, brandedTitleDealers } from "../lib/branded-title-dealers.mjs";
import { readBrandedTitleSignals } from "../lib/buyback-dealer-signals.mjs";

test("a curated all-branded seller marks its cars, others do not", () => {
  // parklinemotors.com: "Every car in our inventory is handpicked and
  // expertly rebuilt" (homepage, 2026-09-08) — the Rivian the owner found.
  assert.equal(inventoryBrandedFor("parklinemotors.com"), true);
  assert.equal(inventoryBrandedFor("www.parklinemotors.com"), true);
  assert.equal(inventoryBrandedFor("aaronfordofpoway.com"), false);
  assert.equal(inventoryBrandedFor(undefined), false);
  // The same seller on a marketplace row: matched by name prefix, never by a
  // word inside another dealer's name.
  assert.equal(inventoryBrandedFor("ford-blue-advantage", "AutoSavvy Fort Worth"), true);
  assert.equal(inventoryBrandedFor("ford-blue-advantage", "AutoSavvy of Austin LLC"), true);
  assert.equal(inventoryBrandedFor("ford-blue-advantage", "Total Auto"), false);
  assert.equal(inventoryBrandedFor("ford-blue-advantage", "Not AutoSavvy Motors"), false);
  assert.equal(inventoryBrandedFor("autosavvy.com", undefined), true);
  for (const [domain, entry] of brandedTitleDealers()) {
    assert.ok(entry.statement && entry.source && entry.checkedAt, `${domain} must quote the seller and say where`);
  }
});

test("a homepage that presents the lot as branded-title stock is a candidate", () => {
  const parkline = "<p>Looking for a branded title vehicle? You're in the right place. Every car in our inventory is handpicked and expertly rebuilt by our team.</p><h2>Quality Inspected branded title cars in Salt Lake City, Utah</h2>";
  const r = readBrandedTitleSignals(parkline);
  assert.equal(r.hit, true);
  assert.match(r.evidence[0].text, /expertly rebuilt|branded title cars/i);
});

test("a dealer that denies selling branded titles, or merely explains them, is not a candidate", () => {
  assert.equal(readBrandedTitleSignals("<p>We never sell salvage or branded title vehicles. Clean title only.</p>").hit, false);
  assert.equal(readBrandedTitleSignals("<p>All of our vehicles come with a free history report.</p>").hit, false);
  assert.equal(readBrandedTitleSignals("<a href='/faq'>What is a branded title?</a>").hit, false);
  // Sony branded audio, Brembo branded brakes: options copy, not titles.
  assert.equal(readBrandedTitleSignals("<li>HD Radio with Sony Branded Sound System</li>").hit, false);
});
