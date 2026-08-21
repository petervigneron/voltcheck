import type { Listing } from "./types";
import { trimTrust } from "./trimTrust";
import { renamedTrim } from "./trimRename";

/**
 * Whether we are willing to print this listing's trim as a fact.
 *
 * Prompted by a 2022 F-150 Lightning that a Chevrolet store listed as a "Pro"
 * while its own description read "F-150 Lightning Lariat" with Equipment Group
 * 511A High, BlueCruise, a twin-panel moonroof and ventilated seats — none of
 * it Pro content, and the listing photo (painted bumpers, chrome surrounds,
 * power-fold tow mirrors) agreed with the description. We printed "Pro" beside
 * a correct 320 mi, and the pair is what reads as impossible to anyone who
 * knows these trucks. The range was never wrong; the badge was.
 *
 * Two of the three gates are decidable from the listing alone. The third —
 * does the dealer's own prose name a different version? — needs the whole
 * corpus (the trim vocabulary is learned from inventory) and the description
 * (which the browse feed drops for egress, migration 0011). Neither is
 * available here, so it is decided at sync time instead and arrives as
 * `trimSuspect`: see scraper/lib/trim-suspect.mjs, which owns that rule and
 * documents why it turns on contradiction rather than confirmation.
 *
 * Keeping this function corpus-free is the point: it now gives the same answer
 * on a card, on a detail page, and anywhere else, without any caller having to
 * load 16k listings to render one.
 *
 * We suppress rather than substitute. The description is usually the more
 * reliable of the two — it is generally the window sticker's option list — but
 * promoting it would trade a trim we can't trust for one we haven't verified,
 * and the house rule is that matching nothing is honest while matching the
 * wrong thing is not. The name the prose gave rides along so a detail surface
 * can show the disagreement; cards just drop the trim.
 */

// Cab styles are not trims — every Lightning is a SuperCrew. These reach us
// from our own pipeline, not the dealers: scraper/vpic-enrich.mjs fills an
// empty trim from vPIC, and for 2022-23 Lightnings vPIC returns Trim
// "SuperCrew" with no Series at all.
const CAB_STYLES =
  /^(super\s*crew|super\s*cab|crew\s*cab|regular\s*cab|extended\s*cab|double\s*cab|quad\s*cab|king\s*cab)$/i;

// Placeholders a feed or a decoder emits when it has nothing, plus drivetrain
// tokens — "4x4" is not a version of a Grand Cherokee 4xe, it is the drive
// field in the wrong column.
const PLACEHOLDER =
  /^(n\/?a|none|other|unknown|base|standard|electric|ev|\d?dr|\d?d|awd|rwd|fwd|4wd|4x4|4x2|2wd)$/i;

export type TrimClaim =
  | { assert: true; trim: string }
  | { assert: false; reason: "no-trim" | "cab-style" | "placeholder" }
  | { assert: false; reason: "contradicted"; feedTrim: string; proseTrim: string };

export function trimClaim(l: Listing): TrimClaim {
  // Read the trim the maker names for this model year, not the feed's stale
  // token: Cadillac's 2026 Escalade IQ/IQL rename (see trimRename.ts).
  const raw = (renamedTrim(l) ?? "").trim();
  if (!raw) return { assert: false, reason: "no-trim" };
  if (CAB_STYLES.test(raw)) return { assert: false, reason: "cab-style" };
  if (PLACEHOLDER.test(raw)) return { assert: false, reason: "placeholder" };
  // The VIN outranks the prose where it actually speaks. Position 8 is the one
  // field a dealer's data entry can't blur, so when it names a version by
  // itself and that version is the one the feed claims — and not the one the
  // description claims — the description is the thing that's wrong. That
  // judgement now lives in trimTrust.ts, because the enrichment matcher has to
  // reach the same verdict: a trim we won't print must not be allowed to pick
  // the range and pack size printed in its place.
  const trust = trimTrust(l, raw);
  if (!trust.trusted) {
    return { assert: false, reason: "contradicted", feedTrim: raw, proseTrim: trust.proseTrim };
  }
  return { assert: true, trim: raw };
}
