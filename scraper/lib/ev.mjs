// Is this vehicle an EV (battery-electric or plug-in hybrid)? Belt and
// suspenders: structured fuel-type fields first, then VIN WMI, then model-name
// match. Anything that only matches by name is flagged lower-confidence
// ("BEV?" / "PHEV?", confidence name_match) so vpic-enrich.mjs can confirm it
// before ingest lets it through; a name match alone never publishes a car.
export const EV_MODEL_RE = new RegExp(
  [
    "model [3sxy]\\b", "cybertruck",
    "bolt e[uv]v?", "silverado ev", "blazer ev", "equinox ev", "lyriq", "hummer ev",
    "sierra ev", "escalade iq", "optiq", "vistiq", "celestiq",
    "charger daytona",
    // \b after the S: unanchored, "wagoneer s" matched inside "Grand
    // Wagoneer Series III" — a petrol Jeep came back BEV?/name_match on
    // thepalmmotors.com (2026-08-23, AutoFunds lane build). vPIC refuted it,
    // so the cost was a decode, not a false listing; same class as the
    // iX/C40/ID.4 anchors above.
    "wagoneer s\\b", "500e", "cooper se", "countryman se",
    "leaf", "ariya",
    "ioniq 5", "ioniq 6", "ioniq5", "ioniq6", "kona electric",
    "ev6", "ev9", "niro ev", "soul ev",
    // \b in front of the ID.4 and ID. Buzz: unanchored, "id\.? ?4" matched
    // the tail of "Hybrid 4WD" / "E-Hybrid 4" / "Hybrid 4MATIC", so 167 rows
    // of one crawl (57 Toyota Sequoia Hybrid 4WDs, 32 Panamera E-Hybrid 4s,
    // F-150 Hybrid 4x4s, Tundra i-FORCE MAX 4WDs …) came back name-matched
    // BEVs (measured 2026-08-23 on out/listings.json). vPIC refuted the
    // conventional hybrids and held the Panameras, so nothing false reached
    // the site — but a nameplate match VOUCHES a dealer's fuel-type text
    // without vPIC (fuelTextOnly), so a Sequoia a dealer tagged "Electric"
    // would have shipped. The anchor closes that.
    "\\bid\\.? ?4", "\\bid\\.? ?buzz", "e-tron", "q4 e", "q8 e", "taycan", "macan electric",
    "mach-e", "mach e", "f-150 lightning", "lightning",
    // \b in front of the iX too, for the same reason as the C40 above: bare
    // "ix\b" matched the tail of every word ending in those letters, so a
    // Toyota Matrix and a Pontiac Grand Prix both came back name-matched EVs
    // (2026-08-16). vPIC declined to confirm them and ingest held them, as
    // designed — the cost was the decode, not a false listing.
    //
    // The i3/i4/i5/i7 need more than \b: "I4" is how dealers write an
    // inline-four, so the bare tokens matched "4dr Sdn I4 CVT" Altimas,
    // "I3 Turbocharged" Trailblazers and "Gas I5" Passats — 3,677 rows of
    // the 2026-08-23 crawl (replayed 2026-08-24, autodealersdigital build),
    // 53% of the entire name_match pile vpic-enrich must decode inside its
    // nightly time cap. Worse than the decode cost: an engine-label "I4" in
    // a TRIM made nameplateVouches() vouch a dealer's fuel-text "Electric"
    // past the vPIC gate, the ID.4/Sequoia hole again. So: the make word in
    // front (\W{0,2} because dealers print "BMW® i4"), or one of BMW's own
    // i-car designators after. The designator digits must END the word —
    // every i-car is eDrive35/40, xDrive40/60 or M50/M60/M70, while the
    // petrol X3 is "xDrive30i" and the plug-in X5 "xDrive45e", and the
    // vouch haystack's name+trim join really did manufacture "I4 xDrive30i"
    // from a petrol X3. Replayed over the same 110k-row crawl: 0 of 3,685
    // real i3/i4/i5/i7 lost from either haystack, 0 engine labels kept.
    "bmw\\W{0,2}i[3457]s?\\b",
    "\\bi[3457]s? ?((e|x)drive ?\\d{2}\\b|m[567]0\\b|gran coupe|with range extender)",
    "\\bix\\b",
    "eqb", "eqe", "eqs",
    "polestar [234]", "r1t", "r1s", "lucid air", "lucid gravity",
    // Toyota renamed the bZ4X to plain "bZ" for MY2026 (and added the bZ
    // Woodland). "bz4x" no longer matches those names, so EchoPark's seven
    // 2026 Toyota bZ came back unclassified on 2026-08-23. Anchored on the
    // make word because a bare \\bbz\\b is exactly the kind of two-letter
    // token the iX/C40 lessons above warn about.
    "toyota bz\\b", "bz4x", "solterra", "prologue", "zdx",
    // The Lexus RZ enumerated its variants and got the list wrong as Lexus
    // added them: "rz ?[34]50" covered the RZ 350e and RZ 450e but not the
    // RZ 300e or the RZ 550e, so half of Lexus's only BEV nameplate fell
    // through to name_match (found 2026-08-18 building lib/oem/toyota.mjs,
    // where the live CPO lot carries all four). Every RZ variant Lexus has
    // sold is battery-electric, so widening the digits is a correction, not a
    // relaxation. The \b in front is the same guard the iX and C40 entries
    // above needed: unanchored, "rz" matches inside other words.
    // 300e / 350e / 450e / 550e — the second digit is 0 or 5, so [3-5][05]0.
    "\\brz ?[3-5][05]0e?\\b",
    // \b on the C40: unanchored, it matched inside "XC40", so every petrol
    // XC40 came back a name-matched EV (a 2022 XC40 T5 AWD R-Design on
    // gaautoworld.com, 2026-08-16). vPIC refuted them before ingest, so
    // nothing false reached the site — it just spent a decode on each.
    "ex30", "ex90", "\\bc40", "xc40 recharge",
    // Measured on Ever Cars' all-BEV lot (2026-08-24): 16 live cars fell
    // through for want of these. GV60 and the Electrified G80/GV70 are
    // Genesis's only BEVs (the bare G80/GV70 are petrol — "electrified" is
    // the load-bearing word). I-Pace and e-Golf were never anything but
    // battery-electric. The bare "Lexus RZ" (no trim number) needs the make
    // word for the same reason "toyota bz" does — two letters alone is the
    // iX lesson again.
    "\\bgv60\\b", "electrified gv70", "electrified g80", "\\bi-pace\\b", "\\be-golf\\b", "lexus rz\\b",
  ].join("|"),
  "i"
);

