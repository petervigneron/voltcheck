import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEBizAutos,
  ebizAutosOrigins,
  ebizAutosSlugRecord,
  ebizAutosNeedsVdp,
} from "../lib/platforms/ebizautos.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { classifyEv } from "../lib/ev.mjs";

// Slugs taken from the-collection.ebizautos.com/sitemap.xml, 2026-08-31.
const HOST = "https://the-collection.ebizautos.com";

test("fingerprinted on the vendor's hosts, never the brand word", () => {
  assert.ok(isEBizAutos('<img src="//cdn.ebizautos.media/used-2023-acura-1-640.jpg">'));
  assert.ok(isEBizAutos('<a href="//the-collection.ebizautos.com/used-cars/">Inventory</a>'));
  assert.equal(isEBizAutos("<p>We run eBizAutos software</p>"), false);
  assert.equal(isEBizAutos(undefined), false);
  assert.equal(fingerprint('<img src="https://cdn.ebizautos.media/x-640.jpg">'), "ebizautos");
});

test("candidate origins: details-links first, then the vendor subdomain, shared hosts never", () => {
  const html = `
    <a href="//www.luckydriversportcars.com/details-2002-porsche-911_carrera-2dr-used-wp0ca29962s653219.html">car</a>
    <img src="//images.ebizautos.com/1.jpg">
    <a href="//the-collection.ebizautos.com/used-cars/">inv</a>
    <script src="//www.ebizautos.com/t.js"></script>`;
  assert.deepEqual(ebizAutosOrigins(html, "https://luckydrivermiami.com"), [
    "https://www.luckydriversportcars.com",
    "https://the-collection.ebizautos.com",
  ]);
  // A rooftop serving its own details pages is its own inventory host.
  assert.deepEqual(
    ebizAutosOrigins('<a href="/details-2023-tesla-model_3-base-used-5yj3e1ea5pf663405.html">x</a>', "https://own.com"),
    ["https://own.com"],
  );
  assert.deepEqual(ebizAutosOrigins(undefined, "https://x.com"), []);
});

test("the slug states the car: vin, year, name, and the platform's own condition token", () => {
  const r = ebizAutosSlugRecord(`${HOST}/details-2021-porsche-panamera_e~hybrid-4s-used-wp0ak2a77ml141691.html`);
  assert.equal(r.vin, "WP0AK2A77ML141691");
  assert.equal(r.year, "2021");
  assert.equal(r.name, "2021 porsche panamera e-hybrid 4s");
  assert.equal(r.condition, "used");
  // No-trim shape (make folded into model on some slugs) still parses.
  const r2 = ebizAutosSlugRecord(`${HOST}/details-2027-a8-l_quattro-new-wauldaf80vn000155.html`);
  assert.equal(r2.vin, "WAULDAF80VN000155");
  assert.equal(r2.condition, "new");
  assert.equal(r2.name, "2027 a8 l quattro");
});

test("a classic with a stock number where the VIN goes is skipped, not mis-keyed", () => {
  assert.equal(ebizAutosSlugRecord(`${HOST}/details-1995-porsche-993_carrera-coupe-used-310390.html`), null);
  assert.equal(ebizAutosSlugRecord(`${HOST}/used-cars.aspx`), null);
  assert.equal(ebizAutosSlugRecord(undefined), null);
});

test("candidate rule: EVs and anything naming electrification earn the VDP; petrol classics do not", () => {
  const taycan = ebizAutosSlugRecord(`${HOST}/details-2022-porsche-taycan-rwd-used-wp0aa2y1xnsa10687.html`);
  assert.ok(ebizAutosNeedsVdp(taycan));
  const tesla = ebizAutosSlugRecord(`${HOST}/details-2023-tesla-model_3-base-used-5yj3e1ea5pf663405.html`);
  assert.ok(ebizAutosNeedsVdp(tesla));
  const phev = ebizAutosSlugRecord(`${HOST}/details-2021-porsche-panamera_e~hybrid-4s-used-wp0ak2a77ml141691.html`);
  assert.ok(ebizAutosNeedsVdp(phev));
  const petrol = ebizAutosSlugRecord(`${HOST}/details-2023-acura-rdx-fwd_w_technology_package-used-5j8tc1h57pl009685.html`);
  assert.equal(ebizAutosNeedsVdp(petrol), false);
});

test("the slug name is enough for classifyEv to work with", () => {
  const tesla = ebizAutosSlugRecord(`${HOST}/details-2023-tesla-model_3-base-used-5yj3e1ea5pf663405.html`);
  const cls = classifyEv({ name: tesla.name, vehicleIdentificationNumber: tesla.vin });
  assert.equal(cls.isEv, true);
});
