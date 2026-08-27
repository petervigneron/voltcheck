// Ford's own window sticker, used as a check on the trim a feed claims.
//
// ── The blind spot this closes ─────────────────────────────────────────────
//
// A shopper reported a 2022 F-150 Lightning listed as an XLT. Ford's Monroney
// label for 1FT6W1EV8NWG06203 reads EQUIPMENT GROUP 110A / PRO SERIES, and
// the label's own interior line agrees ("MED DARK SLATE VINYL BUCKET" — vinyl
// is Pro content, not XLT). The truck is a Pro. "XLT" came from Ford Blue
// Advantage's listing record (`trim.name`, fed to that marketplace by the
// selling dealer) and lib/oem/ford-blue-advantage.mjs takes it verbatim
// because there is nothing on that record to check it against.
//
// Every existing signal was blind to it, each for a reason already written
// down elsewhere in this pipeline:
//   - lib/trim-suspect.mjs judges a listing's own `description`, and that
//     record's description names the pack, not the version ("Extended Range
//     131 kWh battery, battery SOH 100% Excellent per FDRS.").
//   - vPIC's Trim for every 2022-23 Lightning is "SuperCrew", a cab style, so
//     web/lib/listings/trimClaim.ts throws it away rather than compare it —
//     and versionNamedByVinAlone can never corroborate one of these VINs.
//   - The VIN does not carry the version: 6W1EV covers Pro, XLT, Lariat and
//     Platinum alike, measured across our own 2022 Lightning rows.
//
// lib/trim-overrides.mjs — the hand-curated list that exists for exactly this
// gap — names the missing source in its own header: "Ford's window sticker
// for this VIN is unavailable". For that one VIN it was. For most it is not,
// and ford-sticker.mjs now fetches it per VIN, so the hand list no longer has
// to carry cases a document could settle.
//
// ── Why this only ever suppresses, and why not via `trimSuspect` ───────────
//
// It writes `trimRefuted`, a flag, and the site then shows "2022 Ford F-150
// Lightning" with no version rather than the wrong one.
//
// The obvious move was to write `trimSuspect`, the field markTrimSuspects and
// applyTrimOverrides already use for "this trim is contradicted". That field
// is wrong here for a reason that is not stylistic: the detail page renders it
// as "Listed as XLT, but the dealer's own description says Pro"
// (web/app/listing/[id]/page.tsx). Our evidence is not the dealer's
// description — it is Ford's Monroney label — so routing this through that
// field would print a false statement about where the fact came from on every
// car it fires on. Checking a fact's source before surfacing it is the house
// rule; a flag with no copy attached is what keeps it.
//
// Substituting the sticker's own word is defensible on the evidence — it is
// the manufacturer's document for that exact car — and is deliberately not
// done. The parse is verified against one nameplate (below), a trim name is
// shopper-facing copy, and the two mistakes do not cost the same: a
// suppressed trim is a blank, a substituted one is a new claim on thousands
// of Ford listings resting on a PDF layout Ford can change without telling
// us. ford-sticker.json keeps the series string, so promoting this later is a
// change here and not a re-fetch.
//
// ── What the codes mean, measured ──────────────────────────────────────────
//
// Equipment Group is Ford's order code and maps to one version per (model,
// model year). Across 539 live F-150 Lightnings checked against their own
// stickers on 2026-08-26: 110A = Pro, 311A = XLT, 312A = XLT on 2023 and
// Flash from 2024, 510A/511A = Lariat, 710A = Platinum. The code is the
// reliable half; the bulleted series name under it is what we compare
// against, because it is the word a shopper would read.

import { readFile } from "node:fs/promises";

const CACHE_URL = new URL("../registry/ford-sticker.json", import.meta.url);

// The label prints its bullet glyph as a control character (U+009F), so every
// leading non-alphanumeric is stripped before a line is read as a name. This
// is the whole reason a first cut of the parser found every Equipment Group
// code and not one series name.
const clean = (s) => s.replace(/^[^A-Z0-9]+/i, "").replace(/\s{2,}.*$/, "").trim();

