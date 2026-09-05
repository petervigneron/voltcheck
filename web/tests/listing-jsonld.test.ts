// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/listing-jsonld.test.ts
//
// The listing page's schema.org node is read by machines only, which means
// nothing on the page corrects it. Every guard below is a claim the page
// itself refuses to make unqualified — an unconfirmed price, a zero odometer,
// a manufacturer's simulated range wearing the EPA's name, an estimated pack
// size with no "est" on it, a heat-pump answer of "verify" — and each one
// would read as a fact if it escaped into the markup.
import test from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "@/lib/listings/enrich";
import { listingJsonLd, hubItemListJsonLd } from "@/lib/listings/jsonLd";
import type { Listing } from "@/lib/listings/types";

const base: Listing = {
  id: "1g1fz6ev2vf100001",
  vin: "1G1FZ6EV2VF100001",
  year: 2023,
  make: "Chevrolet",
  model: "Bolt EUV",
  trim: "LT",
  drive: "FWD",
  priceUsd: 21_500,
  mileage: 18_400,
  city: "Denver",
  state: "CO",
  sellerType: "dealer",
  condition: "used",
  exteriorColor: "Summit White",
  dealerName: "Example Chevrolet",
  sourceUrl: "https://example-chevrolet.com/used/2023-bolt-euv",
};

const ld = (l: Listing) => listingJsonLd(enrichListing(l));
const props = (l: Listing) =>
  Object.fromEntries(
    (((ld(l).additionalProperty ?? []) as { name: string; value: string | number }[]) ?? []).map((p) => [
      p.name,
      p.value,
    ])
  );

test("the core node names the car and its VIN", () => {
  const j = ld(base);
  assert.equal(j["@type"], "Car");
  assert.equal(j.vehicleIdentificationNumber, "1G1FZ6EV2VF100001");
  assert.equal(j.url, "https://voltcheck.net/listing/1g1fz6ev2vf100001");
  assert.deepEqual(j.brand, { "@type": "Brand", name: "Chevrolet" });
  assert.equal(j.model, "Bolt EUV");
  assert.equal(j.vehicleModelDate, "2023");
  assert.equal(j.itemCondition, "https://schema.org/UsedCondition");
  assert.equal(j.color, "Summit White");
  assert.equal(j.driveWheelConfiguration, "https://schema.org/FrontWheelDriveConfiguration");
  assert.deepEqual(j.mileageFromOdometer, {
    "@type": "QuantitativeValue",
    value: 18_400,
    unitCode: "SMI",
  });
});

test("a certified car is used, and says nothing more than that", () => {
  const j = ld({ ...base, condition: "certified" });
  assert.equal(j.itemCondition, "https://schema.org/UsedCondition");
  // No side channel re-asserting "certified": the row's own word is not a
  // schema.org condition and inventing a property for it is a claim.
  assert.equal(JSON.stringify(j).includes("ertified"), false);
});

test("a condition the seller never gave produces no itemCondition", () => {
  const j = ld({ ...base, condition: undefined });
  assert.equal(j.itemCondition, undefined);
  assert.equal((j.offers as Record<string, unknown>).itemCondition, undefined);
});

test("the offer carries the price, the currency and the dealer's own page", () => {
  const o = ld(base).offers as Record<string, unknown>;
  assert.equal(o["@type"], "Offer");
  assert.equal(o.price, 21_500);
  assert.equal(o.priceCurrency, "USD");
  assert.equal(o.availability, "https://schema.org/InStock");
  assert.equal(o.url, base.sourceUrl);
  assert.deepEqual(o.seller, {
    "@type": "Organization",
    name: "Example Chevrolet",
    url: base.sourceUrl,
  });
});

test("no offer at all when the asking price is not one we could confirm", () => {
  // hasRealPrice's floor: the page prints "See dealer for price" here, so
  // the markup must publish no price rather than a placeholder one.
  const j = ld({ ...base, priceUsd: 0 });
  assert.equal(j.offers, undefined);
});

test("an unnamed seller is not turned into an Organization", () => {
  const o = ld({ ...base, dealerName: undefined }).offers as Record<string, unknown>;
  assert.equal(o.seller, undefined);
  const p = ld({ ...base, sellerType: "private" }).offers as Record<string, unknown>;
  assert.equal(p.seller, undefined);
});

test("a zero odometer is left out, because the page hedges it", () => {
  const j = ld({ ...base, mileage: 0 });
  assert.equal(j.mileageFromOdometer, undefined);
  assert.equal(ld({ ...base, mileage: undefined }).mileageFromOdometer, undefined);
});

