// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/shop-page.test.tsx
//
// A /shop question page as a fetcher with no JavaScript reads it: the
// question as the heading, the count line, the model table linked to model
// pages, the cheapest cars linked to their listings with their disclosures,
// the neighbouring budgets, and nothing printed for a value that is absent.
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopAnswer } from "@/components/ShopAnswer";
import { shopCarRow, shopCountLine, shopItemListJsonLd, shopModelRow, type ShopModel } from "@/lib/listings/shop";
import { findShopQuestion, shopHeading, shopNeighbours } from "@/lib/listings/shopQuestions";
import type { ApiListing } from "@/lib/api/records";

const q = findShopQuestion("used-ev-under-25000")!;
const models: ShopModel[] = [
  { key: "/ev/chevrolet/bolt-ev", name: "Chevrolet Bolt EV", href: "/ev/chevrolet/bolt-ev", n: 812, min: 9995, median: 17450, range: { lo: 238, hi: 259, loEst: false, hiEst: false }, battery: { lo: 60, hi: 66, loEst: false, hiEst: false }, years: [2017, 2018, 2019, 2020, 2021, 2022, 2023], electricOnly: false },
  { key: "chevrolet|sparkev", name: "Chevrolet Spark EV", n: 2, min: 6500, range: { lo: 82, hi: 82, loEst: true, hiEst: true }, years: [2016], electricOnly: false },
];
const car: ApiListing = {
  id: "1g1fz6s00k4000001",
  vin: "1G1FZ6S00K4000001",
  url: "",
  year: 2019,
  make: "Chevrolet",
  model: "Bolt EV",
  title: "2019 Chevrolet Bolt EV LT",
  condition: "used",
  price_usd: 9995,
  mileage: 61000,
  location: { state: "TX" },
  seller: { type: "dealer" },
  buyback_disclosed: true,
};

function render() {
  return renderToStaticMarkup(
    <ShopAnswer
      heading={shopHeading(q)}
      countLine={shopCountLine(814, "2026-11-18T19:18:52.553Z")}
      models={models.map(shopModelRow)}
      cars={[shopCarRow(car)]}
      neighbours={shopNeighbours(q)}
      itemList={shopItemListJsonLd(q, models)}
    />,
  );
}

test("the page states the question, the count and the date", () => {
  const html = render();
  assert.match(html, /<h1[^>]*>Used electric cars under \$25,000<\/h1>/);
  assert.match(html, /814 cars · United States · as of Nov 18, 2026/);
});

test("the model table: linked where a model page exists, ordered by count, marks estimates", () => {
  const html = render();
  assert.match(html, /Cars, most first/);
  assert.match(html, /<a href="\/ev\/chevrolet\/bolt-ev"[^>]*>Chevrolet Bolt EV<\/a>/);
  assert.match(html, /\$17,450/);
  assert.match(html, /238–259 mi/);
  assert.match(html, /2017–2023/);
  assert.match(html, /82 \(est\) mi/);
  assert.doesNotMatch(html, /<a[^>]*>Chevrolet Spark EV<\/a>/);
  assert.doesNotMatch(html, /\bbest\b|undefined|NaN/i);
});

test("the cars: linked to their pages, disclosures labelled as on the near page", () => {
  const html = render();
  assert.match(html, /<a href="\/listing\/1g1fz6s00k4000001"[^>]*>2019 Chevrolet Bolt EV LT<\/a>/);
  assert.match(html, /Used · Manufacturer buyback/);
  assert.match(html, /\$9,995/);
  assert.match(html, /61,000/);
});

test("the links: neighbouring budgets, the warranty checker and the market page", () => {
  const html = render();
  assert.match(html, /href="\/shop\/used-ev-under-20000"[^>]*>Under \$20,000/);
  assert.match(html, /href="\/shop\/used-ev-under-30000"[^>]*>Under \$30,000/);
  assert.match(html, /href="\/warranty"/);
  assert.match(html, /href="\/market"/);
  assert.match(html, /"@type":"ItemList"/);
});

test("no cars: the count line and nothing else to report", () => {
  const html = renderToStaticMarkup(
    <ShopAnswer heading="H" countLine={shopCountLine(0, "2026-11-18T00:00:00Z")} models={[]} cars={[]} neighbours={{}} />,
  );
  assert.match(html, /0 cars · United States/);
  assert.doesNotMatch(html, /<table/);
});
