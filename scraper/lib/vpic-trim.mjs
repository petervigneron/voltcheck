// The trim vpic-enrich.mjs takes from a decode, when the dealer gave none.
//
// Neither vPIC field is reliably the trim, so take whichever survives a junk
// filter rather than ranking them. Observed on F-150 Lightnings 2026-08-15:
//   2022-23  Series ""          Trim "SuperCrew"   -> nothing (cab style)
//   2024     Series "PRO"/"XLT" Trim ""            -> Series
//   2025     Series "F-Series"  Trim "XLT"         -> Trim
// The old `Trim || Series` filled 31 live listings with "SuperCrew" — every
// Lightning is a SuperCrew, so it names no version — and a naive flip to
// `Series || Trim` would have stamped "F-Series" on the 2025 trucks instead.
//
// Three more classes joined the filter on 2026-09-10, after a re-crawl of
// ultimatems.com (AutoManager leaves the VDP trim blank on purpose, de865f1)
// filled a Cayenne with "Type 9YA", an XC90 with "FWD/eAWD (T8)" and an Ariya
// with "ENGAGE/EVOLVE/EMPOWER". Each is a thing vPIC's Series/Trim columns
// hold that is not a version name, and each was measured over every distinct
// Series and Trim value in registry/vpic-cache.json (218k VINs, 1,044 values)
// before it was written — the counts in the comments are from that pass:
//
//   CHASSIS CODE   Porsche files its internal type where the series belongs:
//                  "Type Y1A" (Taycan), "Type 9YA" (Cayenne), "Type XAB"
//                  (Macan Electric), "Type 971". Acura's "Type-S" and Honda's
//                  "Type R" are real trims and keep the pattern to a bare
//                  3–4 character code after the word.
//   GRADE LIST     One Part 565 pattern covering every grade, and vPIC
//                  answers all of them: "ENGAGE/EVOLVE/EMPOWER" (1,482 Ariya
//                  VINs), "Light, Light Long Range, Wind" (2,486 EV6),
//                  "Taycan, Taycan 4", "S/S+" (250 Leafs — a 40 kWh car and
//                  a 62 kWh car; printing either half is a battery claim),
//                  "Turbo / Turbo S", Toyota's own type codes "ASV50L/GSV50L/
//                  AVV50L". Slash, comma and semicolon all join them. The
//                  only real trims with a slash are Dodge's "R/T" family
//                  (Daytona R/T, R/T Plus, R/T 392) and the "w/" of
//                  "SEL w/ Convenience Pkg" — neither is a separator.
//   DRIVE ONLY     "FWD/eAWD (T8)", "AWD/eAWD", "AWD/AWD (T8)" on Volvo
//                  Series; "e-AWD"/"e-FWD" on Polestar Trim. The drive field
//                  already carries this, and web/lib/listings/enrich.ts
//                  cleanTrim drops a bare drive word before matching anyway.
//                  A maker's AWD *name* is not in this class: 900+ live BMWs
//                  and ~700 Mercedes carry a dealer-written "xDrive" /
//                  "4MATIC" as their trim, so that is how the feed spells
//                  those versions, and a vPIC-filled car should read the
//                  same. "xDrive50i", "Standard RWD", "AWD Performance" say
//                  more than the drive and pass.
//
// What falls through when a Series is rejected is what makes the filter worth
// having: the Cayenne's Trim is "S E-Hybrid", the XC90's "Inscription", the
// Ariya's is the grade list itself and the car goes honestly blank.
// test/vpic-trim.test.mjs holds the control set.

const CAB_STYLE_RE =
  /^(super\s*crew|super\s*cab|crew\s*cab|regular\s*cab|extended\s*cab|double\s*cab|quad\s*cab|king\s*cab)$/i;
// "F-Series", "E-Series": the model family in the trim column.
const FAMILY_RE = /^[a-z]-?series$/i;
// "Type 9YA", "TYPE Y1A", "Type 971" — not "Type-S", "Type S", "Type R".
const CHASSIS_CODE_RE = /^type\s+[a-z0-9]{3,4}$/i;
// A generic drivetrain descriptor. Maker AWD names (xDrive, quattro, 4MATIC,
// e-4ORCE) are deliberately absent — see the header.
const DRIVE_TOKEN_RE = /^(e-?)?(fwd|rwd|awd|2wd|4wd|4x4|4x2)$/i;

export const isChassisCode = (t) => CHASSIS_CODE_RE.test(t);

// Two or more grades joined by "/", "," or ";". "R/T" is one word and "w/"
// is "with"; both are neutralised before the split, never returned.
export function isGradeList(t) {
  const s = String(t)
    .replace(/\bR\/T\b/gi, "RT")
    .replace(/\bw\/(o\b)?/gi, " with ");
  return s.split(/[\/,;]/).filter((p) => p.trim()).length >= 2;
}

// Every slash-separated part is a drive token, after a trailing engine code
// in parentheses ("(T8)") is set aside.
export function isDriveOnly(t) {
  const parts = String(t)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .split("/")
    .map((p) => p.trim());
  return parts.length > 0 && parts.every((p) => DRIVE_TOKEN_RE.test(p));
}

export function isJunkTrim(t) {
  return CAB_STYLE_RE.test(t) || FAMILY_RE.test(t) || isChassisCode(t) || isGradeList(t) || isDriveOnly(t);
}

export function vpicTrim(r, l) {
  for (const cand of [r.Series, r.Trim]) {
    const t = String(cand ?? "").trim();
    if (!t) continue;
    if (isJunkTrim(t)) continue;
    // The make or the model restated where the version belongs.
    const n = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (n(t) === n(l.make) || n(t) === n(l.model)) continue;
    return t;
  }
  return "";
}
