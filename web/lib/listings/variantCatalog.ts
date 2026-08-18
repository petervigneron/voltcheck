import type { BodyType } from "@/lib/filters";
import { ENRICHMENT_ROWS } from "@/lib/enrichment/data";
import { RESEARCH_ROWS } from "@/lib/enrichment/data2";
import { RESEARCH_ROWS_3 } from "@/lib/enrichment/data3";
import { RESEARCH_ROWS_4 } from "@/lib/enrichment/data4";
import type { EnrichmentRow } from "@/lib/types";
import { FEED_CACHE_TAG } from "./db";
import type { CardRow } from "./card";

// The variant catalogue: what each model on the site was actually SOLD as —
// drivetrains, body class, and each rated version's EPA range — keyed by the
// model strings the feed uses, so the browse rail can ask "does this car come
// in AWD?" of the manufacturer's certification record instead of of whatever
// happens to be in stock this week.
//
// Why inventory can't answer that question: it's wrong in both directions.
// Volvo sold the EX30 as a single-motor RWD and a twin-motor AWD, but only 10
// of 285 listed today are RWD — the week that reads zero, an inventory-derived
// rail silently drops a choice that exists. The mirror failure is offering
// "+ AWD" on a Chevrolet Bolt, which was never built that way: a filter whose
// only outcome is an empty page. The catalogue makes the rule catalogue-first;
// inventory stays only as the fallback where the catalogue is silent.
//
// Source: the EPA's bulk vehicles dataset (fueleconomy.gov), loaded into
// epa_vehicle_variants by scraper/epa-variants.mjs (migration 0037) — the
// manufacturers' own certified figures, one row per rated configuration.
// Hand-researched enrichment rows (lib/enrichment) fill measured holes in it;
// see mergeEnrichment below.
//
// THE RULE THAT MUST SURVIVE EVERY CONSUMER: absence means UNKNOWN. A model
// with no digest entry, or a model-year missing from its entry, is a car we
// can't catalogue — not a car with no versions. The EPA file has verified
// holes (MY2023 Ioniq 5, MY2023 EQE; everything over 8,500 lb GVWR, so
// BrightDrop, E-Transit and the Escalade IQ never appear), and reading those
// as "single variant" would put the exact false filter on the rail this file
// exists to remove.

export type Drive = "AWD" | "RWD" | "FWD";

/** One model-year's catalogued versions. */
export interface YearVariants {
  /** Drivetrains this model year was rated in. */
  d: Drive[];
  /** Distinct EPA ranges of its rated versions, ascending. Absent when none
   *  of the year's rows carry one (PHEVs) — range-unknown, not zero-range. */
  r?: number[];
  /**
   * Present when the year came from lib/enrichment (manufacturer spec sheets,
   * hand-researched) rather than the EPA bulk file — and that changes what
   * absence means WITHIN the entry. An EPA year is the closed list of rated
   * configurations. An enrichment year lists versions that verifiably exist,
   * with no claim of completeness: the corpus is depth-first, so a consumer
   * may OFFER a drivetrain listed here, but must never grey one out for
   * missing from an e:1 year (the MY2023 EQE entry carries only the 4MATICs
   * the corpus has rows for; Mercedes also sold the RWD 350+).
   */
  e?: 1;
}

/** One model's catalogued variant space. */
export interface ModelVariants {
  /** Drivetrains the model was ever sold with, across all catalogued years. */
  d: Drive[];
  /**
   * Body type, only when every rated configuration in every year maps to the
   * same one, and only for the classes the EPA states unambiguously (SUV,
   * pickup, van). The EPA's VClass is a regulatory bucket, not a showroom
   * body — the 2022 Ioniq 5 is filed under "Large Cars" — so
   * lib/listings/bodyType.ts remains the authority for the body filter and
   * this field is corroboration, never contradiction.
   */
  b?: BodyType;
  /** Per catalogued model year. A year missing here is unknown, not one-version. */
  y: Record<number, YearVariants>;
}

/** Keyed like the browse tally: lowercased "make model" of the feed's strings. */
export type VariantDigest = Record<string, ModelVariants>;

