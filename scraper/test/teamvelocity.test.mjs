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

test("price is sellingPrice, never the 0 internetPrice", () => {
  const v = teamVelocityApiVehicle(rec({ sellingPrice: 24925, internetPrice: 0 }));
  assert.equal(v.offers.price, 24925);
});

test("a record with no valid VIN is dropped", () => {
  assert.equal(teamVelocityApiVehicle({ vin: "NOTAVIN", sellingPrice: 1 }), null);
});
