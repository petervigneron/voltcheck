// The `note` on a Fact must never become page copy. Run from web/:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/note-hygiene.mjs
//
// WHY THIS EXISTS, and why it is shaped the way it is now. A note is the
// researcher's qualifier on a figure. It has been swept off the page by hand
// three times — 2026-08-20 (VW ID. Buzz), 2026-08-22 (Toyota bZ), 2026-08-25
// (Hyundai Ioniq 5) — and each sweep left behind a filter meant to keep the
// "good" notes and drop the rest. The third one passed 2,463 notes, and the
// owner's objection was to notes it had passed: "Long Range pack" under a row
// already reading 84 kWh, "697 V nominal, long-range pack" under 800V,
// "Standard on AWD" under Standard on an AWD-keyed row. See noteRule.ts.
//
// So this no longer grades notes. It checks the only thing that can actually
// regress: that no render surface prints one. A note may be handed to a hover
// (`title`) or copied onto another Fact (`note:`); anything else is a note
// reaching a shopper's eye, and fails.
//
// Pure and offline. Exit 0 = clean, 10 = a note would render.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inlineNote } from "../lib/enrichment/noteRule.ts";
import { ENRICHMENT_ROWS } from "../lib/enrichment/data.ts";
import { RESEARCH_ROWS } from "../lib/enrichment/data2.ts";
import { RESEARCH_ROWS_3 } from "../lib/enrichment/data3.ts";
import { RESEARCH_ROWS_4 } from "../lib/enrichment/data4.ts";
import { RESEARCH_ROWS_5 } from "../lib/enrichment/data5.ts";
import { RESEARCH_ROWS_6 } from "../lib/enrichment/data6.ts";
import { RESEARCH_ROWS_9 } from "../lib/enrichment/data9.ts";

const ALL_ROWS = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4, ...RESEARCH_ROWS_5, ...RESEARCH_ROWS_6, ...RESEARCH_ROWS_9];

// ---- 1. The rule itself, against every note in the corpus. ----
const notes = [];
const walk = (rowId, path, obj) => {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== "object") continue;
    if ("value" in v && "source" in v) notes.push({ where: `${rowId}.${path}${k}`, note: v.note });
    else walk(rowId, `${path}${k}.`, v);
  }
};
for (const row of ALL_ROWS) walk(row.id, "", row);
const rendered = notes.filter((f) => inlineNote(f.note));

// ---- 2. The render surfaces, which is where this can actually regress. ----
// A note may reach a hover or be copied onto another Fact. It may not be
// printed. `severity`/`headline` (buyerNotes) are a different field and not
// in scope here.
const ROOTS = ["components", "app", "lib/listings"];
const ALLOWED = /(?:title\s*[=:]|note\s*:|aria-label\s*=)/;
const files = [];
const collect = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) collect(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
};
for (const r of ROOTS) collect(r);

const leaks = [];
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (!/\.note\b/.test(line)) return;
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    if (ALLOWED.test(line)) return;
    leaks.push(`${f}:${i + 1}\n    ${t}`);
  });
}

console.log(`${notes.length} facts, ${rendered.length} whose note would render as page copy, ${files.length} render-surface files scanned, ${leaks.length} printing a note`);
for (const f of rendered.slice(0, 20)) console.log(`  RULE BREACH ${f.where}\n    ${f.note}`);
for (const l of leaks) console.log(`  PRINTS A NOTE ${l}`);
process.exit(rendered.length || leaks.length ? 10 : 0);
