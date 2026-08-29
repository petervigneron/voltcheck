import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyEv,
  EV_MODEL_RE,
  fuelTextOnly,
  nameplateVouches,
  phevNameplate,
  PHEV_MODEL_RE,
  PHEV_NAME_CLAIM_RE,
  vpicConfirmsBev,
  vpicConfirmsPhev,
  vpicRefutesEv,
} from "../lib/ev.mjs";

// Why these exist (2026-08-23): dealer.com and DealerOn — ~94% of the crawl —
// declare a Jeep Wrangler 4xe with fuelType "Hybrid", the same string a CR-V
// Hybrid gets, and classifyEv returned { isEv: false } for every one. The
// feed carried ~4,500 plug-in hybrids against ~46,700 on Autotrader. The
// failure mode to guard against in the other direction is THE failure mode
// of this site: a conventional hybrid shipped as a plug-in. So every positive
// below is paired with the nearest non-plug-in that must not match.

// ── The nameplate regex ──────────────────────────────────────────────────

// Each of these is certified "Plug-in Hybrid" by EPA's fueleconomy.gov
// vehicles.csv (checked by make/model/year on 2026-08-23). Names are written
// the way dealer titles write them, not the way EPA does.
const PLUG_INS = [
  "2024 Jeep Wrangler 4xe Rubicon",
  "2023 Jeep Grand Cherokee 4xe Overland",
  "2022 Chrysler Pacifica Hybrid Pinnacle",
  "2024 Dodge Hornet R/T Plus",
  "2024 Alfa Romeo Tonale Veloce eAWD",
  "2023 Toyota Prius Prime XSE",
  "2023 Toyota RAV4 Prime SE",
  "2024 Lexus NX 450h+ Luxury",
  "2025 Lexus RX 450h+",
  "2025 Lexus RX450h+ Luxury",
  "2025 Lexus TX 550h+ Luxury",
  "2019 Honda Clarity Plug-In Hybrid Touring",
  "2018 Ford Fusion Energi Titanium",
  "2016 Ford C-Max Energi SEL",
  "2023 Lincoln Corsair Grand Touring",
  "2021 Lincoln Aviator Grand Touring",
  "2017 Chevrolet Volt Premier",
  "2014 Cadillac ELR",
  "2022 BMW 330e xDrive",
  "2023 BMW 530e",
  "2025 BMW 550e xDrive",
  "2021 BMW 745e xDrive",
  "2025 BMW 750e xDrive",
  "2018 BMW 740Le xDrive iPerformance",
  "2021 BMW X3 xDrive30e",
  "2023 BMW X5 xDrive45e",
  "2025 BMW X5 xDrive50e",
  "2017 BMW X5 xDrive40e",
  "2023 BMW XM",
  "2019 BMW i8 Roadster",
  "2017 Mercedes-Benz C 350e",
  "2016 Mercedes-Benz S 550e",
  "2020 Mercedes-Benz S560e",
  "2023 Mercedes-Benz S 580e 4MATIC",
  "2019 Mercedes-Benz GLC 350e 4MATIC",
  "2025 Mercedes-Benz GLE 450e 4MATIC",
  "2017 Mercedes-Benz GLE 550e 4MATIC",
  "2025 Mercedes-Benz AMG GT 63 S E Performance",
  "2025 Mercedes-Benz AMG S 63 E Performance",
  "2023 Audi Q5 55 TFSI e quattro",
  "2022 Audi A7 55 TFSI e",
  "2021 Audi A8 L 60 TFSI e",
  "2022 Porsche Cayenne E-Hybrid",
  "2021 Porsche Panamera 4S E-Hybrid Sport Turismo",
  "2015 Porsche 918 Spyder",
  "2021 Volvo XC90 T8 Inscription",
  "2023 Volvo XC60 Recharge Plug-In Hybrid",
  "2022 Volvo S60 T8 Recharge",
  "2020 Volvo V60 T8 Polestar Engineered",
  "2021 Volvo S90 T8 Inscription",
  "2021 Polestar 1",
  "2021 Land Rover Range Rover P400e",
  "2023 Land Rover Range Rover Sport P440e",
  "2024 Land Rover Range Rover P550e",
  "2022 MINI Cooper S E Countryman ALL4",
  "2020 MINI Cooper SE Countryman ALL4",
  "2021 Bentley Bentayga Hybrid",
  "2023 Bentley Flying Spur Hybrid",
  "2022 Ferrari SF90 Stradale",
  "2023 Ferrari 296 GTB",
  "2023 McLaren Artura",
  "2015 McLaren P1",
  "2025 Lamborghini Urus SE",
  "2020 Karma Revero GT",
  "2021 Karma GS-6",
  "2012 Fisker Karma EcoSport",
];

