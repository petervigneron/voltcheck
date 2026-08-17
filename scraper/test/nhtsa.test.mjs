// node --test scraper/test/nhtsa.test.mjs
//
// The cases here are the measurements from 2026-08-17, not invented examples.
// If NHTSA's vocabulary shifts under us these are what should fail first.
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyComplaint,
  cohortKey,
  isBatteryRecall,
  recallCandidates,
  resolveModels,
  verifyRecall,
} from "../lib/nhtsa.mjs";

// NHTSA's actual 2023 Ford complaint vocabulary, trimmed to the interesting rows.
const FORD_2023_C = ["BRONCO", "ESCAPE", "ESCAPE HEV", "MUSTANG", "MUSTANG MACH-E BEV", "TRANSIT VAN BEV"];

test("the Mach-E resolves to the name NHTSA answers to, not the one we spell", () => {
  // "Mustang Mach-E" queried literally returns HTTP 200 and an empty result
  // set — the 2023 cohort read as 0 complaints when the truth was 115.
  assert.deepEqual(resolveModels("Ford", "Mustang Mach-E", FORD_2023_C), ["MUSTANG MACH-E BEV"]);
});

test("a resolved name never bleeds into its petrol namesake", () => {
  assert.deepEqual(resolveModels("Ford", "Mustang", FORD_2023_C), ["MUSTANG"]);
});

test("token-subset matching handles the spacing and punctuation cases", () => {
  assert.deepEqual(resolveModels("Volkswagen", "ID.4", ["ID.4", "GOLF", "ATLAS"]), ["ID.4"]);
  assert.deepEqual(resolveModels("Hyundai", "Ioniq 5", ["IONIQ 5", "IONIQ HYBRID", "KONA ELECTRIC"]), ["IONIQ 5"]);
});

test("an exact name beats the longer names it is a subset of", () => {
  // Audi lists all of these. "e-tron" is a token subset of every one of them,
  // and only one of them is the e-tron.
  const audi = ["E-TRON", "E-TRON GT", "E-TRON S", "Q4 E-TRON", "Q8 E-TRON"];
  assert.deepEqual(resolveModels("Audi", "e-tron", audi), ["E-TRON"]);
  assert.deepEqual(resolveModels("Audi", "Q4 e-tron", audi), ["Q4 E-TRON"]);
});

test("Audi's make prefix is stripped to match, and kept to query", () => {
  // NHTSA's 2023 Audi vocabulary prefixes every name; the 2024 one does not.
  // Without stripping, "Q4 e-tron" ties between the Sportback and the not,
  // and 285 cars go quiet for a spelling difference.
  const audi2023 = ["AUDI E-TRON", "AUDI E-TRON GT", "AUDI Q4 E-TRON", "AUDI Q4 SPORTBACK E-TRON"];
  assert.deepEqual(resolveModels("Audi", "Q4 e-tron", audi2023), ["AUDI Q4 E-TRON"]);
  assert.deepEqual(resolveModels("Audi", "e-tron", audi2023), ["AUDI E-TRON"]);
  // Mercedes-Maybach is not Mercedes-Benz's prefix and must not be stripped:
  // if it were, the Maybach row would tie with the S-Class as a second exact
  // match and put a $200k car's complaints on an S-Class page.
  assert.deepEqual(resolveModels("Mercedes-Benz", "S-Class", ["S-CLASS", "MERCEDES-MAYBACH S-CLASS"]), [
    "S-CLASS",
  ]);
});

test("Tesla's build-and-release rows are one car", () => {
  // Every one of these is the 2023 Model Y; the complaints are unioned by ODI
  // number, not added up.
  const tesla = [
    "MODEL 3",
    "MODEL Y (All Variants)",
    "MODEL Y (ALL VARIANTS) LATER RELEASE",
    "MODEL Y RWD EARLY RELEASE",
    "MODEL Y RWD LATER RELEASE",
    "MODEL X (ALL VARIANTS)",
  ];
  assert.deepEqual(resolveModels("Tesla", "Model Y", tesla), [
    "MODEL Y (All Variants)",
    "MODEL Y (ALL VARIANTS) LATER RELEASE",
    "MODEL Y RWD EARLY RELEASE",
    "MODEL Y RWD LATER RELEASE",
  ]);
  assert.deepEqual(resolveModels("Tesla", "Model 3", tesla), ["MODEL 3"]);
});

