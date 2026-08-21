import type { Listing } from "./types";
import { matchEnrichment } from "../enrichment/match";
import { decodeTeslaVin, isTeslaVin } from "../tesla-vin";

/**
 * Is the trim this listing's feed claims safe to rely on?
 *
 * This used to live inside trimClaim.ts, where it answered one question: may
 * we PRINT the trim? But a trim does more than get printed — it also picks
 * which enrichment row a listing matches, and therefore which range and pack
 * size the card states as fact. Those are two consumers of one judgement, and
 * having only the display side ask it is how a trim we refuse to show could
 * still choose the numbers shown beside it.
 *
 * The gap was latent rather than live when it was found (2026-08-21): every
 * one of the ten listings then carrying `trimSuspect` resolved to the same
 * enrichment row with the disputed trim withheld as with it honoured, because
 * their cohorts are keyed on VIN position 8 (Lightning, Mach-E) or settled by
 * the drivetrain (Ariya). But 461 pairs of rows in the corpus differ ONLY by
 * trim under an identical VIN — 2018 Model 3 `vin8: ["A"], trim: "Long Range"`
 * (310 mi) against `vin8: ["A"], trim: "Mid Range"` (260 mi) is the shape —
 * and on any of those a contradicted trim picks the row and prints a 50-mile
 * error with full confidence. Hence one shared answer, asked by both sides.
 */
export type TrimTrust =
  /** No contradiction on file — the ordinary case, and the only one that costs
   *  a matcher run. */
  | { trusted: true; reason: "uncontested" }
  /** The description named a different version, but the VIN itself names the
   *  one the feed claims. The VIN outranks the prose where it actually
   *  speaks. */
  | { trusted: true; reason: "vin-corroborated"; namedByVin: string }
  /** The description named a different version and the VIN can't settle it. */
  | { trusted: false; reason: "contradicted"; proseTrim: string };

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
export function versionNamedByVinAlone(l: Listing): string | undefined {
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

/**
 * Whether `claimedTrim` — the string the caller is about to rely on — survives
 * the contradiction on file.
 *
 * Callers pass the form of the trim they actually use, not a canonical one:
 * trimClaim passes the string it is about to print, enrich.ts the cleaned
 * string it is about to match rows with. Those differ occasionally (cleanTrim
 * strips "Premium eAWD" down to "Premium"), and asking about the exact string
 * in hand is what makes each answer true for its own consumer. The shared part
 * — the VIN probe and the naming test — is what must not drift, and it is the
 * part that lives here.
 */
export function trimTrust(l: Listing, claimedTrim: string | undefined): TrimTrust {
  const prose = (l.trimSuspect ?? "").trim();
  // The overwhelmingly common path, and deliberately the cheap one: without a
  // contradiction on file there is nothing to weigh, and no matcher run. Ten
  // of 100,286 live listings carried `trimSuspect` on 2026-08-21, and
  // enrichListing runs on every one of the rest.
  if (!prose || !claimedTrim) return { trusted: true, reason: "uncontested" };
  const namedByVin = versionNamedByVinAlone(l);
  if (namedByVin && namesVersion(namedByVin, claimedTrim) && !namesVersion(namedByVin, prose)) {
    return { trusted: true, reason: "vin-corroborated", namedByVin };
  }
  return { trusted: false, reason: "contradicted", proseTrim: prose };
}