// Makers whose every car is a BEV, so the WMI alone settles it. Membership
// here is load-bearing in a way that is easy to miss: vpic-enrich's
// fuelTextOnly guard deliberately SKIPS vPIC verification for these VINs, so
// a wrong entry ships a non-EV at high confidence with nothing downstream to
// catch it.
//
// LPS was wrong and was removed 2026-08-18. Polestar used it for the BEV
// Polestar 2 AND the Polestar 1, which is a plug-in hybrid — four 2021
// Polestar 1s were live on the site as EVs because of it. Polestar 2/3/4 lose
// nothing: they match EV_MODEL_RE by nameplate, so they arrive as
// "name_match" and vPIC promotes them, while a Polestar 1 gets refuted. The
// slower path is the correct one when the VIN genuinely does not settle it.
// LPS was wrong and was removed 2026-08-18 (Polestar 1 is a plug-in hybrid
// sharing the Polestar 2's WMI). Worth recording WHY it was the entry that
// broke, because it generalises: vPIC's DecodeWMI shows LPS is registered to
// "ZHEJIANG HAOQING AUTOMOBILE MFG CO LTD" — a Geely contract plant, not a
// brand — so it can carry whatever that factory builds. The safe entries are
// the ones registered to the EV maker itself with no parent company.
//
// 7UU added 2026-08-18: Lucid's SECOND WMI, and it was missing. The Air is 50E
// but every Gravity is 7UU, so a used Gravity on a dealer site fell through to
// the name-match path and only landed if the listing said "Lucid Gravity"
// rather than, say, "Gravity Grand Touring". Checked against vPIC rather than
// inferred, both per-VIN and per-WMI: 7UUG1TJK2VA046654 decodes Make LUCID,
// FuelTypePrimary Electric, ElectrificationLevel "BEV (Battery Electric
// Vehicle)"; DecodeWMI/7UU and /50E both return ManufacturerName "LUCID USA,
// INC." with an empty ParentCompanyName, and vPIC lists exactly two models
// ever built under that make (Air, Gravity), both battery-electric.
// Rivian's 7FC/7PD were re-checked at the same time and stay: DecodeWMI
// returns Make RIVIAN / "RIVIAN AUTOMOTIVE LLC" / no parent company for both,
// and vPIC's model list for the make is R1T, R1S, RCV, EDV, R2 — Rivian has
// never built a plug-in hybrid or a combustion vehicle under any of them.
export const EV_ONLY_WMIS = new Set(["5YJ", "7SA", "7G2", "LRW", "XP7", "7FC", "7PD", "50E", "7UU", "YSP"]);