test("one survivor is the answer even when it is longer than our name", () => {
  // BMW's only 2023 i4 row. Nothing else in the vocabulary could be an i4.
  assert.deepEqual(resolveModels("BMW", "i4", ["I4 GRAN COUPE", "4 SERIES COUPE", "IX", "XM"]), [
    "I4 GRAN COUPE",
  ]);
});

test("names that differ only by a powertrain word resolve together", () => {
  // NHTSA renames the same car across model years — "IONIQ 5" one year,
  // "IONIQ 5 BEV" the next — and with no exact hit both are the same car.
  assert.deepEqual(resolveModels("Hyundai", "Ioniq 5", ["IONIQ 5 BEV", "IONIQ 5 EV"]).sort(), [
    "IONIQ 5 BEV",
    "IONIQ 5 EV",
  ]);
  // An exact name still wins outright when the vocabulary offers one.
  assert.deepEqual(resolveModels("Kia", "Niro EV", ["NIRO EV", "NIRO ELECTRIC"]), ["NIRO EV"]);
});

test("an ambiguous cohort is unresolved, not a guess", () => {
  // Mercedes files the EQE as a sedan and an SUV; our feed has one "EQE" row
  // holding both. Picking either would be a claim about a car we cannot
  // identify, so the page renders nothing.
  assert.equal(resolveModels("Mercedes-Benz", "EQE", ["EQE 350 SEDAN", "EQE 350 SUV"]), null);
});

test("an unknown model is null and never zero", () => {
  assert.equal(resolveModels("Ford", "Mustang Mach-E", ["BRONCO", "ESCAPE"]), null);
  assert.equal(resolveModels("Tesla", "Models", ["MODEL 3", "MODEL S", "MODEL Y"]), null);
  assert.equal(resolveModels("Ford", "Mustang Mach-E", []), null);
  assert.equal(resolveModels("Ford", "", FORD_2023_C), null);
});

test("the Jeep alias lands on NHTSA's long-wheelbase spelling", () => {
  assert.deepEqual(resolveModels("Jeep", "Wrangler 4xe", ["WRANGLER", "WRANGLER UNLIMITED PHEV"]), [
    "WRANGLER UNLIMITED PHEV",
  ]);
  // NHTSA renamed it for 2024. A missed alias falls through to token
  // matching rather than going quiet...
  assert.deepEqual(
    resolveModels("Jeep", "Wrangler 4xe", ["WRANGLER 2-DOOR", "WRANGLER 4-DOOR", "WRANGLER 4-DOOR 4XE"]),
    ["WRANGLER 4-DOOR 4XE"]
  );
  // ...but never as far as the petrol Wrangler.
  assert.equal(resolveModels("Jeep", "Wrangler 4xe", ["WRANGLER"]), null);
});

test("seat counts and drive codes are trims of one model", () => {
  // Tesla's 2022 Model Y and BMW's 2025 i4, as NHTSA files them. The double
  // space in "MODEL Y  5-SEAT" is NHTSA's, it is the only spelling they have
  // for that row, and collapsing it before querying is an HTTP 400 — so the
  // name comes back exactly as they wrote it.
  assert.deepEqual(resolveModels("Tesla", "Model Y", ["MODEL Y 7-SEAT", "MODEL Y  5-SEAT", "MODEL 3"]), [
    "MODEL Y 7-SEAT",
    "MODEL Y  5-SEAT",
  ]);
  assert.deepEqual(resolveModels("BMW", "i4", ["I4 XDRIVE40", "I4 EDRIVE40", "IX"]), [
    "I4 XDRIVE40",
    "I4 EDRIVE40",
  ]);
  // A performance badge is not a qualifier — "Q8 e-tron" must not collect
  // the petrol Q8's complaints, and no vocabulary word gets it there.
  assert.equal(resolveModels("Audi", "Q8 e-tron", ["Q8", "SQ8"]), null);
});

test("recall candidates vary punctuation and nothing else", () => {
  // The hyphenless spelling is the one the recalls endpoint answers to.
  const c = recallCandidates("Ford", "Mustang Mach-E", ["MUSTANG MACH-E BEV"]);
  assert.ok(c.includes("MUSTANG MACH E"), c.join(", "));
  assert.ok(c.includes("MUSTANG MACH-E BEV"));
  // Never the bare nameplate: that is the petrol car.
  assert.ok(!c.includes("MUSTANG"), c.join(", "));
});

