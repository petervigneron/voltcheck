import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerSync,
  dealerSyncSearchUrl,
  dealerSyncIsLive,
  dealerSyncPrice,
  dealerSyncVdpUrl,
  dealerSyncVehicle,
  dealerSyncVehicles,
} from "../lib/platforms/dealersync.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { publishedCondition } from "../lib/condition.mjs";
import { DEALERSYNC_FINAL } from "../lib/price-provenance.mjs";

const ORIGIN = "https://www.pluginauto.com";

// The live record shape, trimmed to the fields this reads. Taken from
// www.pluginauto.com/Inventory/Search?startIndex=0&version=2, 2026-08-24.
const rec = (over = {}) => ({
  Vin: "5YJSA1E53RF538271",
  Year: "2024",
  Make: "Tesla",
  Model: "Model S",
  Trim: "AWD",
  Style: "Model S AWD",
  Mileage: 28518,
  Drivetrain: "All Wheel Drive",
  Engine: "Electric Motor",
  Fuel: "Electric Fuel System",
  FactoryColorText: "Gray",
  FactoryInteriorText: "Black",
  Transmission: "Automatic",
  StockNo: "RF538271",
  FinalPrice: 69350,
  PriceDisplay: "$69,350",
  InternetPrice: 69350,
  DiscountDisplay: "",
  IsNew: false,
  IsSold: false,
  CertifiedStatus: 0,
  DealerLocation: "821 S. Glendora Ave., West Covina, CA",
  DealerLocationStreet: "821 S. Glendora Ave.",
  DealerLocationCity: "West Covina",
  VehicleDetailUrl: "/pre-owned-cars/detail/2024-Tesla-Model-S/1525104",
  VehicleName: "2024 Tesla Model S AWD",
  FirstImageUrl: "//images.dealersync.com/2584/Photos/1525104/wm_935.jpg?_=abc&width=900",
  ...over,
});

test("fingerprinted on the vendor's own hosts, never on the brand word", () => {
  assert.ok(isDealerSync('<link href="https://dealer-cdn.dealersync.com/combres.axd/LuxuryCss/1/">'));
  assert.ok(isDealerSync("<img src='//images.dealersync.com/2584/Photos/1.jpg'>"));
  assert.equal(isDealerSync("<html>Welcome to Dealer Sync Motors of Reno</html>"), false);
  assert.equal(isDealerSync(undefined), false);
  assert.equal(fingerprint("<img src='//images.dealersync.com/2584/Photos/1.jpg'>"), "dealersync");
});

test("the search url carries only the two parameters robots leaves alone", () => {
  const u = new URL(dealerSyncSearchUrl(ORIGIN, 30));
  assert.equal(u.pathname, "/Inventory/Search");
  assert.deepEqual([...u.searchParams.keys()].sort(), ["startIndex", "version"]);
  assert.equal(u.searchParams.get("startIndex"), "30");
  // Specifically NOT the parameters pluginauto.com's robots.txt names —
  // Results, SortCriteria, Model, Color, BodyType, Price*.
  for (const banned of ["Results", "SortCriteria", "SortDirection", "Model", "Color", "BodyType", "PriceStart"]) {
    assert.equal(u.searchParams.has(banned), false, banned);
  }
  // Garbage in the offset cannot reach the query string.
  assert.match(dealerSyncSearchUrl(ORIGIN, "30&Results=999"), /startIndex=0&version=2$/);
});

test("reads the whole car out of one search record", () => {
  const v = dealerSyncVehicle(rec(), ORIGIN);
  assert.equal(v.vehicleIdentificationNumber, "5YJSA1E53RF538271");
  assert.equal(v.vehicleModelDate, "2024");
  assert.equal(v.brand, "Tesla");
  assert.equal(v.model, "Model S");
  assert.equal(v.vehicleConfiguration, "AWD");
  assert.equal(v.mileageFromOdometer.value, 28518);
  assert.equal(v.color, "Gray");
  assert.equal(v.fuelType, "Electric Fuel System");
  assert.equal(v.vehicleEngine.name, "Electric Motor");
  assert.equal(v.sku, "RF538271");
  assert.equal(v.offers.url, "https://www.pluginauto.com/pre-owned-cars/detail/2024-Tesla-Model-S/1525104");
  assert.equal(v.offers.seller.address.addressLocality, "West Covina");
  // Protocol-relative photo urls are absolutised, and the volatile query is
  // stripped by stabilizeImages.
  assert.deepEqual(v.image, ["https://images.dealersync.com/2584/Photos/1525104/wm_935.jpg"]);
});