// Plug-in hybrid nameplates. Separate from EV_MODEL_RE on purpose: a match
// here says "this car plugs in", never "this car is battery-electric", and the
// two lists are consulted in that order so a name on both (the 2025 Countryman
// SE, a BEV sharing its name with the 2018-23 plug-in) asks vPIC as BEV? and
// lets the decode settle the kind.
//
// Why this list exists (2026-08-23): dealer.com and DealerOn — ~94% of the
// crawl — declare a Jeep Wrangler 4xe with fuelType "Hybrid", the identical
// string a CR-V Hybrid gets, and classifyEv read that as "not an EV". Nothing
// downstream could catch it because no plug-in nameplate was known anywhere.
// Autotrader lists ~46,700 PHEVs nationally; the feed carried ~4,500.
//
// Every entry was checked against EPA's fueleconomy.gov vehicles.csv
// (atvType "Plug-in Hybrid", by make/model/year) before it went in, and the
// ones a nameplate alone cannot settle are year-gated below rather than
// listed here. Names that share a badge with a conventional hybrid or petrol
// car in some year are NOT entries: "Tonale" (a 2.0T petrol Tonale exists
// from 2025), "RX 450h" (a conventional hybrid 2010-22; only the "+" is the
// plug-in), "Santa Fe"/"Tucson"/"Sorento"/"Niro"/"CX-90" (those arrive via
// the explicit "PHEV"/"Plug-in" token in their own names, see
// PHEV_NAME_CLAIM_RE). Rejected outright, because the primary source does not
// certify them as plug-ins: Lamborghini Revuelto (EPA atvType "Hybrid"),
// Nissan Rogue Plug-In Hybrid and Ram 1500 Ramcharger (no EPA rows at all),
// BMW 545e/760e/225xe and Mercedes CLA 250e/E 350e/GLE 350de (never
// certified for the US).
//
// Same anchoring discipline as the iX/C40/RZ lessons above: \b on every
// short token, never a bare substring. "volt" additionally refuses a digit
// or hyphen in front of it, because "48-Volt" is how dealers describe a
// mild-hybrid starter-generator and that is the exact opposite claim.
export const PHEV_MODEL_RE = new RegExp(
  [
    // Stellantis
    "\\b4xe\\b", "pacifica hybrid", "\\bhornet r/?t\\b", "\\btonale\\b.*\\beawd\\b",
    // Toyota / Lexus — the "+" (or EPA's "Plus") is what separates the
    // RX 450h+ plug-in from the 2010-22 RX 450h hybrid; NX 450h and TX 550h
    // were only ever sold as the "+" car, so they may drop it.
    "\\b(prius|rav4) prime\\b", "\\bnx ?450h\\b", "\\brx ?450h ?(\\+|plus\\b)", "\\btx ?550h\\b",
    // Honda: every Clarity plugs in or is an FCEV (vPIC decides the kind).
    "\\bclarity\\b",
    // Ford / Lincoln: "Energi" was only ever the plug-in badge; "Grand
    // Touring" is the plug-in trim on both Lincolns and nothing else.
    "\\benergi\\b", "\\b(aviator|corsair) grand touring\\b",
    // GM
    "(?<![\\d-])(?<!\\d )\\bvolt\\b", "\\belr\\b",
    // BMW: the trailing "e" on a model number / xDrive code is the plug-in
    // designation in this era (EPA: 330e, 530e, 550e, 740e, 745e, 750e,
    // X3 xDrive30e, X5 xDrive40e/45e/50e). XM and i8 were only ever plug-ins.
    // The lookbehind keeps "550e" off the Lexus RZ 550e, a BEV that shares
    // the number (found in the 2026-08-23 sweep of out/listings.json; it was
    // the only non-plug-in the list matched across 110k names). It only reads
    // the character in front of the badge, so it does not survive a name that
    // repeats the badge ("RZ 550e" + trim "550e F Sport") — that is what
    // BEV_BADGE_COLLISION_RE below catches, and phevNameplate() is where a
    // caller gets both.
    "(?<!\\brz ?)\\b(330e|530e|550e|740e|740le|745e|750e)\\b", "\\bxdrive ?(30|40|45|50)e\\b", "\\bxm\\b", "\\bi8\\b",
    // Mercedes: the "e" suffix again (C350e, S550e/S560e/S580e, GLC350e,
    // GLE450e/GLE550e), plus AMG's "E Performance" plug-in designation.
    "\\bc ?350 ?e\\b", "\\bs ?(550|560|580) ?e\\b", "\\bglc ?350 ?e\\b", "\\bgle ?(450|550) ?e\\b", "\\be[ -]performance\\b",
    // Audi: "TFSI e" is the plug-in badge on every model that wears it.
    "\\btfsi ?e\\b",
    // Porsche: "E-Hybrid" is the plug-in badge on every Cayenne/Panamera.
    "\\be-hybrid\\b", "\\b918 spyder\\b",
    // Volvo: T8 / Recharge on these bodies is the plug-in (the XC40 and C40
    // Recharge are BEVs and are deliberately not in this list — they live in
    // EV_MODEL_RE). "Polestar Engineered" is the S60/V60 T8 by another name.
    "\\b(xc90|xc60|s60|v60|s90|v90)\\b.*\\b(t8|recharge)\\b", "\\bpolestar engineered\\b", "\\bpolestar 1\\b",
    // Land Rover: the P###e codes are the plug-ins.
    "\\bp(300|400|440|460|510|550)e\\b",
    // MINI's 2018-23 plug-in, distinct from the Cooper SE hatch (BEV).
    "\\bcooper s ?e countryman\\b",
    // Bentley / exotics
    "\\bbentayga hybrid\\b", "\\bflying spur hybrid\\b",
    "\\bsf90\\b", "\\b296 ?(gtb|gts|speciale)\\b", "\\bartura\\b", "\\bmclaren p1\\b", "\\burus se\\b",
    "\\brevero\\b", "\\bgs-?6\\b", "\\bfisker karma\\b", "\\bvalhalla\\b",
  ].join("|"),
  "i"
);

