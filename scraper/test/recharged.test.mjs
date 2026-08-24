import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRecharged,
  isRechargedOrigin,
  rechargedSearchUrl,
  rechargedIsLive,
  rechargedVdpUrl,
  rechargedVehicle,
} from "../lib/platforms/recharged.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { publishedCondition } from "../lib/condition.mjs";
import { RECHARGED_PRICE } from "../lib/price-provenance.mjs";

const ORIGIN = "https://recharged.com";

// The live record shape, trimmed to the fields this reads. Taken from
// recharged.com/api/trpc/vehicle.search, 2026-08-24.
const rec = (over = {}) => ({
  vin: "7SAYGDEF8SA339578",
  year: 2025,
  make: "Tesla",
  model: "Model Y",
  trim: "Performance",
  bodyStyle: "Sport Utility",
  mileage: 30531,
  exteriorColor: "Stealth Grey",
  interiorColor: "White",
  driveTrain: "All Wheel Drive",
  motor: "340 kW",
  stockNumber: "339578",
  price: "39998.00",
  // The book values that sit beside the ask and must never be read as one.
  jdpRetail: "41975.00",
  jdpTrade: "39475.00",
  bbRetail: "39550.00",
  bbWholesale: "34050.00",
  actualCashValue: "37300.00",
  previousPrice: null,
  electricType: "BEV",
  saleStatus: "Available For Sale",
  isReserved: false,
  soldAt: null,
  images: [
    { url: "https://dealerslink.s3.amazonaws.com/vehicles/5454/b.jpg", sortOrder: 1, isPrimary: false },
    { url: "https://dealerslink.s3.amazonaws.com/vehicles/5454/a.jpg?v=2", sortOrder: 0, isPrimary: true },
  ],
  ...over,
});

test("recognised by a mark that contains its own host, and by the host itself", () => {
  assert.ok(isRecharged('<script type="application/ld+json">{"logo":"https://recharged.com/logo.svg"}</script>'));
  assert.equal(isRecharged("<html>Recharged Motors of Ohio — recharged-ev.com</html>"), false);
  assert.equal(isRecharged(undefined), false);
  assert.ok(isRechargedOrigin("https://recharged.com"));
  assert.ok(isRechargedOrigin("https://www.recharged.com/vehicles"));
  assert.equal(isRechargedOrigin("https://recharged.com.evil.example"), false);
  assert.equal(isRechargedOrigin("not a url"), false);
  assert.equal(fingerprint('href="https://recharged.com/logo.svg"'), "recharged");
});

test("the search url asks the page's own unfiltered question", () => {
  const u = new URL(rechargedSearchUrl(ORIGIN, { limit: 100, cursor: 200 }));
  assert.equal(u.pathname, "/api/trpc/vehicle.search");
  const input = JSON.parse(u.searchParams.get("input"))["0"].json;
  assert.deepEqual(input, {
    inventoryMode: "ev",
    sort: "recommended",
    direction: "forward",
    limit: 100,
    cursor: 200,
  });
  // No shopper filter of any kind rides along.
  for (const k of ["makes", "models", "minPrice", "maxPrice", "preferredLocationIds"]) {
    assert.equal(k in input, false, k);
  }
  // Nothing textual can reach the query: both fields go through Number(), so
  // a string arrives as null (JSON has no NaN), never as text.
  const bad = JSON.parse(new URL(rechargedSearchUrl(ORIGIN, { limit: "100;drop", cursor: "x" })).searchParams.get("input"))["0"].json;
  assert.equal(bad.limit, null);
  assert.equal(bad.cursor, null);
});

test("reads the whole car out of one record", () => {
  const v = rechargedVehicle(rec(), ORIGIN);
  assert.equal(v.vehicleIdentificationNumber, "7SAYGDEF8SA339578");
  assert.equal(v.vehicleModelDate, "2025");
  assert.equal(v.brand, "Tesla");
  assert.equal(v.model, "Model Y");
  assert.equal(v.vehicleConfiguration, "Performance");
  assert.equal(v.mileageFromOdometer.value, 30531);
  assert.equal(v.color, "Stealth Grey");
  assert.equal(v.sku, "339578");
  assert.equal(v.fuelType, "BEV");
  assert.equal(v.offers.price, 39998);
  assert.equal(v.offers.priceProvenance, RECHARGED_PRICE);
  // Photos come out in the platform's own sortOrder, hero first, query stripped.
  assert.deepEqual(v.image, [
    "https://dealerslink.s3.amazonaws.com/vehicles/5454/a.jpg",
    "https://dealerslink.s3.amazonaws.com/vehicles/5454/b.jpg",
  ]);
  // A delivery-mileage van reads 0, not "no odometer".
  assert.equal(rechargedVehicle(rec({ mileage: 0 }), ORIGIN).mileageFromOdometer.value, 0);
});