test("condition is the machine boolean, and certification is never claimed", () => {
  assert.equal(dealerSyncVehicle(rec(), ORIGIN).itemCondition, "used");
  assert.equal(dealerSyncVehicle(rec({ IsNew: true }), ORIGIN).itemCondition, "new");
  // Absent → no claim at all, not "used" by default.
  assert.equal(dealerSyncVehicle(rec({ IsNew: undefined }), ORIGIN).itemCondition, undefined);
  // CertifiedStatus is never read into a certification claim.
  assert.equal(dealerSyncVehicle(rec({ CertifiedStatus: 1 }), ORIGIN).certified, undefined);
});

test("price is the label-read number, and abstains when the two readings disagree", () => {
  assert.equal(dealerSyncPrice(rec()), 69350);
  // A rendered price that has drifted from the machine field is the
  // badge-disagreement case: publish neither.
  assert.equal(dealerSyncPrice(rec({ PriceDisplay: "$68,900" })), undefined);
  // "Contact us" is stored as 0 and is a real state, not a parse failure.
  assert.equal(dealerSyncPrice(rec({ FinalPrice: 0, PriceDisplay: "" })), undefined);
  // A missing display is not a disagreement.
  assert.equal(dealerSyncPrice(rec({ PriceDisplay: "" })), 69350);
  // InternetPrice is never a fallback: it is a different field.
  assert.equal(dealerSyncPrice(rec({ FinalPrice: 0, InternetPrice: 69350 })), undefined);
});

test("a sold car is in the endpoint and must not reach the site", () => {
  assert.equal(dealerSyncIsLive(rec()), true);
  assert.equal(dealerSyncIsLive(rec({ IsSold: true })), false);
  const out = dealerSyncVehicles({ Success: true, vehicles: [rec(), rec({ Vin: "5YJ3E1EA1RF811777", IsSold: true })] }, ORIGIN);
  assert.equal(out.length, 1);
  assert.equal(out[0].vehicleIdentificationNumber, "5YJSA1E53RF538271");
});

test("an EV record classifies and normalizes; a petrol one on the same lot does not", () => {
  const ev = dealerSyncVehicle(rec(), ORIGIN);
  const cls = classifyEv(ev);
  assert.equal(cls.isEv, true);
  assert.equal(cls.kind, "BEV");
  const r = normalize(ev, { sourceUrl: ev.offers.url, dealerDomain: "pluginauto.com" });
  assert.equal(r.priceUsd, 69350);
  assert.equal(r.priceProvenance, DEALERSYNC_FINAL);
  assert.equal(r.mileage, 28518);
  assert.equal(publishedCondition({ condition: r.condition, sourceUrl: r.sourceUrl }), "used");

  // The control this lot supplies for free: the same rooftop's 207 petrol cars.
  const gas = dealerSyncVehicle(
    rec({
      Vin: "W1NYC7HJ8MX415556",
      Make: "Mercedes-Benz",
      Model: "AMG G 63",
      Trim: "4MATIC SUV",
      Engine: "4.0L  8 Cylinders",
      Fuel: "Gasoline Fuel",
      VehicleName: "2021 Mercedes-Benz AMG G 63 4MATIC SUV",
    }),
    ORIGIN,
  );
  assert.equal(classifyEv(gas).isEv, false);
  // And a non-plug-in hybrid, which is the other thing this lot holds.
  const hev = dealerSyncVehicle(
    rec({ Vin: "JTDKARFU0J3068904", Make: "Toyota", Model: "Prius", Trim: "Two", Fuel: "Gas/Electric Hybrid", Engine: "1.8L 4 Cylinders", VehicleName: "2018 Toyota Prius Two" }),
    ORIGIN,
  );
  assert.equal(classifyEv(hev).isEv, false);
});

test("junk in, nothing out", () => {
  assert.equal(dealerSyncVehicle({ Vin: "NOTAVIN" }, ORIGIN), null);
  assert.equal(dealerSyncVehicle({}, ORIGIN), null);
  assert.equal(dealerSyncVehicles({ Success: false, vehicles: [] }, ORIGIN), null);
  assert.equal(dealerSyncVehicles(null, ORIGIN), null);
  assert.equal(dealerSyncVdpUrl({ VehicleDetailUrl: "" }, ORIGIN), undefined);
});