test("recall candidates never drop the word that makes it electric", () => {
  const c = recallCandidates("Hyundai", "Kona Electric", ["KONA ELECTRIC"]);
  assert.ok(!c.includes("KONA"), c.join(", "));
  const p = recallCandidates("Porsche", "Macan Electric", ["MACAN ELECTRIC"]);
  assert.ok(!p.includes("MACAN"), p.join(", "));
  const b = recallCandidates("Chevrolet", "Bolt EV", ["BOLT EV"]);
  assert.ok(!b.includes("BOLT"), b.join(", "));
});

test("a campaign is kept on NHTSA's attribution, not on its prose", () => {
  const candidates = ["MUSTANG MACH-E BEV", "MUSTANG MACH-E", "MUSTANG MACH E"];
  // 25V315000: genuinely a Mach-E recall, but the summary lists the car as
  // "2021-2023 Mach-E" with the Mustang nameplate several commas away.
  assert.equal(
    verifyRecall(candidates, {
      Model: "MUSTANG MACH E",
      Summary: "Ford is recalling certain 2021-2024 Bronco, F-150, 2021-2023 Mach-E, 2024 Ranger, Mustang...",
    }),
    true
  );
  // A campaign NHTSA joined to a different car does not ride in on a loose match.
  assert.equal(verifyRecall(["BOLT EV"], { Model: "BOLT EUV", Summary: "Chevrolet Bolt EUV" }), false);
  assert.equal(verifyRecall(candidates, { Summary: "no Model field" }), false);
});

test("battery complaints need an electrical component AND battery text", () => {
  const packFire = {
    components: "ELECTRICAL SYSTEM",
    summary: "The high voltage battery pack caught fire while parked.",
  };
  assert.deepEqual(classifyComplaint(packFire), { battery: true, pack: true, twelveVolt: false });

  // Brakes are not a battery, whatever the text says.
  assert.deepEqual(classifyComplaint({ components: "SERVICE BRAKES", summary: "battery pack" }), {
    battery: false,
    pack: false,
    twelveVolt: false,
  });
  // Electrical, but about a door lock.
  assert.deepEqual(classifyComplaint({ components: "ELECTRICAL SYSTEM", summary: "The door lock stopped." }), {
    battery: false,
    pack: false,
    twelveVolt: false,
  });
});

test("the little battery is counted apart from the pack", () => {
  const twelveV = {
    components: "ELECTRICAL SYSTEM",
    summary: "The 12V battery died and the charging system would not wake the car.",
  };
  assert.deepEqual(classifyComplaint(twelveV), { battery: true, pack: false, twelveVolt: true });

  // The ICCU failures kill the 12V battery FROM the high-voltage side — that
  // is a pack-side repair and belongs on the pack side of the count.
  const iccu = {
    components: "ELECTRICAL SYSTEM",
    summary: "The ICCU failed, which stopped charging the 12 volt battery.",
  };
  assert.deepEqual(classifyComplaint(iccu), { battery: true, pack: true, twelveVolt: false });
});

test("recalls classify off their own component and summary", () => {
  assert.equal(
    isBatteryRecall({
      Component: "ELECTRICAL SYSTEM:PROPULSION SYSTEM:TRACTION BATTERY",
      Summary: "The high voltage battery may fail.",
    }),
    true
  );
  assert.equal(
    isBatteryRecall({ Component: "VISIBILITY:WINDSHIELD WIPER/WASHER:MOTOR", Summary: "The wiper motor." }),
    false
  );
  // Power train is in the component gate, but a differential is not a battery.
  assert.equal(
    isBatteryRecall({
      Component: "POWER TRAIN:DRIVELINE:DIFFERENTIAL UNIT",
      Summary: "The rear axle bolts may loosen.",
    }),
    false
  );
});

test("cohort keys fold the capitalisation the dealers disagree about", () => {
  assert.equal(cohortKey("Nissan", "ARIYA", 2024), cohortKey("Nissan", "Ariya", 2024));
  assert.equal(cohortKey("Tesla", "Model Y", 2023), "TESLA|MODEL Y|2023");
});