// Nameplates that are plug-ins only in some model years. Outside the window
// (or with no year at all) they do not match — abstaining is the honest
// direction, because the same name on the other side of the gate is a
// conventional hybrid or a petrol car.
//   Crosstrek Hybrid: EPA certifies the 2019-23 car as a plug-in and the 2026
//   one as a conventional hybrid. 2022 is a hole in EPA's file, not a petrol
//   year (registry/ev-rules-audit-2026-08-22.json adjudicated it kept).
//   BMW M5: petrol through 2023; every 2025+ M5 is a plug-in.
//   Bentley Continental GT/GTC and Flying Spur: petrol through 2024; every
//   2025+ one is a plug-in ("Ultra Performance Hybrid").
//   AMG E 53 Hybrid: the 2019-23 "AMG E 53" was a 48V mild hybrid; the 2025+
//   car is a plug-in and carries "Hybrid" in its name.
const PHEV_YEAR_GATED = [
  { re: /\bcrosstrek hybrid\b/i, from: 2019, to: 2023 },
  { re: /\bm5\b/i, from: 2025 },
  { re: /\bcontinental gtc?\b|\bflying spur\b/i, from: 2025 },
  { re: /\be ?53 hybrid\b/i, from: 2025 },
];

// A plug-in claim made in the car's own NAME rather than a fuel field —
// "Tucson Plug-in Hybrid", "Outlander PHEV", "CX-90 PHEV". This is the
// dealer's (or the maker's) word, so it only ever produces a name_match that
// vPIC must confirm; it never vouches on its own.
export const PHEV_NAME_CLAIM_RE = /\bphev\b|plug[\s-]?in/i;

