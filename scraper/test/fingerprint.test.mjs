import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint } from "../lib/fingerprint.mjs";

// The four vendors added 2026-08-23, and the precedence that matters: three of
// them carry another platform's markers on the same page, and a loose match on
// those beat them to the answer before. Each snippet below is the real signal
// as it appears on a live rooftop, paired with the marker that used to win.
test("Motive wins over the Dealer Inspire markers its rooftops also carry", () => {
  const page =
    '<img src="https://images.app.ridemotive.com/abc"/><script>window.DI_ = {}</script><div class="di-widget"></div>';
  assert.equal(fingerprint(page), "ridemotive");
});

test("Remora wins over the pictures.dealer.com images its rooftops serve", () => {
  const page = '<img src="https://vimg.remora.inc/1/x.avif"/><img src="https://pictures.dealer.com/y.jpg"/>';
  assert.equal(fingerprint(page), "remora");
});

test("AutoManager is recognised from its own CDN, blob and admin hosts", () => {
  assert.equal(fingerprint('<link href="https://automanagerprodcdn.azureedge.net/wmthemes/fluid/default.css"/>'), "automanager");
  assert.equal(fingerprint('<img src="https://automanager.blob.core.windows.net/wmphotos/012532/a.jpg"/>'), "automanager");
  assert.equal(fingerprint('<a href="https://wm.automanager.com/login">Dealer login</a>'), "automanager");
});

test("AutoFunds and DealerWebsites are one product under two names", () => {
  assert.equal(fingerprint('<link href="/HttpCombiner.ashx?s=DW_Common-CSS-min&t=text/css"/>'), "autofunds");
  assert.equal(fingerprint('<a href="//www.autofunds.com">Dealer Websites by AutoFunds</a>'), "autofunds");
  assert.equal(fingerprint('<img src="https://images.autofunds.net/InventoryImages/2026/a.jpg"/>'), "autofunds");
});

test("OneAudi beats dealer.com, which its own inventory tag names", () => {
  // Audi's platform loads "labels-prod…/dealer.com.js" on inventory pages and
  // serves some assets from dealer.com hosts. 20 of the 21 Audi rooftops that
  // ever reached "working" fingerprinted dealer.com because of it, which sends
  // the crawl down the DDC inventory API on a site that has none.
  const audi =
    '<link rel="preload" as="script" href="https://oneaudi-falcon.prod.renderer.one.audi/static/client/client.js"/>' +
    '<link rel="dns-prefetch" href="https://omnigraph.audi.com"/>' +
    '<script src="https://labels-prod.s3.us-east-1.amazonaws.com/dealer.com.js"></script>';
  assert.equal(fingerprint(audi), "oneaudi");
  assert.equal(
    fingerprint('<script src="https://fa-vin-stock-search.cdn.prod.collab.apps.one.audi/v1.0.11/fh/app.js"></script>'),
    "oneaudi",
  );
  // An Audi rooftop that really is on dealer.com must still read dealer.com.
  assert.equal(fingerprint("<html>Audi Raleigh<script>DDC.dataLayer={}</script></html>"), "dealer.com");
});

test("Wayne Reaves is recognised from the footer credit, its only mark", () => {
  assert.equal(
    fingerprint('<a href="https://waynereaves.com/"><img alt="Wayne Reaves Automotive Dealer Websites"/></a>'),
    "waynereaves",
  );
  assert.equal(fingerprint('<a href="http://www.waynereaves.net">Dealer software</a>'), "waynereaves");
});

test("a page with none of these is still unknown", () => {
  assert.equal(fingerprint("<html><body>a plain wordpress site</body></html>"), "unknown");
  // …and the vendors' NAMES in prose are not signals — only their hosts are.
  assert.equal(fingerprint("<p>We are an auto manager and we ride motive daily.</p>"), "unknown");
  assert.equal(fingerprint("<p>Ask for Wayne, or for Reaves in service.</p>"), "unknown");
});
