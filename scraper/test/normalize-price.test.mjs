// node --test scraper/test/normalize-price.test.mjs
//
// The asking price a schema.org Vehicle node yields. Every case is the offer
// shape a real page served (2026-08-20): a negative "you save" incentive in
// the price slot, and a lease/subscription offer sitting beside the sale one.
// Reading offers[0].price with a sign-stripping parser turned both into false
// asking prices ($5,500 Mach-E, $1,990 Model X) — see lib/normalize.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../lib/normalize.mjs";

const price = (vehicle) => normalize(vehicle, { sourceUrl: "x", dealerDomain: "d" }).priceUsd;

test("a plain sale offer is the asking price", () => {
  assert.equal(price({ vehicleIdentificationNumber: "V", offers: { "@type": "Offer", price: "43085" } }), 43085);
});

test("a negative discount in the price slot is not a price", () => {
  // pricefordofsimivalley.com Mach-E JSON-LD: Offer.price = -5500 ("save
  // $5,500"). Digit-stripping used to make it +5500.
  assert.equal(price({ vehicleIdentificationNumber: "V", offers: { "@type": "Offer", price: -5500 } }), undefined);
  assert.equal(price({ vehicleIdentificationNumber: "V", offers: { "@type": "Offer", price: 0 } }), undefined);
});

test("a monthly lease offer never supplies the price; the sale offer beside it does", () => {
  // motorenvy.com Model X: a $1,990/mo LeaseOut offer, then the sale offer.
  const v = {
    vehicleIdentificationNumber: "V",
    offers: [
      { "@type": "Offer", price: "1990", businessFunction: "LeaseOut", paymentFrequency: "MONTH" },
      { "@type": "Offer", price: "102999" },
    ],
  };
  assert.equal(price(v), 102999);
});

test("a lease is skipped by paymentFrequency, businessFunction, or per-period spec", () => {
  const lease = (o) => price({ vehicleIdentificationNumber: "V", offers: [o, { "@type": "Offer", price: "50000" }] });
  assert.equal(lease({ "@type": "Offer", price: "599", paymentFrequency: "MONTH" }), 50000);
  assert.equal(lease({ "@type": "Offer", price: "599", businessFunction: "http://purl.org/goodrelations/v1#LeaseOut" }), 50000);
  assert.equal(
    lease({ "@type": "Offer", price: "599", priceSpecification: { "@type": "UnitPriceSpecification", unitCode: "MON" } }),
    50000,
  );
});

test("a lease-only vehicle yields no price rather than the payment", () => {
  const v = {
    vehicleIdentificationNumber: "V",
    offers: { "@type": "Offer", price: "799", businessFunction: "LeaseOut", paymentFrequency: "MONTH" },
  };
  assert.equal(price(v), undefined);
});

test("an explicit Sale businessFunction is honored", () => {
  assert.equal(
    price({
      vehicleIdentificationNumber: "V",
      offers: { "@type": "Offer", price: "29943", businessFunction: "http://purl.org/goodrelations/v1#Sell" },
    }),
    29943,
  );
});
