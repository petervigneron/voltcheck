import { test } from "node:test";
import assert from "node:assert/strict";
import { motiveDealerRecords, isPublicDealerDomain, stateCode, apex } from "../lib/platforms/ridemotive-dealers.mjs";

// Structurally faithful fragments of live Motive pages (2026-08-23). The
// escaped form is what the RSC flight payload carries and it is the form every
// one of these sites actually serves; the plain form appears in the inline
// JSON. Both are here because the parser has to read either.
const ESCAPED_SELF = `<script>self.__next_f.push([1,"{\\"dealer\\":{\\"id\\":2592,\\"name\\":\\"Twin Falls Subaru\\",\\"domain\\":\\"twinfalls-subaru.com\\",\\"sales_phone\\":\\"2087011944\\",\\"address_1\\":\\"1725 Parkview Dr\\",\\"city\\":\\"Twin Falls\\",\\"state\\":\\"Idaho\\",\\"zipcode\\":\\"83301\\"}}"])</script>`;

const PLAIN_GROUP = `<script>{"initialData":{"child_dealers":[
{"id":43,"name":"Kunes Auto Group","domain":"shopkunes.com","sales_phone":"","city":"Delavan","state":"Wisconsin"},
{"id":1216,"name":"Kunes Mercedes-Benz of Sycamore Auto Mall","domain":"kunesmbsam.app.ridemotive.com","sales_phone":"8153101198","address_1":"1875 Dekalb Ave","city":"Sycamore","state":"Illinois","zipcode":"60178"},
{"id":131,"name":"Kunes Honda of Sycamore","domain":"kuneshondasycamore.com","sales_phone":"8152426850","address_1":"1875 Dekalb Ave","city":"Sycamore","state":"Illinois","zipcode":"60115","about_paragraph":"We are {the} best"}
]}}</script>`;

test("reads the dealer record a site publishes about itself, escaped", () => {
  const r = motiveDealerRecords(ESCAPED_SELF);
  assert.deepEqual(r.get(2592), {
    id: 2592,
    name: "Twin Falls Subaru",
    domain: "twinfalls-subaru.com",
    city: "Twin Falls",
    state: "ID",
    zip: "83301",
    phone: "2087011944",
    address: "1725 Parkview Dr",
  });
});

test("reads every sibling a group page publishes", () => {
  const r = motiveDealerRecords(PLAIN_GROUP);
  assert.equal(r.size, 3);
  assert.equal(r.get(131).domain, "kuneshondasycamore.com");
  assert.equal(r.get(131).zip, "60115");
  // A brace inside a string value must not end the object early — the field
  // after it still has to be found.
  assert.equal(r.get(131).city, "Sycamore");
  assert.equal(r.get(43).state, "WI");
});

// The one record on twinfalls-subaru.com that names a public domain is the
// site's own, and its object is by far the biggest on the page (hours per
// department, theme colours, every page's meta description). At a 20,000
// character cap the brace matcher ran off the end and the record was dropped
// — the page then looked like it published no public domain at all.
test("a dealer object longer than the brace-matching cap is still read", () => {
  const filler = `,\\"about_paragraph\\":\\"${"x".repeat(70000)}\\"`;
  const html = ESCAPED_SELF.replace('\\"zipcode\\":\\"83301\\"', `\\"zipcode\\":\\"83301\\"${filler}`);
  const r = motiveDealerRecords(html);
  assert.equal(r.get(2592)?.domain, "twinfalls-subaru.com");
  assert.equal(r.get(2592)?.zip, "83301");
});

// The same dealer appears twice in one payload, once addressed by the host the
// platform uses internally. A registry row pointing at *.app.ridemotive.com
// would be a row pointing at Motive rather than at a dealer, so the public
// copy has to win regardless of which one the scan meets first.
test("a public domain beats the platform-internal host for the same id", () => {
  const internalFirst = `{"id":77,"name":"Store","domain":"st77.app.ridemotive.com","city":"Ames","state":"Iowa"}
{"id":77,"name":"Store","domain":"storeofames.com","city":"Ames","state":"Iowa","zipcode":"50010"}`;
  const publicFirst = `{"id":77,"name":"Store","domain":"storeofames.com","city":"Ames","state":"Iowa","zipcode":"50010"}
{"id":77,"name":"Store","domain":"st77.app.ridemotive.com","city":"Ames","state":"Iowa"}`;
  assert.equal(motiveDealerRecords(internalFirst).get(77).domain, "storeofames.com");
  assert.equal(motiveDealerRecords(publicFirst).get(77).domain, "storeofames.com");
});

test("platform-internal and churned hosts are not dealer domains", () => {
  assert.equal(isPublicDealerDomain("tfg.app.ridemotive.com"), false);
  assert.equal(isPublicDealerDomain("churnedmonmouth.ridemotive.com"), false);
  assert.equal(isPublicDealerDomain("churnedkunesmobility.motivehq"), false);
  // motivehq is also a real .com, and three of the platform's own hosts were
  // emitted as new dealer rows when only the bare form was matched.
  assert.equal(isPublicDealerDomain("bmw.motivehq.com"), false);
  assert.equal(isPublicDealerDomain("motivehq.com"), false);
  assert.equal(isPublicDealerDomain("ridemotive.com"), false);
  assert.equal(isPublicDealerDomain(""), false);
  assert.equal(isPublicDealerDomain("kuneshondasycamore.com"), true);
  assert.equal(isPublicDealerDomain("twinfalls-subaru.com"), true);
});

test("names keep their JSON escapes decoded, state becomes the two-letter code", () => {
  const r = motiveDealerRecords(`{"id":3037,"name":"Twin Falls Car Sales \\u0026 Rentals","domain":"tfcs.example.com","state":"Idaho"}`);
  assert.equal(r.get(3037).name, "Twin Falls Car Sales & Rentals");
  assert.equal(stateCode("Idaho"), "ID");
  assert.equal(stateCode("id"), "ID");
  assert.equal(stateCode("Bogusland"), "");
  assert.equal(apex("WWW.Example.com."), "example.com");
});