test("only the ask is read — never a book value", () => {
  const v = rechargedVehicle(rec({ price: null }), ORIGIN);
  assert.equal(v.offers.price, undefined);
  assert.equal(v.offers.priceProvenance, undefined);
  const r = normalize(v, { sourceUrl: ORIGIN, dealerDomain: "recharged.com" });
  // jdpRetail 41975 / bbWholesale 34050 / actualCashValue 37300 are all on the
  // record and none of them may stand in for a price the dealer did not ask.
  assert.equal(r.priceUsd, undefined);
});

test("photos are pinned to the platform's own bucket", () => {
  const v = rechargedVehicle(
    rec({ images: [{ url: "https://evil.example/car.jpg", sortOrder: 0 }, { url: "/relative.jpg", sortOrder: 1 }] }),
    ORIGIN,
  );
  assert.equal(v.image, undefined);
});

test("a reserved car cannot be bought, so it is not published", () => {
  assert.equal(rechargedIsLive(rec()), true);
  assert.equal(rechargedIsLive(rec({ saleStatus: "Sale Pending" })), true);
  // The one the site hides in plain sight: saleStatus says available, the SRP
  // counts it, and the VDP replaces the buy path with "Notify me if available".
  assert.equal(rechargedIsLive(rec({ isReserved: true })), false);
  assert.equal(rechargedIsLive(rec({ soldAt: "2026-08-01T00:00:00Z" })), false);
  // A status this lane has never seen is not a claim it will make.
  assert.equal(rechargedIsLive(rec({ saleStatus: "In Transit" })), false);
  assert.equal(rechargedIsLive(rec({ saleStatus: undefined })), false);
});

test("the VDP url is built from the site's own slug rule", () => {
  assert.equal(rechargedVdpUrl(rec(), ORIGIN), "https://recharged.com/vehicles/tesla/model-y/7SAYGDEF8SA339578");
  assert.equal(
    rechargedVdpUrl(rec({ make: "Volkswagen", model: "ID.4", vin: "1V2CMPE80NC012345" }), ORIGIN),
    "https://recharged.com/vehicles/volkswagen/id.4/1V2CMPE80NC012345",
  );
  assert.equal(
    rechargedVdpUrl(rec({ make: "GMC", model: "Hummer EV Pickup", vin: "1GT40FDA0PU100001" }), ORIGIN),
    "https://recharged.com/vehicles/gmc/hummer-ev-pickup/1GT40FDA0PU100001",
  );
  assert.equal(rechargedVdpUrl(rec({ model: "" }), ORIGIN), undefined);
  assert.equal(rechargedVdpUrl({ vin: "NOPE" }, ORIGIN), undefined);
});

test("a BEV and a PHEV both classify, and neither carries a condition claim", () => {
  const bev = rechargedVehicle(rec(), ORIGIN);
  assert.deepEqual(classifyEv(bev), { isEv: true, kind: "BEV", confidence: "high" });
  const phev = rechargedVehicle(
    rec({ vin: "JA4T5UA95PZ012345", make: "Mitsubishi", model: "Outlander PHEV", trim: "SEL", electricType: "PHEV" }),
    ORIGIN,
  );
  assert.equal(phev.fuelType, "Plug-In Hybrid");
  assert.deepEqual(classifyEv(phev), { isEv: true, kind: "PHEV", confidence: "high" });

  const r = normalize(bev, { sourceUrl: bev.offers.url, dealerDomain: "recharged.com" });
  assert.equal(r.priceUsd, 39998);
  assert.equal(r.priceProvenance, RECHARGED_PRICE);
  // No condition field exists on this platform and none is invented — the
  // vdpUrl carries no token either.
  assert.equal(r.condition, undefined);
  assert.equal(publishedCondition({ condition: r.condition, sourceUrl: r.sourceUrl }), undefined);
});

test("junk in, nothing out", () => {
  assert.equal(rechargedVehicle({ vin: "NOTAVIN" }, ORIGIN), null);
  assert.equal(rechargedVehicle({}, ORIGIN), null);
  assert.equal(rechargedVehicle(rec({ electricType: "MYSTERY" }), ORIGIN).fuelType, undefined);
});
