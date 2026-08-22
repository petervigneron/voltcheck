// The one place a dealer platform's condition field becomes ours.
//
// It exists because both platform API extractors used to END in "used" — an
// else-branch, not a reading:
//
//   dealeron-api.mjs   cond.includes("new") ? "new" : "used"
//   dealercom-api.mjs  String(r.condition ?? "").toLowerCase() === "new"
//
// which lied in two separate ways. The first is that the field they read is
// the storefront's DISPLAY string, and display strings are localized:
// es.fordofkendall.com serves VehicleCondition "Nuevo" across its 678-car new
// lot, "Nuevo".includes("new") is false, and so every one of those cars — 34
// of them EVs — published as used (measured live 2026-08-22 against the
// rooftop's own API; its Spanish used lot says "Usado" and reached the right
// answer by accident). The second is that an absent field became "" became
// "used", which is a condition claim made from no evidence at all, on a
// listing surface, in a house whose rule is that matching nothing is honest
// and matching the wrong thing is not.
//
// So the machine token leads and the display string is only a fallback.
// Sampled live 2026-08-22, page one of each rooftop's lot: DealerOn
// VehicleType present on 1,912/1,912 records across 55 rooftops, dealer.com
// `type` on 5,509/5,509 across 115 — both lowercase "new"/"used", both in
// exact agreement with the display string wherever the display string was
// English. Every display value seen in that sample is in the table below:
//
//   New · Used · USED · Pre-Owned · Certified Pre-Owned · Certified Used ·
//   BMW Certified · Certified by Volvo · Nuevo · Usado
//
// Anything the table does not recognise returns undefined, not a guess.
// ingest.mjs then gets its own chance from the VDP URL, and a row that still
// has no condition carries none — a state every consumer already handles,
// because ingest.mjs's condition() has always been able to return undefined.
//
// Certified is deliberately NOT a third answer here. A certified car is a
// used car; the certification is an extra claim — about a warranty — and it
// rides on the platform's own CPO flag (VehicleCpo, r.certified), never on a
// marketing string. dealeron.mjs has the same rule written out at length,
// with the case that earned it: two rooftops stamp "cpo" on cars their own
// Product schema calls used, one of them a Kia store applying it to a
// Hyundai. So "Certified Pre-Owned" reads as used here and ingest.mjs
// promotes the row to certified from the flag, exactly as it does today.

// Order is load-bearing. Certified strings all carry a used token or none, so
// they land in the used branch either way. Used is tested before new so that
// Spanish "seminuevo" — nearly-new, which is a used car — cannot be read as
// "nuevo"; the word boundaries would stop it anyway, but the order says the
// intent out loud rather than resting on a regex detail.
const USED = /\bused\b|\bpre-?owned\b|\bcertified\b|\bcpo\b|certificad|\busad[oa]s?\b|seminuev/;
const NEW = /\bnew\b|\bnuev[oa]s?\b/;

/**
 * A platform's condition value → "new" | "used" | undefined.
 * undefined means the value said nothing we can stand behind — including the
 * field being absent, which is the case this module was written for.
 */
export function conditionToken(raw) {
  if (typeof raw !== "string") return undefined;
  const s = raw.toLowerCase();
  if (USED.test(s)) return "used";
  if (NEW.test(s)) return "new";
  return undefined;
}

/**
 * The condition a row PUBLISHES, from everything the crawl learned about it:
 * the platform's CPO flag, the extractor's reading above, and the VDP URL.
 * Lives here rather than in ingest.mjs so the whole condition vocabulary —
 * including the Spanish one — is in one file with its evidence.
 *
 * Returns "new" | "used" | "certified" | undefined. undefined is a real
 * answer and always has been: every consumer downstream already handles a row
 * with no condition, because this function has never been able to promise one.
 *
 * The stated condition and the URL are one haystack on purpose. A rooftop
 * that says nothing in its feed usually says it in the path — /new-inventory/,
 * /used/, /nuevo-…, /seminuevo-… — and that path is the only signal left when
 * an inventory API can't be read and the HTML fallback runs.
 */
export function publishedCondition({ certified, condition, sourceUrl } = {}) {
  if (certified) return "certified";
  const c = `${condition ?? ""} ${sourceUrl ?? ""}`.toLowerCase();
  if (/certified/.test(c)) return "certified";
  // Spanish-language rooftops slug their VDPs /nuevo- and /seminuevo-.
  // Measured on es.fordofkendall.com (2026-08-22): the 34 /nuevo- EVs are
  // exactly the 34 with no odometer and a 2026 model year, the 8 /seminuevo-
  // ones exactly the 8 carrying miles. seminuevo means nearly-new and is a
  // USED car, so it is tested first — "/nuevo-" cannot match inside
  // "/seminuevo-" anyway, but the order says that out loud instead of resting
  // on where the slash happens to fall.
  if (/\/seminuevo-|\/usado-/.test(c)) return "used";
  if (/\bnew\b|\/new-|\/nuevo-/.test(c)) return "new";
  if (/used|\/used-/.test(c)) return "used";
  return undefined;
}
