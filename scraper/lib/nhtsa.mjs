// NHTSA complaints + recalls, keyed to our own make/model/year cohorts.
//
// Everything in here exists because NHTSA's free APIs answer questions you
// did not ask. Measured 2026-08-17, all of it:
//
//   1. complaintsByVehicle returns HTTP 200 with an empty result set for a
//      model name it does not know. "Mustang Mach-E" reads as zero
//      complaints; NHTSA's own vocabulary spells it "MUSTANG MACH-E BEV",
//      and that name returns 115. A name we never resolved is therefore
//      UNRESOLVED, never zero — see resolveModels().
//
//   2. The vocabulary is per make, per model year AND per issue type. Ford's
//      2022 recall vocabulary says "MUSTANG MACH-E"; the 2023 one says
//      "MUSTANG MACH-E BEV". Cache per (make, year, issueType), never across.
//
//   3. recallsByVehicle has a THIRD vocabulary that the products endpoint
//      does not publish. Every name the products endpoint gives for Ford's
//      BEVs — "MUSTANG MACH-E", "MUSTANG MACH-E BEV", "F-150 (Super Crew)
//      Lightning BEV" — returns zero recalls, while "MUSTANG MACH E" (no
//      hyphen) returns five for 2023 and nine for 2022, four of the latter
//      high-voltage traction-battery campaigns. Control test: "EXPLORER" and
//      "ESCAPE" return 24 and 19 through the same code path, so the endpoint
//      is not down, and Acura RDX 2019 (NHTSA's own documented example)
//      returns 5. So recall names are probed as spelling variants —
//      recallCandidates().
//
//   4. recallsByVehicle answers "no recalls" with HTTP 400 and a body of
//      {"Count":0,"Message":"Results returned successfully"}. A 400 is not an
//      error here and must not be retried as one. It also means an unknown
//      model name and a genuinely clean cohort are indistinguishable, which
//      is why the panel never prints "no recalls" — silence is the only
//      claim we can defend.
//
//   5. Probing spelling variants is how a Kona Electric ends up wearing the
//      petrol Kona's recalls, so no candidate ever drops a powertrain word:
//      "KONA ELECTRIC" is probed, "KONA" is not. Each returned campaign also
//      carries NHTSA's own Model attribution, and verifyRecall() keeps only
//      the ones whose Model is a name we asked for. Its Summary is NOT the
//      test — 25V315000 genuinely covers the Mach-E but its prose lists it as
//      "2021-2023 Mach-E", with the Mustang nameplate several commas away,
//      and a summary-text check threw it out.

export const API = "https://api.nhtsa.gov";

// Model names our feed spells differently from NHTSA, where the difference is
// not a spelling variant a machine can derive. Keyed "MAKE|MODEL" upper-case.
// Add only what has been checked against the products endpoint by hand.
export const MODEL_ALIASES = {
  // Jeep files the plug-in Wrangler under the long-wheelbase body name.
  "JEEP|WRANGLER 4XE": ["WRANGLER UNLIMITED PHEV"],
  "JEEP|WRANGLER UNLIMITED 4XE": ["WRANGLER UNLIMITED PHEV"],
};

// Words NHTSA adds that do not change which car it is. Our cohorts are
// make/model/year and carry every trim, so a vocabulary that splits one model
// across several rows — Tesla files the 2023 Model Y as "MODEL Y (All
// Variants)", "MODEL Y (ALL VARIANTS) LATER RELEASE", "MODEL Y RWD EARLY
// RELEASE" and "MODEL Y RWD LATER RELEASE" — resolves to all of them and the
// complaints are unioned by ODI number.
//
// Anything NOT on this list keeps a cohort unresolved when it is the only
// thing separating two candidate names, because that is how "e-tron" would
// quietly become "e-tron GT". The list is short on purpose.
const QUALIFIER = new Set([
  // powertrain
  "BEV", "EV", "ELECTRIC", "PHEV", "HEV", "HYBRID", "PLUG-IN",
  // Tesla's build/release bookkeeping
  "(ALL", "VARIANTS)", "ALL", "VARIANTS", "EARLY", "LATER", "RELEASE",
  // drive layout
  "RWD", "AWD", "FWD", "4WD", "2WD",
]);