// A plug-in claim in a FUEL field. Accepted as the dealer's explicit
// statement ("Plug-In Hybrid", "Plug-in Gas/Electric Hybrid", "PHEV",
// "Plug-In Electric/Gas" — Stellantis's own string for the 4xe and Pacifica
// Hybrid). "Hybrid" alone is still not an EV.
const PHEV_FUEL_RE = /plug[\s-]?in|\bphev\b/i;

// Battery-electric nameplates that wear a badge PHEV_MODEL_RE reads as a
// plug-in, vetoed across the WHOLE string rather than by what sits directly in
// front of the badge.
//
// PHEV_MODEL_RE's BMW branch already guards the one collision there is — the
// Lexus RZ 550e against BMW's 550e — with a `(?<!\brz ?)` lookbehind, and that
// lookbehind is exactly one character of context wide. It holds for "Lexus RZ
// 550e F Sport" and fails for the shape the feed actually sends: dealers file
// this car as model "RZ 550e" with trim "550e F Sport", so the joined name
// repeats the badge and the second copy has "550e " in front of it, not "RZ ".
// One live 2026 RZ 550e reached web/scripts/phev-enrichment-gap.mjs's
// cross-kind guard that way on 2026-08-29 and was reported as a plug-in
// wearing a battery-electric row — it is a BEV wearing its own correct row.
//
// Keyed on the nameplate, not on the badge: dropping "550e" from
// PHEV_MODEL_RE would take the BMW 550e with it, and the BMW 330e/530e/750e
// pattern that catches it. A veto that names the one car whose nameplate
// settles the question costs those nothing — a BMW listing never says "RZ".
// The measured alternative, letting EV_MODEL_RE win outright the way
// classifyEv orders the two lists, was rejected: over the 42,260
// plug-in-shaped listings live on 2026-08-29 it also swallowed a genuine 2019
// MINI Cooper S E Countryman ALL4, whose name matches EV_MODEL_RE's 2025
// Countryman SE. Losing a real plug-in from the watched population is the
// direction this lane cannot afford.
const BEV_BADGE_COLLISION_RE = /\brz ?[3-5][05]0e\b/i;

// Does the nameplate settle that this car plugs in? `year` gates the names
// that are only plug-ins in some model years.
export function phevNameplate(name, year) {
  if (!name) return false;
  if (BEV_BADGE_COLLISION_RE.test(name)) return false;
  if (PHEV_MODEL_RE.test(name)) return true;
  const y = Number(year);
  if (!Number.isFinite(y)) return false;
  return PHEV_YEAR_GATED.some((g) => y >= g.from && y <= (g.to ?? Infinity) && g.re.test(name));
}

const text = (v) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));

