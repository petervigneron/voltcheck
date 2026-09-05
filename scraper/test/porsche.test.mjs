import { test } from "node:test";
import assert from "node:assert/strict";
import { porscheNode, isPorschePlatform } from "../lib/platforms/porsche.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { publishedCondition } from "../lib/condition.mjs";

// A structurally faithful node from bend.porsche.com, 2026-09-05: brand and
// manufacturer are bare @id references so the marque is never named, `model`
// is Porsche's internal platform code, `vehicleConfiguration` is the string a
// shopper reads, and itemCondition is a schema.org URL.
const CAR = {
  "@context": "https://schema.org",
  "@id": "https://bend.porsche.com/en/inventory/porsche/porsche-macan-4-electric-new-ABC123#car",
  "@type": ["Car", "Product"],
  name: "2026 Porsche Macan 4 Electric",
  model: "H2",
  color: "Ice Grey Metallic",
  image: "https://images.finder.porsche.com/0e46aaad/960",
  brand: { "@type": "Brand", "@id": "https://www.porsche.com/#brand" },
  mileageFromOdometer: { "@type": "QuantitativeValue", value: 12, unitCode: "SMI" },
  vehicleIdentificationNumber: "WP1AA2XA5TL000182",
  offers: {
    "@type": "Offer",
    url: "https://bend.porsche.com/en/inventory/porsche/porsche-macan-4-electric-new-ABC123",
    price: 97640,
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  vehicleModelDate: "2026-01-01",
  itemCondition: "https://schema.org/NewCondition",
  vehicleEngine: { "@type": "EngineSpecification", fuelType: "ELECTRIC" },
  vehicleConfiguration: "Macan 4 Electric",
  bodyType: "SUV",
};

const ORIGIN = "https://bend.porsche.com";

// Asserted through normalize, not on the node's own fields. The first version of
// this test checked `node.make === "Porsche"` and passed while every car came
// out of the real crawl make-less: normalize.mjs reads
// `text(vehicle.brand ?? vehicle.manufacturer)` and never looks at a `make`
// key. A repair is only a repair where it is read.
test("names the marque the node never names, all the way through normalize", () => {
  const n = porscheNode(CAR, ORIGIN);
  const rec = normalize(n, { sourceUrl: n.offers.url, dealerDomain: "porschebend.com" });
  assert.equal(rec.make, "Porsche");
});

// J1 = Taycan, H1 III = petrol Macan, H2 = electric Macan, E3 II = Cayenne,
// E4 = electric Cayenne. None of that is a model name to anyone but Porsche.
test("model is a nameplate, not the platform code", () => {
  const n = porscheNode(CAR, ORIGIN);
  assert.equal(n.model, "Macan");
  assert.notEqual(n.model, "H2");
});

// Shipped wrong on the first run: the whole configuration went into `model`
// and nothing into trim, so both came out as the same string and the listing
// page rendered "2026 PORSCHE Taycan Taycan, Taycan 4" — one value printed
// twice, which is the copy rule this house breaks most often. The shape below
// is what every other lane already produces for the same cars (another
// rooftop's Macan reaches the database as model "Macan", trim "Macan 4
// Electric"), and this asserts it through normalize because that is where it
// is read.
test("model and trim are the nameplate and the configuration, never the same string", () => {
  for (const [cfg, model] of [
    ["Macan 4 Electric", "Macan"],
    ["Taycan 4S Cross Turismo", "Taycan"],
    ["Cayenne Turbo E-Hybrid Coupe", "Cayenne"],
    ["Panamera 4", "Panamera"],
  ]) {
    const n = porscheNode({ ...CAR, vehicleConfiguration: cfg, name: `2026 Porsche ${cfg}` }, ORIGIN);
    const rec = normalize(n, { sourceUrl: n.offers.url, dealerDomain: "porschebend.com" });
    assert.equal(rec.model, model, cfg);
    assert.equal(rec.trim, cfg, cfg);
    assert.notEqual(rec.model, rec.trim, `${cfg}: model and trim must not be the same string`);
  }
});

// A one-word configuration is the exception that must NOT trip the rule
// above: "Taycan" is both the nameplate and the whole configuration, and
// there is nothing to split.
test("a one-word configuration is left alone", () => {
  const n = porscheNode({ ...CAR, vehicleConfiguration: "Taycan", name: "2025 Porsche Taycan" }, ORIGIN);
  const rec = normalize(n, { sourceUrl: n.offers.url, dealerDomain: "d" });
  assert.equal(rec.model, "Taycan");
  assert.equal(rec.trim, "Taycan");
});

test("condition comes from the machine token, not the URL slug", () => {
  assert.equal(porscheNode(CAR, ORIGIN).itemCondition, "new");
  assert.equal(porscheNode({ ...CAR, itemCondition: "https://schema.org/UsedCondition" }, ORIGIN).itemCondition, "used");
});

// The recorded bug class: an extractor that cannot read a condition must not
// invent one. See lib/condition.mjs.
test("an unreadable condition is left unset, never defaulted to used", () => {
  for (const raw of [undefined, "", "https://schema.org/RefurbishedCondition", "Nuevo"]) {
    const n = porscheNode({ ...CAR, itemCondition: raw }, ORIGIN);
    assert.ok(!("itemCondition" in n), `${JSON.stringify(raw)} should leave condition unset, got ${n.itemCondition}`);
  }
});

test("a node without a real VIN is dropped, not guessed at", () => {
  for (const vin of [undefined, "", "TBD", "WP1AA2XA5TL00018"]) {
    assert.equal(porscheNode({ ...CAR, vehicleIdentificationNumber: vin }, ORIGIN), null);
  }
});

test("the condition survives the whole chain, slug or no slug", () => {
  const n = porscheNode(CAR, ORIGIN);
  const rec = normalize(n, { sourceUrl: n.offers.url, dealerDomain: "porschebend.com" });
  // A slug with no condition word in it: the machine token has to carry it.
  assert.equal(publishedCondition({ condition: rec.condition, sourceUrl: "https://bend.porsche.com/en/inventory/porsche/x-ABC123" }), "new");
});

// THE trap this lane is most likely to get wrong, and the reason it does not
// classify anything itself. "2026 Porsche Macan" is a petrol car and "2026
// Porsche Macan 4 Electric" is not — same nameplate, same page. fuelType is
// the only separator, and `model` cannot help because both are Porsche
// platform codes.
test("a petrol Macan is not an EV, and repairing the node does not make it one", () => {
  const petrol = {
    ...CAR,
    name: "2026 Porsche Macan",
    model: "H1 III",
    vehicleConfiguration: "Macan",
    vehicleIdentificationNumber: "WP1AA2A54TLB07674",
    vehicleEngine: { "@type": "EngineSpecification", fuelType: "PETROL" },
  };
  assert.equal(classifyEv(porscheNode(petrol, ORIGIN)).isEv, false);
});

test("an electric Macan is an EV on the same page", () => {
  const c = classifyEv(porscheNode(CAR, ORIGIN));
  assert.equal(c.isEv, true);
  assert.equal(c.kind, "BEV");
});

test("a Cayenne plug-in hybrid classifies as one", () => {
  const phev = {
    ...CAR,
    name: "2025 Porsche Cayenne Turbo E-Hybrid Coupe",
    model: "E3 II",
    vehicleConfiguration: "Cayenne Turbo E-Hybrid Coupe",
    vehicleIdentificationNumber: "WP1BA2AY5SDA33219",
    vehicleEngine: { "@type": "EngineSpecification", fuelType: "PLUG_IN_HYBRID" },
  };
  const c = classifyEv(porscheNode(phev, ORIGIN));
  assert.equal(c.isEv, true);
  assert.match(String(c.kind), /PHEV/);
});

// If Porsche ever drops fuelType, the bare nameplates must stay out rather
// than be admitted on the strength of a name that covers both cars. This is
// the control test for that, and it is the reason this lane must never
// synthesise a name like "Macan Electric" onto a node that did not say so.
test("with fuelType gone, a bare Macan or Cayenne stays out", () => {
  for (const cfg of ["Macan", "Cayenne", "Cayenne Coupe"]) {
    const n = porscheNode({ ...CAR, name: `2026 Porsche ${cfg}`, vehicleConfiguration: cfg, vehicleEngine: undefined }, ORIGIN);
    assert.equal(classifyEv(n).isEv, false, `${cfg} must not be admitted on its name`);
  }
  // …while the nameplates that ARE electrified in every configuration still are.
  for (const cfg of ["Taycan 4S", "Cayenne Turbo E-Hybrid Coupe"]) {
    const n = porscheNode({ ...CAR, name: `2026 Porsche ${cfg}`, vehicleConfiguration: cfg, vehicleEngine: undefined }, ORIGIN);
    assert.equal(classifyEv(n).isEv, true, `${cfg} is electrified in every configuration`);
  }
});

test("the offer url survives, and is what the listing points at", () => {
  const n = porscheNode(CAR, ORIGIN);
  assert.equal(n.offers.url, CAR.offers.url);
  const rec = normalize(n, { sourceUrl: n.offers.url, dealerDomain: "porschebend.com" });
  assert.equal(rec.vin, "WP1AA2XA5TL000182");
  assert.equal(rec.priceUsd, 97640);
  assert.equal(rec.year, 2026);
});

test("recognises the platform from a page", () => {
  assert.equal(isPorschePlatform('<a href="/en/inventory/porsche/search">Inventory</a><link href="https://www.porsche.com/">'), true);
  assert.equal(isPorschePlatform("<html>an ordinary dealer page</html>"), false);
});
