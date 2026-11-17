// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/warranty-page.test.tsx
//
// /warranty has to be a real page to a crawler that runs no script: a title,
// an h1, the picker's options and a link to every battery-warranty sheet, all
// in the server HTML.
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import WarrantyPage, { metadata } from "@/app/warranty/page";
import { FACT_SHEETS } from "@/lib/facts/registry";

const html = renderToStaticMarkup(WarrantyPage());

test("the server HTML carries the h1, the picker and every battery-warranty sheet", () => {
  assert.match(html, /<h1[^>]*>Battery warranty checker<\/h1>/);
  assert.match(html, /<select id="w-make"/);
  assert.match(html, /<option value="kia">Kia<\/option>/);
  const sheets = FACT_SHEETS.filter((s) => s.topic === "battery-warranty");
  assert.ok(sheets.length > 0);
  for (const s of sheets) assert.ok(html.includes(`href="/facts/${s.make}/${s.model}/battery-warranty"`), s.model);
});

test("the JSON-LD is a free WebApplication at the bare URL", () => {
  const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
  const ld = JSON.parse(m![1]);
  assert.equal(ld["@type"], "WebApplication");
  assert.equal(ld.url, "https://censusev.com/warranty");
  assert.equal(ld.offers.price, 0);
});

test("the canonical is the bare path", () => {
  assert.equal(metadata.alternates?.canonical, "/warranty");
});

test("nothing is said before a car is picked", () => {
  assert.ok(!html.includes("Term"));
  assert.ok(!html.includes("first sale date"));
});
