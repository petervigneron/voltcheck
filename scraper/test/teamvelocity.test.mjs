import { test } from "node:test";
import assert from "node:assert/strict";
import { teamVelocityApiIds, teamVelocityApiVehicle, teamVelocityRegistryIds, pickTeamVelocityIds, dealerHosts } from "../lib/platforms/teamvelocity.mjs";
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

test("new: a stale-low record loses to the live higher price", () => {
  // markleyhonda 5J6RS4H45TL015753. Publishing sellingPrice here showed 36,100
  // against a stack whose bottom line is 37,199 — $1,099 BELOW what the shopper
  // pays. This is the same import staleness as the used lane, and it was the
  // worst class the new-car sweep found (12 of 78, worst $2,931 short).
  const crv = { type: "New", sellingPrice: 36100, yourPrice: 37199, purchasePrice: 37199 };
  assert.equal(priceOf(crv), 37199);
  assert.equal(provOf(crv), "tv-retail");
});

test("new: a rebate-loaded yourPrice never displaces sellingPrice", () => {
  // cityworldhyundai kmhlm4dg8tu239336 — the gap IS the conditional rebate:
  // 23,585 - 21,585 = 2,000 = cashRebates, to the dollar. That holds for 70% of
  // divergent new rows carrying a rebate, and for 0 of 26 divergent used rows,
  // which is what makes new-car divergence a different mechanism from staleness.
  // Publishing the rebated figure would invent a bargain a shopper may not get.
  const elantra = { type: "New", sellingPrice: 23585, yourPrice: 21585, cashRebates: 2000 };
  assert.equal(priceOf(elantra), 23585);
  assert.equal(provOf(elantra), "tv-selling");
});