// ── The join ────────────────────────────────────────────────────────────────
// Feed model strings are a mess ("ioniq" spans twelve spellings) and the
// EPA's model strings carry the version name ("EX30 Twin Performance (19 Inch
// Wheels)"). The join works in normalized token lists and leans on the EPA's
// own baseModel column for model identity:
//
//   1. Tokenize: uppercase, split on non-alphanumerics and letter↔digit
//      boundaries, so "Mach-E" / "Mach E" agree and "CLA" meets "CLA250".
//   2. A feed model collects rows from base models of its make three ways,
//      unioned:
//        exact    its tokens are a base's tokens ("Bolt EV", "Model Y"):
//                 the whole base group. Base identity is what keeps "Ioniq"
//                 (the 2017-21 hatchback) from swallowing "Ioniq 5", and
//                 "e-tron" from swallowing "e-tron GT" — different bases.
//        extends  its tokens contain a base's tokens in order ("Equinox EV"
//                 extends "Equinox"; "Ioniq 5 N" extends "Ioniq 5"): only the
//                 group's rows whose model string carries EVERY feed token —
//                 the N gets the N rows, never the base car's RWD. A version
//                 the EPA filed under a sibling base still lands ("RS e-tron
//                 GT Performance" lives under base "RS e-tron").
//        reduced  trailing marketing tokens the EPA doesn't print (the NOISE
//                 list: "Recharge Pure Electric", "PHEV") drop one at a time,
//                 and each reduced form may claim a base it EXACTLY matches —
//                 "Niro EV" reaches base "Niro", "X5 PHEV" reaches "X5".
//                 Only noise tokens drop: anything else ("Ioniq 5 N" → "Ioniq
//                 5") would let a sub-model claim variants it was never sold
//                 in, which is the false-filter bug again.
//      If all of that is empty: a model NAMED like a base but shorter takes
//      its unique base ("CLA" → base "CLA-Class"; two candidates = ambiguous
//      = no match), and as a last resort the feed tokens may match model
//      strings directly, in order from the front ("550e" → "550e xDrive
//      Sedan" under base "5 Series"). Still nothing → UNKNOWN, never
//      inherited: "Blazer EV Police Package" must not claim the showroom
//      Blazer's drivetrains.
//   3. A feed model that names its fuel ("Bolt EV", "Kona Electric",
//      "Wrangler 4xe") only matches rows of that type, so "Niro EV" can never
//      collect the Niro Plug-in Hybrid's rows.
//
// Base groups are keyed by token identity, not raw string — the EPA files
// "Leaf" and "LEAF" as two baseModels for one car.

const tokenize = (s: string): string[] =>
  s
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .flatMap((w) => w.split(/(?<=[A-Z])(?=[0-9])|(?<=[0-9])(?=[A-Z])/))
    .filter(Boolean);

const normMake = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** a is an in-order subsequence of b, anchored at b's first token. */
function anchoredSubseq(a: string[], b: string[]): boolean {
  if (a.length === 0 || a.length > b.length || a[0] !== b[0]) return false;
  let j = 0;
  for (const t of b) if (t === a[j] && ++j === a.length) return true;
  return false;
}

const NOISE = new Set(["ELECTRIC", "EV", "BEV", "PHEV", "RECHARGE", "PURE", "PLUG", "HYBRID"]);

// Certified but never retailed: configurations the EPA rates that no shopper
// can buy, which therefore must not widen a model's variant space. The one
// known case is the Motional "Ioniq 5 Robo taxi" (168 mi, MY2025-26, verified
// in epa_vehicle_variants 2026-08-17) — left in, that single row was the only
// sub-200-mile Ioniq 5, and it put "+ 200+ mi range" back on the Ioniq 5 rail
// (lib/listings/quickRail.ts) with hiding ~700 range-unresolved cars as the
// button's only possible effect: the exact false filter this catalogue exists
// to remove. Police packages are deliberately NOT excluded — ex-fleet police
// cars do reach dealer lots, and the feed already carries "Blazer EV Police
// Package" as a model of its own. Add here only with the EPA string in hand
// and a rail failure it reproduces.
const FLEET_ONLY = /\bROBO ?TAXI\b/i;

// Feed spellings the token rules can't bridge, applied before tokenizing.
// Each entry is a claim checked against both sides of the join; add here only
// with the EPA string in hand.
const MODEL_ALIASES: Record<string, string> = {
  // The feed files the electric Lexus ES as "ESe"; the EPA rates it as
  // "ES 350e" / "ES 500e" under base model "ES".
  ese: "es",
  // Audi's US A6/S6 e-tron IS the Sportback body, and dealers name it so; the
  // EPA's strings and base models say plain "A6 e-tron" / "S6 e-tron"
  // (verified 2026-08-17: no "Sportback" anywhere under those bases, unlike
  // Q4/Q6/Q8, whose Sportback variants are rated separately and must NOT be
  // collapsed this way).
  "a6 sportback e-tron": "a6 e-tron",
  "s6 sportback e-tron": "s6 e-tron",
};