// The same idea where the qualifier carries a number: Tesla splits the 2021
// and 2022 Model Y into "MODEL Y 5-SEAT" and "MODEL Y 7-SEAT", and BMW splits
// the 2025 i4 into "I4 XDRIVE40" and "I4 EDRIVE40". Seat count and drive code
// are trims of one model, which is the granularity our cohorts have.
const QUALIFIER_PATTERN = /^(?:\d+-SEATS?|[XE]DRIVE\d*)$/;
const isQualifier = (token) => QUALIFIER.has(token) || QUALIFIER_PATTERN.test(token);

/** Audi files every 2023 model as "AUDI Q4 E-TRON"; the 2024 vocabulary drops
 *  the prefix again. Stripping it is what lets "Q4 e-tron" find its exact
 *  match instead of tying on two Sportback-vs-not candidates and going quiet.
 *  Only ever the make's own first word, and never the whole name. */
function stripMake(make, name) {
  const m = tokens(make)[0];
  const t = tokens(name);
  return m && t.length > 1 && t[0] === m ? t.slice(1).join(" ") : normName(name);
}

export function normName(s) {
  return String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function tokens(s) {
  return normName(s).split(" ").filter(Boolean);
}

/** Which of NHTSA's model names name this car.
 *
 *  Exact match wins outright: Audi lists "E-TRON", "E-TRON GT", "E-TRON S"
 *  and "Q4 E-TRON", and an "e-tron" cohort is a token subset of all four. An
 *  exact hit is the answer and the subset matches are noise.
 *
 *  With no exact hit, every token of our name must appear in theirs
 *  ("Mustang Mach-E" -> "MUSTANG MACH-E BEV", "Ioniq 5" -> "IONIQ 5"). One
 *  survivor is the answer — BMW's only 2023 i4 row is "I4 GRAN COUPE", and
 *  there is nothing it could be confused with. Several survivors resolve
 *  together only when what separates them is qualifier words; otherwise we
 *  cannot tell which car the shopper is looking at, and an ambiguous cohort
 *  goes quiet rather than picking one. Mercedes files the EQE as a sedan and
 *  an SUV, and our feed's "EQE" rows are both — so that cohort is unresolved,
 *  correctly.
 *
 *  The names returned are NHTSA's originals, prefix and all, because that is
 *  what the query endpoints answer to.
 *
 *  @returns {string[]|null} null = unresolved. Never an empty array. */
export function resolveModels(make, model, vocabulary) {
  const alias = MODEL_ALIASES[`${normName(make)}|${normName(model)}`];
  // The raw string is what gets queried, the normalised one is what gets
  // matched. NHTSA's 2022 Tesla vocabulary contains "MODEL Y  5-SEAT" with
  // two spaces and only that spelling; collapsing the whitespace before
  // asking turns the query into an HTTP 400 and loses 145 cars.
  const rows = [];
  const seen = new Set();
  for (const raw of vocabulary ?? []) {
    const orig = normName(raw);
    if (!orig || seen.has(orig)) continue;
    seen.add(orig);
    rows.push({ raw: String(raw), orig, name: stripMake(make, orig) });
  }
  if (alias) {
    // The alias is a shortcut, not an override. NHTSA renamed the plug-in
    // Wrangler from "WRANGLER UNLIMITED PHEV" to "WRANGLER 4-DOOR 4XE"
    // between 2022 and 2024, and the later spelling matches on tokens
    // without any help — so a miss falls through rather than going quiet.
    const want = alias.map(normName);
    const hits = rows.filter((r) => want.includes(r.name) || want.includes(r.orig));
    if (hits.length) return hits.map((r) => r.raw);
  }
  const want = normName(model);
  if (!want || !rows.length) return null;

  const exact = rows.filter((r) => r.name === want || r.orig === want);
  if (exact.length) return exact.map((r) => r.raw);

  const ours = tokens(want);
  const subset = rows.filter((r) => {
    const theirs = new Set(tokens(r.name));
    return ours.every((t) => theirs.has(t));
  });
  if (subset.length === 0) return null;
  if (subset.length === 1) return [subset[0].raw];

  const ourSet = new Set(ours);
  const qualifierOnly = subset.every((r) => tokens(r.name).every((t) => ourSet.has(t) || isQualifier(t)));
  return qualifierOnly ? subset.map((r) => r.raw) : null;
}

/** Spelling variants to try against recallsByVehicle.
 *
 *  The recalls endpoint publishes no vocabulary of its own (note 3), so the
 *  candidates are whatever the products endpoint offered for issueType=r, our
 *  own name, and the punctuation variants that turned out to matter —
 *  "MUSTANG MACH-E" vs "MUSTANG MACH E".
 *
 *  Punctuation is the only thing allowed to vary. Dropping a word would make
 *  "Kona Electric" ask about the petrol Kona and "Macan Electric" about the
 *  petrol Macan, and the endpoint would answer, with somebody else's recalls
 *  (note 5). Matching is exact at NHTSA's end — "BOLT" returns nothing while
 *  "BOLT EV" and "BOLT EUV" return their own 7 and 4 — so a wider net buys
 *  nothing anyway. */
export function recallCandidates(make, model, vocabulary) {
  const out = [];
  const seen = new Set();
  // Deduped on the normalised form, stored as given: a vocabulary name's own
  // whitespace can be load-bearing (resolveModels, above).
  const push = (n) => {
    const v = normName(n);
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(String(n).trim());
  };
  const variants = (n) => {
    push(n);
    push(normName(n).replace(/-/g, " ").replace(/\s+/g, " "));
    push(normName(n).replace(/-/g, ""));
  };
  for (const n of resolveModels(make, model, vocabulary) ?? []) variants(n);
  variants(model);
  return out;
}

/** NHTSA's own attribution, not ours: every recall row carries the Model it
 *  was joined to, and we keep a campaign only when that Model is one of the
 *  names we asked about. With exact matching at their end this is an
 *  invariant rather than a filter — which is the point. If the endpoint ever
 *  starts matching loosely, a Bolt EUV campaign arriving under "BOLT EV" gets
 *  dropped here instead of appearing on a shopper's page. */
export function verifyRecall(candidates, recall) {
  const model = normName(recall?.Model);
  if (!model) return false;
  return candidates.map(normName).includes(model);
}

// Battery classification. The component gate is what keeps the deliberately
// broad text gate ("fire") from sweeping in every crash report: a complaint
// only counts when NHTSA filed it under an electrical/propulsion component
// AND its text talks about the battery.
export const BATTERY_COMPONENT = /ELECTRICAL SYSTEM|HYBRID PROPULSION|POWER TRAIN|BATTER/i;
export const BATTERY_TEXT =
  /high.?voltage|traction battery|battery pack|propulsion battery|drive battery|BMS|battery management|charg(?:e|ing) (?:port|system|fail)|thermal (?:runaway|event)|fire|ICCU/i;

// The traction pack, in the words owners actually use.
const HIGH_VOLTAGE = /high.?voltage|traction battery|battery pack|propulsion battery|drive battery|BMS|battery management|thermal (?:runaway|event)|ICCU|HV batter/i;
// The little lead-acid one. Its failures are real and common, and they are a
// different repair bill from a pack — so they are counted, and counted apart.
const LOW_VOLTAGE = /\b12[\s-]?v(?:olt)?\b|low.?voltage batter|auxiliary batter|accessory batter/i;

/** @returns {{battery: boolean, pack: boolean, twelveVolt: boolean}} */
export function classifyComplaint(complaint) {
  const components = String(complaint?.components ?? "");
  const summary = String(complaint?.summary ?? "");
  const text = `${components} ${summary}`;
  const battery = BATTERY_COMPONENT.test(components) && BATTERY_TEXT.test(text);
  if (!battery) return { battery: false, pack: false, twelveVolt: false };
  const twelveVolt = LOW_VOLTAGE.test(text) && !HIGH_VOLTAGE.test(text);
  return { battery: true, pack: !twelveVolt, twelveVolt };
}

export function isBatteryRecall(recall) {
  const component = String(recall?.Component ?? "");
  const summary = String(recall?.Summary ?? "");
  return BATTERY_COMPONENT.test(component) && BATTERY_TEXT.test(`${component} ${summary}`);
}

/** The key both lanes agree on: upper-cased so "ARIYA" and "Ariya" are one
 *  cohort, and so the page can look itself up without knowing how the dealer
 *  that supplied the row happened to capitalise it. */
export function cohortKey(make, model, year) {
  return `${normName(make)}|${normName(model)}|${year}`;
}