test("used and new diverge on purpose when yourPrice is LOWER", () => {
  // The same input, read two ways, because two different things cause it.
  // Used: no rebates exist, so a lower yourPrice is a real cut — follow it.
  // New: a lower yourPrice is a conditional rebate — ignore it.
  const shape = { sellingPrice: 30000, yourPrice: 28000, purchasePrice: 28000 };
  assert.equal(priceOf({ ...shape, type: "Used" }), 28000);
  assert.equal(priceOf({ ...shape, type: "New" }), 30000);
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

// Walled rooftops: the ids come from registry/team-velocity-ids.json, never
// from a page the wall will not serve. The page still wins when it answers,
// and a malformed pinned row is a null, not a URL with garbage in it.
test("teamVelocityRegistryIds: pinned ids for a walled rooftop, null otherwise", () => {
  const table = { "volvocarsfredericksburg.com": { accountId: "23519", campaignId: "11037" } };
  assert.deepEqual(teamVelocityRegistryIds("volvocarsfredericksburg.com", table), { accountId: "23519", campaignId: "11037" });
  assert.deepEqual(teamVelocityRegistryIds("WWW.VolvoCarsFredericksburg.com", table), { accountId: "23519", campaignId: "11037" });
  assert.equal(teamVelocityRegistryIds("hartehyundai.com", table), null);
  assert.equal(teamVelocityRegistryIds("x.com", { "x.com": { accountId: "23519;drop", campaignId: "1" } }), null);
  assert.equal(teamVelocityRegistryIds("x.com", { "x.com": { accountId: "23519" } }), null); // needs both
});

test("pickTeamVelocityIds: the page's ids win; the registry's fill a walled page", () => {
  const table = { "d.com": { accountId: "1", campaignId: "2" } };
  const page = `<script>var accountId = '71000'; var campaignId = '7226';</script>`;
  assert.deepEqual(pickTeamVelocityIds(page, "d.com", table), { accountId: "71000", campaignId: "7226" });
  assert.deepEqual(pickTeamVelocityIds("<title>Access Denied</title>", "d.com", table), { accountId: "1", campaignId: "2" });
  assert.equal(pickTeamVelocityIds("<title>Access Denied</title>", "other.com", table), null);
});

test("the committed team-velocity-ids.json parses and every row validates", () => {
  const ids = teamVelocityRegistryIds("georgehartenissan.com");
  assert.deepEqual(ids, { accountId: "31371", campaignId: "10479" });
});

// ---------------------------------------------------------------------------
// The empty vdpUrl. crawl.mjs drops a Team Velocity car with no per-VIN page,
// because recheck has nothing to retire — and 46% of the records this API
// serves have none (7,401 records over 40 working rooftops, 2026-09-05; seven
// of the 40 served an empty vdpUrl on EVERY record, so their whole lot
// vanished under a note reading "complete"). The rooftop host is the only
// thing missing, and dealerID names the rooftop: a record that DOES carry a
// link teaches the map, and a single-dealerID pull may borrow the crawled
// origin. A group account never borrows it.
test("a record with no vdpUrl gets the rooftop's /viewdetails path", () => {
  const hosts = dealerHosts([{ dealerID: 32468, vdpUrl: "" }], "https://www.gebhardtbmw.com");
  const v = teamVelocityApiVehicle(rec({ dealerID: 32468, vdpUrl: "", type: "Used" }), hosts);
  assert.equal(v.offers.url, "https://www.gebhardtbmw.com/viewdetails/Used/1HGCV1F30LA123456");
});

test("a new car takes the New path, and the type is the record's, not the URL's", () => {
  const hosts = dealerHosts([{ dealerID: 1, vdpUrl: "" }], "https://www.d.com");
  assert.equal(
    teamVelocityApiVehicle(rec({ dealerID: 1, vdpUrl: "", type: "New" }), hosts).offers.url,
    "https://www.d.com/viewdetails/New/1HGCV1F30LA123456",
  );
});

test("a linked record in the same pull teaches the host, so the crawled origin is not needed", () => {
  const hosts = dealerHosts(
    [
      { dealerID: 60840, vdpUrl: "https://www.bmwofbrooklyn.com/viewdetails/cpo/x/2023-bmw-x1?type=cash" },
      { dealerID: 60840, vdpUrl: "" },
    ],
    undefined,
  );
  assert.equal(
    teamVelocityApiVehicle(rec({ dealerID: 60840, vdpUrl: "" }), hosts).offers.url,
    "https://www.bmwofbrooklyn.com/viewdetails/Used/1HGCV1F30LA123456",
  );
});

// The guardrail. chulavistaford.com's account 30074 serves three rooftops
// (30074 → chulavistaford.com, 44185 → cvhonda.com, 60962 → chulavistakia.com)
// and a synthesised link on the crawled host really does render another
// rooftop's car (control-tested live 2026-09-05), so the fallback must never
// fire on a multi-rooftop pull.
test("a group account never borrows the crawled origin for an unknown rooftop", () => {
  const hosts = dealerHosts(
    [
      { dealerID: 30074, vdpUrl: "https://www.chulavistaford.com/viewdetails/Used/A" },
      { dealerID: 44185, vdpUrl: "" },
    ],
    "https://www.chulavistaford.com",
  );
  assert.equal(hosts.get("44185"), undefined);
  assert.equal(teamVelocityApiVehicle(rec({ dealerID: 44185, vdpUrl: "" }), hosts).offers.url, undefined);
});

test("a record that carries its own link keeps it, slug and query included", () => {
  const url = "https://www.bmwofbrooklyn.com/viewdetails/cpo/wbx73ef08p5x85541/2023-bmw-x1-sport-utility?type=cash";
  const hosts = dealerHosts([{ dealerID: 1, vdpUrl: url }], "https://www.other.com");
  assert.equal(teamVelocityApiVehicle(rec({ dealerID: 1, vdpUrl: url }), hosts).offers.url, url);
});

test("no map and no origin leaves the car unlinked rather than guessing a host", () => {
  assert.equal(teamVelocityApiVehicle(rec({ dealerID: 7, vdpUrl: "" }), dealerHosts([{ dealerID: 7, vdpUrl: "" }])).offers.url, undefined);
});
