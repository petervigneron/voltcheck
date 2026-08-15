import type { Listing } from "./types";

/**
 * Whether we are willing to print this listing's trim as a fact.
 *
 * Prompted by a 2022 F-150 Lightning that a Chevrolet store listed as a "Pro"
 * while its own description read "F-150 Lightning Lariat" with Equipment Group
 * 511A High, BlueCruise, a twin-panel moonroof and ventilated seats — none of
 * it Pro content, and the photo (painted bumpers, chrome surrounds, power-fold
 * tow mirrors) agreed with the description. We printed "Pro" beside a correct
 * 320 mi, and the pair is what reads as impossible to anyone who knows these
 * trucks. The range was never wrong; the badge was.
 *
 * The rule is CONTRADICTION, not confirmation. Measured against live inventory
 * on 2026-08-15: of 15,392 listings carrying a trim, 11,735 (76%) have it
 * repeated in their own description, 1,012 have no usable description at all,
 * and ~2,645 have marketing boilerplate that simply never names the version.
 * Demanding positive backing would blank the trim on 24% of the site, most of
 * them correct — punishing a missing source rather than a wrong one. So
 * silence is not evidence. An explicit, unambiguous naming of a DIFFERENT
 * version is.
 *
 * We suppress rather than substitute. The description is usually the more
 * reliable of the two (it is generally the window sticker's option list), but
 * promoting it would trade a trim we can't trust for one we haven't verified,
 * and the house rule is that matching nothing is honest while matching the
 * wrong thing is not. The conflicting name is returned so a detail surface can
 * show the disagreement; cards should just drop the trim.
 */

// Cab styles are not trims — every Lightning is a SuperCrew. These reach us
// from our own pipeline, not the dealers: scraper/vpic-enrich.mjs fills an
// empty trim from vPIC, and for 2022-23 Lightnings vPIC returns Trim
// "SuperCrew" with no Series at all. 31 live listings carry it today.
const CAB_STYLES =
  /^(super\s*crew|super\s*cab|crew\s*cab|regular\s*cab|extended\s*cab|double\s*cab|quad\s*cab|king\s*cab)$/i;

// Placeholders that a feed or a decoder emits when it has nothing, plus
// drivetrain tokens — "4x4" is not a version of a Grand Cherokee 4xe, it is
// the drive field in the wrong column.
const PLACEHOLDER =
  /^(n\/?a|none|other|unknown|base|standard|electric|ev|\d?dr|\d?d|awd|rwd|fwd|4wd|4x4|4x2|2wd)$/i;

/**
 * Two names for one version, not two versions. Feeds abbreviate ("Tour" for
 * Touring, "PLAT" for Platinum+, "Lux-1" for Luxury 1), stack GM's tier digit
 * on the front ("2LT" where the prose just says LT), and suffix BMW's motor
 * codes ("xDrive50i" vs xDrive50). Measured on live inventory, these variants
 * were 60% of everything the contradiction rule caught — they would have
 * blanked ~165 correct trims, most of a Honda Prologue's inventory among them.
 *
 * Split each name into its letter stem and its number, and call them the same
 * version when the stems are prefix-compatible AND the numbers don't disagree.
 * Both halves are load-bearing:
 *   "Lux-1" / "Luxury"    LUX ⊂ LUXURY, one number absent      → same
 *   "2LT" / "LT"          LT = LT, one number absent           → same
 *   "xDrive50i" / "xDrive50"  XDRIVEI ⊃ XDRIVE, 50 = 50        → same
 *   "M60" / "M50"         stem "M" too short to carry meaning  → CONFLICT
 *   "xDrive40" / "xDrive50"   stems agree, 40 ≠ 50             → CONFLICT
 * Without the number check, every BMW motor code would collapse into one
 * trim; without the stem check, GM's tier digits would each read as a
 * different car.
 *
 * Deliberately generous overall: calling a real conflict a variant just means
 * we keep printing the feed's trim, which is the status quo, while the reverse
 * blanks a field that was right.
 */
