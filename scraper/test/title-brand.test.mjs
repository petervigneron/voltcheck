import test from "node:test";
import assert from "node:assert/strict";
import { titleBrandFromPage } from "../lib/title-brand.mjs";

// rebuiltdeals.com's spec grid as served 2026-09-10 (AutoManager).
const rebuiltDeals = `<div class="col-sm-6 col-md-4"> <span class="accent-color2 specifics-label">Transmission:</span> <span class="specifics-value">1-Speed Direct-Drive</span> </div>
<div class="col-sm-6 col-md-4"> <span class="accent-color2 specifics-label">Title:</span> <span class="specifics-value">Rebuilt</span> </div>
<div class="col-sm-6 col-md-4"> <span class="accent-color2 specifics-label">VIN:</span> <span class="specifics-value">1FTVW3L73RWG01539</span> </div>`;

test("a spec row that says the title is rebuilt is read, in the dealer's word", () => {
  assert.equal(titleBrandFromPage(rebuiltDeals), "Rebuilt");
  assert.equal(titleBrandFromPage("<tr><th>Title Status</th><td>Salvage</td></tr>"), "Salvage");
  assert.equal(titleBrandFromPage("<dt>Title Type:</dt><dd>Branded Title</dd>"), "Branded");
  assert.equal(titleBrandFromPage("<li>Title: Lemon Law Buyback</li>"), "Lemon Law Buyback");
});

test("a clean title, or no title row at all, states nothing", () => {
  assert.equal(titleBrandFromPage(rebuiltDeals.replace(">Rebuilt<", ">Clean<")), undefined);
  assert.equal(titleBrandFromPage("<tr><th>Title Status</th><td>Clear</td></tr>"), undefined);
  assert.equal(titleBrandFromPage("<p>Transmission: Automatic</p><p>VIN: 1FTVW3L73RWG01539</p>"), undefined);
  assert.equal(titleBrandFromPage(""), undefined);
  assert.equal(titleBrandFromPage(undefined), undefined);
});

test("marketing copy near the word title does not pass for a spec row", () => {
  assert.equal(titleBrandFromPage("<p>We never sell salvage title cars. Title: Clean</p>"), undefined);
  assert.equal(titleBrandFromPage("<h1>Rebuilt Deals</h1><p>Every car has a story. Title: Clean</p>"), undefined);
  // The word "title" alone, followed by a brand word somewhere later, is not a row.
  assert.equal(titleBrandFromPage("<p>Ask about the title. Our rebuilt trucks sell fast.</p>"), undefined);
});
