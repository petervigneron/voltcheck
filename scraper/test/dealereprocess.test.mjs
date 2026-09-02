import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerEProcess,
  dealerEProcessInventorySitemap,
  dealerEProcessEntries,
  dealerEProcessCandidates,
  dealerEProcessVdpVehicle,
} from "../lib/platforms/dealereprocess.mjs";

// Captured off themountainhyundai.com on 2026-09-02 (trimmed).
const INDEX = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://www.themountainhyundai.com/resrc/xmlsitemap/sitemap-menus/</loc></sitemap>
<sitemap><loc>https://www.themountainhyundai.com/resrc/xmlsitemap/sitemap-inventory-search/denver-co-80014/</loc></sitemap>
<sitemap><loc>https://www.themountainhyundai.com/resrc/xmlsitemap/sitemap-inventory-search/</loc></sitemap></sitemapindex>`;
const SITEMAP = `<urlset>
<url><loc>https://www.themountainhyundai.com/search/used-denver-co/?cy=80014&amp;tp=used</loc></url>
<url><loc>https://www.themountainhyundai.com/auto/used-2024-dodge-durango-gt-plus-denver-co/119532368/</loc></url>
<url><loc>https://www.themountainhyundai.com/auto/new-2025-hyundai-ioniq-5-limited-denver-co/102972877/</loc></url>
<url><loc>https://www.themountainhyundai.com/auto/new-2025-hyundai-ioniq-5-limited-near-arvada-co/102972877/</loc></url>
<url><loc>https://www.themountainhyundai.com/auto/used-2023-jeep-wrangler-4xe-sahara-denver-co/120000001/</loc></url>
</urlset>`;
const VDP = (id, vin) => `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Vehicle","name":"Hyundai IONIQ 5 XRT","model":"Ioniq 5","fuelType":"Electric","vehicleIdentificationNumber":"${vin}","vehicleModelDate":"2026","brand":{"@type":"Brand","name":"Hyundai"},"url":"/auto/new-2026-hyundai-ioniq-5-xrt-denver-co/${id}/","offers":[{"@type":"Offer","priceCurrency":"USD","serialNumber":"${vin}","price":"48674","itemCondition":"https://schema.org/NewCondition","url":"/auto/new-2026-hyundai-ioniq-5-xrt-denver-co/${id}/","availability":"https://schema.org/InStock"}]}</script></head><body></body></html>`;

test("isDealerEProcess keys on the vendor's own hosts, not the word", () => {
  assert.ok(isDealerEProcess('<img src="https://cloudflareimages.dealereprocess.com/resrc/images/x.jpg">'));
  assert.ok(isDealerEProcess('<script src="https://jobs.dealereprocess.com/resrc/clickpath/x">'));
  assert.equal(isDealerEProcess("Our web vendor is DealerEProcess, we love them"), false);
  assert.equal(isDealerEProcess(undefined), false);
});

test("the whole-lot sitemap is the bare inventory-search entry, not a city one", () => {
  assert.equal(dealerEProcessInventorySitemap(INDEX), "https://www.themountainhyundai.com/resrc/xmlsitemap/sitemap-inventory-search/");
});

test("entries: one per vendor id, VDPs only, slug kept for candidacy", () => {
  const e = dealerEProcessEntries(SITEMAP);
  assert.deepEqual(e.map((x) => x.id), ["119532368", "102972877", "120000001"]); // the arvada duplicate of 102972877 is folded
  assert.equal(e[1].slug, "new-2025-hyundai-ioniq-5-limited-denver-co");
  const c = dealerEProcessCandidates(e);
  assert.deepEqual(c.map((x) => x.id), ["102972877", "120000001"]); // ioniq, 4xe; the Durango is left unread
});

test("the VDP's Vehicle node is taken only when its url carries the id asked for", () => {
  const good = dealerEProcessVdpVehicle(VDP("102972877", "7YAKPDDC0TY050721"), { id: "102972877", origin: "https://www.themountainhyundai.com" });
  assert.equal(good.vehicleIdentificationNumber, "7YAKPDDC0TY050721");
  assert.equal(good.offers[0].url, "https://www.themountainhyundai.com/auto/new-2026-hyundai-ioniq-5-xrt-denver-co/102972877/");
  assert.equal(good.offers[0].price, "48674");
  // The replaced-slot case measured live: asked for 102972877, page is 116442326.
  assert.equal(dealerEProcessVdpVehicle(VDP("116442326", "7YAKPDDC0TY050721"), { id: "102972877", origin: "https://www.themountainhyundai.com" }), null);
  assert.equal(dealerEProcessVdpVehicle("<html></html>", { id: "1", origin: "https://x.com" }), null);
});
