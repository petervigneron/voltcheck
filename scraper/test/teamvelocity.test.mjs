import { test } from "node:test";
import assert from "node:assert/strict";
import { teamVelocityApiIds, teamVelocityApiVehicle } from "../lib/platforms/teamvelocity.mjs";
import { classifyEv } from "../lib/ev.mjs";

test("teamVelocityApiIds reads accountId/campaignId from inline globals", () => {
  const html = `<script>var accountId = '71000'; var campaignId = '7226';</script>`;
  assert.deepEqual(teamVelocityApiIds(html), { accountId: "71000", campaignId: "7226" });
  assert.equal(teamVelocityApiIds(`<script>var accountId = '71000';</script>`), null); // needs both
  assert.equal(teamVelocityApiIds(undefined), null);
});

// The classification is the subtle part: isElectric means "plugs in", not BEV,
// and it under-counts BEVs. fuel_Type is the real signal. Each case is a real
// record shape seen live (truwestcdjr / dublin group).
// Neutral VIN (1HG… Honda, not an EV-only WMI) and a non-EV nameplate, so the
// declared fuel is the ONLY signal classifyEv can use — the whole point here.
const rec = (o) => ({ vin: "1HGCV1F30LA123456", year: "2022", make: "Honda", model: "Accord", vdpUrl: "https://d.com/v", sellingPrice: 25000, ...o });
const kindOf = (o) => {
  const c = classifyEv(teamVelocityApiVehicle(rec(o)));
  return c.isEv ? c.kind : "not-ev";
};

test("fuel_Type 'Electric Fuel System' → BEV", () => {
  assert.equal(kindOf({ fuel_Type: "Electric Fuel System", isElectric: true }), "BEV");
});

test("BEV with isElectric=false is still caught by fuel_Type (the BMW i4 case)", () => {
  assert.equal(kindOf({ fuel_Type: "Electric Fuel System", isElectric: false }), "BEV");
});

test("isElectric + 'Hybrid Fuel' → PHEV, not BEV (the Jeep 4xe case)", () => {
  assert.equal(kindOf({ fuel_Type: "Hybrid Fuel", isElectric: true }), "PHEV");
});

test("a plain hybrid (not plug-in) and a gas car are not EVs", () => {
  assert.equal(kindOf({ fuel_Type: "Hybrid Fuel", isElectric: false }), "not-ev");
  assert.equal(kindOf({ fuel_Type: "Gasoline Fuel", isElectric: false }), "not-ev");
});

test("internetPrice is never read, even when sellingPrice is the one used", () => {
  const v = teamVelocityApiVehicle(rec({ sellingPrice: 24925, internetPrice: 0 }));
  assert.equal(v.offers.price, 24925);
});

test("a record with no valid VIN is dropped", () => {
  assert.equal(teamVelocityApiVehicle({ vin: "NOTAVIN", sellingPrice: 1 }), null);
});

// ---------------------------------------------------------------------------
// Price. Team Velocity ships two prices per record: `sellingPrice`, a snapshot
// that goes stale with days in stock and reads LOW, and `yourPrice`, the live
// asking price the VDP actually renders. Publishing the snapshot printed
// $39,784 against a listed $42,339 on a real truck until 2026-09-01.
//
// Every fixture below is a real API record, and each expectation is the price
// that rooftop's own VDP rendered. teamvelocity.mjs has the full note.
const priceOf = (o) => teamVelocityApiVehicle(rec(o)).offers.price;
const provOf = (o) => teamVelocityApiVehicle(rec(o)).offers.priceProvenance;

test("used: the live yourPrice wins over the stale sellingPrice", () => {
  // parkwayfamilykia 1FT6W1EV7PWG15378 — VDP renders "List Price $42,339"
  const lightning = { type: "Used", sellingPrice: 39784, msrp: 39784, yourPrice: 42339, purchasePrice: 42339 };
  assert.equal(priceOf(lightning), 42339);
  assert.equal(provOf(lightning), "tv-retail");
});

test("used: yourPrice wins even when it is LOWER — not a max()", () => {
  // livermoreford 1FMUK8DH2TGB71057, an 11-mile demo titled used. Its
  // disclaimer reads "Selling price $43,920.00"; 45,420 is nowhere on the page.
  // A max() rule would publish 45,420 and overstate a real price cut.
  const demo = { type: "Used", msrp: 48920, sellingPrice: 45420, yourPrice: 43920, purchasePrice: 43920 };
  assert.equal(priceOf(demo), 43920);
  assert.equal(provOf(demo), "tv-retail");
});

test("used: the two agree on fresh inventory, which is the common case", () => {
  // 0 of 220 used cars in stock <=7 days diverged; this is 97.6% of the lane.
  assert.equal(priceOf({ type: "Used", sellingPrice: 28500, yourPrice: 28500 }), 28500);
});

test("new cars stay on sellingPrice pending the sweep", () => {
  // markleyhonda 5J6RS4H45TL015753 — renders 36,100, the sellingPrice. New-car
  // yourPrice carries conditional/incentive rungs and flips direction, so this
  // half is deliberately unchanged until it is measured.
  const crv = { type: "New", sellingPrice: 36100, yourPrice: 37199, purchasePrice: 37199 };
  assert.equal(priceOf(crv), 36100);
  assert.equal(provOf(crv), "tv-selling");
});

test("new: a discounted yourPrice never displaces sellingPrice", () => {
  // toyotaofgladstone: yourPrice sits BELOW sellingPrice on 28.5% of new rows.
  assert.equal(priceOf({ type: "New", sellingPrice: 24898, yourPrice: 24648 }), 24898);
});

test("a used car with no yourPrice falls back to sellingPrice", () => {
  const r = { type: "Used", sellingPrice: 19995, yourPrice: 0 };
  assert.equal(priceOf(r), 19995);
  assert.equal(provOf(r), "tv-selling");
});

test("fees are never baked in: yourPriceSort is ignored", () => {
  // yourPriceSort is list + doc fee (42,339 + 225). Our convention is pre-fee.
  assert.equal(priceOf({ type: "Used", sellingPrice: 39784, yourPrice: 42339, yourPriceSort: 42564 }), 42339);
});