test("PHEV_MODEL_RE matches every verified plug-in nameplate", () => {
  for (const n of PLUG_INS) assert.ok(PHEV_MODEL_RE.test(n), `should match: ${n}`);
});

// The nearest non-plug-in neighbour of each entry above. A match here is the
// exact false claim this lane exists to prevent.
const NOT_PLUG_INS = [
  "2024 Honda CR-V Hybrid Sport",
  "2023 Toyota RAV4 Hybrid XLE",
  "2023 Toyota Prius LE",
  "2022 Toyota Prius Two Eco",
  "2023 Volvo XC40 Recharge Twin",      // BEV — lives in EV_MODEL_RE, not here
  "2023 Volvo C40 Recharge",            // BEV
  "2023 Volvo XC40 B5 AWD Plus",        // mild hybrid
  "2022 Volvo XC90 B6 Inscription",     // mild hybrid (no T8)
  "2024 MINI Cooper SE",                // BEV hatch
  "2025 MINI Countryman SE ALL4",       // 2025 BEV (EV_MODEL_RE's, not ours)
  "2022 MINI Cooper S Countryman ALL4", // petrol
  "2019 Lexus RX 450h",                 // conventional hybrid, no plus
  "2020 Lexus RX 450hL",
  "2024 Lexus NX 350h Premium",
  "2024 Lexus TX 500h F Sport",
  "2024 Lexus RX 500h F Sport",
  "2023 BMW 330i xDrive",
  "2023 BMW 530i",
  "2024 BMW X5 xDrive40i",
  "2023 BMW X3 xDrive30i",
  "2023 BMW 760i xDrive",               // mild hybrid
  "2023 BMW M5 Competition",            // petrol (the 2025+ M5 is the plug-in)
  "2023 BMW iX xDrive50",               // BEV
  "2022 Mercedes-Benz C 300",
  "2023 Mercedes-Benz S 580 4MATIC",    // mild hybrid, no e
  "2024 Mercedes-Benz GLE 450 4MATIC",
  "2024 Mercedes-Benz GLC 300 4MATIC",
  "2023 Mercedes-Benz AMG E 53 4MATIC+", // 48V mild hybrid
  "2023 Audi Q5 45 TFSI quattro",
  "2023 Audi Q5 TFSI engine",
  "2023 Porsche Cayenne S",
  "2023 Porsche Panamera 4",
  "2023 Land Rover Range Rover P400 SE", // mild hybrid, no e
  "2024 Land Rover Range Rover Sport P530",
  "2025 Alfa Romeo Tonale Veloce",       // 2.0T petrol
  "2024 Dodge Hornet GT",
  "2023 Chrysler Pacifica Touring L",
  "2023 Jeep Wrangler Rubicon 392",
  "2021 Ram 1500 Big Horn 48-Volt eTorque",
  "2021 Ram 1500 Laramie 48 Volt Mild Hybrid",
  "2023 Lincoln Corsair Reserve",
  "2023 Lincoln Aviator Reserve",
  "2024 Ford Escape ST-Line",
  "2020 Ford Fusion Hybrid SE",
  "2024 Bentley Bentayga EWB",
  "2023 Bentley Flying Spur V8",
  "2024 Lamborghini Urus S",
  "2024 Lamborghini Revuelto",           // EPA atvType "Hybrid" — rejected
  "2022 Lexus GS 350",                   // not a GS-6
  "2026 Subaru Crosstrek Hybrid",        // conventional hybrid; the 2019-23 car is year-gated
  "2024 Subaru Crosstrek Premium",
  "2023 Tesla Model 3",
  "2024 Chevrolet Bolt EUV",
  "2023 Toyota Matrix",
  "2026 Lexus RZ 550e F Sport",           // BEV sharing BMW's 550e number
  "2026 LEXUS RZ 450e RZ 550e F SPORT",
];

test("PHEV_MODEL_RE matches none of the nearest non-plug-ins", () => {
  for (const n of NOT_PLUG_INS) assert.ok(!PHEV_MODEL_RE.test(n), `must not match: ${n}`);
});