test("a battery-electric says Electric; a plug-in says so", () => {
  assert.equal(ld(base).fuelType, "Electric");
  const phev: Listing = {
    id: "t",
    vin: "1C4JJXP68RW100001",
    year: 2024,
    make: "Jeep",
    model: "Wrangler 4xe",
    trim: "Sahara",
    priceUsd: 39_000,
    mileage: 24_000,
    state: "IL",
    sellerType: "dealer",
    condition: "used",
  };
  assert.equal(ld(phev).fuelType, "Plug-in hybrid");
});

test("a car that matched no row gets no fuel type", () => {
  // The control the incentives lane already relies on: unknown is not BEV.
  const j = ld({ ...base, make: "Nonesuch", model: "Nothing At All", trim: undefined });
  assert.equal(j.fuelType, undefined);
  assert.equal(j.additionalProperty, undefined);
});

test("an estimated pack size carries the est marker in its name", () => {
  const p = props(base);
  const names = Object.keys(p);
  const pack = names.find((n) => n.startsWith("Battery capacity"));
  assert.ok(pack, "the Bolt EUV row publishes a pack size");
  const e = enrichListing(base);
  assert.equal(
    pack,
    e.packKwh!.estimated ? "Battery capacity (est)" : "Battery capacity",
    "the marker follows the same boolean the tile's suffix does"
  );
  assert.equal(p[pack], Math.round(e.packKwh!.value));
});

test("a manufacturer's own range figure is never called an EPA range", () => {
  // The rule, stated against the summaries rather than a fixture, so a future
  // row that flips rangeIsMfrEstimate cannot quietly relabel itself.
  for (const l of [base, { ...base, year: 2022 }, { ...base, model: "Bolt EV" }]) {
    const e = enrichListing(l);
    if (!e.realRangeMi) continue;
    const names = Object.keys(props(l));
    assert.equal(
      names.includes("EPA range"),
      !e.rangeIsMfrEstimate,
      `${l.year} ${l.model}: EPA range may only be named when EPA rated it`
    );
    if (e.rangeIsMfrEstimate) assert.ok(names.includes("Range (est)"));
  }
});

test("heat pump is yes or no, never est and never 'verify'", () => {
  const s = JSON.stringify(ld(base));
  assert.equal(s.includes("Heat pump (est)"), false);
  const hp = props(base)["Heat pump"];
  const e = enrichListing(base);
  if (e.heatPump?.status === "yes" || e.heatPump?.status === "no") {
    assert.equal(hp, e.heatPump.status === "yes" ? "Yes" : "No");
  } else {
    assert.equal(hp, undefined, "'verify' is not an answer, so nothing is published");
  }
});

test("a Fact's note never reaches the markup", () => {
  // noteRule.ts: a note is the researcher's qualifier, and it renders
  // nowhere. The Bolt EUV's own facts carry notes; none of them may appear.
  const e = enrichListing(base);
  const notes = [
    e.realRangeMi?.note,
    e.packKwh?.note,
    e.port?.note,
    e.chargeTime1080Min?.note,
  ].filter((n): n is string => typeof n === "string" && n.length > 0);
  assert.ok(notes.length > 0, "the fixture's row does carry notes, so this test can fail");
  const s = JSON.stringify(ld(base));
  for (const n of notes) assert.equal(s.includes(n), false, `note leaked: ${n}`);
});

test("a contradicted trim stays out of the name", () => {
  // trimSuspect is the sync-time verdict that the dealer's own description
  // names a different version. The page prints the disagreement instead of a
  // trim; the markup prints neither.
  const j = ld({ ...base, trim: "Premier", trimSuspect: "LT" });
  assert.equal(j.name, "2023 Chevrolet Bolt EUV");
});

test("the hub's ItemList counts what the page shows", () => {
  const cars = [
    { id: "a", year: 2023, title: "2023 Chevrolet Bolt EUV LT", priceUsd: 21_500, realPrice: true },
    { id: "b", year: 2024, title: "2024 Chevrolet Bolt EUV Premier", priceUsd: 24_000, realPrice: true },
  ];
  const j = hubItemListJsonLd("Chevrolet Bolt EUV", "/ev/chevrolet/bolt-euv", cars);
  assert.equal(j["@type"], "ItemList");
  assert.equal(j.numberOfItems, 2);
  assert.deepEqual((j.itemListElement as Record<string, unknown>[])[0], {
    "@type": "ListItem",
    position: 1,
    url: "https://voltcheck.net/listing/a",
    name: "2023 Chevrolet Bolt EUV LT",
  });
});
