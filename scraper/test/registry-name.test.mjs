// lib/registry-name.mjs: a seller name for a car whose page stated none, from
// its rooftop's registry entry — only a rooftop's, only a name the domain
// itself spells out, and never over the name the listing gave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dealerNameFor, nameAgreesWithDomain, registryRooftopNames } from "../lib/registry-name.mjs";

test("a name every word of which the domain spells out is accepted", () => {
  for (const [name, domain] of [
    ["Lou Fusz Kia", "loufuszkia.com"],
    ["Toyota of Downtown LA", "toyotaofdowntownla.com"],
    ["SEWELL CADILLAC", "sewellcadillac-houston.com"],
    ["Rairdon's Kia", "rairdonkia.com"],
    ["Elmhurst Ford", "fordelmhurst.com"],
    ["Labelle Dodge Chrysler Jeep, Inc.", "labelledodgechryslerjeep.com"],
    ["Recharged", "www.recharged.com"],
  ]) {
    assert.equal(nameAgreesWithDomain(name, domain), true, `${name} on ${domain}`);
  }
});

// Each of these is a real registry entry, 2026-11-18.
test("a page title, a bare make, a legal entity, another rooftop's name, a fragment or a dba is refused", () => {
  for (const [name, domain] of [
    ["Dealership Website", "mearsmazda.com"],
    ["Ford", "porcaroford.com"],
    ["Toyota Motors", "toyotamotorsdirect.com"],
    ["FLORIDA MAG ENTERPRISES INC", "griecocars.com"],
    ["Courtesy Chevrolet - San Diego", "courtesyinfinitioftucson.com"],
    ["THOMPSON BUICK GMC", "thompsoncadillacraleigh.com"],
    ["EVERETT CADILLAC", "hickorycadillac.com"],
    ["Big Valley Ford", "geeautomotive.com"],
    ["GERMAIN OF NORTH NAPLES, LLC", "germain.com"],
    ["Manly Hyundai Dba Genesis Ofsanta Rosa", "manlyhyundaidbagenesis.com"],
    ["Car World", "carworldautomotive.com"],
    ["", "loufuszkia.com"],
    ["Lou Fusz Kia", ""],
    ["Lou Fusz Kia", "localhost"],
  ]) {
    assert.equal(nameAgreesWithDomain(name, domain), false, `${name} on ${domain}`);
  }
});

test("only rooftop entries are read; a group, a dealer or an etailer entry never names a car; a doubled domain is left out", () => {
  const names = registryRooftopNames({
    sites: [
      { domain: "loufuszkia.com", name: "Lou Fusz Kia", kind: "rooftop" },
      { domain: "sewellcadillac.com", name: "Sewell Cadillac", kind: "group" },
      { domain: "porcaroford.com", name: "Porcaro Ford", kind: "dealer" },
      { domain: "recharged.com", name: "Recharged", kind: "etailer" },
      { domain: "mearsmazda.com", name: "Dealership Website", kind: "rooftop" },
      { domain: "fergusonkia.com", name: "Ferguson Kia", kind: "rooftop" },
      { domain: "fergusonkia.com", name: "Ferguson Kia", kind: "group" },
      { domain: "noname.com", kind: "rooftop" },
    ],
  });
  assert.deepEqual([...names], [["loufuszkia.com", "Lou Fusz Kia"]]);
});

test("the listing's own name always wins; the registry fills only an empty one; nothing is overwritten", () => {
  const names = new Map([["loufuszkia.com", "Lou Fusz Kia"]]);
  assert.equal(dealerNameFor("Lou Fusz Kia St. Louis", "loufuszkia.com", names), "Lou Fusz Kia St. Louis");
  assert.equal(dealerNameFor("Somebody Else Motors", "loufuszkia.com", names), "Somebody Else Motors");
  assert.equal(dealerNameFor(undefined, "loufuszkia.com", names), "Lou Fusz Kia");
  assert.equal(dealerNameFor("", "loufuszkia.com", names), "Lou Fusz Kia");
  assert.equal(dealerNameFor("   ", "loufuszkia.com", names), "Lou Fusz Kia");
  assert.equal(dealerNameFor(undefined, "otherdealer.com", names), undefined);
  assert.equal(dealerNameFor(undefined, undefined, names), undefined);
});

// ingest.mjs ships with REGISTRY_NAME_FILL off and an empty map. That has to
// write exactly what ingest wrote before this file existed, or every row's
// payload changes and the nightly rewrites it (migration 0025).
test("with the fill switched off (empty map), every stated value passes through untouched", () => {
  const off = new Map();
  for (const v of [undefined, "", "   ", "Lou Fusz Kia"]) {
    assert.equal(dealerNameFor(v, "loufuszkia.com", off), v);
  }
});
