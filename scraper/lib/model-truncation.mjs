// A dealer feed's model field arrives cut off at a fixed column.
//
// Found 2026-08-29 in the published feed: five Volvo nameplates, each spelled
// out to exactly 25 characters and stopped mid-word — "XC90 Recharge Plug-In
// Hyb", "XC40 Recharge Pure Electr", "C40 Recharge Pure Electri", "S60
// Recharge Plug-In Hybr", "XC60 Recharge Plug-In Hyb". 19 cars.
//
// IT IS NOT OURS, and this was checked rather than assumed. dealer.com's own
// inventory API answers `model: "C40 Recharge Pure Electri"` (25 characters)
// for wilsonvillechevrolet.com's YV4ED3GM6P2042057, and DealerOn's VehicleCard
// answers `VehicleModel: "XC90 Recharge Plug-In Hyb"` for griffinmonroe.com's
// YV4BR0CL2N1821118. Two independent storefront platforms, 17 unrelated
// rooftops, the same cut — so the column lives upstream of both, in whatever
// DMS or syndication hop feeds them. Every derived field on those records is
// built from the already-cut string: DealerOn's VehicleName ("2022 Volvo XC90
// Recharge Plug-In Hyb Inscription"), dealer.com's `title`, and both
// platforms' VDP URL slugs. So there is NO uncut field for the lane to prefer
// instead. The dealer's free-text description does spell the car out in full,
// but reading a model name out of ad copy is a guess, not a field.
//
// WHAT IT COSTS, measured against the 2026-08-29 feed rather than assumed. A
// cut string is its own cohort: it fragments the make/model facet (six junk
// entries of 1-4 cars each, the "IONIQ 5 SEL" failure that lib/listings/
// modelName.ts documents) and it misses enrichment, because the browse feed
// matches enrichment on the FEED's model string (web/lib/listings/enrich.ts,
// decodeFromListing). 7 of the 19 carry no battery or range at all where their
// uncut twins run 92-100%. The other 12 only survive because someone had
// already pasted three of the cut spellings into the enrichment table's
// modelAliases (web/lib/enrichment/data6.ts) — which is the defect being
// written into a curated authority, where it stops being findable.
//
// ─────────────────────────── WHY THE OBVIOUS RULE IS WRONG ──────────────────
//
// "Complete a model string onto the longer spelling of the same make that it
// is a prefix of" is the first thing anyone writes, and it is a disaster.
// Dry-run over all 144,528 published cars: 5,778 rewritten, including
//
//     bZ (2,623 Toyotas)      -> bZ4X          a different nameplate
//     iX (1,282 BMWs)         -> iX3           a different vehicle
//     Escalade IQ (1,174)     -> Escalade IQL  a different wheelbase
//     GLE (347) -> GLE-Class, SL (42) -> SL-Class, RZ (224) -> RZ-Series
//     EQE 320 (19)            -> EQE 320+ SUV  the plus IS identity (see
//                                              modelName.ts, and match.ts's
//                                              trimPlusMismatch)
//
// Model names are alphanumeric codes, so "the next character continues the
// word" is satisfied by exactly the letters that change the car. Each guard
// below is the answer to one of those, and none can be dropped:
//
//  1. MID-WORD. The completion must continue the last token with no space at
//     the join. Kills "C40 Recharge" -> "C40 Recharge Pure Electric" and
//     "Mustang Mach-E" -> "Mustang Mach-E Premium": those are short spellings
//     that end where a word ends, not cut ones.
//  2. UNIQUE. Exactly one completion, case folded. Kills "Model 3 Standard
//     Range" (-> Plus / Plus RWD / Battery RWD) and "Taycan 4" (-> 4S /
//     4S Sedan / 4S Cross Turismo), where the cut destroyed the distinction
//     and no rule can put it back.
//  3. BETTER ATTESTED. The completion must outnumber the string it replaces.
//     A cap-cut string is rare by construction — only the rooftops on the
//     broken feed emit it — while the real name is the make's ordinary
//     spelling. This is what kills bZ -> bZ4X, iX -> iX3, Escalade IQ ->
//     Escalade IQL and GLE -> GLE-Class outright.
//  4. FIXED COLUMN, at least 20 characters, shared by at least 2 of the make's
//     names. A truncation is a column width, so it lands on the same count for
//     every long name in that feed; a legitimately short spelling has no
//     reason to agree with another one to the character. The floor is what a
//     database column plausibly is: guards 1-3 alone still passed
//     "G 580" -> "G 580e" (3 cars), "Rz" -> "RZ-Series" and "AMG E 53" ->
//     "AMG E 53e Plug-In Hybrid", all of them short strings and all wrong.
//
// Together, on the whole 144,528-car feed, these fire on those five Volvo
// strings and on nothing else.
//
// WHAT IT DELIBERATELY LEAVES ALONE. One row reads "XC90 Recharge Plug-I" —
// 20 characters, a different cut, and the only string at that column, so guard
// 4 refuses it and it stays as the dealer published it. That is the right
// outcome for a rule and the wrong outcome for the car, so declined candidates
// are RETURNED rather than swallowed: one car nobody can see is how this whole
// class of defect stayed hidden until the owner read the feed by eye.

// Guard 4's floor. Nothing caps a model column at 2 characters; "iX" and "bZ"
// are nameplates, not cuts.
const MIN_COLUMN = 20;

