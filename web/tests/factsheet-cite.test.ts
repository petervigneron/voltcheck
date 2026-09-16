// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/factsheet-cite.test.ts
//
// Fact-sheet citations render as an icon linking to the source (lib/facts/
// cite.ts), so every footnote on every published sheet must resolve to a
// URL — its own, or the one of the footnote it says "same booklet as". A
// footnote that resolves to nothing is an icon that goes nowhere.
import test from "node:test";
import assert from "node:assert/strict";
import { FACT_SHEETS } from "@/lib/facts/registry";
import { loadFactSheet } from "@/lib/facts/content";
import { citationTitle, citationUrl, citations } from "@/lib/facts/cite";

test("every footnote on every sheet links somewhere", () => {
  for (const entry of FACT_SHEETS) {
    const parsed = loadFactSheet(entry.contentFile);
    for (const [n, c] of citations(parsed.footnotes)) {
      assert.ok(c.url, `${entry.contentFile} footnote ${n} resolves to no URL: "${c.title.slice(0, 80)}"`);
      assert.match(c.url!, /^https?:\/\//);
      assert.ok(c.title.length > 0, `${entry.contentFile} footnote ${n} has no hover text`);
    }
  }
});

test("a footnote without a URL follows its 'same booklet as footnote N' reference", () => {
  const fns = [
    { n: 1, text: "GM, *2025 Blazer EV Warranty Booklet* (PDF). https://example.com/booklet.pdf." },
    { n: 2, text: "Same booklet as footnote 1, \"Warranty Coverage at a Glance,\" printed p. 2." },
    { n: 3, text: "Same booklets as footnotes 4 and 1, p. 3." },
    { n: 4, text: "Cadillac, 2026 booklet as in footnote 3." },
    { n: 5, text: "Nissan, *2024 LEAF Owner's Manual* (PDF), printed pages EV-22 and EV-23." },
    { n: 6, text: "Hyundai, *2022 IONIQ 5 Specifications* (PDF). https://example.com/ioniq5-2022.pdf" },
    { n: 7, text: "Hyundai, *2022 IONIQ 5 Specifications* and *2023 IONIQ 5 Specifications*, same PDFs (URLs above), OBC table." },
  ];
  assert.equal(citationUrl(fns, 1), "https://example.com/booklet.pdf");
  assert.equal(citationUrl(fns, 2), "https://example.com/booklet.pdf");
  // 3 → 4 → 3 is a cycle; the "and 1" branch still gets there.
  assert.equal(citationUrl(fns, 3), "https://example.com/booklet.pdf");
  assert.equal(citationUrl(fns, 5), undefined);
  // No number to follow, but the italic title names a footnote that links.
  assert.equal(citationUrl(fns, 7), "https://example.com/ioniq5-2022.pdf");
});

test("hover text is the footnote without its markup and URLs", () => {
  assert.equal(
    citationTitle("Ford, *2023 Ford F-150 Lightning Technical Specifications* (PDF), sections \"CHARGING UNIT.\" https://www.fromtheroad.ford.com/x.pdf. The miles-added figures carry Ford's own footnote \"Excludes Platinum models.\""),
    "Ford, 2023 Ford F-150 Lightning Technical Specifications (PDF), sections \"CHARGING UNIT.\" The miles-added figures carry Ford's own footnote \"Excludes Platinum models.\""
  );
  assert.equal(citationTitle("See [the order guide](https://a.b/og.pdf), p. 4."), "See the order guide, p. 4");
});
