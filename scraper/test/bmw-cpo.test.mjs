import { test } from "node:test";
import assert from "node:assert/strict";
import { toRecord, keepBev, keepPhev } from "../lib/oem/bmw-cpo.mjs";

// Fixtures are real records from bmwusa.com's pre-owned API, trimmed to the
// fields this lane reads (swept 2026-08-23). The VINs are kept because the
// plug-in cases were each settled against vPIC by VIN, and that is the whole
// argument for the nameplate pattern below.
const ROOT = "https://bmw.assets.shiftdigitalinventory.com";

const iX = {
  year: 2025, type: "Used", make: "BMW", model: "iX", modelSeries: "iX",
  trimDescription: "xDrive50 Sports Activity Vehicle", odometer: 17144,
  vdpUrl: "https://www.centurywestbmw.com/inventory/used-2025-bmw-ix-wb523cf00sct27794/",
  internetPrice: 62002, msrp: null, drivetrain: "AWD", fuelType: "Electric",
  engineCylinders: "0", exterior: "Mineral White Metallic", interior: "Black",
  vin: "WB523CF00SCT27794", photos: ["WB523CF00SCT27794_1.jpg", "WB523CF00SCT27794_2.jpg"],
};

test("an electric record becomes a BEV listing with the site's own photo URLs", () => {
  const r = toRecord(iX, ROOT, "BEV");
  assert.equal(r.vin, "WB523CF00SCT27794");
  assert.equal(r.make, "BMW");
  assert.equal(r.model, "iX");
  assert.equal(r.trim, "xDrive50 Sports Activity Vehicle");
  assert.equal(r.evKind, "BEV");
  assert.equal(r.priceUsd, 62002);
  assert.equal(r.priceProvenance, "oem-bmw-cpo-internet-price");
  assert.equal(r.mileage, 17144);
  assert.equal(r.dealerDomain, "bmw-cpo");
  assert.equal(r.imageUrl, `${ROOT}/images/WB523CF00SCT27794_1.jpg`);
  assert.equal(r.sourceUrl, iX.vdpUrl);
});

test("type is the machine token: CPO certifies, Used does not", () => {
  assert.equal(toRecord(iX, ROOT, "BEV").condition, "used");
  assert.equal(toRecord(iX, ROOT, "BEV").certified, undefined);
  const cpo = toRecord({ ...iX, type: "CPO" }, ROOT, "BEV");
  assert.equal(cpo.condition, "certified");
  assert.equal(cpo.certified, true);
});

test("the model is split from its trim the way the new-car lane splits it", () => {
  // The feed files some i-cars under the parent series with the whole name in
  // `model`; both shapes have to name the same car the same way.
  const filed = toRecord({ ...iX, model: "i7 xDrive60", modelSeries: "7 Series", trimDescription: null }, ROOT, "BEV");
  assert.equal(filed.model, "i7");
  assert.equal(filed.trim, "xDrive60");
  // model can be null; the series is the fallback, never a dropped record.
  const bare = toRecord({ ...iX, model: null, modelSeries: "iX" }, ROOT, "BEV");
  assert.equal(bare.model, "iX");
});

test("a call-us placeholder price abstains instead of claiming $999,999", () => {
  // Live 2026-08-23: one row in 3,028, a 915-mile 2026 M5 at 999999, against a
  // real spread of $10,378-$161,135.
  const r = toRecord({ ...iX, vin: "WBS83GV02TCW93998", internetPrice: 999999, msrp: null }, ROOT, "PHEV");
  assert.equal(r.priceUsd, 0, "an abstain keeps the car and drops the number");
  assert.equal(r.priceProvenance, undefined, "an abstain must not pair in price history");
  // A real six-figure BMW is still a price.
  assert.equal(toRecord({ ...iX, internetPrice: 161135 }, ROOT, "BEV").priceUsd, 161135);
});

test("photo filenames from another host or shape are not turned into URLs", () => {
  const r = toRecord({ ...iX, photos: ["../evil.jpg", "https://elsewhere.example/x.jpg", "ok_1.jpg"] }, ROOT, "BEV");
  assert.deepEqual(r.images, [`${ROOT}/images/ok_1.jpg`]);
});

test("keepBev takes the electric facet at its word but re-checks the record", () => {
  assert.equal(keepBev(iX), "BEV");
  assert.equal(keepBev({ ...iX, fuelType: "Gasoline" }), null, "a drifted server-side filter must not publish petrol");
});

test("keepPhev accepts BMW's plug-in badge wherever the feed puts it", () => {
  // Each of these was confirmed PHEV by vPIC on the VIN in the comment.
  const cases = [
    [{ model: "X5", trimDescription: "xDrive50e", modelSeries: "X5" }, "5UX43EU09R9U02705"],
    [{ model: "X5", trimDescription: "xDrive45e", modelSeries: "X5" }, "5UXTA6C04M9D73862"],
    [{ model: "XM", trimDescription: null, modelSeries: "XM" }, "5YM23CS05R9W28246"],
    [{ model: "330e xDrive", trimDescription: null, modelSeries: "3 Series" }, "name only"],
    [{ model: "750e xDrive", trimDescription: "xDrive", modelSeries: "7 Series" }, "name only"],
    [{ model: null, trimDescription: "530e iPerformance", modelSeries: "5 Series" }, "trim only"],
    [{ model: "X3", trimDescription: "xDrive30e", modelSeries: "X3" }, "trim only"],
    [{ model: "M5", trimDescription: null, modelSeries: "5 Series" }, "vPIC settles which M5"],
    [{ model: "i8", trimDescription: "Base", modelSeries: "i8" }, "plug-in hybrid"],
  ];
  for (const [v, why] of cases) {
    assert.equal(keepPhev({ ...v, fuelType: "Hybrid" }), "PHEV", `${v.model} / ${v.trimDescription} (${why})`);
  }
});

test("keepPhev refuses the mild hybrids that fill the same facet", () => {
  // vPIC on each: ElectrificationLevel "", FuelTypePrimary "Gasoline".
  const cases = [
    { model: "330i", trimDescription: "xDrive", modelSeries: "3 Series" },      // 3MW89CW00T8G04530
    { model: "X7", trimDescription: "xDrive40i", modelSeries: "X7" },           // 5UX23EM00T9377028
    { model: "X5", trimDescription: "xDrive40i", modelSeries: "X5" },           // 5UX23EU00R9V92112
    { model: "540i", trimDescription: null, modelSeries: "5 Series" },
    { model: "M550i xDrive", trimDescription: null, modelSeries: "5 Series" },
  ];
  for (const v of cases) {
    assert.equal(keepPhev({ ...v, fuelType: "Hybrid" }), null, `${v.model} / ${v.trimDescription}`);
  }
});

test("eDrive is BEV nomenclature and must never read as a plug-in hybrid", () => {
  // If an i4 were ever mislabelled into the hybrid facet, matching "eDrive40"
  // would publish a battery-electric car as a plug-in hybrid.
  assert.equal(keepPhev({ model: "i4 eDrive40", trimDescription: "eDrive40", modelSeries: "i4", fuelType: "Hybrid" }), null);
  assert.equal(keepPhev({ model: "i5", trimDescription: "eDrive40", modelSeries: "5 Series", fuelType: "Hybrid" }), null);
});

test("keepPhev ignores rows outside the hybrid facet entirely", () => {
  assert.equal(keepPhev({ model: "X5", trimDescription: "xDrive50e", fuelType: "Electric" }), null);
});
