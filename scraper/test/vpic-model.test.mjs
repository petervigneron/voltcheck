import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedModelFromVpic, VPIC_BADGE_ALIASES } from "../lib/vpic-model.mjs";

const BEV = "BEV (Battery Electric Vehicle)";
const PHEV = "PHEV (Plug-in Hybrid Electric Vehicle)";

test("the badge vPIC strips comes back, and only when the decode says the car is electrified", () => {
  // Real decodes, 2026-09-09, ultimatems.com VINs.
  assert.equal(feedModelFromVpic({ Make: "CHEVROLET", Model: "Equinox", ElectrificationLevel: BEV }), "Equinox EV");
  assert.equal(feedModelFromVpic({ Make: "MERCEDES-BENZ", Model: "EQE-Class SUV", ElectrificationLevel: BEV }), "EQE SUV");
  assert.equal(feedModelFromVpic({ Make: "MERCEDES-BENZ", Model: "EQE-Class Sedan", ElectrificationLevel: BEV }), "EQE");
  assert.equal(feedModelFromVpic({ Make: "MERCEDES-BENZ", Model: "EQS-Class Sedan", ElectrificationLevel: BEV }), "EQS");
  assert.equal(feedModelFromVpic({ Make: "VOLVO", Model: "XC40", ElectrificationLevel: BEV }), "XC40 Recharge Pure Electric");
  assert.equal(feedModelFromVpic({ Make: "VOLVO", Model: "XC90", ElectrificationLevel: PHEV }), "XC90 Plug-In Hybrid");
  // A petrol Equinox decodes with the level EMPTY (vpicEvAlias.ts control
  // test, 2026-08-30) and keeps the petrol name; a strong hybrid is not a plug-in.
  assert.equal(feedModelFromVpic({ Make: "CHEVROLET", Model: "Equinox", ElectrificationLevel: "" }), "Equinox");
  assert.equal(feedModelFromVpic({ Make: "KIA", Model: "Niro", ElectrificationLevel: "Strong HEV (Hybrid Electric Vehicle)" }), "Niro");
  // The wrong level for the alias is no alias.
  assert.equal(feedModelFromVpic({ Make: "VOLVO", Model: "XC90", ElectrificationLevel: BEV }), "XC90");
});

test("vPIC's own extra words come off; everything else passes through as written", () => {
  assert.equal(feedModelFromVpic({ Make: "NISSAN", Model: "Ariya Hatchback", ElectrificationLevel: BEV }), "Ariya");
  assert.equal(feedModelFromVpic({ Make: "TOYOTA", Model: "Prius Prime (PHEV)", ElectrificationLevel: PHEV }), "Prius Prime");
  assert.equal(feedModelFromVpic({ Make: "CADILLAC", Model: "Vistiq", ElectrificationLevel: BEV }), "Vistiq");
  assert.equal(feedModelFromVpic({ Make: "CADILLAC", Model: "Lyriq", ElectrificationLevel: BEV }), "Lyriq");
  assert.equal(feedModelFromVpic({ Make: "BMW", Model: "iX", ElectrificationLevel: BEV }), "iX");
  assert.equal(feedModelFromVpic({ Make: "ALFA ROMEO", Model: "Tonale", ElectrificationLevel: PHEV }), "Tonale");
  assert.equal(feedModelFromVpic({ Make: "PORSCHE", Model: "Macan", ElectrificationLevel: BEV }), "Macan");
  // A blank Model is a real answer with nothing in it.
  assert.equal(feedModelFromVpic({ Make: "TOYOTA", Model: "", ElectrificationLevel: "" }), undefined);
  assert.equal(feedModelFromVpic(undefined), undefined);
});

// ── Keep in step with web/lib/enrichment/vpicEvAlias.ts ────────────────────
//
// The /vin/ page's table lists every corpus row a decode may answer to; this
// lane's table lists the decodes whose feed spelling is ONE string. Read as
// text rather than imported: the scraper runs plain Node 22 in CI and takes
// no dependency on the web lane's TypeScript.
const WEB = readFileSync(new URL("../../web/lib/enrichment/vpicEvAlias.ts", import.meta.url), "utf8");
const webMap = new Map();
for (const m of WEB.matchAll(/^\s*"([A-Z0-9 |\-.()+']+)":\s*\[([^\]]*)\]/gm)) {
  webMap.set(m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

// Deliberately not in this lane's table: the web lists more than one row for
// the decode (a matcher with the VIN can choose; a nameplate cannot), or the
// one row it lists is a version name, not the nameplate.
const OMITTED = new Set([
  "AUDI|Q8|BEV", "AUDI|A6|BEV", "LEXUS|ES|BEV", "LEXUS|RZ|BEV", "TOYOTA|PRIUS|PHEV",
  "FERRARI|296|PHEV", "FERRARI|SF90|PHEV",
  "MERCEDES-BENZ|GLC-CLASS|PHEV", "MERCEDES-BENZ|GLE-CLASS|PHEV", "MERCEDES-BENZ|C-CLASS|PHEV", "MERCEDES-BENZ|E-CLASS|PHEV",
  "MINI|COUNTRYMAN|PHEV",
  // The web lists every E-Hybrid grade for a bare "Cayenne" decode; the VIN
  // descriptor chooses between them there, a nameplate cannot.
  "PORSCHE|CAYENNE|PHEV", "PORSCHE|CAYENNE COUPE|PHEV", "PORSCHE|CAYENNE E-HYBRID|PHEV", "PORSCHE|CAYENNE E-HYBRID COUPE|PHEV",
]);

test("every badge alias here is one the /vin/ page also makes, and every one it makes is here or deliberately not", () => {
  assert.ok(webMap.size >= 40, `parsed only ${webMap.size} entries from vpicEvAlias.ts — has its shape changed?`);
  for (const [key, feed] of Object.entries(VPIC_BADGE_ALIASES)) {
    assert.ok(webMap.has(key), `${key} is not in web/lib/enrichment/vpicEvAlias.ts`);
    assert.ok(webMap.get(key).includes(feed), `${key} → ${JSON.stringify(feed)} is not one of the web's ${JSON.stringify(webMap.get(key))}`);
  }
  for (const [key, rows] of webMap) {
    if (key in VPIC_BADGE_ALIASES) {
      assert.ok(!OMITTED.has(key), `${key} is both aliased and listed as omitted`);
      continue;
    }
    assert.ok(OMITTED.has(key), `${key} → ${JSON.stringify(rows)} was added to vpicEvAlias.ts: alias it here or add it to OMITTED with the reason`);
  }
  for (const key of OMITTED) assert.ok(webMap.has(key), `OMITTED lists ${key}, which the web no longer has`);
});
