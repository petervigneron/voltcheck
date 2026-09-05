import { test } from "node:test";
import assert from "node:assert/strict";
import { toRecord, vdpUrl, photoUrls, dtSlug, searchBody } from "../lib/oem/drivetime.mjs";

// Every fixture below is a real record from search.ext.drivetime.cloud on
// 2026-09-05, trimmed to the fields the lane reads (the served record carries
// 182). They are the rows that shaped the module: the mis-coded plug-ins are
// why the lane walks the lot instead of filtering the fuel facet, and the
// sold Grand Cherokee is the control for the rule that matters most.

const rep = () => ({ notAvailable: 0, belowFloor: 0, noOdometer: 0 });

// A plug-in DriveTime files correctly: fuel "Hybrid", badge in the model.
const GRAND_CHEROKEE = {
  StockNumber: 1040312886,
  Vin: "1C4RJYB65N8715725",
  Year: 2022,
  Make: "Jeep",
  Model: "Grand Cherokee 4xe",
  DisplayName: "Grand Cherokee 4xe",
  Trim: "",
  BodyType: "SUV",
  StickerPrice: 28295,
  OriginalStickerPrice: 28295,
  OdometerValue: 44263,
  DriveType: "4WD",
  NormalizedFuelDescription: "Hybrid",
  FuelDescription: "Gas/Elec Hybrid",
  NormalizedExtColor: "Red",
  NormalizedIntColor: "Tan",
  City: "DALLAS",
  StateAbbreviation: "TX",
  DealershipName: "DALLAS",
  StatusKey: "AV",
  StatusDescription: "Available",
  VehicleTierKey: "DriveTime",
  IsAvailable: true,
  PrimaryPhotoJson: '{"PhotoUID":"7b4f2187-efd1-42a2-9553-f4cffca4c3af","DisplayDescription":"Driver Front Bumper"}',
  VehiclePhotoJson:
    '{"Photos":[{"PhotoUID":"7b4f2187-efd1-42a2-9553-f4cffca4c3af","DisplayDescription":"Driver Front Bumper"},{"PhotoUID":"d38db106-d994-4b6b-9e76-1aeb230c765c","DisplayDescription":"Driver Front Side"},{"PhotoUID":"d77168e3-5584-40d2-adf3-f8a57983ae2e","DisplayDescription":"Driver Rear Side"}]}',
};

// The same nameplate, SOLD. Nothing but StatusKey separates it from a car we
// would publish, so it is the control test for the sold rule.
const SOLD_GRAND_CHEROKEE = {
  ...GRAND_CHEROKEE,
  StockNumber: 1040309284,
  Vin: "1C4RJYB65P8785681",
  Year: 2023,
  StickerPrice: 28495,
  OdometerValue: 35959,
  City: "NORTH PLANO",
  DealershipName: "PLANO",
  StatusKey: "SL",
  StatusDescription: "Sold",
  IsAvailable: false,
  NormalizedFuelDescription: "Gas",
  FuelDescription: "Gas",
};

// Three plug-ins DriveTime files as "Gas". These are the 40% a fuel-facet
// pull would have thrown away.
const MISCODED_4XE = {
  ...GRAND_CHEROKEE,
  StockNumber: 1380108965,
  Vin: "1C4RJYD69N8762754",
  Trim: "Overland",
  StickerPrice: 30895,
  OdometerValue: 29701,
  City: "CORPUS CHRISTI",
  DealershipName: "CORPUS CHRISTI",
  NormalizedFuelDescription: "Gas",
  FuelDescription: "Gas",
  VehiclePhotoJson: undefined,
  PrimaryPhotoJson: '{"PhotoUID":"577afcc2-02ed-43ba-a250-9bfaa5ca2af0","DisplayDescription":"Driver Front Bumper"}',
};