export interface EpaVariantRow {
  make: string;
  model: string;
  base_model: string | null;
  model_year: number;
  ev_type: "BEV" | "PHEV";
  drive: Drive | null;
  epa_range_mi: number | null;
  vclass: string | null;
}

interface BaseGroup {
  baseToks: string[];
  rows: EpaVariantRow[];
}

/** Which fuel types a feed model string admits; null = both. */
function fuelRestriction(modelToks: string[], rawModel: string): "BEV" | "PHEV" | null {
  const raw = rawModel.toUpperCase();
  if (/PHEV|PLUG.?IN|4XE|HYBRID/.test(raw)) return "PHEV";
  if (modelToks.some((t) => t === "EV" || t === "ELECTRIC" || t === "BEV")) return "BEV";
  return null;
}

/**
 * Build the per-model digest for the models actually in the feed. Pure — the
 * fetch lives in fetchEpaVariants — so the join is testable offline against
 * the raw CSV.
 */
export function buildVariantDigest(
  models: { make: string; model: string }[],
  epaRows: EpaVariantRow[]
): VariantDigest {
  // EPA rows grouped by make, then base model — by TOKEN identity, because
  // the EPA files "Leaf" and "LEAF" as two baseModels for one car.
  const byMake = new Map<string, Map<string, BaseGroup>>();
  for (const r of epaRows) {
    if (FLEET_ONLY.test(r.model)) continue;
    const mk = normMake(r.make);
    const baseToks = tokenize(r.base_model ?? r.model);
    const baseKey = baseToks.join(" ");
    let bases = byMake.get(mk);
    if (!bases) byMake.set(mk, (bases = new Map()));
    let g = bases.get(baseKey);
    if (!g) bases.set(baseKey, (g = { baseToks, rows: [] }));
    g.rows.push(r);
  }

  const digest: VariantDigest = {};
  for (const m of models) {
    const bases = byMake.get(normMake(m.make));
    if (!bases) continue;

    // The make restated inside the model ("Polestar 2" under make Polestar)
    // carries no information; aliases bridge spellings tokens can't.
    const makeToks = tokenize(m.make);
    let toks = tokenize(MODEL_ALIASES[m.model.toLowerCase()] ?? m.model);
    while (toks.length > 1 && makeToks.includes(toks[0])) toks = toks.slice(1);
    const fuel = fuelRestriction(toks, m.model);

    const rows = matchRows(toks, bases, fuel);
    if (!rows) continue;

    const entry = aggregate(rows);
    if (entry) digest[`${m.make} ${m.model}`.toLowerCase()] = entry;
  }
  return digest;
}

/** a is an unordered subset of b (every token of a appears somewhere in b). */
function subset(a: string[], b: string[]): boolean {
  return a.every((t) => b.includes(t));
}

/** In-order subsequence, anchored nowhere: [GV,70] ⊆ [ELECTRIFIED,GV,70]. */
function subseq(a: string[], b: string[]): boolean {
  let j = 0;
  for (const t of b) if (t === a[j] && ++j === a.length) return true;
  return a.length === 0;
}

const sameToks = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

