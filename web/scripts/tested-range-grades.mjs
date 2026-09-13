// ─────────────────────────────────────────────────────────────────────────
// Does every tested-range figure belong to the car it is printed under?
//
// backfill.ts's two tables map a row id to a real-world range test. The
// failure they keep producing is not a wrong number — it is the right number
// under the wrong car: one grade's instrumented test credited to a sibling
// grade's row, which then prints it on every listing page for that config.
// On 2026-09-12 nineteen rows were doing it (a Taycan 4 printing the 4S's
// 337 mi, a Macan 4S and GTS printing the Turbo's 290, a 4S Cross Turismo
// printing the Turbo Cross Turismo's 246, an i5 xDrive40 printing the M60's
// 264, an i7 M70 printing the xDrive60's 314, an i4 xDrive40 printing the
// M50's 239). Every one had been there for weeks; the detector was the owner
// opening a listing page and recognising the figure.
//
// Two rules, both offline — no network, no article text:
//
//   SLUG      The source URL names a grade in its own path, and a row citing
//             it declares a different one. This is what caught the Taycan 4:
//             taycan-2025-26-4-pbp pointing at .../taycan-4s-....html.
//
//   SHARED    Two rows declaring different grades cite one URL with the SAME
//             figure. One of them is borrowing the other's number. The same
//             value is the whole signal: a multi-car article legitimately
//             feeds several rows — the Model 3 test that measured LR RWD at
//             386, Performance at 288 and base RWD at 277 is cited by all
//             three — but each row takes its own figure out of it. Equal
//             values across unequal grades is a copy, not a measurement.
//
// SLUG alone would have caught 9 of those 19 rows; the Macan and Cross
// Turismo sources name their grade only in the article title, which this
// script deliberately cannot read. SHARED catches all seven cases.
//
// GRADES below is narrow on purpose. It lists only grades that change motor
// output or pack — the things that move a range figure. Equipment trims
// (Bolt LT vs Premier, EV9 GT-Line vs not) are NOT here: they ride the same
// hardware, and a check that argued about them would be noise, and noise is
// how a check gets switched off.
//
// A borrow that is genuinely the same car goes in WAIVERS with a reason, the
// way a core-field hole goes in `abstains`. The reason is required and is
// checked for being a sentence, because an unchecked escape hatch is just a
// slower way to launder the same mistake.
// ─────────────────────────────────────────────────────────────────────────
import { TESTED_BY_ROWID, TESTED_EST_BY_ROWID } from "../lib/enrichment/backfill.ts";
import { ALL_ROWS } from "../lib/enrichment/rows.ts";

// Each family is a set of mutually exclusive grades, scoped to the makes it
// belongs to so one maker's badge can never be read as another's. Scoping is
// what lets "Performance" mean a Tesla trim without colliding with Porsche's
// Performance Battery, and what keeps a slug's "4s" out of a BMW row.
const GRADES = [
  {
    name: "Porsche grade",
    makes: ["PORSCHE"],
    tokens: ["base", "4", "4s", "gts", "turbo", "turbos", "turbogt"],
  },
  {
    name: "BMW grade",
    makes: ["BMW", "ROLLS-ROYCE"],
    tokens: ["edrive35", "edrive40", "xdrive40", "xdrive45", "xdrive50", "xdrive60", "m50", "m60", "m70"],
  },
  {
    name: "Escalade body",
    makes: ["CADILLAC"],
    tokens: ["iq", "iql"],
  },
  {
    name: "Tesla grade",
    makes: ["TESLA"],
    tokens: ["plaid", "performance", "lr", "standard"],
  },
];

// Badges that are written more than one way. Normalised before tokenising so
// "Turbo S" and "turbo-s" and "turbos" are one token rather than three, and
// so a slug's "turbo-s" cannot read as a bare "turbo".
const NORMALISE = [
  [/turbo[\s_-]*gt\b/g, "turbogt"],
  [/turbo[\s_-]*s\b/g, "turbos"],
  [/\bperf\b/g, "performance"],
  [/\be[\s_-]?drive[\s_-]?(35|40)\b/g, "edrive$1"],
  [/\bx[\s_-]?drive[\s_-]?(40|45|50|60)\b/g, "xdrive$1"],
];