const VOLT = {
  StockNumber: 1010231347,
  Vin: "1G1RD6S55HU119523",
  Year: 2017,
  Make: "Chevrolet",
  Model: "Volt",
  DisplayName: "Volt",
  Trim: "Premier",
  StickerPrice: 16595,
  OriginalStickerPrice: 17695,
  OdometerValue: 51173,
  DriveType: "FWD",
  NormalizedFuelDescription: "Gas",
  FuelDescription: "Gas",
  NormalizedExtColor: "Black",
  NormalizedIntColor: "Black",
  City: "DOWNEY",
  StateAbbreviation: "CA",
  DealershipName: "DOWNEY",
  StatusKey: "AV",
  VehicleTierKey: "DriveTime",
  PrimaryPhotoJson: '{"PhotoUID":"c249ebc9-0ca2-4f4b-85b4-156a0c76aa8f"}',
};

// The badge lives in the TRIM and the fuel says Gas — invisible both to a
// fuel filter and to a make/model facet.
const HORNET_RT = {
  StockNumber: 1050218946,
  Vin: "ZACPDFDW6R3A18540",
  Year: 2024,
  Make: "Dodge",
  Model: "Hornet",
  DisplayName: "Hornet",
  Trim: "R/T Plus",
  StickerPrice: 25795,
  OdometerValue: 25037,
  DriveType: "AWD",
  NormalizedFuelDescription: "Gas",
  City: "GLENDALE",
  StateAbbreviation: "AZ",
  DealershipName: "GLENDALE",
  StatusKey: "AV",
  PrimaryPhotoJson: '{"PhotoUID":"ddfc601b-cab1-4fad-a91b-94e79668d4fd"}',
};

const CORSAIR_GT = {
  StockNumber: 1190231993,
  Vin: "5LMTJ5DZ7NUL15273",
  Year: 2022,
  Make: "Lincoln",
  Model: "Corsair",
  DisplayName: "Corsair",
  Trim: "Grand Touring",
  StickerPrice: 26195,
  OdometerValue: 50520,
  NormalizedFuelDescription: "Gas",
  City: "GREENVILLE",
  StateAbbreviation: "SC",
  DealershipName: "GREENVILLE-SOUTH CAROLINA",
  StatusKey: "AV",
  PrimaryPhotoJson: '{"PhotoUID":"6d3806d7-69ab-4a70-861b-7048d79ee698"}',
};

// A conventional hybrid sitting in the same "Hybrid" bucket. 42 of today's
// 67 hybrids look like this and none of them may be published.
const ELANTRA_HEV = {
  StockNumber: 1030323036,
  Vin: "KMHLM4DJXSU155240",
  Year: 2025,
  Make: "Hyundai",
  Model: "Elantra",
  DisplayName: "Elantra",
  Trim: "Hybrid Blue HEV",
  StickerPrice: 23095,
  OriginalStickerPrice: 23595,
  OdometerValue: 8841,
  DriveType: "FWD",
  NormalizedFuelDescription: "Hybrid",
  FuelDescription: "Gas/Elec Hybrid",
  City: "MORROW",
  StateAbbreviation: "GA",
  DealershipName: "MORROW",
  StatusKey: "AV",
  PrimaryPhotoJson: '{"PhotoUID":"b4eb6b4f-3e39-46a1-b9ca-c7210a39c4d3"}',
};

test("a sold car is refused and counted — nothing but StatusKey separates it from a publishable one", () => {
  const r = rep();
  assert.equal(toRecord(SOLD_GRAND_CHEROKEE, r), null);
  assert.equal(r.notAvailable, 1);
  // And the same record with the status flipped IS admitted, so the test is
  // about the status and not about some other property of the row.
  assert.ok(toRecord({ ...SOLD_GRAND_CHEROKEE, StatusKey: "AV" }, rep()));
});

test("a layaway car is refused too", () => {
  const r = rep();
  assert.equal(toRecord({ ...GRAND_CHEROKEE, StatusKey: "LA", StatusDescription: "Layaway" }, r), null);
  assert.equal(r.notAvailable, 1);
});