function matchRows(
  toks: string[],
  bases: Map<string, BaseGroup>,
  fuel: "BEV" | "PHEV" | null
): EpaVariantRow[] | null {
  const admit = (r: EpaVariantRow) => !fuel || r.ev_type === fuel;
  const out = new Set<EpaVariantRow>();

  for (const g of bases.values()) {
    if (sameToks(g.baseToks, toks)) {
      // exact: the whole base group is this model's variant space.
      for (const r of g.rows) if (admit(r)) out.add(r);
    } else if (g.baseToks.length < toks.length && subseq(g.baseToks, toks)) {
      // extends: only rows whose own model string carries every feed token.
      // Unordered on purpose — the EPA wrote "Q4 e-tron Sportback" in 2022
      // and "Q4 Sportback e-tron" in 2024, one car both times.
      for (const r of g.rows) if (admit(r) && subset(toks, tokenize(r.model))) out.add(r);
    }
  }

  // reduced: trailing marketing noise dropped one token at a time, each form
  // claiming only a base it exactly matches ("Niro EV" → base "Niro").
  for (let t = toks; t.length > 1 && NOISE.has(t[t.length - 1]); ) {
    t = t.slice(0, -1);
    for (const g of bases.values()) {
      if (sameToks(g.baseToks, t)) for (const r of g.rows) if (admit(r)) out.add(r);
    }
  }

  if (out.size === 0) {
    // Named like a base but shorter ("CLA" → "CLA-Class") — only when
    // unambiguous. Two candidate bases means we don't know which car this is.
    const shortened = [...bases.values()].filter(
      (g) => toks.length < g.baseToks.length && anchoredSubseq(toks, g.baseToks)
    );
    if (shortened.length === 1) {
      for (const r of shortened[0].rows) if (admit(r)) out.add(r);
    }
  }
  if (out.size === 0) {
    // Last resort, the version-named feed model whose base renamed the car:
    // "550e" matches "550e xDrive Sedan" under base "5 Series".
    for (const g of bases.values()) {
      for (const r of g.rows) if (admit(r) && anchoredSubseq(toks, tokenize(r.model))) out.add(r);
    }
  }
  return out.size ? [...out] : null;
}

const VCLASS_BODY: [RegExp, BodyType][] = [
  [/sport utility/i, "suv"],
  [/pickup/i, "truck"],
  [/van/i, "van"], // matches "Minivan" and the cargo/passenger van classes
];

function aggregate(rows: EpaVariantRow[]): ModelVariants | null {
  const years = new Map<number, { d: Set<Drive>; r: Set<number> }>();
  const allDrives = new Set<Drive>();
  for (const r of rows) {
    let y = years.get(r.model_year);
    if (!y) years.set(r.model_year, (y = { d: new Set(), r: new Set() }));
    if (r.drive) {
      y.d.add(r.drive);
      allDrives.add(r.drive);
    }
    if (r.ev_type === "BEV" && r.epa_range_mi) y.r.add(r.epa_range_mi);
  }
  if (allDrives.size === 0) return null;

  const y: Record<number, YearVariants> = {};
  for (const [year, v] of [...years].sort((a, b) => a[0] - b[0])) {
    if (v.d.size === 0) continue; // a year that says nothing claims nothing
    const entry: YearVariants = { d: [...v.d].sort() };
    if (v.r.size) entry.r = [...v.r].sort((a, b) => a - b);
    y[year] = entry;
  }

  // Body only when every configuration maps to one unambiguous class. The
  // Hummer EV (pickup and SUV under one base) and the EQE (sedan and SUV)
  // stay silent here on purpose.
  let b: BodyType | undefined | "mixed";
  for (const r of rows) {
    const mapped = r.vclass ? VCLASS_BODY.find(([re]) => re.test(r.vclass!))?.[1] : undefined;
    if (b === undefined) b = mapped;
    else if (b !== mapped) b = "mixed";
  }

  const out: ModelVariants = { d: [...allDrives].sort(), y };
  if (b && b !== "mixed") out.b = b;
  return out;
}

// ── Enrichment fill for measured EPA holes ──────────────────────────────────
// lib/enrichment's hand-researched rows carry drivetrain and EPA range read
// from manufacturer spec sheets — including model years the EPA bulk file
// simply lacks (MY2023 Ioniq 5: absent, control-tested against 2022/2024).
// Those rows fill ONLY years the EPA digest has no entry for, and only from
// rows whose range fact is the manufacturer's own figure (source "mfr");
// estimates stay out — the catalogue's claim is "the maker sold it this way",
// and an estimate can't carry that.

const ALL_ENRICHMENT: EnrichmentRow[] = [
  ...ENRICHMENT_ROWS,
  ...RESEARCH_ROWS,
  ...RESEARCH_ROWS_3,
  ...RESEARCH_ROWS_4,
];

