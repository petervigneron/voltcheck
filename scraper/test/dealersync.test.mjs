import { test } from "node:test";
import assert from "node:assert/strict";
import { isDealerSync, dealerSyncSlug, dealerSyncNodes } from "../lib/platforms/dealersync.mjs";
import { classifyEv } from "../lib/ev.mjs";

// A page-shell fragment carrying the per-rooftop VDP slug the way DealerSync
// homepages do (a featured-vehicle link), plus the asset host.
const SHELL = `<html><head><script src="https://dealer-cdn.dealersync.com/app.js"></script></head>
<body><a href="/pre-owned-cars/detail/1971-Volkswagen-Bus/1012541">featured</a></body></html>`;

// Vehicles shaped like the /Inventory/Search API's `vehicles[]`.
const VEHICLES = [
  {
    Vin: "KM8KNDDF1RU286250", Year: 2024, Make: "Hyundai", Model: "IONIQ 5", Trim: "SEL",
    VehicleTitle: "2024 Hyundai IONIQ 5 SEL", FinalPrice: 25738, FinalPriceDisplay: 25738,
    InternetPrice: 25988, IncentiveDiscount: 0, Fuel: "Electric Fuel System", Mileage: 12000,
    Drivetrain: "AWD", StockNo: "A1", VehicleId: 1553555, IsNew: false,
    FirstImageUrl: "//images.dealersync.com/2814/Photos/1553555/wm_x.jpeg",
  },
  {
    // Conditional incentive folded into FinalPrice — the advertised price must
    // add it back, not print the incentive-loaded low number.
    Vin: "1HGCR2F79GA126544", Year: 2016, Make: "Honda", Model: "Accord", Trim: "EX",
    VehicleTitle: "2016 Honda Accord EX", FinalPrice: 12000, FinalPriceDisplay: 12000,
    InternetPrice: 15000, IncentiveDiscount: 2000, Fuel: "Gasoline Fuel", Mileage: 80000,
    VehicleId: 100200, IsNew: false,
  },
  {
    // No VIN -> dropped.
    Vin: "", Year: 2015, Make: "Nissan", Model: "Altima", VehicleTitle: "2015 Nissan Altima",
    FinalPrice: 9000, Fuel: "Gasoline Fuel", VehicleId: 100300,
  },
];

test("isDealerSync fires on the vendor host, not arbitrary pages", () => {
  assert.equal(isDealerSync(SHELL), true);
  assert.equal(isDealerSync("<html>a dealer.com page</html>"), false);
  assert.equal(isDealerSync(undefined), false);
});

test("dealerSyncSlug reads the per-rooftop inventory slug, defaulting to inventory", () => {
  assert.equal(dealerSyncSlug(SHELL), "pre-owned-cars");
  assert.equal(dealerSyncSlug("<html>no detail links</html>"), "inventory");
});

test("dealerSyncNodes builds VIN/price/URL and drops the VIN-less car", () => {
  const cars = dealerSyncNodes(VEHICLES, "https://x.test", SHELL);
  assert.equal(cars.length, 2);

  const ev = cars.find((c) => c.vehicleIdentificationNumber === "KM8KNDDF1RU286250");
  assert.ok(ev);
  assert.equal(ev.offers.price, 25738); // IncentiveDiscount 0 -> displayed price
  assert.equal(ev.offers.url, "https://x.test/pre-owned-cars/detail/2024-Hyundai-IONIQ-5/1553555");
  assert.equal(ev.image[0], "https://images.dealersync.com/2814/Photos/1553555/wm_x.jpeg");
  assert.equal(ev.itemCondition, "used");
});

test("advertised price backs out a conditional incentive (false-bargain rule)", () => {
  const accord = dealerSyncNodes(VEHICLES, "https://x.test", SHELL).find(
    (c) => c.vehicleIdentificationNumber === "1HGCR2F79GA126544"
  );
  // FinalPrice 12000 folded in a 2000 conditional incentive; advertised = 14000,
  // never the incentive-loaded 12000.
  assert.equal(accord.offers.price, 14000);
});

test("the declared Fuel classifies the EV at high confidence; the ICE does not", () => {
  const cars = dealerSyncNodes(VEHICLES, "https://x.test", SHELL);
  const evs = cars.filter((c) => classifyEv(c).isEv);
  assert.equal(evs.length, 1);
  const cls = classifyEv(evs[0]);
  assert.equal(evs[0].vehicleIdentificationNumber, "KM8KNDDF1RU286250");
  assert.equal(cls.confidence, "high"); // from "Electric Fuel System", not a name guess
});