test("the query excludes sold and layaway and asks for a nationwide answer", () => {
  const b = searchBody({ pageNumber: 1, pageSize: 1000, withFacets: true });
  const excluded = b.filters.filter((f) => f.name === "StatusKey" && f.operator === 7).flatMap((f) => f.items);
  assert.deepEqual(excluded.sort(), ["LA", "SL"]);
  // One filter object per value: the two statuses in a single object's items
  // would OR them and exclude nothing.
  assert.equal(b.filters.length, 2);
  assert.equal(b.filterConjunction, 1);
  // No location keys — those are what would narrow the answer to a radius.
  for (const k of ["lat", "lng", "latitude", "longitude", "mileRadius"]) assert.ok(!(k in b), `${k} must not be sent`);
  assert.deepEqual(b.facets, [{ value: "NormalizedFuelDescription", count: null }]);
});

test("a plug-in DriveTime files as 'Gas' is still kept — the fuel field is not the gate", () => {
  // This is the finding the lane is built around: on 2026-09-05, 19 of 47
  // plug-ins were filed under Gas or Flex Fuel, so a fuel-facet pull would
  // have shipped 28 and lost these.
  for (const v of [MISCODED_4XE, VOLT, HORNET_RT, CORSAIR_GT]) {
    const rec = toRecord(v, rep());
    assert.ok(rec, `${v.Year} ${v.Make} ${v.Model} ${v.Trim} must be kept`);
    assert.equal(rec.evKind, "PHEV?");
    assert.equal(rec.evConfidence, "name_match");
    // The source's own wrong claim is carried through rather than laundered.
    assert.equal(rec.fuelType, "Gas");
  }
});

test("a conventional hybrid in the same bucket is not published", () => {
  assert.equal(toRecord(ELANTRA_HEV, rep()), null);
  assert.equal(toRecord({ ...ELANTRA_HEV, Make: "Toyota", Model: "Camry", DisplayName: "Camry", Trim: "Hybrid SE" }, rep()), null);
  assert.equal(toRecord({ ...ELANTRA_HEV, Make: "Ram", Model: "1500", DisplayName: "1500", Trim: "Crew Cab Big Horn 5.5 ft" }, rep()), null);
});

test("the record reads the machine fields, cross-checked against the rendered VDP", () => {
  const rec = toRecord(GRAND_CHEROKEE, rep());
  assert.equal(rec.vin, "1C4RJYB65N8715725");
  assert.equal(rec.year, 2022);
  assert.equal(rec.make, "Jeep");
  assert.equal(rec.model, "Grand Cherokee 4xe");
  // The VDP prints "Guaranteed Price* $28,295" and "Miles 44,263".
  assert.equal(rec.priceUsd, 28295);
  assert.equal(rec.mileage, 44263);
  assert.equal(rec.priceProvenance, "oem-drivetime-sticker-price");
  assert.equal(rec.driveLine, "AWD");
  assert.equal(rec.condition, "used");
  assert.equal(rec.dealerDomain, "drivetime.com");
  assert.equal(rec.platform, "drivetime-locator");
  assert.equal(rec.city, "Dallas");
  assert.equal(rec.state, "TX");
  assert.equal(rec.dealerName, "DriveTime Dallas");
  assert.equal(rec.stockNumber, "1040312886");
});

test("OriginalStickerPrice is never published as a price", () => {
  // It is a PREVIOUS ask (the "Reduced Price" badge counts down from it), so
  // a $17,695 sitting above a $16,595 must not become an MSRP or a price.
  const rec = toRecord(VOLT, rep());
  assert.equal(rec.priceUsd, 16595);
  assert.ok(!("msrpUsd" in rec));
  assert.ok(!Object.values(rec).includes(17695));
});

test("a number below the year's junk floor is withheld, not published", () => {
  const r = rep();
  // $1,280 is the shape of a monthly payment in a price slot — the failure
  // lib/price-floor.mjs exists for. A 2022 sits on the $7,000 floor.
  const rec = toRecord({ ...GRAND_CHEROKEE, StickerPrice: 1280 }, r);
  assert.ok(rec);
  assert.equal(rec.priceUsd, undefined);
  assert.equal(rec.priceProvenance, undefined);
  assert.equal(r.belowFloor, 1);
});

