import { test } from "node:test";
import assert from "node:assert/strict";
import { isDealerWebsites, extractDealerWebsitesVehicles } from "../lib/platforms/dealerwebsites.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";

// The Angular bootstrap the way DealerWebsites ships it: the whole lot inline in
// a BootstrapService factory. The array carries a `]` inside a string value to
// exercise the bracket matcher, plus payment/book-value fields that must NOT be
// read as the asking price.
const PAGE = `<html><body>
<script src="/js/inventory-bundle?v=abc"></script>
<script>
angular.module("app.inventory").factory("BootstrapService", function() { return { vehicles: [
  {"listingId":482798,"stockNumber":"T1","vin":"5YJ3E1EB2NF194764","year":2022,"make":"Tesla","model":"Model 3","trim":"Long Range [AWD]","engine":"Electric","mileage":31000,"price":28900.00,"nadaPrice":31000,"kbbPrice":30500,"monthlyPayment":499,"drive":"AWD","exteriorColor":"White","interiorColor":"Black","photoUrl":"https://img.test/a.jpg"},
  {"listingId":495212,"stockNumber":"T2","vin":"WBAPL5G50BNN22263","year":2011,"make":"BMW","model":"3-Series","trim":"335i","engine":"3.0L L6","mileage":138000,"price":7500.00,"monthlyPayment":199,"drive":"RWD"},
  {"listingId":1,"stockNumber":"B1","vin":"SHORTVIN","year":1999,"make":"ALPINA","model":"20FT","price":10990.00}
] } })
</script></body></html>`;

const ORIGIN = "https://dealer.test/inventory";

test("isDealerWebsites fires on the bootstrap factory / asset host", () => {
  assert.equal(isDealerWebsites(PAGE), true);
  assert.equal(isDealerWebsites("<html>a dealer.com page</html>"), false);
  assert.equal(isDealerWebsites(undefined), false);
});

test("extractDealerWebsitesVehicles reads the inline lot and drops the bad VIN", () => {
  const vs = extractDealerWebsitesVehicles(PAGE, ORIGIN);
  assert.equal(vs.length, 2); // the boat's "SHORTVIN" is dropped

  const tesla = vs.find((v) => v.vehicleIdentificationNumber === "5YJ3E1EB2NF194764");
  assert.ok(tesla);
  assert.equal(tesla.vehicleModelDate, "2022");
  assert.equal(tesla.brand, "Tesla");
  assert.equal(tesla.offers.price, 28900); // `price`, never monthlyPayment/nadaPrice
  assert.equal(tesla.mileageFromOdometer.value, 31000);
  assert.equal(tesla.offers.url, "https://dealer.test/482798/2022-Tesla-Model-3");
  assert.equal(tesla.image[0], "https://img.test/a.jpg");
});

test("the bracket matcher survives a ] inside a string value", () => {
  // "Long Range [AWD]" contains a ] — the array must not terminate there.
  const vs = extractDealerWebsitesVehicles(PAGE, ORIGIN);
  assert.equal(vs.find((v) => v.vehicleIdentificationNumber === "5YJ3E1EB2NF194764").vehicleConfiguration, "Long Range [AWD]");
});

test("the EV classifies, normalizes, and the ICE does not", () => {
  const vs = extractDealerWebsitesVehicles(PAGE, ORIGIN);
  const evs = vs.filter((v) => classifyEv(v).isEv);
  assert.equal(evs.length, 1);
  const rec = normalize(evs[0], { sourceUrl: evs[0].offers.url, dealerDomain: "dealer.test" });
  assert.equal(rec.vin, "5YJ3E1EB2NF194764");
  assert.equal(rec.priceUsd, 28900);
});