test("the year-gated nameplates match only inside their plug-in years", () => {
  assert.equal(phevNameplate("Subaru Crosstrek Hybrid", 2019), true);
  assert.equal(phevNameplate("Subaru Crosstrek Hybrid", 2022), true); // EPA hole, adjudicated kept
  assert.equal(phevNameplate("Subaru Crosstrek Hybrid", 2023), true);
  assert.equal(phevNameplate("Subaru Crosstrek Hybrid", 2026), false);
  assert.equal(phevNameplate("Subaru Crosstrek Hybrid", 2016), false); // XV Crosstrek Hybrid, conventional
  assert.equal(phevNameplate("Subaru Crosstrek Hybrid", undefined), false); // no year = abstain
  assert.equal(phevNameplate("BMW M5", 2025), true);
  assert.equal(phevNameplate("BMW M5 Competition", 2023), false);
  assert.equal(phevNameplate("Bentley Continental GT Speed", 2025), true);
  assert.equal(phevNameplate("Bentley Continental GTC", 2026), true);
  assert.equal(phevNameplate("Bentley Continental GT V8", 2023), false);
  assert.equal(phevNameplate("Bentley Flying Spur", 2025), true);
  assert.equal(phevNameplate("Bentley Flying Spur V8", 2023), false);
  assert.equal(phevNameplate("Mercedes-Benz AMG E 53 Hybrid 4MATIC+", 2025), true);
  assert.equal(phevNameplate("Mercedes-Benz AMG E 53 4MATIC+", 2021), false);
});

test("a plug-in claim made in the car's own name is recognised (and is not a nameplate)", () => {
  for (const n of [
    "2024 Hyundai Tucson Plug-In Hybrid Limited",
    "2023 Kia Sorento Plug-in Hybrid SX",
    "2024 Mitsubishi Outlander PHEV SEL",
    "2024 Mazda CX-90 PHEV Premium Plus",
    "2023 Ford Escape Plug-In Hybrid",
    "2018 Hyundai Ioniq Plug-in Hybrid",
    "2014 Honda Accord Plug-In",
    "2025 Toyota Prius Plug-in Hybrid SE",
  ]) {
    assert.ok(PHEV_NAME_CLAIM_RE.test(n), `claim in name: ${n}`);
    // The generic token never vouches on its own — that is the same party's
    // claim as the fuel field, not an independent one.
    assert.equal(nameplateVouches({ name: n, year: 2024 }), false, `must not vouch: ${n}`);
  }
  assert.ok(!PHEV_NAME_CLAIM_RE.test("2024 Hyundai Tucson Hybrid Limited"));
  assert.ok(!PHEV_NAME_CLAIM_RE.test("2024 Kia Niro EX Hybrid"));
});

// ── classifyEv: the fuel-string rule ─────────────────────────────────────

test("an explicit plug-in fuel string is a high-confidence PHEV", () => {
  for (const fuel of ["Plug-In Hybrid", "plug in hybrid", "PHEV", "Plug-in Gas/Electric Hybrid", "Plug-In Electric/Gas", "Plug-in Electric"]) {
    const c = classifyEv({ fuelType: fuel, name: "2022 Hyundai Tucson", model: "Tucson" });
    assert.deepEqual(c, { isEv: true, kind: "PHEV", confidence: "high" }, fuel);
  }
});

test('"Hybrid" alone is still not an EV', () => {
  for (const fuel of ["Hybrid", "Gas/Electric Hybrid", "Hybrid Fuel", "Gasoline Hybrid"]) {
    assert.deepEqual(classifyEv({ fuelType: fuel, name: "2024 Honda CR-V Hybrid", model: "CR-V Hybrid" }), { isEv: false }, fuel);
  }
  assert.deepEqual(classifyEv({ fuelType: "Hybrid", name: "2023 Toyota Prius LE", model: "Prius" }), { isEv: false });
  assert.deepEqual(classifyEv({ fuelType: "Gas/Electric Hybrid", name: "2023 Toyota RAV4 Hybrid", model: "RAV4 Hybrid" }), { isEv: false });
});

test("the live 4xe case: fuelType Hybrid + a plug-in nameplate is a PHEV? name match, never high", () => {
  // dealer.com's record for every Wrangler / Grand Cherokee 4xe on
  // lhmdenverjeep.com and lhmcoloradojeep.com (2026-08-23).
  const c = classifyEv({ fuelType: "Hybrid", vehicleEngine: { fuelType: "Hybrid" }, name: "2024 Jeep Wrangler 4xe Sahara", model: "Wrangler 4xe", vehicleModelDate: "2024" });
  assert.deepEqual(c, { isEv: true, kind: "PHEV?", confidence: "name_match" });
  // The badge is often only in the trim.
  const t = classifyEv({ fuelType: "Hybrid", name: "2023 Jeep Grand Cherokee", model: "Grand Cherokee", vehicleConfiguration: "4xe Overland", vehicleModelDate: "2023" });
  assert.deepEqual(t, { isEv: true, kind: "PHEV?", confidence: "name_match" });
});

