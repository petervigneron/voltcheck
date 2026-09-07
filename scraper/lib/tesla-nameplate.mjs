// Tesla's model field, split back into nameplate and version.
//
// Tesla has four nameplates a dealer can sell — Model 3, S, X, Y — and the
// independent lots that carry them almost never file the car that way. Their
// inventory systems have one "model" box, and into it goes whatever the
// auction sheet said: "Model Y Long Range AWD", "Model S Plaid AWD", "Model 3
// Standard Range Plus RWD", "Model X 100D". Measured 2026-09-07 against the
// live feed: 263 cars across 31 rooftops, and 121 of the make/model groups
// the nightly enrichment audit failed on the night before were exactly these
// spellings — one group per spelling, none of them matching an enrichment row
// keyed "Model 3", so every one of those shoppers opened a card with no
// battery, no range and no warranty for a car the corpus has known since
// 2018. The strings come from three platforms (eBizAutos' JSON-LD `model`,
// AutoManager's data-displaymodel, and the dealer's own free text on
// DealerFire), which is why this lives at ingest, the one door every lane's
// record passes through, rather than in any one extractor.
//
// WHAT THIS CLAIMS, and the two things it refuses to.
//
// The nameplate is the one part of the string that is never in doubt: a
// string that begins "Model 3" names a Model 3, and Tesla's own VIN says so
// in position 4 (5YJ3…, 7SAY…, LRW3… — the letter after the WMI is the
// nameplate on every Tesla VIN ever issued). When a VIN is on the record and
// disagrees with the string, nothing here changes: matching nothing is
// honest, matching the wrong car is not.
//
// The rest of the string becomes the trim ONLY when the whole of it, once
// the drivetrain and body words are set aside, is a version Tesla itself
// sold under that name — the vocabulary below, and nothing outside it. "Long
// Range" moves. "Long Range Palladium" does not (Palladium is Tesla's
// internal name for the 2021 S/X refresh, not a version a shopper can buy),
// and neither does "2019 TESLA MODEL 3 AWD PERFORMANCE 1-OWNER 615-730-9991"
// even though a person can see the word Performance in it: a rule that
// picks words out of ad copy is a rule that will one day pick "Performance"
// out of "Performance tires, Long Range sold separately". The house rule on
// claims: when the data can't support the claim, the code goes quiet.
//
// The drivetrain token, when the string carries one, is reported alongside
// so ingest can use it the way it uses every other platform drive field —
// it is not a trim, and the corpus keys Tesla rows on VIN position 8, not
// on "AWD".
//
// The record's existing trim is respected, in this order: a trim that
// restates the model string (AutoManager's "Model 3 Long Range | RWD | 0")
// or names no Tesla version at all (DealerFire's "*FULL SELF-DRIVING
// ENABLED, TRAFFIC AWARE CRUISE CONTROL, …") carried nothing this loses, so
// the version moves in; a trim that already names the same version is kept
// as the dealer wrote it; a trim that names a DIFFERENT version is two
// signals disagreeing, and then neither is claimed — the autofunds
// two-signal rule, applied to the version instead of the condition.

// Tesla's nameplate letter, as it appears in VIN position 4 and at the head
// of the model string. Cybertruck and Roadster are not "Model _" strings and
// are not handled here.
const NAMEPLATE_RE = /^\s*model\s*([3sxy])\b\s*(.*)$/i;

// Words that describe the drivetrain or the body, not the version. Set
// aside before the vocabulary test, never carried into the trim.
const DRIVE_WORDS = [
  [/\b(?:awd|4wd|dual[\s-]?motor(?:\s+all[\s-]?wheel[\s-]?drive)?|all[\s-]?wheel[\s-]?drive)\b/gi, "AWD"],
  [/\b(?:rwd|rear[\s-]?wheel[\s-]?drive)\b/gi, "RWD"],
];
const BODY_RE = /\b(?:sedan|sport\s+utility(?:\s+vehicle)?|suv|hatchback|4[\s-]?(?:d|dr|door))\b/gi;

