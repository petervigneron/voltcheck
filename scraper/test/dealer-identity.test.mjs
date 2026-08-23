import { test } from "node:test";
import assert from "node:assert/strict";
import { identityRule, pageEvidence } from "../lib/dealer-identity.mjs";

const page = (html) => pageEvidence(html);
const HUDSON_NY = { name: "Hudson Collision Center Inc", city: "Hudson", zip: "12534", phone: "" };

test("the roll's phone, digit-exact, is enough on its own", () => {
  const d = { name: "Parks Motors LLC", city: "Tacoma", zip: "98409", phone: "2534727483" };
  assert.equal(identityRule(d, page("<p>Call us at (253) 472-7483</p>")), "phone");
});

test("licensed name plus the roll's zip", () => {
  const d = { name: "Auto Smart LLC", city: "Binghamton", zip: "13905", phone: "" };
  assert.equal(identityRule(d, page("<h1>Auto Smart</h1><address>1126 Front St, Binghamton NY 13905</address>")), "name+zip");
});

// The false match this gate was rebuilt around: same business name, same city
// name, different state. The roll's zip is on the row and NOT on the page.
test("a same-named shop in a same-named city, wrong state, is refused", () => {
  const oh = page("<title>Collision Repair Hudson Ohio | Hudson Collision Center</title><p>Hudson, OH 44236</p>");
  assert.equal(identityRule(HUDSON_NY, oh), null);
});

// Found by hand-checking claimed matches on 2026-08-23: searching the page's
// digits run together for five digits matches any five-digit window of any
// phone number or price on the page. Land'n Sea Inc — a Manhattan apparel
// manufacturer — cleared "name + zip" against LAND N SEA CO of Marysville WA
// 98270 that way, and Three Rivers Marine of Crystal River FLORIDA cleared it
// against the same-named licensee in Woodinville WA.
test("a zip must be printed as a zip, not found inside the page's digits", () => {
  const d = { name: "Land N Sea Co", city: "Marysville", zip: "98270", phone: "" };
  // 98270 appears here only as a window of a longer number.
  const soup = page("<h1>Land'n Sea Inc.</h1><p>Order #4459827033 — New York, NY 10018</p>");
  assert.equal(identityRule(d, soup), null);
  const real = page("<h1>Land N Sea Co</h1><address>Marysville, WA 98270</address>");
  assert.equal(identityRule(d, real), "name+zip");
  const plusFour = page("<h1>Land N Sea Co</h1><address>Marysville WA 982701234</address>");
  assert.equal(identityRule(d, plusFour), "name+zip");
});

test("city alone clears only when the roll row has no zip at all", () => {
  const noZip = { ...HUDSON_NY, zip: "" };
  const oh = page("<title>Hudson Collision Center</title><p>Hudson</p>");
  assert.equal(identityRule(noZip, oh), "name+city");
  assert.equal(identityRule(HUDSON_NY, oh), null);
});

// Washington publishes 262 of its 2,064 licences with the last digit of the
// phone missing. Nine digits corroborated by the name recovers RAY'S AUTO
// SALE → raysautosalewa.com; nine digits alone must not.
test("a nine-digit roll phone counts only alongside the licensed name", () => {
  const d = { name: "Rays Auto Sale", city: "Lake Stevens", zip: "98258", phone: "425480655" };
  const withName = page("<h1>Ray's Auto Sale</h1><p>(425) 480-6551</p>");
  assert.equal(identityRule(d, withName), "name+phone9");
  const withoutName = page("<h1>Somebody Else Motors</h1><p>(425) 480-6551</p>");
  assert.equal(identityRule(d, withoutName), null);
});

test("a page that only shows the name asserts nothing", () => {
  const d = { name: "Wells Auto", city: "Spencerport", zip: "14559", phone: "" };
  assert.equal(identityRule(d, page("<h1>Wells Auto</h1><p>Serving the tri-state area</p>")), null);
});

test("short names cannot clear the gate at all", () => {
  // "MB Auto" squashes to 6 characters: too generic to be evidence.
  const d = { name: "MB Auto", city: "Great Neck", zip: "11021", phone: "" };
  assert.equal(identityRule(d, page("<h1>MB Auto</h1><p>Great Neck 11021</p>")), null);
});

test("markup and punctuation do not hide the assertion", () => {
  const d = { name: "Parks Motors, LLC", city: "Tacoma", zip: "98409", phone: "" };
  const html = "<div class='x'>Parks&nbsp;<b>Motors</b></div><span>Tacoma, WA 98409</span>";
  assert.equal(identityRule(d, page(html)), "name+zip");
});