export function classifyEv(vehicle) {
  const fuelFields = [
    vehicle.fuelType,
    vehicle.vehicleEngine?.fuelType,
    ...(Array.isArray(vehicle.vehicleEngine) ? vehicle.vehicleEngine.map((e) => e?.fuelType) : []),
  ].map(text).join(" ").toLowerCase();

  // An explicit plug-in claim in the fuel field is the dealer's own word, the
  // same standing a bare "Electric" has for a BEV. Checked before the electric
  // test because "Plug-In Hybrid" carries no "electric" at all — the old rule
  // demanded both words and so threw every one of these away.
  if (PHEV_FUEL_RE.test(fuelFields)) return { isEv: true, kind: "PHEV", confidence: "high" };

  // "BEV" as the fuel string is the same explicit claim "Electric" is — the
  // motorcarsites platform prints exactly that, and a 2024 Cybertruck was
  // saved only by its WMI (2026-08-24). \b-anchored: "bev" appears inside
  // ordinary words ("beverage" on a page would never reach a fuel FIELD, but
  // the anchor costs nothing and the two-letter-token lessons above earned it).
  if (/\bbev\b/i.test(fuelFields)) return { isEv: true, kind: "BEV", confidence: "high" };

  // "electric" alone still admits hybrids ("Gas/Electric Hybrid"). A hybrid
  // fuel string without a plug is NOT a refutation, though — it is what
  // dealer.com prints on a Wrangler 4xe — so it falls through to the
  // nameplate check below instead of returning not-an-EV here. The nameplate
  // path only ever yields a name_match that vPIC must confirm.
  if (fuelFields.includes("electric") && !fuelFields.includes("hybrid") && !fuelFields.includes("gas")) {
    return { isEv: true, kind: "BEV", confidence: "high" };
  }

  const vin = text(vehicle.vehicleIdentificationNumber).toUpperCase();
  if (vin.length === 17 && EV_ONLY_WMIS.has(vin.slice(0, 3))) {
    return { isEv: true, kind: "BEV", confidence: "high" };
  }

  const name = [vehicle.name, vehicle.model, text(vehicle.model?.name)].map(text).join(" ");
  if (EV_MODEL_RE.test(name)) return { isEv: true, kind: "BEV?", confidence: "name_match" };
  // The plug-in badge is often in the trim, not the model ("Wrangler" /
  // "Rubicon 4xe", "XC90" / "T8 Recharge"), so the trim joins the haystack
  // here. EV_MODEL_RE above keeps its original haystack on purpose: widening
  // it is a change to the BEV rule, not this one.
  const nameWithTrim = `${name} ${text(vehicle.vehicleConfiguration)}`;
  const year = Number(text(vehicle.vehicleModelDate).match(/\b(19[89]\d|20\d{2})\b/)?.[0]);
  if (phevNameplate(nameWithTrim, year) || PHEV_NAME_CLAIM_RE.test(nameWithTrim)) {
    return { isEv: true, kind: "PHEV?", confidence: "name_match" };
  }

  return { isEv: false };
}

// Can the car's own name vouch for an electrified powertrain, without asking
// vPIC? True for a known BEV nameplate or a plug-in nameplate (year-gated
// where the name alone does not settle it). The generic "PHEV"/"Plug-in"
// name token deliberately does NOT vouch: it is the same party's claim as the
// fuel field, not an independent one.
export function nameplateVouches(l) {
  const name = [l.make, l.model, l.name, l.trim].filter(Boolean).join(" ");
  return EV_MODEL_RE.test(name) || phevNameplate(name, l.year);
}

