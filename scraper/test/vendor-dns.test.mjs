import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorFromDns } from "../lib/vendor-dns.mjs";

// The three vendors' own hosts, as measured on 2026-09-02 — and the two
// traps: dcdws.net is DealerCenter (not dealer.com), and a bare A record in
// Cars Commerce's /24 is Dealer Inspire with no CNAME at all.
test("vendorFromDns names the vendor from its own CNAME host", () => {
  assert.equal(vendorFromDns({ chain: ["pod40.dealerinspire.com"] }), "dealerinspire");
  assert.equal(vendorFromDns({ chain: ["saas.www.dealereprocess.org"] }), "dealereprocess");
  assert.equal(vendorFromDns({ chain: ["alpha.dcdws.net", "dealers.dealercenterwebsite.net.cdn.cloudflare.net"] }), "dealercenter");
  assert.equal(vendorFromDns({ chain: ["dealers.dealercenterwebsite.net"] }), "dealercenter");
});

test("vendorFromDns: Cars Commerce /24 without a CNAME is Dealer Inspire; anything else is null", () => {
  assert.equal(vendorFromDns({ chain: [], a: ["74.119.99.3"] }), "dealerinspire");
  assert.equal(vendorFromDns({ chain: ["www.example.com.cdn.cloudflare.net"], a: ["104.18.1.1"] }), null);
  assert.equal(vendorFromDns({ chain: ["secure.dealer.com.edgekey.net"] }), null); // dealer.com is not a browser lane
  assert.equal(vendorFromDns({}), null);
});

// Never a brand word: a dealer named "Inspire Motors" on its own host is not
// Dealer Inspire.
test("vendorFromDns never matches a dealer's own domain", () => {
  assert.equal(vendorFromDns({ chain: ["www.inspiremotors.com"] }), null);
  assert.equal(vendorFromDns({ chain: ["dealerinspire.com.evil.example"] }), null);
});
