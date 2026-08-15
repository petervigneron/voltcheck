import type { Listing } from "./types";
import { matchEnrichment } from "../enrichment/match";
import { decodeTeslaVin, isTeslaVin } from "../tesla-vin";

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

/**
 * The version the VIN names on its own, or undefined.
 *
 * "On its own" is the whole point, and the reason this re-runs the matcher
 * with the trim REMOVED rather than reading the ordinary match. A row can be
 * keyed to both a VIN code and a trim — the 2022 Lightning Platinum is
 * `vin8: ["V"], trim: "Platinum"` — so a match made with the disputed trim in
 * hand proves nothing about that trim. Asking what the VIN resolves to with
 * no trim at all is the only non-circular question.
 *
 * The two cases this separates, both live:
 *   Mach-E 3FMTK4SE2PMA38629 — position 8 is E, which IS the GT motor, and E
 *     alone resolves to one row ("Extended Range · GT"). The feed's "GT" is
 *     corroborated by the VIN and the prose calling it a Premium is wrong.
 *   Lightning 1FT6W1EV0NWG09760 — position 8 is V, which means Extended
 *     Range and says nothing about Pro vs Lariat: V alone leaves two rows.
 *     The VIN cannot defend the feed here, so the contradiction stands.
 *
 * Only rows the VIN actually keyed count. A row that matched on make/model/
 * year alone is not VIN evidence, however unique it is.
 */
function versionNamedByVinAlone(l: Listing): string | undefined {
  if (!l.vin) return undefined;
  const tesla = isTeslaVin(l.vin) ? decodeTeslaVin(l.vin) : null;
  const r = matchEnrichment(
    {
      vin: l.vin,
      usMarket: true,
      make: l.make.toUpperCase(),
      model: l.model,
      modelYear: l.year,
      trim: undefined,
      driveType: l.drive,
      batteryKwhHint: l.vpicBatteryKwh,
    },
    tesla
  );
  const row = r.exact;
  if (!row) return undefined;
  // vin8 is the maker's own motor/battery code; plant comes from VIN position
  // 11. Anything else in the row was not decided by the VIN.
  if (!row.vin8?.length && !row.plant) return undefined;
  const names = [row.packVariant, ...(Array.isArray(row.trim) ? row.trim : row.trim ? [row.trim] : [])];
  const joined = names.filter(Boolean).join(" · ");
  return joined || undefined;
}

const namesVersion = (haystack: string, name: string): boolean =>
  new RegExp(`(^|[^A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i").test(haystack);

export type TrimClaim =
  | { assert: true; trim: string }
  | { assert: false; reason: "no-trim" | "cab-style" | "placeholder" }
  | { assert: false; reason: "contradicted"; feedTrim: string; proseTrim: string };

export function trimClaim(l: Listing): TrimClaim {
  const raw = (l.trim ?? "").trim();
  if (!raw) return { assert: false, reason: "no-trim" };
  if (CAB_STYLES.test(raw)) return { assert: false, reason: "cab-style" };
  if (PLACEHOLDER.test(raw)) return { assert: false, reason: "placeholder" };
  const prose = (l.trimSuspect ?? "").trim();
  if (prose) {
    // The VIN outranks the prose where it actually speaks. Position 8 is the
    // one field a dealer's data entry can't blur, so when it names a version
    // by itself and that version is the one the feed claims — and not the one
    // the description claims — the description is the thing that's wrong.
    const fromVin = versionNamedByVinAlone(l);
    if (fromVin && namesVersion(fromVin, raw) && !namesVersion(fromVin, prose)) {
      return { assert: true, trim: raw };
    }
    return { assert: false, reason: "contradicted", feedTrim: raw, proseTrim: prose };
  }
  return { assert: true, trim: raw };
}
