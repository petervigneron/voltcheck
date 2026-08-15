// Does a listing's own description name a DIFFERENT version than its trim
// field claims?
//
// This lives in the scraper because it needs two things the web app doesn't
// have together: every listing's description (the browse feed drops it —
// migration 0011, egress) and the whole corpus at once (the trim vocabulary is
// learned from inventory, and the detail page reads one VIN by design). The
// answer is a per-listing fact, so it is computed once at sync time and rides
// the payload as `trimSuspect`; the web decides what to do about it.
//
// Origin: a 2022 F-150 Lightning a Chevrolet store listed as a "Pro" whose own
// description read "F-150 Lightning Lariat" with Equipment Group 511A High,
// BlueCruise, a moonroof and ventilated seats — none of it Pro content, and
// the listing photo agreed. We printed "Pro" beside a correct 320 mi, and the
// pair is what reads as impossible to anyone who knows these trucks.
//
// The rule is CONTRADICTION, not confirmation. Measured on live inventory
// 2026-08-15: of 15,392 listings carrying a trim, 11,735 (76%) repeat it in
// their own description, 1,012 have no usable description at all, and ~2,645
// carry boilerplate that never names the version. Demanding positive backing
// would blank the trim on 24% of the site, nearly all of them correct.
// Silence is not evidence; naming a different version unambiguously is.

// Cab styles are not versions — every Lightning is a SuperCrew.
const CAB_STYLE = /^(super\s*crew|super\s*cab|crew\s*cab|regular\s*cab|extended\s*cab|double\s*cab|quad\s*cab|king\s*cab)$/i;
// What a feed or a decoder emits when it has nothing, plus drivetrain tokens.
const PLACEHOLDER = /^(n\/?a|none|other|unknown|base|standard|electric|ev|\d?dr|\d?d|awd|rwd|fwd|4wd|4x4|4x2|2wd)$/i;
// Trim names that are also ordinary feature words. Left in, "Pro Trailer
// Backup Assist" makes every loaded Lariat read as a Pro.
const FEATURE_NOISE =
  /\b(pro\s+(?:trailer|power|access|co-?pilot|series)\S*|sport\s+(?:appearance|seats?|suspension|mode)|select\s+(?:shift|terrain)|launch\s+control)\b/gi;

/**
 * A trim name is only a trim mention when it heads a name, not a feature.
 * Three guards, each earning its place against an observed false positive:
 *
 *  - TRAILING_FEATURE: any version name followed by a packaging noun is an
 *    option, not the car — "Premium Connectivity" and "Premium Sound" on a
 *    Model Y Performance, "Plus Package" on a Polestar 2, "Luxury Package".
 *  - Capitalisation: dealer prose capitalises version names, so a lowercase
 *    hit is the ordinary English word — "designed to deliver confident
 *    performance" was reading as a Model X Performance.
 *  - The model's own name is never a version of itself, even though feeds do
 *    put it in the trim column often enough to enter the vocabulary: "Wheels:
 *    19 Taycan S Aero" was contradicting a Taycan 4S.
 */
// Anchored: only the word IMMEDIATELY after the name disqualifies it. Left
// unanchored this matched "Heated Seats" later in the same description and
// threw away the Lariat that started this whole thread.
const TRAILING_FEATURE =
  /^\s+(?:package|pkg|group|connectivity|sound|audio|interior|exterior|wheels?|tires?|seats?|paint|aero|appearance|suspension)\b/i;

const modelKey = (make, model) =>
  `${make ?? ""}|${model ?? ""}`.toUpperCase().replace(/\s+/g, " ").trim();

/**
 * The versions each model's feeds actually name, learned from inventory rather
 * than hardcoded — so Flash and Uncharted arrive on their own and no table
 * goes stale. Single words only (a multiword string is an option list), and a
 * name must be used by at least three listings before it counts.
 */
export function buildTrimVocabulary(listings) {
  const counts = new Map();
  const bare = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const l of listings) {
    const t = String(l.trim ?? "").trim();
    if (!t || t.length < 2 || t.length > 20) continue;
    if (CAB_STYLE.test(t) || PLACEHOLDER.test(t) || /\s/.test(t)) continue;
    // The model (or make) restated in the trim column is not a version — and
    // it need only be PART of the model name to be worthless: "4xe" inside
    // "Wrangler 4xe", "Taycan" inside "Taycan".
    const bt = bare(t);
    if (bt === bare(l.make)) continue;
    if (bt.length >= 3 && bare(l.model).includes(bt)) continue;
    const k = modelKey(l.make, l.model);
    const inner = counts.get(k) ?? new Map();
    const u = t.toUpperCase();
    inner.set(u, (inner.get(u) ?? 0) + 1);
    counts.set(k, inner);
  }
  const vocab = new Map();
  for (const [k, inner] of counts) {
    const keep = new Set([...inner].filter(([, n]) => n >= 3).map(([t]) => t));
    if (keep.size) vocab.set(k, keep);
  }
  return vocab;
}