test("a hybrid fuel string no longer refutes a BEV nameplate outright — it asks vPIC", () => {
  // An Optiq a dealer tagged "Gas/Electric Hybrid": the old rule returned
  // not-an-EV before the nameplate was ever consulted. It is still not
  // admitted at high confidence — vPIC has to settle it.
  const c = classifyEv({ fuelType: "Gas/Electric Hybrid", name: "2026 Cadillac OPTIQ Sport", model: "OPTIQ" });
  assert.deepEqual(c, { isEv: true, kind: "BEV?", confidence: "name_match" });
});

test("the BEV list wins when a name is on both (2025 Countryman SE is EV_MODEL_RE's)", () => {
  const c = classifyEv({ fuelType: "Hybrid", name: "2025 MINI Countryman SE ALL4", model: "Countryman SE", vehicleModelDate: "2025" });
  assert.equal(c.kind, "BEV?");
});

test("EV_MODEL_RE's ID.4 token is anchored: a Sequoia Hybrid 4WD is not an ID.4", () => {
  // 167 rows of one crawl matched the unanchored "id\.? ?4" through the tail
  // of "Hybrid 4WD" / "E-Hybrid 4" / "Hybrid 4MATIC" (2026-08-23).
  for (const n of ["2024 Toyota Sequoia Hybrid 4WD", "2023 Ford F-150 Hybrid 4x4", "2026 Porsche Panamera E-Hybrid 4", "2024 Mercedes-Benz GLE 450 Hybrid 4MATIC"]) {
    assert.ok(!EV_MODEL_RE.test(n), `must not match EV_MODEL_RE: ${n}`);
  }
  for (const n of ["2024 Volkswagen ID.4 Pro S", "2023 VW ID4", "2025 Volkswagen ID. Buzz Pro S", "2025 VW ID.Buzz"]) {
    assert.ok(EV_MODEL_RE.test(n), `must match EV_MODEL_RE: ${n}`);
  }
});

test("the BEV controls still classify as before", () => {
  assert.deepEqual(classifyEv({ fuelType: "Electric", name: "2024 MINI Cooper SE", model: "Cooper SE" }), { isEv: true, kind: "BEV", confidence: "high" });
  assert.equal(classifyEv({ fuelType: "Hybrid", name: "2023 Volvo XC40 Recharge", model: "XC40 Recharge" }).kind, "BEV?");
  assert.deepEqual(classifyEv({ fuelType: "Gas/Electric Hybrid", name: "2023 Tesla Model 3", model: "Model 3", vehicleIdentificationNumber: "5YJ3E1EA7KF000000" }), { isEv: true, kind: "BEV", confidence: "high" });
});

// ── The intake gate ──────────────────────────────────────────────────────

test("a plug-in nameplate vouches a dealer's explicit plug-in fuel claim, a generic token does not", () => {
  const fourXe = { vin: "1C4JJXP60PW000000", make: "Jeep", model: "Wrangler 4xe", trim: "Rubicon", year: 2023, evConfidence: "high" };
  assert.equal(nameplateVouches(fourXe), true);
  assert.equal(fuelTextOnly(fourXe), false);
  // Dealer says "Plug-In Hybrid" on a Tucson Plug-In Hybrid: the name carries
  // the same claim, not a second source, so vPIC is still asked.
  const tucson = { vin: "KM8JFDA24PU000000", make: "Hyundai", model: "Tucson Plug-In Hybrid", year: 2023, evConfidence: "high" };
  assert.equal(fuelTextOnly(tucson), true);
  // A year-gated nameplate with no year cannot vouch.
  const crosstrek = { vin: "JF2GTDNC0K0000000", make: "Subaru", model: "Crosstrek Hybrid", evConfidence: "high" };
  assert.equal(fuelTextOnly(crosstrek), true);
  assert.equal(fuelTextOnly({ ...crosstrek, year: 2020 }), false);
  assert.equal(fuelTextOnly({ ...crosstrek, year: 2026 }), true);
});

test("a PHEV? name match is never admitted by ingest's gate without vPIC", () => {
  // Mirror of ingest.mjs's first two filters, same as ev-vouching.test.mjs.
  const admits = (r) => r.evConfidence === "high" && (!fuelTextOnly(r) || r.evVpicAsked === true);
  assert.equal(admits({ vin: "1C4JJXP60PW000000", make: "Jeep", model: "Wrangler 4xe", year: 2023, evKind: "PHEV?", evConfidence: "name_match" }), false);
});

// ── What a vPIC decode proves ────────────────────────────────────────────

