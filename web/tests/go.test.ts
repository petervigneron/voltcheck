// /go/<vin> (lib/go.ts): the counted link from a connector result to a
// dealer's page. Every answer the route can give is decided here, so the
// branches are pinned without a server: found, not found, a crawler, a HEAD,
// a lookup that ran out of time, and a stored URL that is not a web address.
import { test } from "node:test";
import assert from "node:assert/strict";
import { goDecision, goVin, withUtm, redirectable, GO_CLIENT_ID, GO_HEADERS, type GoLookup } from "../lib/go";

const SITE = "https://censusev.com";
const VIN = "kndc3dlc8p5104606";
const PERSON = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const go = (lookup: GoLookup, over: Partial<{ method: string; userAgent: string | null; search: string }> = {}) =>
  goDecision({ vin: VIN, method: "GET", userAgent: PERSON, search: "?ref=mcp", lookup, site: SITE, ...over });

test("utm: appended to a bare URL, after an existing query, and before a fragment", () => {
  assert.equal(withUtm("https://dealer.example/car/123"), "https://dealer.example/car/123?utm_source=censusev&utm_medium=referral");
  assert.equal(withUtm("https://dealer.example/vdp?id=9&a=b%20c"), "https://dealer.example/vdp?id=9&a=b%20c&utm_source=censusev&utm_medium=referral");
  assert.equal(withUtm("https://dealer.example/vdp#photos"), "https://dealer.example/vdp?utm_source=censusev&utm_medium=referral#photos");
  assert.equal(withUtm("https://dealer.example/vdp?id=9#/gallery?x=1"), "https://dealer.example/vdp?id=9&utm_source=censusev&utm_medium=referral#/gallery?x=1");
  assert.equal(withUtm("https://dealer.example/vdp?"), "https://dealer.example/vdp?utm_source=censusev&utm_medium=referral");
});

test("utm: a URL that already names a utm_source is the dealer's tagging and is left alone", () => {
  const u = "https://dealer.example/vdp?utm_source=feed&utm_medium=cpc#x";
  assert.equal(withUtm(u), u);
  // utm_source in the fragment is not in the query.
  assert.equal(withUtm("https://dealer.example/vdp#utm_source=x"), "https://dealer.example/vdp?utm_source=censusev&utm_medium=referral#utm_source=x");
});

test("utm: anything that is not an http(s) URL comes back unchanged", () => {
  for (const u of ["not a url", "/relative/path", "javascript:alert(1)", "mailto:a@b.example", ""]) assert.equal(withUtm(u), u);
});

test("a VIN-shaped path segment is accepted, lowercased; anything else is not", () => {
  assert.equal(goVin("KNDC3DLC8P5104606"), VIN);
  for (const bad of ["KNDC3DLC8P510460", "KNDC3DLC8P51046066", "KNDC3DLC8P510460O", "https:%2F%2Fevil.example", ""]) assert.equal(goVin(bad), undefined);
});

test("found: 302 to the dealer with utm, and one dealer_click recorded under the fixed client id", () => {
  const d = go({ kind: "found", sellerUrl: "https://dealer.example/vdp?id=9" });
  assert.equal(d.status, 302);
  assert.ok(d.status === 302);
  assert.equal(d.location, "https://dealer.example/vdp?id=9&utm_source=censusev&utm_medium=referral");
  assert.deepEqual(d.record, { client_id: GO_CLIENT_ID, name: "dealer_click", listing: VIN, props: { src: "mcp", via: "go" } });
  assert.equal(GO_CLIENT_ID, "go");
});

test("the ref label follows visitSrc's rule: a junk label is dropped, the click is still counted", () => {
  const d = go({ kind: "found", sellerUrl: "https://dealer.example/vdp" }, { search: "?ref=%3Cscript%3E" });
  assert.ok(d.status === 302 && d.record);
  assert.deepEqual(d.record!.props, { via: "go" });
  const up = go({ kind: "found", sellerUrl: "https://dealer.example/vdp" }, { search: "?ref=MCP" });
  assert.ok(up.status === 302 && up.record?.props.src === "mcp");
});

test("not found, no seller URL, or a stored URL that is not a web address: 404, never a redirect", () => {
  assert.deepEqual(go({ kind: "missing" }), { status: 404 });
  assert.deepEqual(go({ kind: "found" }), { status: 404 });
  assert.deepEqual(go({ kind: "found", sellerUrl: "javascript:alert(1)" }), { status: 404 });
  assert.deepEqual(go({ kind: "found", sellerUrl: "/relative" }), { status: 404 });
  assert.equal(redirectable("ftp://x.example/a"), undefined);
});

test("nothing in the request chooses the destination", () => {
  const d = go({ kind: "found", sellerUrl: "https://dealer.example/vdp" }, { search: "?ref=mcp&url=https://evil.example&next=//evil.example" });
  assert.ok(d.status === 302 && d.location.startsWith("https://dealer.example/vdp?"));
  assert.ok(!d.location.includes("evil"));
});

test("a crawler or a HEAD gets the redirect but is not counted", () => {
  for (const userAgent of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "curl/8.4.0", null]) {
    const d = go({ kind: "found", sellerUrl: "https://dealer.example/vdp" }, { userAgent });
    assert.ok(d.status === 302 && d.record === undefined, String(userAgent));
  }
  const head = go({ kind: "found", sellerUrl: "https://dealer.example/vdp" }, { method: "HEAD" });
  assert.ok(head.status === 302 && head.record === undefined);
  assert.equal(head.status === 302 && head.location, "https://dealer.example/vdp?utm_source=censusev&utm_medium=referral");
});

test("a lookup that could not finish forwards to the car's own page here, uncounted", () => {
  const d = go({ kind: "unavailable" });
  assert.deepEqual(d, { status: 302, location: `${SITE}/listing/${VIN}?ref=mcp` });
  assert.deepEqual(go({ kind: "unavailable" }, { search: "" }), { status: 302, location: `${SITE}/listing/${VIN}` });
});

test("headers: never cached, never indexed, and the dealer sees only our origin as referrer", () => {
  assert.equal(GO_HEADERS["cache-control"], "no-store");
  assert.equal(GO_HEADERS["x-robots-tag"], "noindex, nofollow");
  assert.equal(GO_HEADERS["referrer-policy"], "origin");
});