/**
 * Two names for one version, not two versions. Feeds abbreviate ("Tour" for
 * Touring, "PLAT" for Platinum+, "Lux-1" for Luxury 1), stack GM's tier digit
 * on the front ("2LT" where the prose says LT), and suffix BMW's motor codes
 * ("xDrive50i" vs xDrive50). These were 60% of the first cut — ~165 correct
 * trims, most of a Prologue's inventory among them.
 *
 * Stems and numbers are compared separately, and both halves are load-bearing:
 *   "Lux-1"/"Luxury"        LUX in LUXURY, one number absent  -> same
 *   "2LT"/"LT"              LT = LT, one number absent        -> same
 *   "xDrive50i"/"xDrive50"  stems agree, 50 = 50              -> same
 *   "M60"/"M50"             stem "M" too short to mean much   -> CONFLICT
 *   "xDrive40"/"xDrive50"   stems agree, 40 != 50             -> CONFLICT
 * Without the number check every BMW motor code collapses into one trim;
 * without the stem check GM's tier digits each read as a different car.
 */
function sameTrimName(a, b) {
  const parts = (s) => {
    const n = s.split("/")[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
    return { stem: n.replace(/[0-9]/g, ""), num: n.replace(/[^0-9]/g, "") };
  };
  const x = parts(a);
  const y = parts(b);
  if (!x.stem || !y.stem) return false;
  if (x.stem !== y.stem) {
    // Prefix containment is weaker evidence and needs a stem long enough to
    // mean something: "SE" must not be swallowed by "SEL", while "LT" == "LT"
    // is conclusive at any length.
    const [short, long] = x.stem.length <= y.stem.length ? [x.stem, y.stem] : [y.stem, x.stem];
    if (short.length < 3 || !long.startsWith(short)) return false;
  }
  // A number on both sides must match; a number on one side only is the more
  // specific of two names for the same thing.
  return !x.num || !y.num || x.num === y.num;
}

/**
 * The version this listing's description names, when it unambiguously names a
 * different one than the trim field claims; otherwise null.
 *
 * Returning the name rather than a bare true is what lets a detail page say
 * "the dealer's own description says Lariat" — the specific thing a shopper
 * can go and check — instead of only "these disagree". It is one short string
 * on 0.5% of rows.
 *
 * Undefined-safe throughout: anything we cannot judge returns null, because
 * the default is to keep printing the feed's trim.
 */
export function trimSuspectName(l, vocab) {
  const raw = String(l.trim ?? "").trim();
  if (!raw || CAB_STYLE.test(raw) || PLACEHOLDER.test(raw)) return null; // handled web-side
  const known = vocab.get(modelKey(l.make, l.model));
  const feed = raw.toUpperCase();
  // Only judge a name the model's own vocabulary recognises. A freeform string
  // ("Lariat 4x4 w/ Tow Pkg") is not a clean claim to contradict.
  if (!known || !known.has(feed)) return null;

  const desc = String(l.description ?? "").replace(FEATURE_NOISE, " ");
  if (desc.length < 40) return null;

  const named = new Set();
  for (const t of known) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Every occurrence, so one feature mention can't stand in for a real one.
    const re = new RegExp(`(^|[^A-Za-z0-9])(${esc})([^A-Za-z0-9]|$)`, "gi");
    for (const m of desc.matchAll(re)) {
      const hit = m[2];
      // Dealer prose capitalises version names; a lowercase hit is the
      // ordinary English word ("confident performance").
      if (hit[0] !== hit[0].toUpperCase()) continue;
      if (TRAILING_FEATURE.test(desc.slice(m.index + m[0].length - 1))) continue;
      named.add(t);
      break;
    }
  }
  // Prose that names several versions, or none, settles nothing.
  if (named.size !== 1) return null;
  const [only] = [...named];
  return only !== feed && !sameTrimName(only, feed) ? only : null;
}

/** Stamps `trimSuspect` (the name the description gives) on contradicted
 *  listings, in place. Returns how many were flagged. Only the positive case
 *  is written — an absent key is the common one and costs no egress. */
export function markTrimSuspects(listings) {
  const vocab = buildTrimVocabulary(listings);
  let n = 0;
  for (const l of listings) {
    const name = trimSuspectName(l, vocab);
    if (name) {
      l.trimSuspect = name;
      n++;
    } else if (l.trimSuspect !== undefined) {
      delete l.trimSuspect; // a corrected feed must be able to clear the flag
    }
  }
  return n;
}
