// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/near-page.test.tsx
//
// The near-a-ZIP page as a fetcher with no JavaScript reads it: the heading,
// the count line, a table of cars linked to their pages, the year counts and
// the asking-price spread, and nothing printed for a value a car lacks.
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { NearResults } from "@/components/NearResults";
import { nearAsking, nearCountLine, nearHeading, nearLinks, nearRow } from "@/lib/listings/near";
import { findModelHub } from "@/lib/listings/modelHubs";
import { hubItemListJsonLd } from "@/lib/listings/jsonLd";
import type { ApiListing } from "@/lib/api/records";

const hub = findModelHub("kia", "ev6")!;
const p = { radius: 100, condition: "used" as const, maxPrice: 28000 };
const recs: ApiListing[] = [
  {
    id: "knde34ab1n5000001",
    vin: "KNDE34AB1N5000001",
    url: "https://censusev.com/listing/knde34ab1n5000001",
    year: 2023,
    make: "Kia",
    model: "EV6",
    trim: "Wind",
    title: "2023 Kia EV6 Wind",
    condition: "used",
    price_usd: 27450,
    mileage: 21345,
    location: { city: "Evanston", state: "IL" },
    seller: { type: "dealer" },
    range: { mi: 310, estimated: false, electric_only: false },
    battery: { kwh: 77, basis: "usable", estimated: true },
    last_seen: "2026-11-17",
  },
  {
    id: "knde34ab1n5000002",
    vin: "KNDE34AB1N5000002",
    url: "https://censusev.com/listing/knde34ab1n5000002",
    year: 2022,
    make: "Kia",
    model: "EV6",
    title: "2022 Kia EV6",
    price_usd: null,
    location: {},
    seller: { type: "dealer" },
  },
];
const breakdown = {
  by_year: [
    { year: 2023, n: 4 },
    { year: 2022, n: 3 },
  ],
  asking_usd: { n: 6, min: 21900, median: 25500, max: 27995 },
};

function render() {
  const heading = nearHeading("Kia EV6", "60614", p);
  return renderToStaticMarkup(
    <NearResults
      name="Kia EV6"
      hubHref="/ev/kia/ev6"
      zip="60614"
      heading={heading}
      countLine={nearCountLine(7, p, "2026-11-18T08:04:59Z")}
      rows={[nearRow(recs[0], 11.6, "EV6"), nearRow(recs[1], 40.2, "EV6")]}
      years={breakdown.by_year}
      asking={nearAsking(breakdown)}
      links={nearLinks(hub, "60614", p, breakdown)}
      itemList={hubItemListJsonLd(heading, "/ev/kia/ev6/near/60614", recs.map((r) => ({ id: r.id, title: r.title })))}
    />,
  );
}

test("the page says what was asked and what was found, in its HTML", () => {
  const html = render();
  assert.match(html, /<h1[^>]*>Used Kia EV6 up to \$28,000 for sale near 60614<\/h1>/);
  assert.ok(html.includes("7 cars · within 100 miles · as of Nov 18, 2026"));
  assert.ok(html.includes('href="/listing/knde34ab1n5000001"'));
  assert.ok(html.includes(">2023 Wind</a>"));
  assert.ok(html.includes(">2022 EV6</a>"));
  for (const s of ["$27,450", "21,345", "Evanston, IL", "12 mi", "310 mi", "77 kWh (est)", "Nov 17"]) assert.ok(html.includes(s), s);
  assert.ok(html.includes('href="/ev/kia/ev6"'));
});

test("the breakdown and the other searches are there", () => {
  const html = render();
  assert.ok(html.includes(">Model year<"));
  assert.ok(html.includes("Asking price · 6 cars"));
  for (const s of ["$21,900", "$25,500", "$27,995"]) assert.ok(html.includes(s), s);
  assert.ok(html.includes("Within 200 miles"));
  assert.ok(html.includes("Within 50 miles"));
  assert.ok(html.includes('href="/ev/kia/ev6/near/60614?condition=used"'));
});

test("an absent value is an empty cell, never a sentence", () => {
  const html = render();
  for (const s of [/unknown/i, /not available/i, /no price/i, /call for/i, /n\/a/i]) assert.doesNotMatch(html, s);
});

test("the ItemList names the cars shown and links them", () => {
  const html = render();
  const m = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html);
  assert.ok(m);
  const json = JSON.parse(m[1]);
  assert.equal(json["@type"], "ItemList");
  assert.equal(json.numberOfItems, 2);
  assert.equal(json.itemListElement[0].url, "https://censusev.com/listing/knde34ab1n5000001");
  assert.equal(json.itemListElement[0].name, "2023 Kia EV6 Wind");
});

test("no cars: the count still answers, and no empty table is drawn", () => {
  const html = renderToStaticMarkup(
    <NearResults
      name="Kia EV6"
      hubHref="/ev/kia/ev6"
      zip="59001"
      heading={nearHeading("Kia EV6", "59001", { radius: 100 })}
      countLine={nearCountLine(0, { radius: 100 }, "2026-11-18")}
      rows={[]}
      years={[]}
      links={nearLinks(hub, "59001", { radius: 100 })}
    />,
  );
  assert.ok(html.includes("0 cars · within 100 miles"));
  assert.ok(!html.includes("<table"));
  assert.ok(!html.includes("application/ld+json"));
  assert.ok(html.includes("Within 200 miles"));
});