function sameTrimName(a: string, b: string): boolean {
  const parts = (s: string) => {
    const n = s.split("/")[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
    return { stem: n.replace(/[0-9]/g, ""), num: n.replace(/[^0-9]/g, "") };
  };
  const x = parts(a);
  const y = parts(b);
  if (!x.stem || !y.stem) return false;
  if (x.stem !== y.stem) {
    // Prefix containment is the weaker evidence, so it needs a stem long
    // enough to mean something: "SE" must not be swallowed by "SEL", but
    // "LT" == "LT" is conclusive at any length.
    const [short, long] = x.stem.length <= y.stem.length ? [x.stem, y.stem] : [y.stem, x.stem];
    if (short.length < 3 || !long.startsWith(short)) return false;
  }
  // A number on both sides has to match; a number on only one side is the
  // more specific of two names for the same thing.
  return !x.num || !y.num || x.num === y.num;
}

/**
 * Trim names that are also ordinary feature words. Matching these inside prose
 * produces confident nonsense: "Pro Trailer Backup Assist" on a loaded Lariat
 * reads as a Pro, "Premium Audio" as a Premium, "Sport Appearance Package" as
 * a Sport. Each needs the trailing feature noun stripped before the sentence
 * can be read as naming a version.
 */
const FEATURE_NOISE =
  /\b(pro\s+(?:trailer|power|access|co-?pilot|series)\S*|premium\s+(?:audio|sound|package|paint|wheels?|interior)|sport\s+(?:appearance|package|seats?|suspension|mode)|select\s+(?:shift|terrain)|launch\s+(?:control|edition\s+package)|technology\s+package|luxury\s+package)\b/gi;

/** A trim vocabulary learned from inventory rather than hardcoded: whatever
 *  dealers actually call this model's versions. Self-maintaining as new trims
 *  appear (Flash, Uncharted) and immune to a stale table. */
export type TrimVocabulary = Map<string, Set<string>>;

const modelKey = (make: string, model: string) =>
  `${make}|${model}`.toUpperCase().replace(/\s+/g, " ").trim();

export function buildTrimVocabulary(
  listings: { make: string; model: string; trim?: string }[]
): TrimVocabulary {
  // A name has to be used by several listings before it counts as a version of
  // the car; one dealer's freeform string is not a vocabulary entry.
  const counts = new Map<string, Map<string, number>>();
  for (const l of listings) {
    const t = (l.trim ?? "").trim();
    if (!t || t.length < 2 || t.length > 20 || CAB_STYLES.test(t) || PLACEHOLDER.test(t)) continue;
    if (/\s/.test(t)) continue; // single-word names only — multiword strings are option lists
    const k = modelKey(l.make, l.model);
    const inner = counts.get(k) ?? new Map<string, number>();
    inner.set(t.toUpperCase(), (inner.get(t.toUpperCase()) ?? 0) + 1);
    counts.set(k, inner);
  }
  const vocab: TrimVocabulary = new Map();
  for (const [k, inner] of counts) {
    const keep = new Set([...inner].filter(([, n]) => n >= 3).map(([t]) => t));
    if (keep.size) vocab.set(k, keep);
  }
  return vocab;
}

export type TrimClaim =
  | { assert: true; trim: string }
  | { assert: false; reason: "no-trim" | "cab-style" | "placeholder" }
  | { assert: false; reason: "contradicted"; feedTrim: string; proseTrim: string };

export function trimClaim(l: Listing, vocab: TrimVocabulary): TrimClaim {
  const raw = (l.trim ?? "").trim();
  if (!raw) return { assert: false, reason: "no-trim" };
  if (CAB_STYLES.test(raw)) return { assert: false, reason: "cab-style" };
  if (PLACEHOLDER.test(raw)) return { assert: false, reason: "placeholder" };

  const known = vocab.get(modelKey(l.make, l.model));
  const feed = raw.toUpperCase();
  // Only judge a trim the model's own vocabulary recognises. A freeform string
  // ("Lariat 4x4 w/ Tow Pkg") isn't a clean claim to contradict in the first
  // place, and cleanTrim already handles that shape for matching.
  if (!known || !known.has(feed)) return { assert: true, trim: raw };

  const desc = (l.description ?? "").replace(FEATURE_NOISE, " ");
  if (desc.length < 40) return { assert: true, trim: raw };

  const named = new Set<string>();
  for (const t of known) {
    // Word-boundary match on the vocabulary term, case-insensitive.
    if (new RegExp(`(^|[^A-Za-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i").test(desc)) {
      named.add(t);
    }
  }
  // Ambiguous prose (names several versions, or none) settles nothing.
  if (named.size !== 1) return { assert: true, trim: raw };
  const [only] = [...named];
  if (only === feed || sameTrimName(only, feed)) return { assert: true, trim: raw };

  return { assert: false, reason: "contradicted", feedTrim: raw, proseTrim: only };
}
