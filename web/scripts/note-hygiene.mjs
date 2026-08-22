// Every Fact note that would render under a value on a listing page, checked
// against the rule in lib/enrichment/noteRule.ts: cite, state a fact, or say
// nothing. Run from web/:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/note-hygiene.mjs [--list]
//
// WHY THIS EXISTS: this has now been swept out by hand twice. On 2026-08-20 a
// VW ID. Buzz page carried notes that repeated the number above them and named
// the document they came from; ~120 were deleted fleet-wide. On 2026-08-22 a
// Toyota bZ page carried "Toyota press: single AWD pack shared by XLE AWD and
// Limited AWD", "Toyota's own release, stated as approximate", and a range
// note quoting a different trim's figure — the same shapes, on rows written
// after that sweep. A rule that only lives in a commit message gets re-broken
// by the next research tranche, and the only detector was the owner opening a
// listing. So it lives here, and a new row of the same shape fails CI.
//
// Pure and offline: it reads only the static enrichment data. Exit 0 = clean,
// 10 = at least one note names its source or narrates the research.

import { ENRICHMENT_ROWS } from "../lib/enrichment/data.ts";
import { RESEARCH_ROWS } from "../lib/enrichment/data2.ts";
import { RESEARCH_ROWS_3 } from "../lib/enrichment/data3.ts";
import { RESEARCH_ROWS_4 } from "../lib/enrichment/data4.ts";
import { RESEARCH_ROWS_5 } from "../lib/enrichment/data5.ts";
import { inlineNote, reason } from "../lib/enrichment/noteRule.ts";

const ALL_ROWS = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4, ...RESEARCH_ROWS_5];
const LIST = process.argv.includes("--list");

const facts = [];
const walk = (rowId, path, obj) => {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== "object") continue;
    if ("value" in v && "source" in v) facts.push({ where: `${rowId}.${path}${k}`, note: v.note });
    else walk(rowId, `${path}${k}.`, v);
  }
};
for (const row of ALL_ROWS) walk(row.id, "", row);

const rendered = facts.filter((f) => inlineNote(f.note));
const bad = rendered.map((f) => ({ ...f, why: reason(f.note) })).filter((f) => f.why);

console.log(`${facts.length} facts, ${rendered.length} with a note that renders under the value, ${bad.length} in breach`);

if (LIST && !bad.length) {
  const seen = new Map();
  for (const f of rendered) seen.set(f.note, (seen.get(f.note) ?? 0) + 1);
  for (const [note, n] of [...seen].sort((a, b) => b[1] - a[1])) console.log(`  [${n}] ${note}`);
}

for (const f of bad) console.log(`  ${f.where}\n    ${f.note}\n    -> ${f.why}`);
process.exit(bad.length ? 10 : 0);
