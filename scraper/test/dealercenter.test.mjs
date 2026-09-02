import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerCenter,
  parseDealerCenterJsonp,
  dealerCenterPageSize,
  dealerCenterVdpLinks,
  dealerCenterVehicle,
  dealerCenterSrpUrl,
} from "../lib/platforms/dealercenter.mjs";
import { DEALERCENTER_ASKING } from "../lib/price-provenance.mjs";
import { normalize } from "../lib/normalize.mjs";
import { classifyEv } from "../lib/ev.mjs";

// A record as served by jordanmotors.co's JSONP on 2026-09-02, trimmed.
const REC = { VehicleInfoId: "35632e87", VehicleClass: 2, StockNumber: "195207", Vin: "3C63R3PL9NG195207", Year: 2022, Make: "RAM", Model: "3500 MEGA CAB", Trim: "LIMITED PICKUP 4D 6 1/3 FT", Drivetrain: "4WD", ExteriorColor: "GRAY", InteriorColor: "BEIGE", Odometer: 43973.0, AskingPrice: 50995.0, VehiclePrice: 50995.0, DisplayDealerFees: true, TotalPrice: 51494.0, DealerFees: [{ Displayname: "Doc /Dealer Prep", Amount: "499" }], FuelType: "DIESEL" };
const JSONP = `dws_inventory_listing_4({"TotalRecordCount":31,"Vehicles":[${JSON.stringify(REC)},${JSON.stringify({ ...REC, Vin: "5YJ3E1EA7KF317000", StockNumber: "317000", Make: "TESLA", Model: "MODEL 3", Trim: "STANDARD RANGE PLUS", FuelType: "ELECTRIC", VehiclePrice: 21995, AskingPrice: 21995, TotalPrice: 22494, Drivetrain: "RWD" })}]})`;
const PAGE = `<html><head><script type="application/json" id="DWS_Async_Vehicle_Listing_Settings_4">{"vehicleBaseUrl":"inventory","pageSize":10,"pageNo":1,"serviceUrl":"/inv-scripts-v2/inv/vehicles?vc=a&ps=10&pn=0&cb=dws_inventory_listing_4&dcid=3759769&h=f07a"}</script>
<img src="https://imagescf.dealercenter.net/x.jpg"></head><body>
<a href="/inventory/ram/3500-mega-cab/195207/">2022 RAM 3500</a> <a href="/apply-online/?stock_number=195207">Apply</a>
<a href="https://www.jordanmotors.co/inventory/tesla/model-3/317000/">2019 Tesla</a>
<a href="/inventory/audi/q7">facet</a>
<nav><a class="page-link" href="?page_no=2">2</a></nav></body></html>`;

test("isDealerCenter keys on the vendor's own hosts or its settings block, never the word", () => {
  assert.ok(isDealerCenter(PAGE));
  assert.ok(isDealerCenter('<script src="https://cdn.dealercenterwsstatic.net/x.js">'));
  assert.equal(isDealerCenter("Our DMS is DealerCenter and our website is custom"), false);
});

test("JSONP body → total + records; page size from the page's own settings", () => {
  const b = parseDealerCenterJsonp(JSONP);
  assert.equal(b.total, 31);
  assert.equal(b.vehicles.length, 2);
  assert.equal(parseDealerCenterJsonp("cb()"), null);
  assert.equal(dealerCenterPageSize(PAGE), 10);
  assert.equal(dealerCenterSrpUrl("https://www.jordanmotors.co", 3), "https://www.jordanmotors.co/inventory/?page_no=3");
});

test("VDP links come off the rendered card by stock number; facets are not VDPs", () => {
  const links = dealerCenterVdpLinks(PAGE, "https://www.jordanmotors.co/inventory/");
  assert.equal(links.get("195207"), "https://www.jordanmotors.co/inventory/ram/3500-mega-cab/195207/");
  assert.equal(links.get("317000"), "https://www.jordanmotors.co/inventory/tesla/model-3/317000/");
  assert.equal(links.has("q7"), true); // a two-segment facet is keyed but harmless: no record carries stock "q7"
});

test("record → node: pre-fee VehiclePrice with its own tag, TotalPrice never; condition abstains", () => {
  const v = dealerCenterVehicle(REC, { vdpUrl: "https://www.jordanmotors.co/inventory/ram/3500-mega-cab/195207/" });
  assert.equal(v.offers.price, 50995);
  assert.equal(v.offers.priceProvenance, DEALERCENTER_ASKING);
  assert.equal(v.itemCondition, undefined);
  assert.equal(v.driveWheelConfiguration, "4WD");
  const rec = normalize(v, { sourceUrl: "https://www.jordanmotors.co/inventory/", dealerDomain: "jordanmotors.co" });
  assert.equal(rec.priceUsd, 50995);
  assert.equal(rec.priceProvenance, "dealercenter-asking");
  assert.equal(rec.mileage, 43973);
  assert.equal(rec.vin, "3C63R3PL9NG195207");
  assert.equal(rec.condition, undefined);
  assert.equal(dealerCenterVehicle({ ...REC, Vin: "SHORT" }), null);
});

test("the vendor's FuelType enum reaches classifyEv as the words it reads", () => {
  const ev = dealerCenterVehicle(parseDealerCenterJsonp(JSONP).vehicles[1]);
  assert.equal(classifyEv(ev).isEv, true);
  assert.equal(classifyEv(dealerCenterVehicle(REC)).isEv, false);
  assert.equal(dealerCenterVehicle({ ...REC, FuelType: "PLUG-IN HYBRID" }).fuelType, "Plug-in Hybrid Electric");
});