const makeKey = (s) => String(s ?? "").trim().toUpperCase();

// The same fold web/lib/listings/modelName.ts uses: case, whitespace and
// punctuation are typing, not identity. The plus is carried through because on
// a Mercedes it IS identity.
const modelKey = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, "");

/** Every model string of one make, with how many cars spell it that way. */
function formsByMake(listings) {
  const byMake = new Map();
  for (const l of listings) {
    const mk = makeKey(l?.make);
    const model = typeof l?.model === "string" ? l.model.trim() : "";
    if (!mk || !model) continue;
    const forms = byMake.get(mk) ?? new Map();
    forms.set(model, (forms.get(model) ?? 0) + 1);
    byMake.set(mk, forms);
  }
  return byMake;
}

/**
 * The one spelling `cut` completes to, or the reason it has none.
 *
 * Guards 1-3. Guard 4 needs every candidate of the make at once, so it lives
 * in the caller.
 */
function completionOf(cut, forms) {
  const lower = cut.toLowerCase();
  const exts = [];
  for (const [form, n] of forms) {
    if (form === cut || form.length <= cut.length) continue;
    if (!form.toLowerCase().startsWith(lower)) continue;
    // Guard 1: whitespace at the join means `cut` ended where a word ends, so
    // it was never cut — it is just the shorter name.
    if (/\s/.test(form[cut.length])) continue;
    exts.push([form, n]);
  }
  if (!exts.length) return { status: "no completion" };
  // Guard 2. Case and punctuation variants of one completion are one answer;
  // two real answers mean the cut destroyed the distinction.
  if (new Set(exts.map(([form]) => modelKey(form))).size > 1) {
    return { status: "ambiguous", candidates: exts.map(([form]) => form).sort() };
  }
  // Which spelling of the one answer to adopt: the make's own majority, ties to
  // the one that isn't shouting — preferredForm()'s rule in modelName.ts.
  const shouty = (s) => s === s.toUpperCase();
  exts.sort(
    (a, b) => b[1] - a[1] || Number(shouty(a[0])) - Number(shouty(b[0])) || a[0].localeCompare(b[0])
  );
  const into = exts[0][0];
  const intoCount = exts.reduce((sum, [, n]) => sum + n, 0);
  const count = forms.get(cut) ?? 0;
  // Guard 3. A cut string is rare and the real name is the make's ordinary
  // spelling; the other way round means this is a nameplate, not a cut.
  if (intoCount <= count) return { status: "not attested", into, intoCount, count };
  return { status: "ok", into, intoCount, count };
}

/**
 * Rewrite model strings that a fixed-column truncation cut, in place.
 *
 * Runs on the whole feed at once: the completion is learned from the make's
 * other rows, so a partial crawl that never sees the uncut spelling abstains
 * rather than guessing — the same shape as markTrimSuspects' vocabulary.
 *
 * One pass, not a fixed point. Repairing the 25-character cuts would give the
 * 20-character one a unique completion, but it would still be alone at its own
 * column and guard 4 would still refuse it — so iterating buys nothing, and it
 * would let one repair become the evidence for the next.
 *
 * @returns {{repaired: number, changes: Array, declined: Array}} `declined`
 *   carries the near-misses at or past the column floor, for a human to read.
 */
export function repairTruncatedModels(listings) {
  const byMake = formsByMake(listings);
  const declined = [];
  // make -> Map(cut string -> completion), for the cuts that cleared 1-3.
  const passed = new Map();
  for (const [mk, forms] of byMake) {
    const found = new Map();
    for (const cut of forms.keys()) {
      const r = completionOf(cut, forms);
      if (r.status === "ok") found.set(cut, r);
      // Below the column floor there are dozens of these and every one is a
      // nameplate ("iX", "bZ", "GLE"), so they are not worth a line.
      else if (cut.length >= MIN_COLUMN && r.status !== "no completion") {
        declined.push({ make: mk, model: cut, count: forms.get(cut), reason: r.status, into: r.into, candidates: r.candidates });
      }
    }
    if (found.size) passed.set(mk, found);
  }

  // Guard 4: a truncation is a column width, so it lands on the same character
  // count for more than one of the make's names. A lone survivor is reported,
  // never applied.
  const repairs = new Map();
  for (const [mk, found] of passed) {
    const atColumn = new Map();
    for (const cut of found.keys()) atColumn.set(cut.length, (atColumn.get(cut.length) ?? 0) + 1);
    for (const [cut, r] of found) {
      if (cut.length >= MIN_COLUMN && atColumn.get(cut.length) >= 2) {
        repairs.set(`${mk} ${cut}`, r.into);
      } else {
        declined.push({
          make: mk,
          model: cut,
          count: r.count,
          reason: cut.length < MIN_COLUMN ? "below column floor" : "column of one",
          into: r.into,
        });
      }
    }
  }

  const applied = new Map();
  let repaired = 0;
  for (const l of listings) {
    if (typeof l?.model !== "string") continue;
    const key = `${makeKey(l.make)} ${l.model.trim()}`;
    const into = repairs.get(key);
    if (!into || into === l.model) continue;
    const from = l.model;
    l.model = into;
    repaired++;
    const seen = applied.get(key) ?? { make: makeKey(l.make), from, into, count: 0 };
    seen.count++;
    applied.set(key, seen);
  }
  return { repaired, changes: [...applied.values()], declined };
}