test("the VDP url is the site's own six-segment path, slugged its way", () => {
  // Verified live 2026-09-05: this URL renders the 2022 Grand Cherokee 4xe
  // whose VIN is 1C4RJYB65N8715725.
  assert.equal(vdpUrl(GRAND_CHEROKEE), "https://www.drivetime.com/used-cars/tx/dallas/jeep/grand-cherokee-4xe/2022/1040312886");
  assert.equal(vdpUrl(CORSAIR_GT), "https://www.drivetime.com/used-cars/sc/greenville/lincoln/corsair/2022/1190231993");
  // DisplayName, not Model — that is what the site's own card component
  // passes, and the two can differ.
  assert.equal(vdpUrl({ ...GRAND_CHEROKEE, DisplayName: "Grand Cherokee" }), "https://www.drivetime.com/used-cars/tx/dallas/jeep/grand-cherokee/2022/1040312886");
});

test("a missing segment yields no url rather than a broken one", () => {
  assert.equal(vdpUrl({ ...GRAND_CHEROKEE, City: "" }), undefined);
  assert.equal(vdpUrl({ ...GRAND_CHEROKEE, StockNumber: null }), undefined);
  assert.equal(toRecord({ ...GRAND_CHEROKEE, StateAbbreviation: "" }, rep()).sourceUrl, undefined);
});

test("dtSlug matches drivetime.com's own StringUtils.slug", () => {
  assert.equal(dtSlug("Grand Cherokee 4xe"), "grand-cherokee-4xe");
  assert.equal(dtSlug("GREENVILLE-SOUTH CAROLINA"), "greenville-south-carolina");
  assert.equal(dtSlug("Mercedes-Benz"), "mercedes-benz");
  assert.equal(dtSlug("C-MAX"), "c-max");
  assert.equal(dtSlug("Land Rover & Co"), "land-rover-and-co");
  assert.equal(dtSlug("  Ram  1500 "), "ram-1500");
  assert.equal(dtSlug("R/T Plus"), "rt-plus");
});

test("photos are built from the stock number and the photo uids, primary first", () => {
  const urls = photoUrls(GRAND_CHEROKEE);
  assert.equal(urls[0], "https://dtstockphotos.azureedge.net/stockitems/1040312886/7b4f2187-efd1-42a2-9553-f4cffca4c3af_Medium.webp");
  assert.equal(urls.length, 3); // the primary is deduped against the gallery
  assert.ok(urls.every((u) => u.endsWith("_Medium.webp")));
  // A record with only the card photo still gets one.
  assert.deepEqual(photoUrls(HORNET_RT), ["https://dtstockphotos.azureedge.net/stockitems/1050218946/ddfc601b-cab1-4fad-a91b-94e79668d4fd_Medium.webp"]);
  assert.deepEqual(photoUrls({ ...GRAND_CHEROKEE, StockNumber: null }), []);
  assert.deepEqual(photoUrls({ ...GRAND_CHEROKEE, PrimaryPhotoJson: "not json", VehiclePhotoJson: "{" }), []);
});

test("a row with no odometer is counted rather than passed over in silence", () => {
  // The used-condition reading rests on the merchant plus the fact that every
  // one of the 7,822 rows carries real mileage (minimum 2,147). A row without
  // one weakens that, so it is surfaced.
  const r = rep();
  const rec = toRecord({ ...GRAND_CHEROKEE, OdometerValue: 0 }, r);
  assert.ok(rec);
  assert.equal(rec.mileage, undefined);
  assert.equal(r.noOdometer, 1);
});

test("a malformed VIN never reaches the feed", () => {
  assert.equal(toRecord({ ...GRAND_CHEROKEE, Vin: "1C4RJYB65N871572" }, rep()), null); // 16 chars
  assert.equal(toRecord({ ...GRAND_CHEROKEE, Vin: "1C4RJYB65N871572I" }, rep()), null); // I is not a VIN letter
  assert.equal(toRecord({ ...GRAND_CHEROKEE, Vin: null }, rep()), null);
});
