import type { VariantToggleKey } from "../filters";
import type { CardRow } from "./card";
import type { Drive, VariantDigest } from "./variantCatalog";

// Which quick toggles earn a place on the browse rail, and in what state —
// one decision, shared by the server's first-paint build
// (lib/listings/firstPaint.ts, which answers the pristine landing state) and
// the client's per-keystroke recompute (components/Browse.tsx), rendered by
// components/Filters.tsx. Types only from variantCatalog.ts: this module
// rides in the client bundle, and the catalogue's runtime half drags the
// whole enrichment corpus with it.
//
// A toggle earns its place by dividing something real. Three ways it can fail
// to, and each is a false claim if shown:
//
//   nothing      "+ AWD" on a Chevrolet Bolt — never built that way, so the
//                button's only outcome is an empty page.
//   everything   "+ SUVs" on a Bolt EUV search, where every car is an SUV.
//   only the unknowns   the subtle one. The toggles admit only cars we can
//                verifiably classify, so a car we know nothing about fails
//                all of them. On an F-150 Lightning search "+ 200+ mi range"
//                excluded 19 of 357 trucks and NOT ONE was under 200 miles —
//                every Lightning is 230–320; the 19 were trucks whose range
//                we never resolved. Shown, it reads as a range filter and
//                acts as a "do we have data" filter: matching the wrong
//                thing. Hence `of` below: the denominator is cars with an
//                answer on that axis (match.ts QUICK_KNOWS), never the pool.
//
// The two axes (lib/filters.ts QUICK_TOGGLES) get genuinely different rules:
//
//   market   Mileage and price are properties of this week's listings, so the
//            listings are the whole truth, and the toggle has to divide the
//            judgeable cars AND clear a share — two cars over 60k miles in
//            4,603 Lyriqs is noise, not a filter. Measured over the 90 models
//            with 50+ cars (450 toggle slots): this share rule plus the
//            variant rule kept 116 toggles; a flat 5% on everything kept 110
//            but lost the EX30 case below; no floor at all kept 155 and the
//            Lyriq noise with them. The share measures FAILS, which is what
//            keeps the rare find: the lone sub-$30k Taycan passes while 288
//            peers fail, so that button stays.
//
//   variant  Drivetrain, body, rated range are properties of the MODEL —
//            decided once by the maker, picked between by the shopper — so
//            inventory is the wrong witness, in both directions. Volvo sold
//            the EX30 as a single-motor RWD and a twin-motor AWD; the week
//            the 10 listed RWDs hit zero, an inventory rule silently deletes
//            a choice that still exists. And one mis-stamped "AWD" Bolt in
//            the feed would conjure a version Chevrolet never built. So these
//            consult the variant catalogue (variantCatalog.ts — the EPA's own
//            certification records, shipped in the first-paint payload) for
//            the models actually in the results:
//
//              offer  iff a matching version exists among those models AND so
//                     does a non-matching one — the variant SPACE divides,
//                     whatever happens to be in stock. Zero in stock renders
//                     the toggle dead (visible, disabled): "comes in AWD,
//                     none listed right now" is real information, the same
//                     way SpecFacets keeps an exhausted value visible.
//              never  when the catalogue says those models are single-variant
//                     on the axis (the Bolt case) — there the catalogue
//                     overrules stray in-stock counter-rows, because the
//                     EPA's list of a year's rated configurations is closed
//                     and a dealer's drivetrain field is not.
//
//            The catalogue is consulted per model AND per model year, and its
//            absence — a model with no entry, a year missing from one — means
//            UNKNOWN, never "single variant": those cars fall back to what
//            their own rows say, which is the old inventory inference scoped
//            to exactly the cars the catalogue can't speak for. Years flagged
//            e:1 are enrichment-sourced and non-exhaustive: their listed
//            versions are real (they may add either side of the division) but
//            absence from them proves nothing, so their cars' rows are STILL
//            consulted. And the body toggle stays under bodyType.ts's
//            authority: the catalogue's `b` may only rule versions OUT for
//            rows bodyType.ts left unclassified — it never puts a body toggle
//            up, because rows without a curated body can never pass the body
//            filter, and a button over cars the filter can't show would be
//            the empty-page bug wearing EPA clothes.
//
// When there is no digest at all — the payload hasn't landed, failed, or a
// stale cached body predates the field — `offer` is simply absent and the
// variant rule degrades to the inventory inference (0 < n < of), which was
// the rule before the catalogue existed: thin but honest. The rail's
// pre-payload state is unchanged from before: quickCounts undefined means
// every toggle shows (components/Filters.tsx) — a rail stripped bare while
// loading would be a wrong answer, not a pending one.

/** What one quick toggle would leave (`n`), out of how many cars it can judge
 *  (`of`), of how many the pool held in total (`all` — the denominator that
 *  says whether an absence was verified on every car or merely on the ones
 *  with data), and — for variant toggles when the catalogue digest is present
 *  — whether the catalogue says to offer it at all. `offer` absent = no
 *  digest, fall back to inventory inference. */