const PHEV_ROW = { ElectrificationLevel: "PHEV (Plug-in Hybrid Electric Vehicle)", FuelTypePrimary: "Gasoline", FuelTypeSecondary: "Electric" };
const BEV_ROW = { ElectrificationLevel: "BEV (Battery Electric Vehicle)", FuelTypePrimary: "Electric", FuelTypeSecondary: "" };
const STRONG_HEV_ROW = { ElectrificationLevel: "Strong HEV (Hybrid Electric Vehicle)", FuelTypePrimary: "Gasoline", FuelTypeSecondary: "Electric" };
const MILD_HEV_ROW = { ElectrificationLevel: "Mild HEV (Hybrid Electric Vehicle)", FuelTypePrimary: "Gasoline", FuelTypeSecondary: "" };
const PETROL_ROW = { ElectrificationLevel: "", FuelTypePrimary: "Gasoline", FuelTypeSecondary: "" };
const BLANK_ROW = { ElectrificationLevel: "", FuelTypePrimary: "", FuelTypeSecondary: "" };
const AMBIGUOUS_ROW = { ElectrificationLevel: "", FuelTypePrimary: "Electric", FuelTypeSecondary: "Gasoline" };

test("vPIC confirms a plug-in only on an affirmative PHEV level", () => {
  assert.equal(vpicConfirmsPhev(PHEV_ROW), true);
  assert.equal(vpicConfirmsPhev(BEV_ROW), false);
  assert.equal(vpicConfirmsPhev(STRONG_HEV_ROW), false);
  assert.equal(vpicConfirmsPhev(MILD_HEV_ROW), false);
  assert.equal(vpicConfirmsPhev(BLANK_ROW), false);
  // Electric+Gasoline with no level is what a conventional hybrid can report
  // too — silence, not agreement.
  assert.equal(vpicConfirmsPhev(AMBIGUOUS_ROW), false);
  assert.equal(vpicConfirmsBev(AMBIGUOUS_ROW), false);
});

test("a conventional hybrid that carried a plug-in string is demoted by vPIC", () => {
  // A CR-V Hybrid whose dealer fuel field said "Plug-In Hybrid": classifyEv
  // takes the dealer's word (high), fuelTextOnly sends it to vPIC, and the
  // Strong HEV level refutes it. Mild HEV the same (736/736 control, 08-22).
  const c = classifyEv({ fuelType: "Plug-In Hybrid", name: "2024 Honda CR-V Hybrid", model: "CR-V Hybrid" });
  assert.equal(c.confidence, "high");
  assert.equal(fuelTextOnly({ vin: "7FARS6H90RE000000", make: "Honda", model: "CR-V Hybrid", evConfidence: "high" }), true);
  assert.equal(vpicRefutesEv(STRONG_HEV_ROW), true);
  assert.equal(vpicRefutesEv(MILD_HEV_ROW), true);
  assert.equal(vpicRefutesEv(PETROL_ROW), true);
  // And the real plug-in survives the same check.
  assert.equal(vpicRefutesEv(PHEV_ROW), false);
  assert.equal(vpicRefutesEv(BEV_ROW), false);
  // A blank decode proves nothing either way.
  assert.equal(vpicRefutesEv(BLANK_ROW), false);
});

test("a Lexus RZ 550e stays a BEV however many times the badge repeats", () => {
  // PHEV_MODEL_RE's `(?<!\brz ?)` reads exactly one character of context in
  // front of the badge, and the feed does not send the badge once. Dealers
  // file this car as model "RZ 550e" with trim "550e F Sport", so a name
  // joined from make+model+trim carries "550e" twice and the second copy has
  // "550e " in front of it. One live 2026 car reached web/'s cross-kind guard
  // that way on 2026-08-29, reported as a plug-in wearing a battery-electric
  // row. It is a BEV wearing its own correct row; phevNameplate vetoes the
  // whole string, so this holds wherever the badge lands.
  for (const n of [
    "Lexus RZ 550e 550e F Sport",
    "LEXUS RZ 550e 550e F SPORT",
    "2026 Lexus RZ 550e Premium 550e",
    "Lexus RZ 550e F Sport",
    "Lexus RZ550e",
  ]) {
    assert.equal(phevNameplate(n, 2026), false, `must not be a plug-in: ${n}`);
  }
  // And the badge it collides with still fires. Dropping BMW's number pattern
  // to settle this would have cost all four of these.
  for (const n of ["BMW 550e xDrive", "BMW 530e", "BMW 330e xDrive", "BMW 750e xDrive"]) {
    assert.equal(phevNameplate(n, 2026), true, `must be a plug-in: ${n}`);
  }
});