export function mergeEnrichmentYears(digest: VariantDigest, models: { make: string; model: string }[]): void {
  for (const m of models) {
    const makeToks = tokenize(m.make);
    let toks = tokenize(m.model);
    while (toks.length > 1 && makeToks.includes(toks[0])) toks = toks.slice(1);
    const key = `${m.make} ${m.model}`.toLowerCase();

    const rows = ALL_ENRICHMENT.filter((r) => {
      if (normMake(r.make) !== normMake(m.make) || !r.drive) return false;
      // Exact model identity only — an enrichment row for "Ioniq 5" must not
      // fill "Ioniq 5 N", whose variant space it says nothing about.
      return [r.model, ...(r.modelAliases ?? [])].some((rm) => {
        let rt = tokenize(rm);
        while (rt.length > 1 && makeToks.includes(rt[0])) rt = rt.slice(1);
        return rt.length === toks.length && rt.every((t, i) => t === toks[i]);
      });
    });
    if (rows.length === 0) continue;

    const entry = digest[key];
    const fill = new Map<number, { d: Set<Drive>; r: Set<number> }>();
    for (const r of rows) {
      for (let year = r.modelYears[0]; year <= r.modelYears[1]; year++) {
        if (entry?.y[year]) continue; // the EPA already answers this year
        let f = fill.get(year);
        if (!f) fill.set(year, (f = { d: new Set(), r: new Set() }));
        f.d.add(r.drive!);
        const range = r.range?.epaRangeMi;
        // "mfr" alone is not enough for the r field, which holds EPA ratings:
        // the corpus files the Escalade IQ's 465 mi as source "mfr" at
        // confidence "medium" precisely because it is Cadillac's ESTIMATE —
        // the truck is GVWR-exempt and has no EPA figure at all. High-
        // confidence mfr range facts are the maker reprinting the certified
        // number (the MY2023 Ioniq 5 pass); those belong, estimates don't.
        if (range && range.source === "mfr" && range.confidence === "high") f.r.add(range.value);
      }
    }
    if (fill.size === 0) continue;

    const target = entry ?? (digest[key] = { d: [], y: {} });
    for (const [year, f] of [...fill].sort((a, b) => a[0] - b[0])) {
      const yEntry: YearVariants = { d: [...f.d].sort(), e: 1 };
      if (f.r.size) yEntry.r = [...f.r].sort((a, b) => a - b);
      target.y[year] = yEntry;
    }
    target.d = [...new Set([...target.d, ...Object.values(target.y).flatMap((v) => v.d)])].sort();
  }
}

// ── Fetch + assembly ────────────────────────────────────────────────────────

const PAGE = 1000; // PostgREST's hard cap; the table is ~2k rows, so two pages.

/** The whole catalogue table, or null when the DB is unconfigured or
 *  unreachable — in which case the digest is simply absent and every consumer
 *  treats every model as unknown, the honest failure direction. */
export async function fetchEpaVariants(): Promise<EpaVariantRow[] | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  const rows: EpaVariantRow[] = [];
  try {
    let after: number | null = null;
    for (;;) {
      const url =
        `${base}/rest/v1/epa_vehicle_variants` +
        `?select=epa_id,make,model,base_model,model_year,ev_type,drive,epa_range_mi,vclass` +
        `&order=epa_id.asc&limit=${PAGE}` +
        (after !== null ? `&epa_id=gt.${after}` : "");
      const res = await fetch(url, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Encoding": "gzip" },
        // Same vintage discipline as the feed itself: cached a day, expired by
        // /api/revalidate's tag, so the digest is rebuilt exactly when the
        // browse index is.
        next: { revalidate: 86400, tags: [FEED_CACHE_TAG] },
      });
      if (!res.ok) throw new Error(`PostgREST ${res.status}`);
      const page = (await res.json()) as (EpaVariantRow & { epa_id: number })[];
      rows.push(...page);
      if (page.length < PAGE) return rows;
      after = page[page.length - 1].epa_id;
    }
  } catch (err) {
    console.error("[variants] EPA catalogue read failed — models will read as unknown:", err);
    return null;
  }
}

/**
 * The digest for the browse client, keyed by the feed's own model strings.
 * Distinct (make, model) pairs come from the card rows; a pair listed twice
 * with different casing joins under whichever form appears (the key is
 * lowercased either way).
 */
export async function buildVariantDigestForRows(rows: CardRow[]): Promise<VariantDigest | undefined> {
  const seen = new Map<string, { make: string; model: string }>();
  for (const r of rows) {
    const k = `${r.make} ${r.model}`.toLowerCase();
    if (!seen.has(k)) seen.set(k, { make: r.make, model: r.model });
  }
  const models = [...seen.values()];
  const epa = await fetchEpaVariants();
  if (!epa) return undefined;
  const digest = buildVariantDigest(models, epa);
  mergeEnrichmentYears(digest, models);
  return digest;
}