// A "high" classification backed by nothing but the dealer's own fuel-type
// text — VIN not an EV-only WMI, model/name not a known EV — is only as good
// as the dealer's data entry (a 2015 Prius Two shipped as an EV because its
// page said fuelType "Electric", 2026-08-15). vpic-enrich.mjs puts these to
// vPIC and demotes the ones it refutes; ingest.mjs refuses the ones vPIC was
// never asked about. Both need the same predicate, so it lives here rather
// than in one of them — they disagreeing about which rows are unverified is
// the failure this whole lane exists to prevent.
//
// A plug-in nameplate vouches the same way a BEV nameplate does (2026-08-23):
// a dealer's "Plug-In Hybrid" on a car whose own name says 4xe / Energi /
// E-Hybrid is two sources agreeing, and that is the standard "Electric" on a
// Lyriq already ships under. It also matters for the plug-ins vPIC is simply
// wrong about — it decodes the BMW XM and the S 580e as bare Gasoline and the
// Polestar 1 as Strong HEV (registry/ev-rules-audit-2026-08-22.json) — which
// a vPIC-only gate would refute every night.
export function fuelTextOnly(l) {
  if (l.evConfidence !== "high" || l.evConfidenceSource === "vpic") return false;
  if (EV_ONLY_WMIS.has(String(l.vin ?? "").slice(0, 3).toUpperCase())) return false;
  return !nameplateVouches(l);
}

// ── What a vPIC decode row proves ──────────────────────────────────────────
// Shared by vpic-enrich.mjs (which promotes/demotes on them) and
// audit-listings.mjs (which re-judges live rows by them). One definition on
// purpose: an audit that judged more harshly than ingest would retire cars
// ingest would happily admit tomorrow, and vice versa.
// vPIC confirms BEV via ElectrificationLevel ("BEV (Battery Electric
// Vehicle)") or, when that's blank, a bare "Electric" FuelTypePrimary with no
// secondary fuel. PHEVs/HEVs report FuelTypePrimary "Electric" too (secondary
// "Gasoline", ElectrificationLevel "PHEV (...)"), so both are checked and
// excluded explicitly — this is the only path that promotes a name-match EV,
// and it never fires on name text alone.
// The reverse check, for demoting fuel-text-only classifications: demotion is
// evidence-based only. A blank vPIC decode proves nothing and must not delist
// a real EV — only an affirmative non-plug-in hybrid level or a pure
// combustion fuel row refutes. (Control-tested 2026-08-15: Prius Two → Strong
// HEV refuted; Cayenne "S" E-Hybrid, GLC 350e, AMG E 53 → PHEV kept; the GLC
// reports FuelTypePrimary "Gasoline" WITH level PHEV, which is why the level
// is consulted first.)
export function vpicRefutesEv(r) {
  const level = String(r.ElectrificationLevel ?? "");
  if (/phev|plug|bev|battery electric/i.test(level)) return false;
  if (/hev|hybrid|mild/i.test(level)) return true;
  const fuels = `${r.FuelTypePrimary ?? ""} ${r.FuelTypeSecondary ?? ""}`;
  return /gasoline|diesel|flex|e85/i.test(fuels) && !/electric/i.test(fuels);
}

export function vpicConfirmsBev(r) {
  const level = String(r.ElectrificationLevel ?? "");
  const fuelPrimary = String(r.FuelTypePrimary ?? "");
  const fuelSecondary = String(r.FuelTypeSecondary ?? "");
  if (/hev|phev|hybrid/i.test(level) || /hybrid/i.test(fuelPrimary) || fuelSecondary.trim()) return false;
  if (/\bbev\b|battery electric/i.test(level)) return true;
  return /electric/i.test(fuelPrimary);
}

// vPIC confirms a plug-in hybrid ONLY through an affirmative ElectrificationLevel
// ("PHEV (Plug-in Hybrid Electric Vehicle)"). The fuel pair is not enough:
// "Electric" + "Gasoline" is what a conventional hybrid can report too, and a
// blank level is silence, not agreement. This is the only path that promotes
// a "PHEV?" name match, and it errs toward abstaining — vPIC decodes the BMW XM
// and the Mercedes S 580e as bare Gasoline and the Polestar 1 as Strong HEV
// (registry/ev-rules-audit-2026-08-22.json), so those nameplates never land
// through this path and are held instead. Held is honest; a Strong HEV string
// promoted as a plug-in would not be.
export function vpicConfirmsPhev(r) {
  return /\bphev\b|plug-?in/i.test(String(r.ElectrificationLevel ?? ""));
}