const tokenise = (s) => {
  let t = String(s ?? "").toLowerCase();
  for (const [re, to] of NORMALISE) t = t.replace(re, to);
  return new Set(t.replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
};

// A row's own claim about which grade it is: the id (whose suffix is this
// file's naming convention), plus whatever the row states in `trim` and
// `packVariant`. Deliberately not `drive`, which answers a different question.
const rowGrades = (row, family) => {
  const src = [row.id, Array.isArray(row.trim) ? row.trim.join(" ") : row.trim, row.packVariant]
    .filter(Boolean).join(" ");
  const t = tokenise(src);
  return family.tokens.filter((g) => t.has(g));
};

const urlGrades = (url, family) => {
  const t = tokenise(url.replace(/^https?:\/\/[^/]+/, ""));
  return family.tokens.filter((g) => t.has(g));
};

// ── Waivers ──────────────────────────────────────────────────────────────
// A cross-grade citation that is the same car after all. `rows` is the set of
// row ids the waiver covers for that URL; a flag outside it still fails.
const WAIVERS = [
  {
    url: "https://insideevs.com/reviews/590360/bmw-i4-m50-range-test/",
    rows: ["i4-2026-m60"],
    reason:
      "BMW renamed the i4 M50 to i4 M60 xDrive for MY2025 without changing the pack or the motors, so the M50 test and the M60 row are the same car under two badges.",
  },
];

const waiverFor = (url, rowId) =>
  WAIVERS.find((w) => w.url === url && w.rows.includes(rowId));

// ── Collect every (row, fact) pair the two tables produce ────────────────
const byId = new Map(ALL_ROWS.map((r) => [r.id, r]));
const entries = [];
for (const [table, facts] of [["TESTED_BY_ROWID", TESTED_BY_ROWID], ["TESTED_EST_BY_ROWID", TESTED_EST_BY_ROWID]]) {
  for (const [id, fact] of Object.entries(facts)) {
    const row = byId.get(id);
    if (!row) {
      entries.push({ table, id, fact, row: null });
      continue;
    }
    entries.push({ table, id, fact, row });
  }
}

const errors = [];
const orphans = entries.filter((e) => !e.row).map((e) => `${e.table}["${e.id}"] names a row id that no longer exists`);

// ── Rule 1: SLUG ─────────────────────────────────────────────────────────
const slugFlags = [];
for (const { id, fact, row } of entries) {
  if (!row || !fact.sourceUrl) continue;
  for (const family of GRADES) {
    if (!family.makes.includes((row.make || "").toUpperCase())) continue;
    const named = urlGrades(fact.sourceUrl, family);
    // Two grades in one path is an index or a comparison, not a claim about
    // one car — it says nothing this rule can act on.
    if (named.length !== 1) continue;
    const mine = rowGrades(row, family);
    if (mine.length === 0 || mine.includes(named[0])) continue;
    if (waiverFor(fact.sourceUrl, id)) continue;
    slugFlags.push(
      `${id} declares ${family.name} "${mine.join("/")}" but cites a source whose path names "${named[0]}"\n      ${fact.sourceUrl}`
    );
  }
}

// ── Rule 2: SHARED ───────────────────────────────────────────────────────
// Group by (source URL, value). Within a group, more than one distinct grade
// means at least one row is wearing another's measurement.
const groups = new Map();
for (const { id, fact, row } of entries) {
  if (!row || !fact.sourceUrl) continue;
  const key = `${fact.sourceUrl} ${fact.value}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ id, row, fact });
}

const sharedFlags = [];
for (const [key, members] of groups) {
  const [url, value] = key.split(" ");
  for (const family of GRADES) {
    const scoped = members.filter((m) => family.makes.includes((m.row.make || "").toUpperCase()));
    if (scoped.length < 2) continue;
    const declared = new Map(); // grade string -> row ids
    for (const m of scoped) {
      const g = rowGrades(m.row, family);
      if (g.length === 0) continue; // says nothing about this family
      const k = g.join("/");
      if (!declared.has(k)) declared.set(k, []);
      declared.get(k).push(m.id);
    }
    if (declared.size < 2) continue;
    const unwaived = [...declared].filter(([, ids]) => ids.some((i) => !waiverFor(url, i)));
    if (unwaived.length < 2) continue;
    const shown = unwaived.map(([g, ids]) => `${g} (${ids.join(", ")})`).join(" vs ");
    sharedFlags.push(`${value} mi is printed under more than one ${family.name}: ${shown}\n      ${url}`);
  }
}

// ── Waiver hygiene ───────────────────────────────────────────────────────
for (const w of WAIVERS) {
  if (typeof w.reason !== "string" || w.reason.trim().split(/\s+/).length < 8)
    errors.push(`waiver for ${w.rows.join(", ")} has no reason — say why the two grades are one car, in a sentence`);
  for (const id of w.rows) {
    if (!byId.has(id)) errors.push(`waiver names row "${id}", which does not exist`);
  }
  const used = entries.some((e) => e.fact.sourceUrl === w.url && w.rows.includes(e.id));
  if (!used) errors.push(`waiver for ${w.rows.join(", ")} covers a citation that is no longer in either table — delete it`);
}

// ── Report ───────────────────────────────────────────────────────────────
const fail = [...orphans, ...errors, ...slugFlags, ...sharedFlags];
if (fail.length) {
  if (orphans.length) {
    console.log("\nRow ids with no row:");
    for (const o of orphans) console.log(`  - ${o}`);
  }
  if (errors.length) {
    console.log("\nBroken waivers:");
    for (const e of errors) console.log(`  - ${e}`);
  }
  if (slugFlags.length) {
    console.log("\nThe source's own path names a different grade:");
    for (const f of slugFlags) console.log(`  - ${f}`);
  }
  if (sharedFlags.length) {
    console.log("\nOne figure, more than one grade:");
    for (const f of sharedFlags) console.log(`  - ${f}`);
  }
  console.log(
    `\n${fail.length} tested-range citation${fail.length === 1 ? "" : "s"} to answer. Either the row is the tested car — then say so in WAIVERS with the reason — or it is not, and the honest fix is the right grade's own figure, or none.\n`
  );
  process.exit(1);
}

console.log(
  `OK — ${entries.length} tested-range citations, ${groups.size} distinct (source, figure) pairs, 0 printing another grade's measurement; ${WAIVERS.length} waived`
);
