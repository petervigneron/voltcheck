// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/factsheet-structure.test.ts
//
// Structural pin for the 2026-08-30 fact-sheet format: every published sheet
// parses, leads with tables rather than prose, and has airtight footnote
// cross-references. The footnote checks are the load-bearing ones — a fact
// whose [^n] points at nothing has silently lost its source, and an
// unreferenced footnote is a claim that lost its fact; both violate the
// house rule that every surfaced number carries its citation.
import test from "node:test";
import assert from "node:assert/strict";
import { FACT_SHEETS } from "@/lib/facts/registry";
import { loadFactSheet } from "@/lib/facts/content";
import type { FactBlock } from "@/lib/facts/parse";

function blockTexts(b: FactBlock): string[] {
  if (b.type === "p" || b.type === "h3") return [b.text];
  if (b.type === "ul") return b.items.flatMap((i) => [i.text, ...(i.sub ?? [])]);
  return [...b.header, ...b.rows.flat()];
}

// The copy rule, enforced (owner, 2026-08-30, after "Peak DC charging rate:
// not published. Ford states DC fast charging as a test condition…" shipped):
// a page body states values, never the absence of values and never the
// research that produced them. If we don't have the number, the row doesn't
// exist. Sourcing lives in footnotes; scope limits live in the scope note
// (which this list deliberately does not police); methodology lives in
// docs/. "Not offered" / "Not available" stay legal — a maker saying a
// feature can't be had IS a product fact.
const ABSENCE_NARRATION =
  /not published|not documented|not stated|not specified|not verified|not defined|not claimed|no claim|this sheet|this page|publishes no|does not publish|do not publish|was checked|were checked|not checked|wording|no \w+ document|document opened|documents? behind/i;

for (const entry of FACT_SHEETS) {
  test(`${entry.contentFile} parses into the fact-sheet shape`, () => {
    const parsed = loadFactSheet(entry.contentFile);

    assert.ok(parsed.title.length > 0, "empty title");
    assert.ok(parsed.sections.length > 0, "no content sections");
    assert.ok(parsed.seeItYourself.length > 0, "no See it for yourself links");
    assert.ok(parsed.footnotes.length > 0, "no footnotes");

    const blocks = parsed.sections.flatMap((s) => s.blocks);
    const tables = blocks.filter((b) => b.type === "table");
    assert.ok(tables.length > 0, "no tables — the sheet has regressed to prose");
    for (const t of tables) {
      if (t.type !== "table") continue;
      for (const row of t.rows) {
        assert.equal(row.length, t.header.length, `ragged table row: [${row.join(" · ")}]`);
      }
    }

    for (const section of parsed.sections) {
      for (const text of [section.heading, ...section.blocks.flatMap(blockTexts)]) {
        const hit = ABSENCE_NARRATION.exec(text);
        assert.equal(hit, null, `absence-narration on the page: "${text.slice(0, 120)}" (matched "${hit?.[0]}")`);
      }
    }

    const texts = [...blocks.flatMap(blockTexts), ...(parsed.scopeNote ?? [])];
    const referenced = new Set<number>();
    for (const text of texts) {
      for (const m of text.matchAll(/\[\^(\d+)\]/g)) referenced.add(Number(m[1]));
    }
    const defined = new Set(parsed.footnotes.map((f) => f.n));
    for (const n of referenced) {
      assert.ok(defined.has(n), `[^${n}] is referenced but never defined`);
    }
    for (const n of defined) {
      assert.ok(referenced.has(n), `footnote ${n} is defined but never referenced`);
    }
  });
}