export interface QuickCount {
  n: number;
  of: number;
  all: number;
  offer?: boolean;
}

const digestKey = (r: CardRow) => `${r.make} ${r.model}`.toLowerCase();

/**
 * The catalogue-first verdict for one variant-axis toggle over one pool of
 * result rows: true iff a matching version AND a non-matching version both
 * exist among the pool's models — from the catalogue where it speaks, from
 * the rows themselves where it doesn't.
 */
export function offerVariantToggle(
  key: VariantToggleKey,
  value: string,
  pool: CardRow[],
  digest: VariantDigest
): boolean {
  let hasMatch = false;
  let hasOther = false;

  if (key === "drive") {
    for (const r of pool) {
      const yv = digest[digestKey(r)]?.y[r.year];
      if (yv) {
        if (yv.d.includes(value as Drive)) hasMatch = true;
        if (yv.d.some((d) => d !== value)) hasOther = true;
        if (hasMatch && hasOther) return true;
        // An EPA year is the closed list of rated configurations — the row's
        // own drivetrain field adds nothing and may only contradict it (the
        // mis-stamped AWD Bolt). An e:1 year is non-exhaustive, so its cars
        // still testify below.
        if (!yv.e) continue;
      }
      if (r.drive !== undefined) {
        if (r.drive === value) hasMatch = true;
        else hasOther = true;
        if (hasMatch && hasOther) return true;
      }
    }
  } else if (key === "minRange") {
    const min = Number(value);
    for (const r of pool) {
      const yv = digest[digestKey(r)]?.y[r.year];
      // `r` absent on a catalogued year is range-UNKNOWN (none of the year's
      // rows carried one), never zero-range — those cars fall through to
      // their own resolved range, same as an uncatalogued year.
      if (yv?.r) {
        if (yv.r[yv.r.length - 1] >= min) hasMatch = true; // ascending
        if (yv.r[0] < min) hasOther = true;
        if (hasMatch && hasOther) return true;
        if (!yv.e) continue;
      }
      if (r.rangeMi != null) {
        if (r.rangeMi >= min) hasMatch = true;
        else hasOther = true;
        if (hasMatch && hasOther) return true;
      }
    }
  } else {
    // body — model-level (a body never sells out separately from its model,
    // so there is no per-year question and no dead state to reach here).
    for (const r of pool) {
      if (r.body !== undefined) {
        // bodyType.ts is the authority wherever it speaks (the EPA files the
        // 2022 Ioniq 5 under "Large Cars"; the catalogue's b never overrides).
        if (r.body === value) hasMatch = true;
        else hasOther = true;
      } else {
        const b = digest[digestKey(r)]?.b;
        // Rule-out only. A row without a curated body can never PASS the body
        // filter, so catalogue-b matching `value` must not put the toggle up:
        // it would be a button (live or dead) over cars the filter can't
        // show. But catalogue-b naming a different body is a real
        // non-matching version among the models — it may keep the toggle
        // offered where the old rule saw only unknowns.
        if (b && b !== value) hasOther = true;
      }
      if (hasMatch && hasOther) return true;
    }
  }
  return false;
}

export type QuickToggleState = "live" | "dead" | "hidden";

// Market toggles must genuinely divide: a toggle keeping over 95% of the
// judgeable cars is noise (the two high-mile Lyriqs), not a filter.
const MARKET_SHARE = 0.95;

/**
 * The rail state for one toggle, given its counts. The caller owns two rules
 * that sit above this one: a toggle that is currently ON always renders live
 * (the only way to switch it off is for it to be there), and an undefined
 * quickCounts — nothing has landed yet — shows everything.
 */
export function quickToggleState(axis: "variant" | "market", c: QuickCount | undefined): QuickToggleState {
  if (!c) return "hidden";
  if (axis === "variant" && c.offer !== undefined) {
    if (!c.offer) return "hidden";
    if (c.n > 0) return "live";
    // Zero in stock. Dead says "this version exists, none listed right now" —
    // a negative, and negatives get verified here, not guessed: it stands
    // only when every car in the pool could actually be judged on the axis
    // (of === all). With unknowns in the pool the absence is a guess — the
    // Lexus RZ case, found in the 2026-08-17 survey: the catalogue rightly
    // says 200+ mi versions exist, but ZERO of the 63 listed RZs have a
    // resolved range, so "no 200+ mi range in stock" would be a false claim
    // over cars that are almost certainly rated 220+ — and live would be a
    // click into an empty page. Hidden is the honest remainder.
    return c.of === c.all ? "dead" : "hidden";
  }
  // No catalogue verdict (market axis, or no digest this session): inventory
  // inference. n === 0 hides rather than deads — without the catalogue,
  // "exists but sold out" and "no such version" are indistinguishable, and a
  // dead toggle would claim the first.
  if (c.n === 0) return "hidden";
  return c.n < c.of * (axis === "market" ? MARKET_SHARE : 1) ? "live" : "hidden";
}