// The versions Tesla sold, with the spelling the corpus keys on. Each pattern
// matches the WHOLE remainder, so an extra word anywhere fails the test.
//
// "Standard Plus" is a dealer shorthand for Standard Range Plus (there was
// never a different car by that name) and "Long Range Battery" / "Mid Range
// Battery" are what Tesla's own 2018–19 order page called the Model 3 packs;
// those fold onto the corpus spelling. "Plaid Plus" was announced and never
// delivered, "Launch Series" and "Signature" are editions of a version rather
// than versions, and none of them are here — a string carrying one abstains.
const VERSIONS = [
  ["Standard Range Plus", /^standard(?: range)?(?: battery)? plus$/i],
  ["Standard Range", /^standard range(?: battery)?$/i],
  ["Standard", /^standard$/i],
  ["Long Range Plus", /^long range plus$/i],
  ["Long Range", /^long range(?: battery)?$/i],
  ["Mid Range", /^mid range(?: battery)?$/i],
  ["Performance", /^performance$/i],
  ["Plaid", /^plaid$/i],
  ["Premium", /^premium$/i],
];
// Model S/X pack badges (60, 70D, 75, 85D, 90D, 100D, P85, P85+, P90D,
// P100D). "70 D" is the same badge with a space a dealer typed.
const PACK_BADGE_RE = /^(p?)(40|60|70|75|85|90|100)\s?(d?)(\+?)$/i;

/** The version a string names, or undefined when it names anything else
 *  (or nothing). `drive` is whichever drivetrain word the string carried. */
export function teslaVersion(s) {
  let rest = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!rest) return { drive: undefined };
  let drive;
  for (const [re, token] of DRIVE_WORDS) {
    if (re.test(rest)) {
      drive ??= token;
      rest = rest.replace(re, " ");
    }
    re.lastIndex = 0;
  }
  rest = rest.replace(BODY_RE, " ").replace(/\s+/g, " ").trim();
  if (!rest) return { drive };
  for (const [name, re] of VERSIONS) if (re.test(rest)) return { trim: name, drive };
  const badge = rest.match(PACK_BADGE_RE);
  if (badge) return { trim: `${badge[1]}${badge[2]}${badge[3]}${badge[4]}`.toUpperCase(), drive };
  return { drive, unrecognized: true };
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * One normalized record's make/model/trim/vin → the same fields with a Tesla
 * model folded to its nameplate. Returns the record's own fields untouched
 * for every non-Tesla, every Tesla already filed by nameplate, and every
 * string whose nameplate the VIN contradicts. Never mutates its argument.
 */
export function splitTeslaModel(r) {
  const out = { model: r.model, trim: r.trim, driveLine: r.driveLine };
  if (!/^\s*tesla\s*$/i.test(String(r.make ?? ""))) return out;
  const m = String(r.model ?? "").match(NAMEPLATE_RE);
  if (!m) return out;
  const letter = m[1].toUpperCase();
  const vin = String(r.vin ?? "").toUpperCase();
  // Position 4 of a Tesla VIN is the nameplate. A 17-character VIN that says
  // otherwise means the string is about some other car; leave it alone.
  if (vin.length === 17 && vin[3] !== letter) return out;
  const nameplate = `Model ${letter}`;
  const remainder = m[2].trim();
  out.model = nameplate;
  if (!remainder) return out;

  const fromModel = teslaVersion(remainder);
  if (fromModel.drive && !out.driveLine) out.driveLine = fromModel.drive;
  if (!fromModel.trim) return out; // drivetrain only, or words this cannot vouch for

  const existing = String(r.trim ?? "").trim();
  if (!existing || norm(existing).startsWith(norm(r.model))) {
    out.trim = fromModel.trim;
    return out;
  }
  const fromTrim = teslaVersionInText(existing);
  if (!fromTrim) out.trim = fromModel.trim; // the trim slot held a feature blurb, not a version
  else if (fromTrim !== fromModel.trim) out.trim = undefined; // two versions named; claim neither
  return out;
}

// Does an existing trim name a Tesla version anywhere in it? Looser than
// teslaVersion() on purpose: "Long Range Sport Utility 4d Awd" and "Long
// Range Launch Series" both name Long Range, and the question here is only
// whether the slot already holds a version this would be overwriting.
function teslaVersionInText(s) {
  const whole = teslaVersion(s);
  if (whole.trim) return whole.trim;
  const t = String(s).replace(/\s+/g, " ");
  for (const [name] of VERSIONS) {
    if (new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "i").test(t)) return name;
  }
  const badge = t.match(/\b(p?)(40|60|70|75|85|90|100)(d?)(\+?)(?=\s|$)/i);
  if (badge && (badge[1] || badge[3])) return `${badge[1]}${badge[2]}${badge[3]}${badge[4]}`.toUpperCase();
  return undefined;
}