/**
 * The Monroney's version line: "EQUIPMENT GROUP <code>" with the series name
 * bulleted under it — "110A" / "PRO SERIES", "312A" / "FLASH".
 *
 * Returns { group, series } or null. `series` is null when the code was found
 * but the name under it did not read as a name; callers must treat that as no
 * answer, never as agreement.
 */
export function stickerTrim(txt) {
  const lines = String(txt ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/EQUIPMENT GROUP\s+(\w+)/);
    if (!m) continue;
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const c = clean(lines[j].trim());
      // pdftotext -layout puts the price table in the same rows; those words
      // are the ones that show up there.
      if (c && /^[A-Z0-9][A-Z0-9 \-'./]{1,28}$/.test(c) && !/PRICE|BASE|TOTAL|OPTIONAL|MSRP|OTHER/.test(c)) {
        return { group: m[1], series: c };
      }
    }
    return { group: m[1], series: null };
  }
  return null;
}

/**
 * Does the sticker's series contradict the trim the feed claims?
 *
 * CONTRADICTION, not confirmation — the same rule and the same reason as
 * lib/trim-suspect.mjs: silence is not evidence. A label we could not read a
 * series off says nothing about the feed.
 *
 * Matching is loose on purpose, because feeds pad the trim column with body
 * style and punctuation and none of that is a different version: "Pro" must
 * agree with "PRO SERIES", "Flash™" with "FLASH", "XLT SuperCrew 5.5' Box"
 * with "XLT". Only a name with no relationship to the label's is a
 * contradiction — which is what "XLT" against "PRO SERIES" is.
 */
export function contradicts(feedTrim, series) {
  const norm = (s) =>
    String(s ?? "")
      .toUpperCase()
      .replace(/\bSERIES\b/g, "")
      .replace(/[^A-Z0-9]/g, "");
  const f = norm(feedTrim);
  const s = norm(series);
  if (!f || !s) return false;
  return !(f.includes(s) || s.includes(f));
}

/** The per-VIN sticker cache ford-sticker.mjs maintains. */
export async function loadFordStickers(url = CACHE_URL) {
  let raw;
  try {
    raw = JSON.parse(await readFile(url, "utf-8"));
  } catch {
    return new Map(); // not fetched yet — nothing to apply, nothing to say
  }
  const byVin = new Map();
  for (const [vin, hit] of Object.entries(raw ?? {})) {
    const series = String(hit?.series ?? "").trim();
    if (vin.length === 17 && series) byVin.set(vin.toUpperCase(), series);
  }
  return byVin;
}

/**
 * Stamps `trimRefuted` on listings Ford's own label contradicts, and clears it
 * where the feed has since caught up — same self-clearing contract as
 * markTrimSuspects, so a dealer fixing their data fixes the site.
 *
 * Runs after markTrimSuspects, which deletes any `trimSuspect` its own
 * vocabulary does not re-derive; ordering is why this is a pure step db-sync
 * calls rather than something ford-sticker.mjs writes into listings.json.
 * `trimRefuted` is a separate field, so the two never fight over one slot.
 *
 * Returns how many were stamped.
 */
export function applyFordStickerTrims(listings, byVin) {
  if (!byVin?.size) return 0;
  let n = 0;
  for (const l of listings) {
    const series = byVin.get(String(l.vin ?? "").toUpperCase());
    const feedTrim = String(l.trim ?? "").trim();
    // No claim, no label, or the two agree: nothing to refute. The clear is
    // unconditional so a corrected feed drops the flag on the next sync.
    if (!series || !feedTrim || !contradicts(feedTrim, series)) {
      if (l.trimRefuted !== undefined) delete l.trimRefuted;
      continue;
    }
    l.trimRefuted = true;
    n++;
  }
  return n;
}
