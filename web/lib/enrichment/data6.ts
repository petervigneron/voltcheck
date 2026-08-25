import type { EnrichmentRow, Fact, Source } from "../types";

// Seventh research tranche (2026-08-23): the plug-in hybrid backlog that
// scripts/phev-enrichment-gap.mjs surfaced after the 08-23 crawl expansions
// doubled the live plug-in population — Volvo XC90/XC60/S60 T8, the renamed
// 2026 Toyota RAV4/Prius Plug-in Hybrids, Lexus NX/RX 450h+, Mazda
// CX-90/CX-70 PHEV, Hyundai Tucson/Santa Fe PHEV, Kia Sportage/Sorento/Niro
// PHEV, Mitsubishi Outlander PHEV, BMW's e-badged sedans plus XM and M5,
// Mercedes GLC 350e/GLE 450e, Lincoln Corsair/Aviator Grand Touring, Porsche
// Cayenne/Panamera E-Hybrid, and the 2026 Escape PHEV year.
//
// Sourcing split, deliberately two-lane:
//  - Every EPA figure (electric range, total range, MPGe, gas MPG) was pulled
//    from fueleconomy.gov's REST API directly — machine-readable, no
//    transcription by hand or by a model — and cites the same Find.do compare
//    page the earlier PHEV tranche cites. Where fueleconomy has no record for
//    a model year (2026 Toyota/Lexus, 2024 GLE 450e), the maker's own
//    published figure stands in, tagged with the maker URL and a note saying
//    whose estimate it is; where neither exists the row abstains rather than
//    stretches a neighbouring year (the RAV4-Prime-alias shortcut this
//    tranche's brief explicitly rejected).
//  - Battery, charger, DC-capability and warranty facts come from
//    manufacturer documents fetched this pass (press releases, spec pages,
//    owner-manual charging pages), each verified against a verbatim quote.
//    NOT-FOUNDs stayed empty or became `abstains` entries; nothing was filled
//    from memory. The research transcripts include control tests worth
//    keeping: Volvo's US site never says "heat pump" even for the EX90 (so
//    heat-pump silence proves nothing and every Volvo row abstains), and
//    Porsche's Taycan page names DC power plainly (so its absence on every
//    E-Hybrid page is meaningful, but still est, not mfr).
//
// The trim-guarded bare-model `-alt` shape (see data4's Wrangler comment and
// web/tests/phev-bare-model-aliases.test.ts) is used everywhere a petrol car
// shares the nameplate: bare "5 Series"/"3 Series"/"7 Series" keyed on the
// e-badge, bare "GLC"/"GLE" keyed on 350e/450e, bare "Corsair"/"Aviator"
// keyed on Grand Touring, bare "Cayenne"/"Panamera" keyed on the E-Hybrid
// variant names, bare "Tucson"/"Sportage"/"Sorento"/"CX-90"/"CX-70"/
// "Outlander" keyed on the PHEV token their trims carry. withAlt() below
// makes the pair from one fact set so the two can't drift.
const AS_OF = "2026-08-23";

function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

// Same rationale as data4's PHEV_J1772: J1772 is the only AC inlet any
// US-market plug-in hybrid ships, but where no maker document consulted this
// pass names the connector the fact stays `est`.
const J1772_EST = f<"J1772">("J1772", "est", "high", "AC charging only, no DC fast charge");
const NO_DCFC_EST = f<"none">("none", "est", "high", "AC charging only");

// Shared abstention reasons. heat pump: PHEV makers almost never state it,
// and the Volvo control test showed silence can't be read as "none".
const HP_ABSTAIN = "No US maker document consulted this pass states heat-pump hardware for this model";

// Emit a researched row twice: once under the model string that names the
// plug-in itself, once under the bare nameplate a petrol car shares, guarded
// by the trim tokens only the plug-in wears. The guard is load-bearing on
// /vin/ — see the Wrangler comment in data4 — so alt.trim is required.
function withAlt(
  row: EnrichmentRow,
  alt: { model: string; modelAliases?: string[]; trim: string[] }
): EnrichmentRow[] {
  return [row, { ...row, id: `${row.id}-alt`, model: alt.model, modelAliases: alt.modelAliases, trim: alt.trim }];
}

const R: EnrichmentRow[] = [];

// ───────────────────────── VOLVO XC90 / XC60 / S60 T8 ─────────────────────
// The battery story is one Volvo press release: the long-range pack grew
// nominal energy 11.6 → 18.8 kWh, announced mid-MY2022 — so 2022 is a SPLIT
// year with both packs sold as 2022s, and EPA carries two 2022 trim strings
// ("T8 AWD Recharge" and "… ext. Range"). Dealer feeds do not carry the
// suffix, so the 2022 rows come in pairs and resolve to candidates; the
// packVariant labels are what a shopper sees to tell them apart. 2023+ is
// uniformly extended-range. Naming history: "Recharge" through MY2024,
// plain "plug-in hybrid" from the MY2025 facelift — both spellings alias to
// the same rows. Bare "XC90"/"XC60" turned out to be neither a handful nor
// unmatchable — 1,356 live listings on 2026-08-25 — and the guarded `-alt`
// rows that catch them are built below the XC60 block, where the comment
// explains which trim tokens are safe against the petrol B5/B6 and why the
// obvious ones are not.
{
  const VOLVO_ER_PR = "https://www.volvocars.com/us/media/press-releases/11C10482DFEF2BC9/";
  const VOLVO_CHARGE_XC90 =
    "https://www.volvocars.com/us/support/car/xc90-plug-in-hybrid/article/0ed816eed33d98cac0a8cc377bc12bc7-83c0c849d91ad5fac0a8cc3751bbe62b-8664b2fa77a7e089c0a8296870d1a409/";
  const VOLVO_NO_DC = "https://www.volvocars.com/us/support/topic/blt62870ecab912f410/";
  const VOLVO_CPO = "https://www.volvocars.com/us/l/certified-by-volvo/";

  const VOLVO_PACK_NOTE = "Nominal energy; Volvo does not split gross and usable";
  const VOLVO_SMALL = { packGrossKwh: f(11.6, "mfr", "high", VOLVO_PACK_NOTE, VOLVO_ER_PR) };
  const VOLVO_ER = { packGrossKwh: f(18.8, "mfr", "high", VOLVO_PACK_NOTE, VOLVO_ER_PR) };
  // Volvo's US support pages state 3.6 kW for every T8 era; the 6.4 kW
  // two-phase figure floating around is the European spec.
  const VOLVO_CHARGING = {
    acOnboardKw: f(3.6, "mfr", "high", undefined, VOLVO_CHARGE_XC90),
    portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge", VOLVO_NO_DC),
    dcFastCharging: f<"none">("none", "mfr", "high", undefined, VOLVO_NO_DC),
  };
  const VOLVO_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, VOLVO_CPO),
    batteryMiles: f(100_000, "mfr", "high", undefined, VOLVO_CPO),
  };
  const VOLVO_ABSTAIN = { heatPump: HP_ABSTAIN };

  const volvo = (
    id: string,
    model: string,
    aliases: string[],
    years: [number, number],
    battery: typeof VOLVO_SMALL,
    packVariant: string,
    range: EnrichmentRow["range"]
  ): EnrichmentRow => ({
    id,
    make: "VOLVO",
    model,
    modelAliases: aliases,
    modelYears: years,
    packVariant,
    battery,
    range,
    charging: VOLVO_CHARGING,
    warranty: VOLVO_WARRANTY,
    abstains: VOLVO_ABSTAIN,
  });

  const XC90_ALIASES = [
    "XC90 Recharge Plug-In Hybrid",
    "XC90 Recharge Plug-In Hyb",
    "XC90 Recharge",
    "XC90 T8 Recharge",
  ];
  R.push(
    volvo("xc90-t8-2021", "XC90 Plug-In Hybrid", XC90_ALIASES, [2021, 2021], VOLVO_SMALL, "PHEV", {
      epaRangeMi: f(18, "mfr", "high", "Electric-only EPA range", epa(42804)),
      epaRangeTotalMi: f(520, "mfr", "high", undefined, epa(42804)),
      mpgeElectric: f(55, "mfr", "high", undefined, epa(42804)),
      mpgeCombined: f(34, "mfr", "high", undefined, epa(42804)),
      mpgGasoline: f(27, "mfr", "high", undefined, epa(42804)),
    }),
    volvo("xc90-t8-2022-std", "XC90 Plug-In Hybrid", XC90_ALIASES, [2022, 2022], VOLVO_SMALL, "Standard range pack", {
      epaRangeMi: f(18, "mfr", "high", "Electric-only EPA range, pre-update 2022 cars", epa(44269)),
      epaRangeTotalMi: f(520, "mfr", "high", undefined, epa(44269)),
      mpgeElectric: f(55, "mfr", "high", undefined, epa(44269)),
      mpgeCombined: f(34, "mfr", "high", undefined, epa(44269)),
      mpgGasoline: f(27, "mfr", "high", undefined, epa(44269)),
    }),
    volvo("xc90-t8-2022-er", "XC90 Plug-In Hybrid", XC90_ALIASES, [2022, 2022], VOLVO_ER, "Extended Range", {
      epaRangeMi: f(36, "mfr", "high", "Electric-only EPA range, Extended Range 2022 cars", epa(45201)),
      epaRangeTotalMi: f(530, "mfr", "high", undefined, epa(45201)),
      mpgeElectric: f(66, "mfr", "high", undefined, epa(45201)),
      mpgeCombined: f(43, "mfr", "high", undefined, epa(45201)),
      mpgGasoline: f(26, "mfr", "high", undefined, epa(45201)),
    }),
    volvo("xc90-t8-2023-26", "XC90 Plug-In Hybrid", XC90_ALIASES, [2023, 2026], VOLVO_ER, "PHEV", {
      epaRangeMi: f(33, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2026", epa(47505)),
      epaRangeTotalMi: f(530, "mfr", "high", undefined, epa(47505)),
      mpgeElectric: f(58, "mfr", "high", undefined, epa(47505)),
      mpgeCombined: f(40, "mfr", "high", undefined, epa(47505)),
      mpgGasoline: f(27, "mfr", "high", undefined, epa(47505)),
    })
  );

  const XC60_ALIASES = [
    "XC60 Recharge Plug-In Hybrid",
    "XC60 Recharge Plug-In Hyb",
    "XC60 Recharge",
    "XC60 T8 Recharge",
  ];
  R.push(
    volvo("xc60-t8-2021", "XC60 Plug-In Hybrid", XC60_ALIASES, [2021, 2021], VOLVO_SMALL, "PHEV", {
      epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range", epa(43145)),
      epaRangeTotalMi: f(520, "mfr", "high", undefined, epa(43145)),
      mpgeElectric: f(57, "mfr", "high", undefined, epa(43145)),
      mpgeCombined: f(34, "mfr", "high", undefined, epa(43145)),
      mpgGasoline: f(27, "mfr", "high", undefined, epa(43145)),
    }),
    volvo("xc60-t8-2022-std", "XC60 Plug-In Hybrid", XC60_ALIASES, [2022, 2022], VOLVO_SMALL, "Standard range pack", {
      epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range, pre-update 2022 cars", epa(44268)),
      epaRangeTotalMi: f(500, "mfr", "high", undefined, epa(44268)),
      mpgeElectric: f(57, "mfr", "high", undefined, epa(44268)),
      mpgeCombined: f(33, "mfr", "high", undefined, epa(44268)),
      mpgGasoline: f(25, "mfr", "high", undefined, epa(44268)),
    }),
    volvo("xc60-t8-2022-er", "XC60 Plug-In Hybrid", XC60_ALIASES, [2022, 2022], VOLVO_ER, "Extended Range", {
      epaRangeMi: f(36, "mfr", "high", "Electric-only EPA range, Extended Range 2022 cars", epa(45200)),
      epaRangeTotalMi: f(560, "mfr", "high", undefined, epa(45200)),
      mpgeElectric: f(63, "mfr", "high", undefined, epa(45200)),
      mpgeCombined: f(44, "mfr", "high", undefined, epa(45200)),
      mpgGasoline: f(28, "mfr", "high", undefined, epa(45200)),
    }),
    volvo("xc60-t8-2023-26", "XC60 Plug-In Hybrid", XC60_ALIASES, [2023, 2026], VOLVO_ER, "PHEV", {
      epaRangeMi: f(36, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2026", epa(46629)),
      epaRangeTotalMi: f(560, "mfr", "high", undefined, epa(46629)),
      mpgeElectric: f(63, "mfr", "high", undefined, epa(46629)),
      mpgeCombined: f(44, "mfr", "high", undefined, epa(46629)),
      mpgGasoline: f(28, "mfr", "high", undefined, epa(46629)),
    })
  );

  // Bare "XC90"/"XC60" — 1,356 live listings on 2026-08-25 that file the T8
  // under the nameplate a petrol B5/B6 shares, with the plug-in badge in the
  // trim instead ("Plus, T8 AWD Plug-in hybrid, Electric/Gasoline, Bright,
  // 7 Seats"). The comment above this block used to say those could not be
  // matched, and the reason it gave was right about the token it tried: "T8"
  // is two characters, and trimStringsOverlap requires trims shorter than
  // three to match EXACTLY, so a "T8" key only ever catches a listing whose
  // whole trim is the string "T8" — of which there are none.
  //
  // What is unsafe is bigger than that, and worth writing down because the
  // obvious fix walks straight into it. Every T8 grade name is ALSO a petrol
  // grade name — Core, Plus, Ultra, Ultimate, Inscription, R-Design — and
  // overlap is substring-tolerant in BOTH directions, so a key of "T8 Plus"
  // ("T8PLUS") swallows a petrol listing that says only "Plus" ("PLUS"). Every
  // grade-bearing key fails that way. Only tokens that name the electrified
  // powertrain and nothing else survive it: "Recharge" and "Plug-in hybrid".
  // Checked against Volvo's petrol grade strings in
  // tests/phev-bare-model-aliases.test.ts, including the near-miss that makes
  // this look luckier than it is — "PLUS" is not a substring of
  // "PLUGINHYBRID" only because Volvo spells it PLUG, not PLUS.
  //
  // "eAWD" WAS in this list and is the reason the paragraph above now says
  // "and nothing else" so emphatically. It looks like a powertrain token —
  // Volvo only ever writes it of a T8 — but it normalizes to "EAWD", four
  // characters, and substring matching runs BOTH ways. "Ultimate AWD" norms
  // to "ULTIMATEAWD", which ends in EAWD, so a petrol B6 Ultimate matched the
  // T8 row and took its 33 electric miles and 18.8 kWh pack. So did "Core
  // AWD", "Ultimate Dark Theme AWD" and a bare "AWD" (contained BY "EAWD"),
  // and the glued forms "Ultimate/AWD" and "Core-AWD" survive even
  // cleanTrim's drivetrain-token filter, which only drops "AWD" when it
  // stands alone as a word. Live listings happen to carry grade-only trims
  // today, so nothing had reached it — but /vin/ hands the matcher vPIC's raw
  // trim, uncleaned, and that is where the strings above come from.
  //
  // The rule this leaves behind: a guard token must not contain a drivetrain
  // substring. Dropping "eAWD" costs exactly one live listing (a 2021
  // "T8 eAWD PHEV Inscription" that names no other electrified token);
  // "Recharge" catches every other in-year listing that carried it.
  //
  // Deliberately NOT keyed on "T8 …" spellings: the ~90 bare listings whose
  // whole trim is a grade name ("Plus", "Ultimate Bright Theme") or a
  // grade-bearing "T8 Plus" stay unmatched, because nothing separates them
  // from a petrol XC90 wearing the same string. A `vds` key would separate
  // them for any car that HAS a VIN, but the bare-nameplate contract in
  // tests/phev-bare-model-aliases.test.ts is that the trim guard alone must
  // hold, so silence on 90 cars is the price of it.
  //
  // "Recharge" is here for a second reason worth naming: the browse shard
  // carries specTrim()'s cut-at-the-comma version of the trim ("Recharge
  // Plus"), not the raw one the per-listing enrichment path sees, so it is the
  // only one of these tokens that survives on both. It is safe on the same
  // test as the others — Recharge is Volvo's electrified sub-brand and no
  // petrol XC90/XC60 wears it. "T8" is two characters, which means the matcher
  // demands an exact trim of "T8"; that catches the handful of listings whose
  // whole trim is that string and, by the same rule, nothing else.
  const BARE_T8_TRIMS = ["Recharge", "Plug-in hybrid", "T8"];
  for (const r of R.filter((x) => /^xc(90|60)-t8-/.test(x.id))) {
    R.push({
      ...r,
      id: `${r.id}-alt`,
      model: r.id.startsWith("xc90") ? "XC90" : "XC60",
      modelAliases: undefined,
      trim: BARE_T8_TRIMS,
    });
  }

  const S60_ALIASES = ["S60 Recharge Plug-In Hybrid", "S60 Recharge Plug-In Hybr", "S60 Recharge", "S60 T8 Recharge"];
  R.push(
    volvo("s60-t8-2021", "S60 Plug-In Hybrid", S60_ALIASES, [2021, 2021], VOLVO_SMALL, "PHEV", {
      epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range", epa(43408)),
      epaRangeTotalMi: f(510, "mfr", "high", undefined, epa(43408)),
      mpgeElectric: f(69, "mfr", "high", undefined, epa(43408)),
      mpgeCombined: f(42, "mfr", "high", undefined, epa(43408)),
      mpgGasoline: f(30, "mfr", "high", undefined, epa(43408)),
    }),
    volvo("s60-t8-2022-std", "S60 Plug-In Hybrid", S60_ALIASES, [2022, 2022], VOLVO_SMALL, "Standard range pack", {
      epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range, pre-update 2022 cars", epa(44266)),
      epaRangeTotalMi: f(510, "mfr", "high", undefined, epa(44266)),
      mpgeElectric: f(69, "mfr", "high", undefined, epa(44266)),
      mpgeCombined: f(42, "mfr", "high", undefined, epa(44266)),
      mpgGasoline: f(30, "mfr", "high", undefined, epa(44266)),
    }),
    volvo("s60-t8-2022-er", "S60 Plug-In Hybrid", S60_ALIASES, [2022, 2022], VOLVO_ER, "Extended Range", {
      epaRangeMi: f(40, "mfr", "high", "Electric-only EPA range, Extended Range 2022 cars", epa(45197)),
      epaRangeTotalMi: f(530, "mfr", "high", undefined, epa(45197)),
      mpgeElectric: f(74, "mfr", "high", undefined, epa(45197)),
      mpgeCombined: f(52, "mfr", "high", undefined, epa(45197)),
      mpgGasoline: f(31, "mfr", "high", undefined, epa(45197)),
    }),
    volvo("s90-t8-2021", "S90 Plug-In Hybrid", ["S90 Recharge Plug-In Hybrid", "S90 Recharge"], [2021, 2021], VOLVO_SMALL, "PHEV", {
      epaRangeMi: f(21, "mfr", "high", "Electric-only EPA range", epa(42984)),
      epaRangeTotalMi: f(490, "mfr", "high", undefined, epa(42984)),
      mpgeElectric: f(60, "mfr", "high", undefined, epa(42984)),
      mpgeCombined: f(40, "mfr", "high", undefined, epa(42984)),
      mpgGasoline: f(30, "mfr", "high", undefined, epa(42984)),
    }),
    volvo("s90-t8-2022-std", "S90 Plug-In Hybrid", ["S90 Recharge Plug-In Hybrid", "S90 Recharge"], [2022, 2022], VOLVO_SMALL, "Standard range pack", {
      epaRangeMi: f(21, "mfr", "high", "Electric-only EPA range, pre-update 2022 cars", epa(44267)),
      epaRangeTotalMi: f(490, "mfr", "high", undefined, epa(44267)),
      mpgeElectric: f(63, "mfr", "high", undefined, epa(44267)),
      mpgeCombined: f(40, "mfr", "high", undefined, epa(44267)),
      mpgGasoline: f(30, "mfr", "high", undefined, epa(44267)),
    }),
    volvo("s90-t8-2022-er", "S90 Plug-In Hybrid", ["S90 Recharge Plug-In Hybrid", "S90 Recharge"], [2022, 2022], VOLVO_ER, "Extended Range", {
      epaRangeMi: f(38, "mfr", "high", "Electric-only EPA range, Extended Range 2022 cars", epa(45198)),
      epaRangeTotalMi: f(500, "mfr", "high", undefined, epa(45198)),
      mpgeElectric: f(66, "mfr", "high", undefined, epa(45198)),
      mpgeCombined: f(47, "mfr", "high", undefined, epa(45198)),
      mpgGasoline: f(29, "mfr", "high", undefined, epa(45198)),
    }),
    volvo("s90-t8-2023-25", "S90 Plug-In Hybrid", ["S90 Recharge Plug-In Hybrid", "S90 Recharge"], [2023, 2025], VOLVO_ER, "PHEV", {
      epaRangeMi: f(38, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2025", epa(46261)),
      epaRangeTotalMi: f(520, "mfr", "high", undefined, epa(46261)),
      mpgeElectric: f(66, "mfr", "high", undefined, epa(46261)),
      mpgeCombined: f(47, "mfr", "high", undefined, epa(46261)),
      mpgGasoline: f(30, "mfr", "high", undefined, epa(46261)),
    }),
    volvo("s60-t8-2023-25", "S60 Plug-In Hybrid", S60_ALIASES, [2023, 2025], VOLVO_ER, "PHEV", {
      epaRangeMi: f(40, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2025", epa(47503)),
      epaRangeTotalMi: f(530, "mfr", "high", undefined, epa(47503)),
      mpgeElectric: f(74, "mfr", "high", undefined, epa(47503)),
      mpgeCombined: f(52, "mfr", "high", undefined, epa(47503)),
      mpgGasoline: f(31, "mfr", "high", undefined, epa(47503)),
    })
  );
}

// ───────────────── TOYOTA RAV4 PLUG-IN HYBRID (2026, new generation) ───────
// The sixth-generation RAV4, revealed May 2025 — the renamed successor to
// the RAV4 Prime but a genuinely new car, researched fresh on purpose (the
// alias-to-Prime shortcut was rejected as inventing a fact). fueleconomy.gov
// carries no 2026 RAV4 PHEV record yet, so every range figure is Toyota's
// own manufacturer estimate from its launch releases and says so. Range and
// charging both differ by grade, so the rows are grade-keyed and a listing
// with no grade matches nothing: XSE and Woodland get an 11 kW onboard
// charger, a CCS1 port and DC fast charging; SE and GR SPORT get 7 kW and
// J1772 with no DC. The "64 Series" trim in the feed matched no Toyota grade
// in the launch materials and is deliberately not keyed.
{
  const RAV4_2026_LAUNCH = "https://pressroom.toyota.com/the-next-adventure-begins-2026-rav4-arrives-this-winter/";
  const TOYOTA_EST_NOTE = "Toyota estimate; final EPA rating not yet issued";
  const RAV4_WARRANTY = {
    batteryYears: f(10, "mfr", "high", undefined, RAV4_2026_LAUNCH),
    batteryMiles: f(150_000, "mfr", "high", undefined, RAV4_2026_LAUNCH),
    batteryTransfers: f(true, "mfr", "high", undefined, RAV4_2026_LAUNCH),
  };
  const RAV4_ABSTAINS = {
    packUsableKwh: "Toyota's 2026 RAV4 materials state no battery capacity figure",
    heatPump: HP_ABSTAIN,
  };
  const RAV4_DC_CHARGING = {
    acOnboardKw: f(11, "mfr", "high", "XSE and Woodland grades", RAV4_2026_LAUNCH),
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, RAV4_2026_LAUNCH),
    dcFastCharging: f<"standard">("standard", "mfr", "high", "10–80% in about 30 minutes", RAV4_2026_LAUNCH),
  };
  const RAV4_AC_CHARGING = {
    acOnboardKw: f(7, "mfr", "high", "SE and GR SPORT grades", RAV4_2026_LAUNCH),
    portStandard: f<"J1772">("J1772", "mfr", "high", undefined, RAV4_2026_LAUNCH),
    dcFastCharging: f<"none">("none", "mfr", "high", "DC fast charging is XSE and Woodland only", RAV4_2026_LAUNCH),
  };
  const rav4 = (id: string, trim: string[], rangeMi: number, charging: EnrichmentRow["charging"]): EnrichmentRow => ({
    id,
    make: "TOYOTA",
    model: "RAV4 Plug-In Hybrid",
    // "RAV4 Prime (PHEV)" is vPIC's model string for the NEW generation too
    // (decoded live 2026-08-24, e.g. JTM7ERAV4TJ020569) — without it the
    // /vin/ page finds nothing for these cars. It is only the vPIC LABEL that
    // carries over from the Prime; the facts are this car's own, and the
    // year gate keeps real 2021–25 Prime listings on their own row. NB the
    // matcher refuses to let vPIC's Trim pick between these rows: every 2026
    // VIN decodes Trim "GR Sport" regardless of grade — a single-pattern
    // filing, see VPIC_PATTERN_TRIM_ARTIFACTS in match.ts — so a /vin/
    // lookup answers with the grade rows as candidates.
    modelAliases: ["RAV4 PLUG-IN", "RAV4 PHEV", "RAV4 Prime (PHEV)"],
    modelYears: [2026, 2026],
    trim,
    packVariant: "PHEV",
    range: { epaRangeMi: f(rangeMi, "mfr", "medium", TOYOTA_EST_NOTE, RAV4_2026_LAUNCH) },
    charging,
    warranty: RAV4_WARRANTY,
    abstains: RAV4_ABSTAINS,
  });
  R.push(
    rav4("rav4-phev-2026-se", ["SE"], 52, RAV4_AC_CHARGING),
    rav4("rav4-phev-2026-xse", ["XSE"], 52, RAV4_DC_CHARGING),
    rav4("rav4-phev-2026-woodland", ["Woodland"], 49, RAV4_DC_CHARGING),
    rav4("rav4-phev-2026-gr-sport", ["GR Sport"], 48, RAV4_AC_CHARGING)
  );
}

// ─────────────── TOYOTA PRIUS PLUG-IN HYBRID (2026–2027 rename) ────────────
// Same fifth-generation car as the 2023–25 Prius Prime — Toyota's own 2026
// and 2027 releases restate the 13.6 kWh pack — but the ratings moved twice
// (SE 45 → 44; others 40 → 39 for 2027), so these are researched rows, not
// year extensions. fueleconomy.gov has no 2026–27 record yet; the range
// figures are Toyota's, and its 2027 release itself calls them
// EPA-estimated. Structure mirrors data4's gen-3 rows: a trim-less row for
// XSE/XSE Premium/Nightshade, an SE row for the grade that rates higher.
{
  const PRIUS_2026 = "https://pressroom.toyota.com/toyota-prius-plug-in-hybrid-gets-edgier-with-new-nightshade-edition/";
  const PRIUS_2027 = "https://pressroom.toyota.com/2027-toyota-prius-plug-in-hybrid-combines-electrified-performance-and-everyday-efficiency/";
  const PRIUS_ALIASES = ["Prius Prime", "Prius PHEV", "PRIUS PLUG-IN", "Prius Prime (PHEV)"];
  const TOYOTA_EST_NOTE = "Toyota estimate; final EPA rating not yet issued";
  const prius = (id: string, years: [number, number], trim: string[] | undefined, src: string, range: EnrichmentRow["range"]): EnrichmentRow => ({
    id,
    make: "TOYOTA",
    model: "Prius Plug-In Hybrid",
    modelAliases: PRIUS_ALIASES,
    modelYears: years,
    trim,
    packVariant: "PHEV",
    battery: { packGrossKwh: f(13.6, "mfr", "high", undefined, src) },
    range,
    charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
    warranty: {
      batteryYears: f(10, "mfr", "high", undefined, src),
      batteryMiles: f(150_000, "mfr", "high", undefined, src),
      batteryTransfers: f(true, "mfr", "high", undefined, src),
    },
    abstains: { heatPump: "Not re-verified for the renamed 2026–27 car; the Prime rows' source predates it" },
  });
  R.push(
    prius("prius-phev-2026-base", [2026, 2026], undefined, PRIUS_2026, {
      epaRangeMi: f(40, "mfr", "medium", "XSE, Nightshade and XSE Premium grades; Toyota estimate", PRIUS_2026),
    }),
    prius("prius-phev-2026-se", [2026, 2026], ["SE"], PRIUS_2026, {
      epaRangeMi: f(44, "mfr", "medium", TOYOTA_EST_NOTE, PRIUS_2026),
    }),
    prius("prius-phev-2027-base", [2027, 2027], undefined, PRIUS_2027, {
      epaRangeMi: f(39, "mfr", "high", "XSE, Nightshade and XSE Premium grades", PRIUS_2027),
    }),
    prius("prius-phev-2027-se", [2027, 2027], ["SE"], PRIUS_2027, {
      epaRangeMi: f(44, "mfr", "high", undefined, PRIUS_2027),
      mpgGasoline: f(51, "mfr", "high", "SE grade, gas-only", PRIUS_2027),
    })
  );
}

// ───────────────────────── LEXUS NX 450h+ / RX 450h+ ──────────────────────
// The 450h+ badge names the plug-in itself, so those model strings are safe
// unguarded; bare "NX"/"RX"/"NX-Series"/"RX-Series" get the trim-guarded alt
// shape keyed on the 450h token their trims carry. Lexus never states the NX
// pack (18.1 kWh is secondary and tagged agg); it does state the RX's in the
// 2023 RX reveal. Warranty abstains: Lexus's 10-year hybrid-battery policy
// statement never names the plug-ins, and printing an inferred warranty is a
// claim this site can't stand behind.
{
  const NX_2026 = "https://pressroom.lexus.com/2026-lexus-nx-adds-grades-and-drivetrain/";
  const RX_2023 = "https://pressroom.lexus.com/the-evolution-of-an-icon-the-all-new-2023-lexus-rx/";
  const RX_2024 = "https://pressroom.lexus.com/electrifying-an-icon-the-2024-lexus-rx-450h/";
  const RX_2026 = "https://pressroom.lexus.com/2026-lexus-rx-extending-the-range/";
  const LEXUS_WARRANTY_ABSTAIN = "Lexus's 10-year hybrid battery policy statement never names the plug-ins";

  const NX_ALIASES = ["NX 450h", "NX 450h Plus", "NX 450h PLUS", "NX PLUG-IN HYBRID ELECTRIC VEHICLE", "NX Plug-In Hybrid", "NX 450h+ Luxury", "NX 450h+ LUXURY AWD"];
  const NX_BATTERY = { packGrossKwh: f(18.1, "agg", "medium", "Lexus publishes no capacity figure for the NX") };
  R.push(
    ...withAlt(
      {
        id: "nx-450h-plus-2022-25",
        make: "LEXUS",
        model: "NX 450h+",
        modelAliases: NX_ALIASES,
        modelYears: [2022, 2025],
        packVariant: "PHEV",
        battery: NX_BATTERY,
        range: {
          epaRangeMi: f(37, "mfr", "high", "Electric-only EPA range. Identical rating 2022–2025", epa(44933)),
          epaRangeTotalMi: f(550, "mfr", "high", undefined, epa(44933)),
          mpgeElectric: f(84, "mfr", "high", undefined, epa(44933)),
          mpgeCombined: f(57, "mfr", "high", undefined, epa(44933)),
          mpgGasoline: f(36, "mfr", "high", undefined, epa(44933)),
        },
        charging: {
          acOnboardKw: f(6.6, "mfr", "medium", "Optional Expedited Onboard Charger; the base charger is slower"),
          portStandard: J1772_EST,
          dcFastCharging: NO_DCFC_EST,
        },
        abstains: { batteryWarranty: LEXUS_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
      },
      { model: "NX", modelAliases: ["NX-Series"], trim: ["450h+", "450h"] }
    ),
    ...withAlt(
      {
        id: "nx-450h-plus-2026",
        make: "LEXUS",
        model: "NX 450h+",
        modelAliases: NX_ALIASES,
        modelYears: [2026, 2026],
        packVariant: "PHEV",
        battery: NX_BATTERY,
        range: { epaRangeMi: f(37, "mfr", "high", "Lexus-stated EPA estimate", NX_2026) },
        charging: {
          acOnboardKw: f(7, "mfr", "high", undefined, NX_2026),
          portStandard: J1772_EST,
          dcFastCharging: NO_DCFC_EST,
        },
        abstains: { batteryWarranty: LEXUS_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
      },
      { model: "NX", modelAliases: ["NX-Series"], trim: ["450h+", "450h"] }
    )
  );

  const RX_ALIASES = ["RX 450h", "RX 450h Plus", "RX PLUG-IN HYBRID ELECTRIC VEHICLE", "RX Plug-In Hybrid", "RX 450h+ Luxury", "RX 450h+ LUXURY AWD"];
  const RX_BATTERY = { packGrossKwh: f(18.1, "mfr", "high", undefined, RX_2023) };
  const RX_CHARGING = {
    acOnboardKw: f(6.6, "mfr", "high", undefined, RX_2026),
    portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge", RX_2026),
    dcFastCharging: f<"none">("none", "est", "high", "AC charging only"),
  };
  const rx = (id: string, years: [number, number], range: EnrichmentRow["range"]): EnrichmentRow[] =>
    withAlt(
      {
        id,
        make: "LEXUS",
        model: "RX 450h+",
        modelAliases: RX_ALIASES,
        modelYears: years,
        packVariant: "PHEV",
        battery: RX_BATTERY,
        range,
        charging: RX_CHARGING,
        abstains: { batteryWarranty: LEXUS_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
      },
      { model: "RX", modelAliases: ["RX-Series"], trim: ["450h+", "450h"] }
    );
  R.push(
    ...rx("rx-450h-plus-2024", [2024, 2024], {
      epaRangeMi: f(37, "mfr", "high", "Lexus-stated EPA estimate", RX_2024),
      mpgeCombined: f(83, "mfr", "medium", "Lexus manufacturer estimate", RX_2024),
    }),
    ...rx("rx-450h-plus-2025", [2025, 2025], {
      epaRangeMi: f(37, "mfr", "high", "Electric-only EPA range", epa(49159)),
      epaRangeTotalMi: f(540, "mfr", "high", undefined, epa(49159)),
      mpgeElectric: f(83, "mfr", "high", undefined, epa(49159)),
      mpgeCombined: f(56, "mfr", "high", undefined, epa(49159)),
      mpgGasoline: f(35, "mfr", "high", undefined, epa(49159)),
    }),
    ...rx("rx-450h-plus-2026", [2026, 2026], {
      epaRangeMi: f(38, "mfr", "high", "Lexus-stated EPA estimate", RX_2026),
      mpgeCombined: f(85, "mfr", "medium", "Lexus manufacturer estimate", RX_2026),
    })
  );
}

// ───────────────────────── MAZDA CX-90 / CX-70 PHEV ───────────────────────
// One e-Skyactiv PHEV powertrain across both nameplates, 17.8 kWh, restated
// verbatim in every model-year pricing release — except the 2026 CX-70,
// whose release states a range increase (EPA 32 mi, up from 26) without a
// capacity figure, so that row abstains on the pack rather than inferring
// carryover across a rating jump. Mazda states outright that the CX-90 PHEV
// takes no DC charging; the CX-70 page stops at listing Level 1/2, so its
// "none" stays est. The feed's "Mazda CX-90 PHEV" double-make spelling is
// handled by the matcher's make-prefix strip, not an alias.
{
  const CX90_2026_PR = "https://news.mazdausa.com/2025-09-04-2026-Mazda-CX-90-Pricing-and-Packaging";
  const CX90_2024_PR = "https://news.mazdausa.com/2023-01-31-Mazda-Debuts-First-Ever-2024-Mazda-CX-90";
  const CX70_2025_PR = "https://news.mazdausa.com/2024-02-21-Mazda-Announces-Pricing-and-Packaging-For-All-New-2025-Mazda-CX-70";
  const CX90_PAGE = "https://www.mazdausa.com/vehicles/cx-90-phev";
  const CX70_PAGE = "https://www.mazdausa.com/vehicles/cx-70-phev";
  const MAZDA_MANUAL = "https://www.mazdausa.com/static/manuals/2025/cx-90-phev/contents/65290300.html";
  const MAZDA_EV_PAGE = "https://www.mazdausa.com/the-mazda-difference/electric-vehicles";

  const MAZDA_PACK = (src: string) => ({
    packGrossKwh: f(17.8, "mfr", "high", "Mazda does not label the figure gross or usable", src),
  });
  const MAZDA_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, MAZDA_EV_PAGE),
    batteryMiles: f(100_000, "mfr", "high", undefined, MAZDA_EV_PAGE),
  };
  const CX90_CHARGING = {
    acOnboardKw: f(7.2, "mfr", "high", undefined, MAZDA_MANUAL),
    portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge", CX90_PAGE),
    dcFastCharging: f<"none">("none", "mfr", "high", undefined, CX90_PAGE),
  };
  const CX70_CHARGING = {
    acOnboardKw: f(7.2, "mfr", "high", undefined, "https://www.mazdausa.com/static/manuals/2025/cx-70-phev/contents/65290300.html"),
    portStandard: f<"J1772">("J1772", "mfr", "high", undefined, CX70_PAGE),
    dcFastCharging: f<"none">("none", "est", "high", "Mazda lists Level 1 and 2 charging only", CX70_PAGE),
  };

  R.push(
    ...withAlt(
      {
        id: "cx-90-phev-2024-25",
        make: "MAZDA",
        model: "CX-90 PHEV",
        modelAliases: ["CX-90 Plug-In Hybrid"],
        modelYears: [2024, 2025],
        packVariant: "PHEV",
        battery: MAZDA_PACK(CX90_2024_PR),
        range: {
          epaRangeMi: f(26, "mfr", "high", "Electric-only EPA range. Identical rating 2024–2025", epa(48673)),
          epaRangeTotalMi: f(490, "mfr", "high", undefined, epa(48673)),
          mpgeElectric: f(56, "mfr", "high", undefined, epa(48673)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(48673)),
        },
        charging: CX90_CHARGING,
        warranty: MAZDA_WARRANTY,
        abstains: { heatPump: HP_ABSTAIN },
      },
      { model: "CX-90", trim: ["PHEV"] }
    ),
    ...withAlt(
      {
        id: "cx-90-phev-2026",
        make: "MAZDA",
        model: "CX-90 PHEV",
        modelAliases: ["CX-90 Plug-In Hybrid"],
        modelYears: [2026, 2026],
        packVariant: "PHEV",
        battery: MAZDA_PACK(CX90_2026_PR),
        range: {
          epaRangeMi: f(27, "mfr", "high", "Electric-only EPA range", epa(50267)),
          epaRangeTotalMi: f(500, "mfr", "high", undefined, epa(50267)),
          mpgeElectric: f(56, "mfr", "high", undefined, epa(50267)),
          mpgeCombined: f(56, "mfr", "high", undefined, epa(50267)),
          mpgGasoline: f(26, "mfr", "high", undefined, epa(50267)),
        },
        charging: CX90_CHARGING,
        warranty: MAZDA_WARRANTY,
        abstains: { heatPump: HP_ABSTAIN },
      },
      { model: "CX-90", trim: ["PHEV"] }
    ),
    ...withAlt(
      {
        id: "cx-70-phev-2025",
        make: "MAZDA",
        model: "CX-70 PHEV",
        modelAliases: ["CX-70 Plug-In Hybrid"],
        modelYears: [2025, 2025],
        packVariant: "PHEV",
        battery: MAZDA_PACK(CX70_2025_PR),
        range: {
          epaRangeMi: f(26, "mfr", "high", "Electric-only EPA range", epa(48672)),
          epaRangeTotalMi: f(490, "mfr", "high", undefined, epa(48672)),
          mpgeElectric: f(56, "mfr", "high", undefined, epa(48672)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(48672)),
        },
        charging: CX70_CHARGING,
        warranty: MAZDA_WARRANTY,
        abstains: { heatPump: HP_ABSTAIN },
      },
      { model: "CX-70", trim: ["PHEV"] }
    ),
    ...withAlt(
      {
        id: "cx-70-phev-2026",
        make: "MAZDA",
        model: "CX-70 PHEV",
        modelAliases: ["CX-70 Plug-In Hybrid"],
        modelYears: [2026, 2026],
        packVariant: "PHEV",
        range: {
          epaRangeMi: f(32, "mfr", "high", "Electric-only EPA range", epa(50266)),
          epaRangeTotalMi: f(520, "mfr", "high", undefined, epa(50266)),
          mpgeElectric: f(61, "mfr", "high", undefined, epa(50266)),
          mpgGasoline: f(26, "mfr", "high", undefined, epa(50266)),
        },
        charging: CX70_CHARGING,
        warranty: MAZDA_WARRANTY,
        abstains: {
          packUsableKwh: "Mazda's 2026 CX-70 release states a range change without a capacity figure",
          heatPump: HP_ABSTAIN,
        },
      },
      { model: "CX-70", trim: ["PHEV"] }
    )
  );
}

// ───────────────────────── MITSUBISHI OUTLANDER PHEV ───────────────────────
// Four battery eras, not two: gen 1 grew 12.0 → 13.8 kWh at MY2021, gen 2
// launched MY2023 at 20 kWh and grew to 22.7 kWh at the MY2026 refresh. The
// distinctive fact is CHAdeMO DC fast charging — standard on every gen-1
// trim, but SEL-and-above only on gen 2, so gen-2 rows say "optional". The
// onboard AC charger is deliberately absent everywhere: Mitsubishi publishes
// EVSE amperage, never a kW rating, and anything else would be derived.
{
  const OUT_2018_KIT = "https://media.mitsubishicars.com/en-US/releases/release-2664184aa9424786bf812d1adf5b9b46-2018-mitsubishi-outlander-phev-press-kit";
  const OUT_2022_KIT = "https://media.mitsubishicars.com/en-US/releases/2022-mitsubishi-outlander-plug-in-hybrid-press-kit";
  const OUT_2025_SPECS = "https://www.mitsubishicars.com/cars-and-suvs/outlander-phev-2025/specs";
  const OUT_2026_SPECS = "https://www.mitsubishicars.com/cars-and-suvs/outlander-phev/specs";
  const OUT_WARRANTY = (src: string) => ({
    batteryYears: f(10, "mfr", "high", undefined, src),
    batteryMiles: f(100_000, "mfr", "high", undefined, src),
  });
  const OUT_HP_ABSTAIN = { heatPump: "Mitsubishi's spec tables itemize heated features and carry no heat pump line" };
  const outlander = (id: string, years: [number, number], over: Partial<EnrichmentRow>): EnrichmentRow[] =>
    withAlt(
      {
        id,
        make: "MITSUBISHI",
        model: "Outlander PHEV",
        modelAliases: ["Outlander Plug-In Hybrid"],
        modelYears: years,
        packVariant: "PHEV",
        abstains: OUT_HP_ABSTAIN,
        ...over,
      } as EnrichmentRow,
      { model: "Outlander", trim: ["PHEV"] }
    );
  R.push(
    ...outlander("outlander-phev-2018-20", [2018, 2020], {
      battery: { packGrossKwh: f(12, "mfr", "high", undefined, OUT_2018_KIT) },
      range: {
        epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2020", epa(39830)),
        epaRangeTotalMi: f(310, "mfr", "high", undefined, epa(39830)),
        mpgeElectric: f(74, "mfr", "high", undefined, epa(39830)),
        mpgGasoline: f(25, "mfr", "high", undefined, epa(39830)),
      },
      charging: {
        portStandard: f<"J1772">("J1772", "mfr", "high", "DC fast charge uses a separate CHAdeMO port", OUT_2018_KIT),
        dcFastCharging: f<"standard">("standard", "mfr", "high", "CHAdeMO; 80% in about 25 minutes", OUT_2018_KIT),
      },
      warranty: OUT_WARRANTY(OUT_2018_KIT),
    }),
    ...outlander("outlander-phev-2021-22", [2021, 2022], {
      battery: { packGrossKwh: f(13.8, "mfr", "high", "Pack grew from 12.0 kWh at MY2021", OUT_2022_KIT) },
      range: {
        epaRangeMi: f(24, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2022", epa(43726)),
        epaRangeTotalMi: f(320, "mfr", "high", undefined, epa(43726)),
        mpgeElectric: f(74, "mfr", "high", undefined, epa(43726)),
        mpgeCombined: f(39, "mfr", "high", undefined, epa(43726)),
        mpgGasoline: f(26, "mfr", "high", undefined, epa(43726)),
      },
      charging: {
        portStandard: f<"J1772">("J1772", "mfr", "high", "DC fast charge uses a separate CHAdeMO port", OUT_2022_KIT),
        dcFastCharging: f<"standard">("standard", "mfr", "high", "CHAdeMO; 80% in about 25 minutes", OUT_2022_KIT),
      },
      warranty: OUT_WARRANTY(OUT_2022_KIT),
    }),
    ...outlander("outlander-phev-2023-25", [2023, 2025], {
      battery: { packGrossKwh: f(20, "mfr", "high", undefined, OUT_2025_SPECS) },
      range: {
        epaRangeMi: f(38, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2025", epa(47280)),
        epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(47280)),
        mpgeElectric: f(64, "mfr", "high", undefined, epa(47280)),
        mpgeCombined: f(43, "mfr", "high", undefined, epa(47280)),
        mpgGasoline: f(26, "mfr", "high", undefined, epa(47280)),
      },
      charging: {
        portStandard: f<"J1772">("J1772", "mfr", "high", "DC fast charge uses a separate CHAdeMO port", OUT_2025_SPECS),
        dcFastCharging: f<"optional">("optional", "mfr", "high", "SEL and above only; CHAdeMO, 80% in about 38 minutes", OUT_2025_SPECS),
      },
      warranty: OUT_WARRANTY(OUT_2025_SPECS),
    }),
    ...outlander("outlander-phev-2026", [2026, 2026], {
      battery: { packGrossKwh: f(22.7, "mfr", "high", undefined, OUT_2026_SPECS) },
      range: {
        epaRangeMi: f(44, "mfr", "high", "Electric-only EPA range", epa(50310)),
        epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(50310)),
        mpgeElectric: f(73, "mfr", "high", undefined, epa(50310)),
        mpgeCombined: f(48, "mfr", "high", undefined, epa(50310)),
        mpgGasoline: f(27, "mfr", "high", undefined, epa(50310)),
      },
      charging: {
        portStandard: f<"J1772">("J1772", "mfr", "high", "DC fast charge uses a separate CHAdeMO port", OUT_2026_SPECS),
        dcFastCharging: f<"optional">("optional", "mfr", "high", "SEL and Black Edition only; CHAdeMO, 80% in about 29 minutes", OUT_2026_SPECS),
      },
      warranty: OUT_WARRANTY(OUT_2026_SPECS),
    })
  );
}

// ───────────────── HYUNDAI TUCSON / SANTA FE PLUG-IN HYBRID ────────────────
// One 13.8 kWh pack across the whole Tucson run — the 2025 facelift changed
// the motor (66.9 → 72 kW), not the battery — and the same pack in the
// Santa Fe PHEV's two-year US run. Hyundai's own compare-specs pages name
// the hybrid battery in the 10-year/100,000-mile warranty. Heat pump
// abstains: the control test failed (hyundaiusa spec pages carry no heat
// pump string even for the Ioniq 5), so silence proves nothing. DC absence
// did pass its control (the Ioniq 5 page lists DC fast charging), so "none"
// is stated, as est.
{
  const TUCSON_2022_PR = "https://www.hyundainews.com/en-us/releases/3275";
  const TUCSON_2025_PR = "https://www.hyundainews.com/en-us/releases/4109";
  const TUCSON_SPECS = "https://www.hyundaiusa.com/us/en/vehicles/tucson-plug-in-hybrid/compare-specs";
  const SANTA_FE_PAGE = "https://www.hyundainews.com/en-us/models/hyundai-santa_fe-2022-santa_fe_plug_in_hybrid";
  const HYUNDAI_WARRANTY = {
    batteryYears: f(10, "mfr", "high", undefined, TUCSON_SPECS),
    batteryMiles: f(100_000, "mfr", "high", undefined, TUCSON_SPECS),
  };
  const HYUNDAI_DCFC = f<"none">("none", "est", "high", "AC charging only");
  R.push(
    ...withAlt(
      {
        id: "tucson-phev-2022-24",
        make: "HYUNDAI",
        model: "Tucson Plug-In Hybrid",
        modelAliases: ["Tucson PHEV"],
        modelYears: [2022, 2024],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(13.8, "mfr", "high", undefined, TUCSON_2022_PR) },
        range: {
          epaRangeMi: f(33, "mfr", "high", "Electric-only EPA range. Identical rating 2022–2024", epa(44360)),
          epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(44360)),
          mpgeElectric: f(80, "mfr", "high", undefined, epa(44360)),
          mpgeCombined: f(53, "mfr", "high", undefined, epa(44360)),
          mpgGasoline: f(35, "mfr", "high", undefined, epa(44360)),
        },
        charging: { acOnboardKw: f(7.2, "mfr", "high", undefined, TUCSON_2022_PR), portStandard: J1772_EST, dcFastCharging: HYUNDAI_DCFC },
        warranty: HYUNDAI_WARRANTY,
        abstains: { heatPump: HP_ABSTAIN },
      },
      { model: "Tucson", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        id: "tucson-phev-2025-26",
        make: "HYUNDAI",
        model: "Tucson Plug-In Hybrid",
        modelAliases: ["Tucson PHEV"],
        modelYears: [2025, 2026],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(13.8, "mfr", "high", undefined, TUCSON_2025_PR) },
        range: {
          epaRangeMi: f(32, "mfr", "high", "Electric-only EPA range. Identical rating 2025–2026", epa(49011)),
          epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(49011)),
          mpgeElectric: f(77, "mfr", "high", undefined, epa(49011)),
          mpgeCombined: f(51, "mfr", "high", undefined, epa(49011)),
          mpgGasoline: f(35, "mfr", "high", undefined, epa(49011)),
        },
        charging: { acOnboardKw: f(7.2, "mfr", "high", undefined, TUCSON_2025_PR), portStandard: J1772_EST, dcFastCharging: HYUNDAI_DCFC },
        warranty: HYUNDAI_WARRANTY,
        abstains: { heatPump: HP_ABSTAIN },
      },
      { model: "Tucson", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        id: "santa-fe-phev-2022-23",
        make: "HYUNDAI",
        model: "Santa Fe Plug-In Hybrid",
        modelAliases: ["Santa Fe PHEV"],
        modelYears: [2022, 2023],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(13.8, "mfr", "high", undefined, SANTA_FE_PAGE) },
        range: {
          epaRangeMi: f(31, "mfr", "high", "Electric-only EPA range. Identical rating 2022–2023", epa(44024)),
          epaRangeTotalMi: f(440, "mfr", "high", undefined, epa(44024)),
          mpgeElectric: f(76, "mfr", "high", undefined, epa(44024)),
          mpgeCombined: f(49, "mfr", "high", undefined, epa(44024)),
          mpgGasoline: f(33, "mfr", "high", undefined, epa(44024)),
        },
        charging: { portStandard: J1772_EST, dcFastCharging: HYUNDAI_DCFC },
        warranty: HYUNDAI_WARRANTY,
        abstains: { heatPump: HP_ABSTAIN },
      },
      { model: "Santa Fe", trim: ["PHEV", "Plug-In Hybrid"] }
    )
  );
}

// ──────────────── KIA SPORTAGE / SORENTO / NIRO PLUG-IN HYBRID ─────────────
// Kia's negatives here are control-tested, not assumed: the same kiamedia
// page templates carry "Heat Pump" and "DC Fast Charge" strings on the EV
// models and none on any PHEV page, so heat pump and DC absence are stated
// as est rather than left blank. The Sorento pack is printed as 14 kWh in
// every Kia spec table and 13.8 in its launch release — both Kia — so the
// value keeps the spec-table figure at medium confidence with the conflict
// named. Niro MY2024 is a fueleconomy.gov year hole (the car existed;
// kiamedia's 2024 spec page is populated), so that row carries Kia's own
// figure instead of an EPA citation.
{
  const SPORTAGE_PR = "https://www.kiamedia.com/us/en/media/pressreleases/18448/plugged-in-dialed-in-2023-kia-sportage-phev-expands-the-breadth-of-kia-electrified-suvs";
  const SPORTAGE_SPECS = "https://www.kiamedia.com/us/en/models/sportage-phev/2023/specifications";
  const SORENTO_SPECS = "https://www.kiamedia.com/us/en/models/sorento-phev/2022/specifications";
  const NIRO_G1_SPECS = "https://www.kiamedia.com/us/en/models/niro-phev/2018/specifications";
  const NIRO_G2_SPECS = "https://www.kiamedia.com/us/en/models/niro-phev/2023/specifications";
  const NIRO_2024_SPECS = "https://www.kiamedia.com/us/en/models/niro-phev/2024/specifications";
  const KIA_PHEV_PAGE = "https://www.kia.com/us/en/sorento-plug-in-hybrid/specs";
  const KIA_WARRANTY = {
    batteryYears: f(10, "mfr", "high", undefined, KIA_PHEV_PAGE),
    batteryMiles: f(100_000, "mfr", "high", undefined, KIA_PHEV_PAGE),
  };
  const KIA_NO_HEAT_PUMP = f<"none">("none", "est", "medium", "Absent from Kia feature tables that list it for the EVs");
  const KIA_DCFC = f<"none">("none", "est", "high", "AC charging only");

  R.push(
    ...withAlt(
      {
        id: "sportage-phev-2023-25",
        make: "KIA",
        model: "Sportage Plug-In Hybrid",
        modelAliases: ["Sportage PHEV"],
        modelYears: [2023, 2025],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(13.8, "mfr", "high", undefined, SPORTAGE_SPECS) },
        range: {
          epaRangeMi: f(34, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2025", epa(47223)),
          epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(47223)),
          mpgeElectric: f(84, "mfr", "high", undefined, epa(47223)),
          mpgeCombined: f(55, "mfr", "high", undefined, epa(47223)),
          mpgGasoline: f(35, "mfr", "high", undefined, epa(47223)),
        },
        charging: { acOnboardKw: f(7.2, "mfr", "high", undefined, SPORTAGE_PR), portStandard: J1772_EST, dcFastCharging: KIA_DCFC },
        thermal: { heatPump: KIA_NO_HEAT_PUMP },
        warranty: KIA_WARRANTY,
      },
      { model: "Sportage", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        id: "sportage-phev-2026-27",
        make: "KIA",
        model: "Sportage Plug-In Hybrid",
        modelAliases: ["Sportage PHEV"],
        modelYears: [2026, 2027],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(13.8, "mfr", "high", undefined, SPORTAGE_SPECS) },
        range: {
          epaRangeMi: f(33, "mfr", "high", "Electric-only EPA range. Identical rating 2026–2027", epa(49767)),
          epaRangeTotalMi: f(470, "mfr", "high", undefined, epa(49767)),
          mpgeElectric: f(83, "mfr", "high", undefined, epa(49767)),
          mpgeCombined: f(54, "mfr", "high", undefined, epa(49767)),
          mpgGasoline: f(36, "mfr", "high", undefined, epa(49767)),
        },
        charging: { acOnboardKw: f(7.2, "mfr", "high", undefined, SPORTAGE_PR), portStandard: J1772_EST, dcFastCharging: KIA_DCFC },
        thermal: { heatPump: KIA_NO_HEAT_PUMP },
        warranty: KIA_WARRANTY,
      },
      { model: "Sportage", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        id: "sorento-phev-2022-24",
        make: "KIA",
        model: "Sorento Plug-In Hybrid",
        modelAliases: ["Sorento PHEV"],
        modelYears: [2022, 2024],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(14, "mfr", "medium", "Kia prints both 14 and 13.8 for this pack", SORENTO_SPECS) },
        range: {
          epaRangeMi: f(32, "mfr", "high", "Electric-only EPA range. Identical rating 2022–2024", epa(44361)),
          epaRangeTotalMi: f(460, "mfr", "high", undefined, epa(44361)),
          mpgeElectric: f(79, "mfr", "high", undefined, epa(44361)),
          mpgeCombined: f(52, "mfr", "high", undefined, epa(44361)),
          mpgGasoline: f(34, "mfr", "high", undefined, epa(44361)),
        },
        charging: { portStandard: J1772_EST, dcFastCharging: KIA_DCFC },
        thermal: { heatPump: KIA_NO_HEAT_PUMP },
        warranty: KIA_WARRANTY,
      },
      { model: "Sorento", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        id: "sorento-phev-2025-26",
        make: "KIA",
        model: "Sorento Plug-In Hybrid",
        modelAliases: ["Sorento PHEV"],
        modelYears: [2025, 2026],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(14, "mfr", "medium", "Kia prints both 14 and 13.8 for this pack", SORENTO_SPECS) },
        range: {
          epaRangeMi: f(30, "mfr", "high", "Electric-only EPA range. Identical rating 2025–2026", epa(49012)),
          epaRangeTotalMi: f(440, "mfr", "high", undefined, epa(49012)),
          mpgeElectric: f(74, "mfr", "high", undefined, epa(49012)),
          mpgeCombined: f(49, "mfr", "high", undefined, epa(49012)),
          mpgGasoline: f(33, "mfr", "high", undefined, epa(49012)),
        },
        charging: { portStandard: J1772_EST, dcFastCharging: KIA_DCFC },
        thermal: { heatPump: KIA_NO_HEAT_PUMP },
        warranty: KIA_WARRANTY,
      },
      { model: "Sorento", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        id: "niro-phev-2018-22",
        make: "KIA",
        model: "Niro Plug-In Hybrid",
        modelAliases: ["Niro PHEV"],
        modelYears: [2018, 2022],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(8.9, "mfr", "high", undefined, NIRO_G1_SPECS) },
        range: {
          epaRangeMi: f(26, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2022", epa(39799)),
          epaRangeTotalMi: f(560, "mfr", "high", undefined, epa(39799)),
          mpgeElectric: f(105, "mfr", "high", undefined, epa(39799)),
          mpgeCombined: f(66, "mfr", "high", undefined, epa(39799)),
          mpgGasoline: f(46, "mfr", "high", undefined, epa(39799)),
        },
        charging: { portStandard: J1772_EST, dcFastCharging: KIA_DCFC },
        thermal: { heatPump: KIA_NO_HEAT_PUMP },
        warranty: KIA_WARRANTY,
      },
      { model: "Niro", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        id: "niro-phev-2023",
        make: "KIA",
        model: "Niro Plug-In Hybrid",
        modelAliases: ["Niro PHEV"],
        modelYears: [2023, 2023],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(11.1, "mfr", "high", undefined, NIRO_G2_SPECS) },
        range: {
          epaRangeMi: f(34, "mfr", "high", "Electric-only EPA range", epa(47221)),
          epaRangeTotalMi: f(510, "mfr", "high", undefined, epa(47221)),
          mpgeElectric: f(108, "mfr", "high", undefined, epa(47221)),
          mpgeCombined: f(73, "mfr", "high", undefined, epa(47221)),
          mpgGasoline: f(48, "mfr", "high", undefined, epa(47221)),
        },
        charging: { portStandard: J1772_EST, dcFastCharging: KIA_DCFC },
        thermal: { heatPump: KIA_NO_HEAT_PUMP },
        warranty: KIA_WARRANTY,
      },
      { model: "Niro", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        // fueleconomy.gov has no MY2024 Niro PHEV record though the car
        // existed (kiamedia's 2024 spec page is populated) — a known EPA
        // year-hole shape, so Kia's own figure stands in.
        id: "niro-phev-2024",
        make: "KIA",
        model: "Niro Plug-In Hybrid",
        modelAliases: ["Niro PHEV"],
        modelYears: [2024, 2024],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(11.1, "mfr", "high", undefined, NIRO_2024_SPECS) },
        range: { epaRangeMi: f(33, "mfr", "medium", "EX grade", NIRO_2024_SPECS) },
        charging: { portStandard: J1772_EST, dcFastCharging: KIA_DCFC },
        thermal: { heatPump: KIA_NO_HEAT_PUMP },
        warranty: KIA_WARRANTY,
      },
      { model: "Niro", trim: ["PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      {
        id: "niro-phev-2025",
        make: "KIA",
        model: "Niro Plug-In Hybrid",
        modelAliases: ["Niro PHEV"],
        modelYears: [2025, 2025],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(11.1, "mfr", "high", undefined, NIRO_G2_SPECS) },
        range: {
          epaRangeMi: f(33, "mfr", "high", "Electric-only EPA range", epa(48666)),
          epaRangeTotalMi: f(510, "mfr", "high", undefined, epa(48666)),
          mpgeElectric: f(108, "mfr", "high", undefined, epa(48666)),
          mpgeCombined: f(73, "mfr", "high", undefined, epa(48666)),
          mpgGasoline: f(48, "mfr", "high", undefined, epa(48666)),
        },
        charging: { portStandard: J1772_EST, dcFastCharging: KIA_DCFC },
        thermal: { heatPump: KIA_NO_HEAT_PUMP },
        warranty: KIA_WARRANTY,
      },
      { model: "Niro", trim: ["PHEV", "Plug-In Hybrid"] }
    )
  );
}

// ────────────── BMW 330e / 530e / 550e / 745e / 750e / XM / M5 ─────────────
// The e-badged model strings name the plug-in themselves; bare
// "3 Series"/"5 Series"/"7 Series" get the alt shape keyed on the badge. BMW
// packs come from its own US press releases, which mix gross and net freely
// — each fact keeps BMW's own word in the slot it names. The 530e's bigger
// pack is tied by BMW to MY2021, but EPA re-rated the car at MY2020
// (16→21 mi), so the 2020 rows carry the EPA range and abstain on the pack
// rather than pick a side. Battery warranty abstains corpus-wide: BMW's own
// pages state both 8yr/80k and 8yr/100k for plug-ins, and an unresolved
// conflict is not a fact. DC: no BMW PHEV document mentions DC charging at
// all; "none" stays est.
{
  const BMW_M5_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0443395EN_US/the-all-new-2025-bmw-m5?language=en_US";
  const BMW_M5T_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0444418EN_US/the-all-new-2025-bmw-m5-touring?language=en_US";
  const BMW_XM_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0404063EN_US/the-first-ever-bmw-xm:-a-bmw-m-original?language=en_US";
  const BMW_550E_PAGE = "https://www.bmwusa.com/vehicles/5-series/sedan/plug-in-hybrid.html";
  const BMW_SPRING25_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0449456EN_US/bmw-model-updates-for-spring-2025";
  const BMW_750E_GLOBAL = "https://www.press.bmwgroup.com/global/article/detail/T0404080EN/progress-and-efficiency-with-added-variety:-additional-drive-system-variants-and-innovations-for-the-new-bmw-7-series?language=en";
  const BMW_530E_2018_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0266705EN_US/world-premiere-of-the-first-ever-bmw-530e-iperformance?language=en_US";
  const BMW_5ER_2021_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0308911EN_US/the-new-2021-bmw-5-series-sedan?language=en_US";
  const BMW_330E_2021_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0307067EN_US/the-2021-bmw-330e-and-330e-xdrive-phev-sedans?language=en_US";

  const BMW_WARRANTY_ABSTAIN = "BMW's own pages state both 8-year/80,000 and 8-year/100,000 for plug-in hybrids";
  const BMW_ABSTAINS = { batteryWarranty: BMW_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN };
  const BMW_CHARGING_EST = { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST };
  const G20_PACK = {
    packGrossKwh: f(12, "mfr", "high", undefined, BMW_330E_2021_PR),
    packUsableKwh: f(9.09, "mfr", "high", undefined, BMW_330E_2021_PR),
  };
  const G30_LATE_PACK = {
    packGrossKwh: f(12, "mfr", "high", undefined, BMW_5ER_2021_PR),
    packUsableKwh: f(9.09, "mfr", "high", undefined, BMW_5ER_2021_PR),
  };

  const bmw = (row: Omit<EnrichmentRow, "make">): EnrichmentRow => ({
    make: "BMW",
    packVariant: "PHEV",
    abstains: BMW_ABSTAINS,
    ...row,
  });

  // 330e. F30 era is EPA-only (its US materials were not researched this
  // pass); G20 era carries BMW's 12 kWh gross / 9.09 net on the rows the
  // MY2021 release covers.
  const F30_PACK_ABSTAIN = {
    ...BMW_ABSTAINS,
    packUsableKwh: "The F30-era pack size was not confirmed from a BMW document this pass",
  };
  const G20_LATE_ABSTAIN = {
    ...BMW_ABSTAINS,
    packUsableKwh: "BMW's releases pin the 12 kWh pack to MY2021; later years are unrestated",
  };
  R.push(
    ...withAlt(
      bmw({
        id: "330e-f30-2016",
        model: "330e",
        modelAliases: ["330e iPerformance"],
        modelYears: [2016, 2016],
        drive: "RWD",
        range: {
          epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range", epa(37289)),
          epaRangeTotalMi: f(350, "mfr", "high", undefined, epa(37289)),
          mpgeElectric: f(72, "mfr", "high", undefined, epa(37289)),
          mpgeCombined: f(38, "mfr", "high", undefined, epa(37289)),
          mpgGasoline: f(31, "mfr", "high", undefined, epa(37289)),
        },
        charging: BMW_CHARGING_EST,
        abstains: F30_PACK_ABSTAIN,
      }),
      { model: "3 Series", modelAliases: ["3-Series"], trim: ["330e"] }
    ),
    ...withAlt(
      bmw({
        id: "330e-f30-2017-18",
        model: "330e",
        modelAliases: ["330e iPerformance"],
        modelYears: [2017, 2018],
        drive: "RWD",
        range: {
          epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range. Identical rating 2017–2018", epa(38081)),
          epaRangeTotalMi: f(350, "mfr", "high", undefined, epa(38081)),
          mpgeElectric: f(71, "mfr", "high", undefined, epa(38081)),
          mpgeCombined: f(38, "mfr", "high", undefined, epa(38081)),
          mpgGasoline: f(30, "mfr", "high", undefined, epa(38081)),
        },
        charging: BMW_CHARGING_EST,
        abstains: F30_PACK_ABSTAIN,
      }),
      { model: "3 Series", modelAliases: ["3-Series"], trim: ["330e"] }
    ),
    ...withAlt(
      bmw({
        id: "330e-g20-2021-22",
        model: "330e",
        modelAliases: ["330e Sedan"],
        modelYears: [2021, 2022],
        drive: "RWD",
        battery: G20_PACK,
        range: {
          epaRangeMi: f(23, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2022", epa(45116)),
          epaRangeTotalMi: f(320, "mfr", "high", undefined, epa(45116)),
          mpgeElectric: f(75, "mfr", "high", undefined, epa(45116)),
          mpgeCombined: f(40, "mfr", "high", undefined, epa(45116)),
          mpgGasoline: f(28, "mfr", "high", undefined, epa(45116)),
        },
        charging: BMW_CHARGING_EST,
      }),
      { model: "3 Series", modelAliases: ["3-Series"], trim: ["330e"] }
    ),
    ...withAlt(
      bmw({
        id: "330e-g20-2023-24",
        model: "330e",
        modelAliases: ["330e Sedan"],
        modelYears: [2023, 2024],
        drive: "RWD",
        range: {
          epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2024", epa(47215)),
          epaRangeTotalMi: f(310, "mfr", "high", undefined, epa(47215)),
          mpgeElectric: f(73, "mfr", "high", undefined, epa(47215)),
          mpgeCombined: f(39, "mfr", "high", undefined, epa(47215)),
          mpgGasoline: f(27, "mfr", "high", undefined, epa(47215)),
        },
        charging: BMW_CHARGING_EST,
        abstains: G20_LATE_ABSTAIN,
      }),
      { model: "3 Series", modelAliases: ["3-Series"], trim: ["330e"] }
    ),
    ...withAlt(
      bmw({
        id: "330e-xdrive-2021-22",
        model: "330e xDrive",
        modelAliases: ["330e", "330e xDrive Sedan"],
        modelYears: [2021, 2022],
        drive: "AWD",
        battery: G20_PACK,
        range: {
          epaRangeMi: f(20, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2022", epa(45146)),
          epaRangeTotalMi: f(290, "mfr", "high", undefined, epa(45146)),
          mpgeElectric: f(67, "mfr", "high", undefined, epa(45146)),
          mpgeCombined: f(35, "mfr", "high", undefined, epa(45146)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(45146)),
        },
        charging: BMW_CHARGING_EST,
      }),
      { model: "3 Series", modelAliases: ["3-Series"], trim: ["330e xDrive"] }
    ),
    ...withAlt(
      bmw({
        id: "330e-xdrive-2023-24",
        model: "330e xDrive",
        modelAliases: ["330e", "330e xDrive Sedan"],
        modelYears: [2023, 2024],
        drive: "AWD",
        range: {
          epaRangeMi: f(20, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2024", epa(47216)),
          epaRangeTotalMi: f(300, "mfr", "high", undefined, epa(47216)),
          mpgeElectric: f(68, "mfr", "high", undefined, epa(47216)),
          mpgeCombined: f(36, "mfr", "high", undefined, epa(47216)),
          mpgGasoline: f(26, "mfr", "high", undefined, epa(47216)),
        },
        charging: BMW_CHARGING_EST,
        abstains: G20_LATE_ABSTAIN,
      }),
      { model: "3 Series", modelAliases: ["3-Series"], trim: ["330e xDrive"] }
    )
  );

  // 530e. BMW pins the 12 kWh pack to MY2021; EPA re-rated at MY2020, so
  // the 2020 rows abstain on the pack.
  const G30_2020_ABSTAIN = {
    ...BMW_ABSTAINS,
    packUsableKwh: "BMW ties the 12 kWh pack to MY2021 while EPA re-rated at MY2020; unresolved",
  };
  const G30_EARLY_PACK = { packGrossKwh: f(9.2, "mfr", "high", undefined, BMW_530E_2018_PR) };
  R.push(
    ...withAlt(
      bmw({
        id: "530e-2018-19",
        model: "530e",
        modelAliases: ["530e iPerformance"],
        modelYears: [2018, 2019],
        drive: "RWD",
        battery: G30_EARLY_PACK,
        range: {
          epaRangeMi: f(16, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2019", epa(38754)),
          epaRangeTotalMi: f(370, "mfr", "high", undefined, epa(38754)),
          mpgeElectric: f(72, "mfr", "high", undefined, epa(38754)),
          mpgeCombined: f(37, "mfr", "high", undefined, epa(38754)),
          mpgGasoline: f(29, "mfr", "high", undefined, epa(38754)),
        },
        charging: BMW_CHARGING_EST,
      }),
      { model: "5 Series", modelAliases: ["5-Series"], trim: ["530e"] }
    ),
    ...withAlt(
      bmw({
        id: "530e-2020",
        model: "530e",
        modelAliases: ["530e iPerformance"],
        modelYears: [2020, 2020],
        drive: "RWD",
        range: {
          epaRangeMi: f(21, "mfr", "high", "Electric-only EPA range", epa(42108)),
          epaRangeTotalMi: f(350, "mfr", "high", undefined, epa(42108)),
          mpgeElectric: f(69, "mfr", "high", undefined, epa(42108)),
          mpgeCombined: f(38, "mfr", "high", undefined, epa(42108)),
          mpgGasoline: f(27, "mfr", "high", undefined, epa(42108)),
        },
        charging: BMW_CHARGING_EST,
        abstains: G30_2020_ABSTAIN,
      }),
      { model: "5 Series", modelAliases: ["5-Series"], trim: ["530e"] }
    ),
    ...withAlt(
      bmw({
        id: "530e-2021-23",
        model: "530e",
        modelAliases: ["530e Sedan"],
        modelYears: [2021, 2023],
        drive: "RWD",
        battery: G30_LATE_PACK,
        range: {
          epaRangeMi: f(21, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2023", epa(43738)),
          epaRangeTotalMi: f(340, "mfr", "high", undefined, epa(43738)),
          mpgeElectric: f(64, "mfr", "high", undefined, epa(43738)),
          mpgeCombined: f(37, "mfr", "high", undefined, epa(43738)),
          mpgGasoline: f(26, "mfr", "high", undefined, epa(43738)),
        },
        charging: { acOnboardKw: f(3.7, "mfr", "medium", undefined, BMW_5ER_2021_PR), ...BMW_CHARGING_EST },
      }),
      { model: "5 Series", modelAliases: ["5-Series"], trim: ["530e"] }
    ),
    ...withAlt(
      bmw({
        id: "530e-xdrive-2018-19",
        model: "530e xDrive",
        modelAliases: ["530e", "530e xDrive iPerformance"],
        modelYears: [2018, 2019],
        drive: "AWD",
        battery: G30_EARLY_PACK,
        range: {
          epaRangeMi: f(15, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2019", epa(38755)),
          epaRangeTotalMi: f(360, "mfr", "high", undefined, epa(38755)),
          mpgeElectric: f(67, "mfr", "high", undefined, epa(38755)),
          mpgeCombined: f(36, "mfr", "high", undefined, epa(38755)),
          mpgGasoline: f(28, "mfr", "high", undefined, epa(38755)),
        },
        charging: BMW_CHARGING_EST,
      }),
      { model: "5 Series", modelAliases: ["5-Series"], trim: ["530e xDrive"] }
    ),
    ...withAlt(
      bmw({
        id: "530e-xdrive-2020",
        model: "530e xDrive",
        modelAliases: ["530e", "530e xDrive iPerformance"],
        modelYears: [2020, 2020],
        drive: "AWD",
        range: {
          epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range", epa(42109)),
          epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(42109)),
          mpgeElectric: f(65, "mfr", "high", undefined, epa(42109)),
          mpgeCombined: f(34, "mfr", "high", undefined, epa(42109)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(42109)),
        },
        charging: BMW_CHARGING_EST,
        abstains: G30_2020_ABSTAIN,
      }),
      { model: "5 Series", modelAliases: ["5-Series"], trim: ["530e xDrive"] }
    ),
    ...withAlt(
      bmw({
        id: "530e-xdrive-2021-23",
        model: "530e xDrive",
        modelAliases: ["530e", "530e xDrive Sedan"],
        modelYears: [2021, 2023],
        drive: "AWD",
        battery: G30_LATE_PACK,
        range: {
          epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2023", epa(43739)),
          epaRangeTotalMi: f(320, "mfr", "high", undefined, epa(43739)),
          mpgeElectric: f(62, "mfr", "high", undefined, epa(43739)),
          mpgeCombined: f(33, "mfr", "high", undefined, epa(43739)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(43739)),
        },
        charging: { acOnboardKw: f(3.7, "mfr", "medium", undefined, BMW_5ER_2021_PR), ...BMW_CHARGING_EST },
      }),
      { model: "5 Series", modelAliases: ["5-Series"], trim: ["530e xDrive"] }
    )
  );

  // 550e xDrive (G60, 2025+). BMW's consumer page states 22.1 kWh without a
  // gross/usable word; the onboard charger moved 7.4 → 11 kW at March 2025
  // production.
  const G60_PACK = {
    packGrossKwh: f(22.1, "mfr", "medium", "BMW does not label the figure gross or usable", BMW_550E_PAGE),
  };
  R.push(
    ...withAlt(
      bmw({
        id: "550e-2025",
        model: "550e",
        modelAliases: ["550e xDrive", "550e xDrive Sedan"],
        modelYears: [2025, 2025],
        battery: G60_PACK,
        range: {
          epaRangeMi: f(34, "mfr", "high", "Electric-only EPA range", epa(49005)),
          epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(49005)),
          mpgeElectric: f(67, "mfr", "high", undefined, epa(49005)),
          mpgeCombined: f(40, "mfr", "high", undefined, epa(49005)),
          mpgGasoline: f(24, "mfr", "high", undefined, epa(49005)),
        },
        charging: { acOnboardKw: f(7.4, "mfr", "high", "11 kW from March 2025 production", BMW_SPRING25_PR), ...BMW_CHARGING_EST },
      }),
      { model: "5 Series", modelAliases: ["5-Series"], trim: ["550e"] }
    ),
    ...withAlt(
      bmw({
        id: "550e-2026-27",
        model: "550e",
        modelAliases: ["550e xDrive", "550e xDrive Sedan"],
        modelYears: [2026, 2027],
        battery: G60_PACK,
        range: {
          epaRangeMi: f(34, "mfr", "high", "Electric-only EPA range. Identical rating 2026–2027", epa(49756)),
          epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(49756)),
          mpgeElectric: f(68, "mfr", "high", undefined, epa(49756)),
          mpgeCombined: f(41, "mfr", "high", undefined, epa(49756)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(49756)),
        },
        charging: { acOnboardKw: f(11, "mfr", "high", undefined, BMW_SPRING25_PR), ...BMW_CHARGING_EST },
      }),
      { model: "5 Series", modelAliases: ["5-Series"], trim: ["550e"] }
    )
  );

  // 745e (2020–2022) and 750e (2025+). The 745e's pack was not researched
  // this pass; the 750e's usable figure exists only in BMW's global release
  // (same hardware worldwide), tagged medium for that reason.
  const BMW_745E_ABSTAIN = {
    ...BMW_ABSTAINS,
    packUsableKwh: "The 745e's pack size was not confirmed from a BMW document this pass",
  };
  R.push(
    ...withAlt(
      bmw({
        id: "745e-2020",
        model: "745e xDrive",
        modelAliases: ["745e", "745e xDrive iPerformance"],
        modelYears: [2020, 2020],
        range: {
          epaRangeMi: f(16, "mfr", "high", "Electric-only EPA range", epa(41373)),
          epaRangeTotalMi: f(290, "mfr", "high", undefined, epa(41373)),
          mpgeElectric: f(56, "mfr", "high", undefined, epa(41373)),
          mpgeCombined: f(28, "mfr", "high", undefined, epa(41373)),
          mpgGasoline: f(22, "mfr", "high", undefined, epa(41373)),
        },
        charging: BMW_CHARGING_EST,
        abstains: BMW_745E_ABSTAIN,
      }),
      { model: "7 Series", modelAliases: ["7-Series"], trim: ["745e"] }
    ),
    ...withAlt(
      bmw({
        id: "745e-2021-22",
        model: "745e xDrive",
        modelAliases: ["745e", "745e xDrive iPerformance"],
        modelYears: [2021, 2022],
        range: {
          epaRangeMi: f(17, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2022", epa(42647)),
          epaRangeTotalMi: f(290, "mfr", "high", undefined, epa(42647)),
          mpgeElectric: f(56, "mfr", "high", undefined, epa(42647)),
          mpgeCombined: f(28, "mfr", "high", undefined, epa(42647)),
          mpgGasoline: f(22, "mfr", "high", undefined, epa(42647)),
        },
        charging: BMW_CHARGING_EST,
        abstains: BMW_745E_ABSTAIN,
      }),
      { model: "7 Series", modelAliases: ["7-Series"], trim: ["745e"] }
    ),
    ...withAlt(
      bmw({
        id: "750e-2025",
        model: "750e",
        modelAliases: ["750e xDrive", "750e xDrive Sedan"],
        modelYears: [2025, 2025],
        battery: { packUsableKwh: f(18.7, "mfr", "medium", undefined, BMW_750E_GLOBAL) },
        range: {
          epaRangeMi: f(34, "mfr", "high", "Electric-only EPA range", epa(49008)),
          epaRangeTotalMi: f(470, "mfr", "high", undefined, epa(49008)),
          mpgeElectric: f(65, "mfr", "high", undefined, epa(49008)),
          mpgeCombined: f(41, "mfr", "high", undefined, epa(49008)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(49008)),
        },
        charging: { acOnboardKw: f(7.4, "mfr", "medium", undefined, BMW_750E_GLOBAL), ...BMW_CHARGING_EST },
      }),
      { model: "7 Series", modelAliases: ["7-Series"], trim: ["750e"] }
    ),
    ...withAlt(
      bmw({
        id: "750e-2026",
        model: "750e",
        modelAliases: ["750e xDrive", "750e xDrive Sedan"],
        modelYears: [2026, 2026],
        battery: { packUsableKwh: f(18.7, "mfr", "medium", undefined, BMW_750E_GLOBAL) },
        range: {
          epaRangeMi: f(35, "mfr", "high", "Electric-only EPA range", epa(49759)),
          epaRangeTotalMi: f(460, "mfr", "high", undefined, epa(49759)),
          mpgeElectric: f(70, "mfr", "high", undefined, epa(49759)),
          mpgeCombined: f(41, "mfr", "high", undefined, epa(49759)),
          mpgGasoline: f(24, "mfr", "high", undefined, epa(49759)),
        },
        charging: { acOnboardKw: f(7.4, "mfr", "medium", undefined, BMW_750E_GLOBAL), ...BMW_CHARGING_EST },
      }),
      { model: "7 Series", modelAliases: ["7-Series"], trim: ["750e"] }
    )
  );

  // XM (2023–2026) and M5 (2025+): PHEV-only nameplates, no petrol guard
  // needed. The M5 Touring rates lower than the sedan, so it gets its own
  // trim-keyed row and the sedan rows label their figure.
  const XM_PACK = {
    packGrossKwh: f(29.5, "mfr", "high", undefined, BMW_XM_PR),
    packUsableKwh: f(19.2, "mfr", "high", undefined, BMW_XM_PR),
  };
  const M5_PACK = { packUsableKwh: f(14.8, "mfr", "high", undefined, BMW_M5_PR) };
  R.push(
    bmw({
      id: "xm-2023-25",
      model: "XM",
      modelYears: [2023, 2025],
      battery: XM_PACK,
      range: {
        epaRangeMi: f(31, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2025", epa(46627)),
        epaRangeTotalMi: f(300, "mfr", "high", undefined, epa(46627)),
        mpgeElectric: f(46, "mfr", "high", undefined, epa(46627)),
        mpgeCombined: f(24, "mfr", "high", undefined, epa(46627)),
        mpgGasoline: f(14, "mfr", "high", undefined, epa(46627)),
      },
      charging: { acOnboardKw: f(7.4, "mfr", "high", undefined, BMW_XM_PR), ...BMW_CHARGING_EST },
    }),
    bmw({
      id: "xm-2026",
      model: "XM",
      modelYears: [2026, 2026],
      battery: XM_PACK,
      range: {
        epaRangeMi: f(30, "mfr", "high", "Electric-only EPA range", epa(49761)),
        epaRangeTotalMi: f(300, "mfr", "high", undefined, epa(49761)),
        mpgeElectric: f(47, "mfr", "high", undefined, epa(49761)),
        mpgeCombined: f(23, "mfr", "high", undefined, epa(49761)),
        mpgGasoline: f(14, "mfr", "high", undefined, epa(49761)),
      },
      charging: { acOnboardKw: f(7.4, "mfr", "high", undefined, BMW_XM_PR), ...BMW_CHARGING_EST },
    }),
    bmw({
      id: "m5-2025",
      model: "M5",
      modelYears: [2025, 2025],
      battery: M5_PACK,
      range: {
        epaRangeMi: f(27, "mfr", "high", "Sedan", epa(49006)),
        epaRangeTotalMi: f(270, "mfr", "high", undefined, epa(49006)),
        mpgeElectric: f(50, "mfr", "high", undefined, epa(49006)),
        mpgeCombined: f(23, "mfr", "high", undefined, epa(49006)),
        mpgGasoline: f(14, "mfr", "high", undefined, epa(49006)),
      },
      charging: { acOnboardKw: f(7.4, "mfr", "high", "11 kW from March 2025 production", BMW_SPRING25_PR), ...BMW_CHARGING_EST },
    }),
    bmw({
      id: "m5-2026-27",
      model: "M5",
      modelYears: [2026, 2027],
      battery: M5_PACK,
      range: {
        epaRangeMi: f(29, "mfr", "high", "Sedan. Identical rating 2026–2027", epa(49757)),
        epaRangeTotalMi: f(280, "mfr", "high", undefined, epa(49757)),
        mpgeElectric: f(47, "mfr", "high", undefined, epa(49757)),
        mpgeCombined: f(25, "mfr", "high", undefined, epa(49757)),
        mpgGasoline: f(14, "mfr", "high", undefined, epa(49757)),
      },
      charging: { acOnboardKw: f(11, "mfr", "high", undefined, BMW_SPRING25_PR), ...BMW_CHARGING_EST },
    }),
    bmw({
      id: "m5-touring-2025-27",
      model: "M5",
      modelAliases: ["M5 Touring"],
      modelYears: [2025, 2027],
      trim: ["Touring"],
      battery: { packUsableKwh: f(14.8, "mfr", "high", undefined, BMW_M5T_PR) },
      range: {
        epaRangeMi: f(25, "mfr", "high", "Touring. Identical rating 2025–2027", epa(49007)),
        epaRangeTotalMi: f(270, "mfr", "high", undefined, epa(49007)),
        mpgeElectric: f(54, "mfr", "high", undefined, epa(49007)),
        mpgeCombined: f(22, "mfr", "high", undefined, epa(49007)),
        mpgGasoline: f(13, "mfr", "high", undefined, epa(49007)),
      },
      charging: { acOnboardKw: f(11, "mfr", "high", undefined, BMW_M5T_PR), ...BMW_CHARGING_EST },
    })
  );
}

// ───────────────── MERCEDES-BENZ GLC 350e / GLE 450e ───────────────────────
// Three GLC eras, not two: W253 at 8.7 kWh (2018–19), W253 at 13.5 kWh
// (2020), then the X254 return at MY2025 with a 23.3 kWh usable pack, 54
// EPA miles and — unusual for a PHEV — standard 60 kW CCS DC charging plus
// NACS via Mercedes' accessory adapter. The GLE 450e shares the 23.3 kWh
// pack and the DC capability; MBUSA launched its MY2024 with range "TBA"
// and EPA holds no 2024 record, so that row abstains on range rather than
// borrow 2025's. Warranty abstains: MBUSA's booklets are PDF-walled and no
// fetched page states the terms.
{
  const GLC_2019_PR = "https://media.mbusa.com/releases/release-509f111c269a7cfd54023c5f1b1e800f-2019-mercedes-benz-glc-350e-4matic-plug-in-hybrid-suv";
  const GLC_2020_PR = "https://media.mbusa.com/releases/release-b18352e93dea249afa4ed6c6eb11d6f7-mercedes-benz-glc-350e-4matic-eq-power-new-third-generation-plug-in-hybrid";
  const GLC_X254_PR = "https://media.mbusa.com/releases/release-1d2ba082ef32b72d00f8f4d0181918c9-mercedes-benz-glc-plug-in-hybrid-suv-offers-best-in-segment-all-electric-range-of-54-miles";
  const GLE_2024_PR = "https://media.mbusa.com/releases/release-5cb3e9a9966d028045733a5ddf028528-2024-mercedes-benz-gle-trendsetting-luxury-suv-now-even-better";
  const GLE_PAGE = "https://www.mbusa.com/en/vehicles/model/gle/suv/gle450e4";
  const MB_WARRANTY_ABSTAIN = "Mercedes' US warranty booklets are PDF-walled and no fetched page states the terms";
  const MB_ABSTAINS = { batteryWarranty: MB_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN };
  const MB_PACK_233 = (src: string) => ({ packUsableKwh: f(23.3, "mfr", "high", undefined, src) });
  const MB_DC_CHARGING = (src: string, acKw: number) => ({
    acOnboardKw: f(acKw, "mfr", "high", undefined, src),
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, src),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, src),
    dcPeakKw: f(60, "mfr", "high", undefined, src),
    superchargerAccess: f<"adapter">("adapter", "mfr", "medium", "Accessory NACS DC adapter", src),
  });
  R.push(
    ...withAlt(
      {
        id: "glc-350e-2018-19",
        make: "MERCEDES-BENZ",
        model: "GLC 350e",
        modelAliases: ["GLC350e", "GLC 350e 4MATIC"],
        modelYears: [2018, 2019],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(8.7, "mfr", "high", "Mercedes does not label the figure gross or usable", GLC_2019_PR) },
        range: {
          epaRangeMi: f(10, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2019", epa(41132)),
          epaRangeTotalMi: f(350, "mfr", "high", undefined, epa(41132)),
          mpgeElectric: f(56, "mfr", "high", undefined, epa(41132)),
          mpgeCombined: f(31, "mfr", "high", undefined, epa(41132)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(41132)),
        },
        charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
        abstains: MB_ABSTAINS,
      },
      { model: "GLC", trim: ["350e"] }
    ),
    ...withAlt(
      {
        id: "glc-350e-2020",
        make: "MERCEDES-BENZ",
        model: "GLC 350e",
        modelAliases: ["GLC350e", "GLC 350e 4MATIC"],
        modelYears: [2020, 2020],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(13.5, "mfr", "high", "Mercedes does not label the figure gross or usable", GLC_2020_PR) },
        range: {
          epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range", epa(42756)),
          epaRangeTotalMi: f(360, "mfr", "high", undefined, epa(42756)),
          mpgeElectric: f(68, "mfr", "high", undefined, epa(42756)),
          mpgeCombined: f(36, "mfr", "high", undefined, epa(42756)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(42756)),
        },
        charging: { acOnboardKw: f(3.8, "mfr", "medium", "Stated as a Level 2 charging rate", GLC_2020_PR), portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
        abstains: MB_ABSTAINS,
      },
      { model: "GLC", trim: ["350e"] }
    ),
    ...withAlt(
      {
        id: "glc-350e-2025-27",
        make: "MERCEDES-BENZ",
        model: "GLC 350e",
        modelAliases: ["GLC350e", "GLC 350e 4MATIC"],
        modelYears: [2025, 2027],
        packVariant: "PHEV",
        battery: MB_PACK_233(GLC_X254_PR),
        range: {
          epaRangeMi: f(54, "mfr", "high", "Electric-only EPA range. Identical rating 2025–2027", epa(48674)),
          epaRangeTotalMi: f(380, "mfr", "high", undefined, epa(48674)),
          mpgeElectric: f(64, "mfr", "high", undefined, epa(48674)),
          mpgeCombined: f(46, "mfr", "high", undefined, epa(48674)),
          mpgGasoline: f(25, "mfr", "high", undefined, epa(48674)),
        },
        charging: MB_DC_CHARGING(GLC_X254_PR, 11),
        abstains: MB_ABSTAINS,
      },
      { model: "GLC", trim: ["350e"] }
    ),
    ...withAlt(
      {
        id: "gle-450e-2024",
        make: "MERCEDES-BENZ",
        model: "GLE 450e",
        modelAliases: ["GLE450e", "GLE 450e 4MATIC"],
        modelYears: [2024, 2024],
        packVariant: "PHEV",
        battery: MB_PACK_233(GLE_2024_PR),
        charging: MB_DC_CHARGING(GLE_2024_PR, 11),
        abstains: {
          ...MB_ABSTAINS,
          epaRangeMi: "MBUSA launched the MY2024 with range TBA and EPA holds no 2024 rating",
        },
      },
      { model: "GLE", trim: ["450e"] }
    ),
    ...withAlt(
      {
        id: "gle-450e-2025",
        make: "MERCEDES-BENZ",
        model: "GLE 450e",
        modelAliases: ["GLE450e", "GLE 450e 4MATIC"],
        modelYears: [2025, 2025],
        packVariant: "PHEV",
        battery: MB_PACK_233(GLE_2024_PR),
        range: {
          epaRangeMi: f(50, "mfr", "high", "Electric-only EPA range", epa(48675)),
          epaRangeTotalMi: f(450, "mfr", "high", undefined, epa(48675)),
          mpgeElectric: f(60, "mfr", "high", undefined, epa(48675)),
          mpgeCombined: f(42, "mfr", "high", undefined, epa(48675)),
          mpgGasoline: f(23, "mfr", "high", undefined, epa(48675)),
        },
        charging: MB_DC_CHARGING(GLE_2024_PR, 11),
        abstains: MB_ABSTAINS,
      },
      { model: "GLE", trim: ["450e"] }
    ),
    ...withAlt(
      {
        id: "gle-450e-2026",
        make: "MERCEDES-BENZ",
        model: "GLE 450e",
        modelAliases: ["GLE450e", "GLE 450e 4MATIC"],
        modelYears: [2026, 2026],
        packVariant: "PHEV",
        battery: MB_PACK_233(GLE_2024_PR),
        range: { epaRangeMi: f(49, "mfr", "high", undefined, GLE_PAGE) },
        charging: MB_DC_CHARGING(GLE_PAGE, 9.6),
        abstains: MB_ABSTAINS,
      },
      { model: "GLE", trim: ["450e"] }
    )
  );
}

// ───────────────── PORSCHE CAYENNE / PANAMERA E-HYBRID ─────────────────────
// Keyed by battery generation, with the variant names carrying the trim
// guards: 14.1 kWh (2019–20), 17.9 kWh (2021–23), 25.9 kWh gross (the
// MY2025 US records; EPA holds no 2024 E-Hybrid rating). Variant naming is
// load-bearing across eras — Turbo S E-Hybrid exists 2020–23 only, S
// E-Hybrid returns 2025 on the new pack, Turbo E-Hybrid is 2024+ only — so
// the year windows do most of the disambiguation and a "Turbo" trim string
// resolves differently on either side of the facelift. DC: no Porsche
// E-Hybrid page states DC capability while the Taycan's page names it
// plainly, so "none" is stated as est. Warranty abstains: Porsche's
// E-Hybrid warranty manuals are PDF-only and were not machine-readable.
{
  const CAY_2019_PR = "https://newsroom.porsche.com/en_US/products/the-new-2019-cayenne-e-hybrid-19872.html";
  const CAY_2021_PR = "https://newsroom.porsche.com/en_US/products/porsche-cayenne-e-hybrid-models-updated-high-voltage-battery-22704.html";
  const CAY_TSE_PR = "https://newsroom.porsche.com/en_US/products/porsche-cayenne-turbo-s-e-hybrid-models-announced-18392.html";
  const CAY_2024_S_PR = "https://newsroom.porsche.com/en_US/2023/products/The-2024-Porsche-Cayenne-S-E-Hybrid-SUV-and-Coupe-33850.html";
  const PAN_TSE_PR = "https://newsroom.porsche.com/en_US/products/panamera-turbo-s-e-hybrid-debut-19945.html";
  const PAN_2021_PR = "https://newsroom.porsche.com/en_US/products/porsche-panamera-new-models-two-additional-plug-in-hybrids-more-performance-comfort-range-22629.html";
  const PAN_2025_PR = "https://newsroom.porsche.com/en_US/2024/products/porsche-new-panamera-e-hybrid-variants-35289.html";
  const PORSCHE_WARRANTY_ABSTAIN = "Porsche's E-Hybrid warranty manuals are PDF-only and were not machine-readable";
  const PORSCHE_ABSTAINS = { batteryWarranty: PORSCHE_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN };
  const P_PACK_141 = (src: string) => ({ packGrossKwh: f(14.1, "mfr", "high", "Porsche does not label the figure gross or usable", src) });
  const P_PACK_179 = (src: string) => ({ packGrossKwh: f(17.9, "mfr", "high", undefined, src) });
  const P_PACK_259 = (src: string) => ({ packGrossKwh: f(25.9, "mfr", "high", undefined, src) });
  const P_AC = (kw: number, src: string, note?: string) => ({
    acOnboardKw: f(kw, "mfr", "high", note, src),
    portStandard: J1772_EST,
    dcFastCharging: NO_DCFC_EST,
  });
  const CAYENNE_ALIASES = ["Cayenne E-Hybrid Coupe"];

  // The variant alias plumbing matters here: a variant's named row (model
  // "Cayenne S E-Hybrid") must NOT alias "Cayenne E-Hybrid" itself — that
  // row is trim-less, so the alias would drag every plain "Cayenne E-Hybrid"
  // listing into candidates against the base row. The alias rides on the
  // -alt row instead, whose trim guard means it only claims listings whose
  // trim actually names the variant ("Cayenne E-Hybrid" + trim "S").
  const cayenne = (id: string, model: string, years: [number, number], trim: string[], over: Partial<EnrichmentRow>): EnrichmentRow[] =>
    withAlt(
      {
        id,
        make: "PORSCHE",
        model,
        modelYears: years,
        packVariant: "PHEV",
        abstains: PORSCHE_ABSTAINS,
        ...over,
      } as EnrichmentRow,
      { model: "Cayenne", modelAliases: ["Cayenne Coupe", "Cayenne E-Hybrid", "Cayenne E-Hybrid Coupe"], trim }
    );

  R.push(
    // 958-era Cayenne S E-Hybrid: EPA-only rows, pack unresearched.
    ...cayenne("cayenne-s-ehybrid-2017", "Cayenne S E-Hybrid", [2017, 2017], ["S E-Hybrid", "S"], {
      range: {
        epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range", epa(37799)),
        epaRangeTotalMi: f(480, "mfr", "high", undefined, epa(37799)),
        mpgeElectric: f(46, "mfr", "high", undefined, epa(37799)),
        mpgeCombined: f(27, "mfr", "high", undefined, epa(37799)),
        mpgGasoline: f(22, "mfr", "high", undefined, epa(37799)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      abstains: { ...PORSCHE_ABSTAINS, packUsableKwh: "The 958-era pack size was not confirmed from a Porsche document this pass" },
    }),
    ...cayenne("cayenne-s-ehybrid-2018", "Cayenne S E-Hybrid", [2018, 2018], ["S E-Hybrid", "S"], {
      range: {
        epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range", epa(39928)),
        epaRangeTotalMi: f(490, "mfr", "high", undefined, epa(39928)),
        mpgeElectric: f(47, "mfr", "high", undefined, epa(39928)),
        mpgeCombined: f(27, "mfr", "high", undefined, epa(39928)),
        mpgGasoline: f(22, "mfr", "high", undefined, epa(39928)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      abstains: { ...PORSCHE_ABSTAINS, packUsableKwh: "The 958-era pack size was not confirmed from a Porsche document this pass" },
    }),
    ...cayenne("cayenne-ehybrid-2019", "Cayenne E-Hybrid", [2019, 2019], ["E-Hybrid"], {
      modelAliases: CAYENNE_ALIASES,
      battery: P_PACK_141(CAY_2019_PR),
      range: {
        epaRangeMi: f(13, "mfr", "high", "Electric-only EPA range", epa(41901)),
        epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(41901)),
        mpgeElectric: f(46, "mfr", "high", undefined, epa(41901)),
        mpgeCombined: f(25, "mfr", "high", undefined, epa(41901)),
        mpgGasoline: f(21, "mfr", "high", undefined, epa(41901)),
      },
      charging: P_AC(3.6, CAY_2019_PR, "7.2 kW optional"),
    }),
    ...cayenne("cayenne-ehybrid-2020", "Cayenne E-Hybrid", [2020, 2020], ["E-Hybrid"], {
      modelAliases: CAYENNE_ALIASES,
      battery: P_PACK_141(CAY_2019_PR),
      range: {
        epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range", epa(42580)),
        epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(42580)),
        mpgeElectric: f(41, "mfr", "high", undefined, epa(42580)),
        mpgeCombined: f(25, "mfr", "high", undefined, epa(42580)),
        mpgGasoline: f(21, "mfr", "high", undefined, epa(42580)),
      },
      charging: P_AC(3.6, CAY_2019_PR, "7.2 kW optional"),
    }),
    ...cayenne("cayenne-ehybrid-2021-22", "Cayenne E-Hybrid", [2021, 2022], ["E-Hybrid"], {
      modelAliases: CAYENNE_ALIASES,
      battery: P_PACK_179(CAY_2021_PR),
      range: {
        epaRangeMi: f(17, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2022", epa(43775)),
        epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(43775)),
        mpgeElectric: f(46, "mfr", "high", undefined, epa(43775)),
        mpgeCombined: f(27, "mfr", "high", undefined, epa(43775)),
        mpgGasoline: f(21, "mfr", "high", undefined, epa(43775)),
      },
      charging: P_AC(7.2, CAY_2021_PR),
    }),
    ...cayenne("cayenne-turbos-ehybrid-2020", "Cayenne Turbo S E-Hybrid", [2020, 2020], ["Turbo S E-Hybrid", "Turbo S", "Turbo"], {
      modelAliases: ["Cayenne Turbo S E-Hybrid Coupe"],
      battery: P_PACK_141(CAY_TSE_PR),
      range: {
        epaRangeMi: f(12, "mfr", "high", "Electric-only EPA range", epa(42805)),
        epaRangeTotalMi: f(360, "mfr", "high", undefined, epa(42805)),
        mpgeElectric: f(39, "mfr", "high", undefined, epa(42805)),
        mpgeCombined: f(21, "mfr", "high", undefined, epa(42805)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(42805)),
      },
      charging: P_AC(7.2, CAY_TSE_PR),
    }),
    ...cayenne("cayenne-turbos-ehybrid-2021-23", "Cayenne Turbo S E-Hybrid", [2021, 2023], ["Turbo S E-Hybrid", "Turbo S", "Turbo"], {
      modelAliases: ["Cayenne Turbo S E-Hybrid Coupe"],
      battery: P_PACK_179(CAY_2021_PR),
      range: {
        epaRangeMi: f(15, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2023", epa(43777)),
        epaRangeTotalMi: f(370, "mfr", "high", undefined, epa(43777)),
        mpgeElectric: f(42, "mfr", "high", undefined, epa(43777)),
        mpgeCombined: f(22, "mfr", "high", undefined, epa(43777)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(43777)),
      },
      charging: P_AC(7.2, CAY_2021_PR),
    }),
    ...cayenne("cayenne-ehybrid-2025", "Cayenne E-Hybrid", [2025, 2025], ["E-Hybrid"], {
      modelAliases: CAYENNE_ALIASES,
      battery: P_PACK_259(CAY_2024_S_PR),
      range: {
        epaRangeMi: f(29, "mfr", "high", "Electric-only EPA range", epa(49023)),
        epaRangeTotalMi: f(460, "mfr", "high", undefined, epa(49023)),
        mpgeElectric: f(53, "mfr", "high", undefined, epa(49023)),
        mpgeCombined: f(33, "mfr", "high", undefined, epa(49023)),
        mpgGasoline: f(22, "mfr", "high", undefined, epa(49023)),
      },
      charging: P_AC(11, CAY_2024_S_PR),
    }),
    ...cayenne("cayenne-s-ehybrid-2025", "Cayenne S E-Hybrid", [2025, 2025], ["S E-Hybrid", "S"], {
      modelAliases: ["Cayenne S E-Hybrid Coupe"],
      battery: P_PACK_259(CAY_2024_S_PR),
      range: {
        epaRangeMi: f(27, "mfr", "high", "Electric-only EPA range", epa(49025)),
        epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(49025)),
        mpgeElectric: f(52, "mfr", "high", undefined, epa(49025)),
        mpgeCombined: f(32, "mfr", "high", undefined, epa(49025)),
        mpgGasoline: f(22, "mfr", "high", undefined, epa(49025)),
      },
      charging: P_AC(11, CAY_2024_S_PR),
    }),
    ...cayenne("cayenne-turbo-ehybrid-2025", "Cayenne Turbo E-Hybrid", [2025, 2025], ["Turbo E-Hybrid", "Turbo"], {
      modelAliases: ["Cayenne Turbo E-Hybrid Coupe"],
      battery: P_PACK_259(CAY_2024_S_PR),
      range: {
        epaRangeMi: f(24, "mfr", "high", "Electric-only EPA range", epa(49027)),
        epaRangeTotalMi: f(390, "mfr", "high", undefined, epa(49027)),
        mpgeElectric: f(47, "mfr", "high", undefined, epa(49027)),
        mpgeCombined: f(27, "mfr", "high", undefined, epa(49027)),
        mpgGasoline: f(22, "mfr", "high", undefined, epa(49027)),
      },
      charging: P_AC(11, CAY_2024_S_PR),
    })
  );

  // The facelift years EPA never rated: fueleconomy.gov's 2024 and 2026
  // menus carry no Cayenne E-Hybrid at all, though Porsche's US releases put
  // all three variants on sale for MY2024 and porsche.com/usa carries the
  // same 25.9 kWh / 11 kW figures for the current year. Same shape as the
  // MY2024 GLE 450e: the pack and charger are Porsche-published, the range
  // abstains rather than borrowing 2025's rating.
  const CAY_2024_RANGE_ABSTAIN = "Porsche said EPA estimates would follow launch and fueleconomy holds no 2024 rating";
  const CAY_2026_RANGE_ABSTAIN = "fueleconomy.gov holds no 2026 Cayenne E-Hybrid rating yet";
  for (const [year, reason] of [
    [2024, CAY_2024_RANGE_ABSTAIN],
    [2026, CAY_2026_RANGE_ABSTAIN],
  ] as Array<[number, string]>) {
    R.push(
      ...cayenne(`cayenne-ehybrid-${year}`, "Cayenne E-Hybrid", [year, year], ["E-Hybrid"], {
        modelAliases: CAYENNE_ALIASES,
        battery: P_PACK_259(CAY_2024_S_PR),
        charging: P_AC(11, CAY_2024_S_PR),
        abstains: { ...PORSCHE_ABSTAINS, epaRangeMi: reason },
      }),
      ...cayenne(`cayenne-s-ehybrid-${year}`, "Cayenne S E-Hybrid", [year, year], ["S E-Hybrid", "S"], {
        modelAliases: ["Cayenne S E-Hybrid Coupe"],
        battery: P_PACK_259(CAY_2024_S_PR),
        charging: P_AC(11, CAY_2024_S_PR),
        abstains: { ...PORSCHE_ABSTAINS, epaRangeMi: reason },
      }),
      ...cayenne(`cayenne-turbo-ehybrid-${year}`, "Cayenne Turbo E-Hybrid", [year, year], ["Turbo E-Hybrid", "Turbo"], {
        modelAliases: ["Cayenne Turbo E-Hybrid Coupe"],
        battery: P_PACK_259(CAY_2024_S_PR),
        charging: P_AC(11, CAY_2024_S_PR),
        abstains: { ...PORSCHE_ABSTAINS, epaRangeMi: reason },
      })
    );
  }

  const panamera = (id: string, model: string, years: [number, number], trim: string[], over: Partial<EnrichmentRow>): EnrichmentRow[] =>
    withAlt(
      {
        id,
        make: "PORSCHE",
        model,
        modelYears: years,
        packVariant: "PHEV",
        abstains: PORSCHE_ABSTAINS,
        ...over,
      } as EnrichmentRow,
      { model: "Panamera", modelAliases: ["Panamera E-Hybrid"], trim }
    );
  const PAN4_ALIASES = ["Panamera E-Hybrid", "Panamera 4 E-Hybrid Executive", "Panamera 4 E-Hybrid Sport Turismo", "Panamera 4 E-Hybrid ST"];
  R.push(
    ...panamera("panamera-4-ehybrid-2018", "Panamera 4 E-Hybrid", [2018, 2018], ["4 E-Hybrid"], {
      modelAliases: PAN4_ALIASES,
      battery: { packGrossKwh: f(14.1, "mfr", "high", "Porsche does not label the figure gross or usable", PAN_TSE_PR) },
      range: {
        epaRangeMi: f(16, "mfr", "high", "Electric-only EPA range", epa(40225)),
        epaRangeTotalMi: f(480, "mfr", "high", undefined, epa(40225)),
        mpgeElectric: f(46, "mfr", "high", undefined, epa(40225)),
        mpgeCombined: f(27, "mfr", "high", undefined, epa(40225)),
        mpgGasoline: f(22, "mfr", "high", undefined, epa(40225)),
      },
      charging: P_AC(3.6, PAN_TSE_PR, "7.2 kW optional"),
    }),
    ...panamera("panamera-4-ehybrid-2019-20", "Panamera 4 E-Hybrid", [2019, 2020], ["4 E-Hybrid"], {
      modelAliases: PAN4_ALIASES,
      battery: { packGrossKwh: f(14.1, "mfr", "high", "Porsche does not label the figure gross or usable", PAN_TSE_PR) },
      range: {
        epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range. Identical rating 2019–2020", epa(41291)),
        epaRangeTotalMi: f(490, "mfr", "high", undefined, epa(41291)),
        mpgeElectric: f(51, "mfr", "high", undefined, epa(41291)),
        mpgeCombined: f(28, "mfr", "high", undefined, epa(41291)),
        mpgGasoline: f(23, "mfr", "high", undefined, epa(41291)),
      },
      charging: P_AC(3.6, PAN_TSE_PR, "7.2 kW optional"),
    }),
    ...panamera("panamera-4-ehybrid-2021-23", "Panamera 4 E-Hybrid", [2021, 2023], ["4 E-Hybrid"], {
      modelAliases: PAN4_ALIASES,
      battery: P_PACK_179(PAN_2021_PR),
      range: {
        epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2023", epa(43913)),
        epaRangeTotalMi: f(480, "mfr", "high", undefined, epa(43913)),
        mpgeElectric: f(52, "mfr", "high", undefined, epa(43913)),
        mpgeCombined: f(29, "mfr", "high", undefined, epa(43913)),
        mpgGasoline: f(22, "mfr", "high", undefined, epa(43913)),
      },
      charging: P_AC(7.2, PAN_2021_PR),
    }),
    ...panamera("panamera-4-ehybrid-2025", "Panamera 4 E-Hybrid", [2025, 2025], ["4 E-Hybrid"], {
      modelAliases: PAN4_ALIASES,
      battery: P_PACK_259(PAN_2025_PR),
      range: {
        epaRangeMi: f(28, "mfr", "high", "Electric-only EPA range", epa(49163)),
        epaRangeTotalMi: f(490, "mfr", "high", undefined, epa(49163)),
        mpgeElectric: f(55, "mfr", "high", undefined, epa(49163)),
        mpgeCombined: f(32, "mfr", "high", undefined, epa(49163)),
        mpgGasoline: f(21, "mfr", "high", undefined, epa(49163)),
      },
      charging: P_AC(11, PAN_2025_PR),
    }),
    ...panamera("panamera-4s-ehybrid-2021-23", "Panamera 4S E-Hybrid", [2021, 2023], ["4S E-Hybrid", "4S"], {
      modelAliases: ["Panamera 4S E-Hybrid Executive", "Panamera 4S E-Hybrid Sport Turismo", "Panamera 4S E-Hybrid ST"],
      battery: P_PACK_179(PAN_2021_PR),
      range: {
        epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2023", epa(43916)),
        epaRangeTotalMi: f(480, "mfr", "high", undefined, epa(43916)),
        mpgeElectric: f(50, "mfr", "high", undefined, epa(43916)),
        mpgeCombined: f(28, "mfr", "high", undefined, epa(43916)),
        mpgGasoline: f(22, "mfr", "high", undefined, epa(43916)),
      },
      charging: P_AC(7.2, PAN_2021_PR),
    }),
    ...panamera("panamera-4s-ehybrid-2025", "Panamera 4S E-Hybrid", [2025, 2025], ["4S E-Hybrid", "4S"], {
      modelAliases: ["Panamera 4S E-Hybrid Executive", "Panamera 4S E-Hybrid Sport Turismo"],
      battery: P_PACK_259(PAN_2025_PR),
      range: {
        epaRangeMi: f(28, "mfr", "high", "Electric-only EPA range", epa(49164)),
        epaRangeTotalMi: f(480, "mfr", "high", undefined, epa(49164)),
        mpgeElectric: f(54, "mfr", "high", undefined, epa(49164)),
        mpgeCombined: f(32, "mfr", "high", undefined, epa(49164)),
        mpgGasoline: f(21, "mfr", "high", undefined, epa(49164)),
      },
      charging: P_AC(11, PAN_2025_PR),
    }),
    // MY2026: EPA holds no rating yet (same shape as the 2026 Cayennes) —
    // pack and charger are Porsche-published for the current cars, range
    // abstains.
    ...panamera("panamera-4-ehybrid-2026", "Panamera 4 E-Hybrid", [2026, 2026], ["4 E-Hybrid"], {
      modelAliases: PAN4_ALIASES,
      battery: P_PACK_259(PAN_2025_PR),
      charging: P_AC(11, PAN_2025_PR),
      abstains: { ...PORSCHE_ABSTAINS, epaRangeMi: "fueleconomy.gov holds no 2026 Panamera E-Hybrid rating yet" },
    }),
    ...panamera("panamera-4s-ehybrid-2026", "Panamera 4S E-Hybrid", [2026, 2026], ["4S E-Hybrid", "4S"], {
      modelAliases: ["Panamera 4S E-Hybrid Executive", "Panamera 4S E-Hybrid Sport Turismo"],
      battery: P_PACK_259(PAN_2025_PR),
      charging: P_AC(11, PAN_2025_PR),
      abstains: { ...PORSCHE_ABSTAINS, epaRangeMi: "fueleconomy.gov holds no 2026 Panamera E-Hybrid rating yet" },
    }),
    ...panamera("panamera-turbo-ehybrid-2025-26", "Panamera Turbo E-Hybrid", [2025, 2026], ["Turbo E-Hybrid", "Turbo"], {
      modelAliases: ["Panamera Turbo E-Hybrid Executive", "Panamera Turbo E-Hybrid Sport Turismo"],
      battery: P_PACK_259(PAN_2025_PR),
      charging: P_AC(11, PAN_2025_PR),
      abstains: { ...PORSCHE_ABSTAINS, epaRangeMi: "fueleconomy.gov holds no Panamera Turbo E-Hybrid rating yet" },
    }),
    ...panamera("panamera-turbos-ehybrid-2018-20", "Panamera Turbo S E-Hybrid", [2018, 2020], ["Turbo S E-Hybrid", "Turbo S"], {
      modelAliases: ["Panamera Turbo S E-Hybrid Executive", "Panamera Turbo S E-Hybrid Sport Turismo", "Panamera Turbo S E-Hybrid ST"],
      battery: { packGrossKwh: f(14.1, "mfr", "high", "Porsche does not label the figure gross or usable", PAN_TSE_PR) },
      range: {
        epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2020", epa(40055)),
        epaRangeTotalMi: f(450, "mfr", "high", undefined, epa(40055)),
        mpgeElectric: f(49, "mfr", "high", undefined, epa(40055)),
        mpgeCombined: f(26, "mfr", "high", undefined, epa(40055)),
        mpgGasoline: f(21, "mfr", "high", undefined, epa(40055)),
      },
      charging: P_AC(3.6, PAN_TSE_PR, "7.2 kW optional"),
    }),
    ...panamera("panamera-turbos-ehybrid-2021-23", "Panamera Turbo S E-Hybrid", [2021, 2023], ["Turbo S E-Hybrid", "Turbo S"], {
      modelAliases: ["Panamera Turbo S E-Hybrid Executive", "Panamera Turbo S E-Hybrid Sport Turismo", "Panamera Turbo S E-Hybrid ST"],
      battery: P_PACK_179(PAN_2021_PR),
      range: {
        epaRangeMi: f(17, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2023", epa(43919)),
        epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(43919)),
        mpgeElectric: f(48, "mfr", "high", undefined, epa(43919)),
        mpgeCombined: f(25, "mfr", "high", undefined, epa(43919)),
        mpgGasoline: f(19, "mfr", "high", undefined, epa(43919)),
      },
      charging: P_AC(7.2, PAN_2021_PR),
    })
  );
}

// ──────────── LINCOLN CORSAIR / AVIATOR GRAND TOURING ─────────────────────
// "Grand Touring" is the plug-in itself: every Lincoln powertrain table read
// this pass puts the gas engine and the Grand Touring column in mutually
// exclusive columns (gas trims are Corsair/Reserve/Black Label), so the bare
// nameplates take a Grand Touring trim guard — as a substring key, because
// "Black Label Grand Touring" is also the PHEV. Lincoln's recall notice for
// 2021–2026 Corsair Grand Touring PHEVs proves the run is contiguous;
// fueleconomy.gov's missing 2024 record is a year hole, so that row abstains
// on range (Lincoln's archived 2024 spec page did not render either).
// Lincoln's own archived MY2025 page prints 32 miles where EPA's 2025 record
// says 27 — the EPA record wins for an EPA-labelled field, and 27 is also
// what both neighbours rate. media.lincoln.com is retired, so the fact-sheet
// and PHEV-page citations point at the Internet Archive's copies of the
// manufacturer-authored pages.
{
  const CORSAIR_FACTS = "https://web.archive.org/web/20250411id_/https://media.lincoln.com/content/dam/lincolnmedia/lna/us/product/2020/Corsair/Grand-Touring/All-New-Lincoln-Corsair-Grand-Touring-Fact-Sheet.pdf";
  const AVIATOR_FACTS = "https://web.archive.org/web/2023id_/https://media.lincoln.com/content/dam/lincolnmedia/lna/us/product/2020/Aviator/2020-Aviator-Grand-Touring-Fact-Sheet2.pdf";
  const LINCOLN_PHEV_PAGE = "https://web.archive.org/web/20230729091457/https://www.lincoln.com/plug-in-hybrid-electric-vehicles/";
  const LINCOLN_L2_SUPPORT = "https://www.lincoln.com/support/how-tos/electric-vehicles/home-charging/lincoln-grand-touring-helpful-hints/";
  const LINCOLN_WARRANTY = "https://www.lincoln.com/support/how-tos/warranty/warranties-and-coverage/what-is-the-lincoln-warranty-on-hybrid-electric-components/";
  const LINCOLN_WARRANTY_FACTS = {
    batteryYears: f(8, "mfr", "high", undefined, LINCOLN_WARRANTY),
    batteryMiles: f(100_000, "mfr", "high", undefined, LINCOLN_WARRANTY),
  };
  const LINCOLN_CHARGING = {
    portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge", LINCOLN_PHEV_PAGE),
    dcFastCharging: f<"none">("none", "mfr", "high", undefined, LINCOLN_L2_SUPPORT),
  };
  // The fact sheet's "14.4 kilowatt-hours." line sits under its Battery
  // heading but is the tail of a sentence split across a page break —
  // unambiguous in placement, hence mfr, medium rather than high.
  const CORSAIR_BATTERY = { packGrossKwh: f(14.4, "mfr", "medium", undefined, CORSAIR_FACTS) };
  const corsair = (id: string, years: [number, number], over: Partial<EnrichmentRow>): EnrichmentRow[] =>
    withAlt(
      {
        id,
        make: "LINCOLN",
        model: "Corsair Plug-In Hybrid",
        modelAliases: ["Corsair PHEV", "Corsair Grand Touring"],
        modelYears: years,
        packVariant: "PHEV",
        battery: CORSAIR_BATTERY,
        charging: LINCOLN_CHARGING,
        warranty: LINCOLN_WARRANTY_FACTS,
        abstains: { heatPump: HP_ABSTAIN },
        ...over,
      } as EnrichmentRow,
      { model: "Corsair", trim: ["Grand Touring"] }
    );
  R.push(
    ...corsair("corsair-gt-2021-22", [2021, 2022], {
      range: {
        epaRangeMi: f(28, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2022", epa(43774)),
        epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(43774)),
        mpgeElectric: f(78, "mfr", "high", undefined, epa(43774)),
        mpgeCombined: f(49, "mfr", "high", undefined, epa(43774)),
        mpgGasoline: f(33, "mfr", "high", undefined, epa(43774)),
      },
    }),
    ...corsair("corsair-gt-2023", [2023, 2023], {
      range: {
        epaRangeMi: f(27, "mfr", "high", "Electric-only EPA range", epa(47226)),
        epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(47226)),
        mpgeElectric: f(78, "mfr", "high", undefined, epa(47226)),
        mpgeCombined: f(48, "mfr", "high", undefined, epa(47226)),
        mpgGasoline: f(33, "mfr", "high", undefined, epa(47226)),
      },
    }),
    ...corsair("corsair-gt-2024", [2024, 2024], {
      abstains: {
        heatPump: HP_ABSTAIN,
        epaRangeMi: "fueleconomy holds no 2024 record though Lincoln's recall scope proves the year exists",
      },
    }),
    ...corsair("corsair-gt-2025", [2025, 2025], {
      range: {
        epaRangeMi: f(27, "mfr", "high", "Electric-only EPA range", epa(48671)),
        epaRangeTotalMi: f(450, "mfr", "high", undefined, epa(48671)),
        mpgeElectric: f(76, "mfr", "high", undefined, epa(48671)),
        mpgeCombined: f(47, "mfr", "high", undefined, epa(48671)),
        mpgGasoline: f(33, "mfr", "high", undefined, epa(48671)),
      },
    }),
    ...corsair("corsair-gt-2026", [2026, 2026], {
      range: {
        epaRangeMi: f(27, "mfr", "high", "Electric-only EPA range", epa(49768)),
        epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(49768)),
        mpgeElectric: f(76, "mfr", "high", undefined, epa(49768)),
        mpgeCombined: f(48, "mfr", "high", undefined, epa(49768)),
        mpgGasoline: f(33, "mfr", "high", undefined, epa(49768)),
      },
    }),
    ...withAlt(
      {
        id: "aviator-gt-2020-23",
        make: "LINCOLN",
        model: "Aviator Plug-In Hybrid",
        modelAliases: ["Aviator PHEV", "Aviator Grand Touring"],
        modelYears: [2020, 2023],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(13.6, "mfr", "high", undefined, AVIATOR_FACTS) },
        range: {
          epaRangeMi: f(21, "mfr", "high", "Electric-only EPA range. Identical rating 2020–2023", epa(42377)),
          epaRangeTotalMi: f(460, "mfr", "high", undefined, epa(42377)),
          mpgeElectric: f(56, "mfr", "high", undefined, epa(42377)),
          mpgeCombined: f(31, "mfr", "high", undefined, epa(42377)),
          mpgGasoline: f(23, "mfr", "high", undefined, epa(42377)),
        },
        charging: LINCOLN_CHARGING,
        warranty: LINCOLN_WARRANTY_FACTS,
        abstains: { heatPump: HP_ABSTAIN },
      },
      { model: "Aviator", trim: ["Grand Touring"] }
    )
  );
}

// ───────────────────────── FORD ESCAPE PHEV (2026) ─────────────────────────
// fueleconomy.gov now carries a 2026 record (37 mi, same as every prior
// year), which is what the earlier tranche was waiting for before extending
// the Escape rows past 2025 — a new-year row on a new EPA rating, not a
// year-range stretch. Battery and charging mirror data4's Escape rows,
// which tagged them est.
R.push({
  id: "escape-phev-2026",
  make: "FORD",
  model: "Escape PHEV",
  modelAliases: ["Escape", "Escape Plug-In Hybrid"],
  modelYears: [2026, 2026],
  packVariant: "PHEV",
  battery: { packGrossKwh: f(14.4, "est", "medium") },
  range: {
    epaRangeMi: f(37, "mfr", "high", "Electric-only EPA range", epa(49763)),
    epaRangeTotalMi: f(520, "mfr", "high", undefined, epa(49763)),
    mpgeElectric: f(101, "mfr", "high", undefined, epa(49763)),
    mpgGasoline: f(40, "mfr", "high", undefined, epa(49763)),
  },
  charging: { acOnboardKw: f(3.3, "est", "medium"), portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
  warranty: {
    batteryYears: f(8, "mfr", "high", undefined, "https://www.ford.com/support/how-tos/warranty/warranties-and-coverage/what-is-the-warranty-on-my-ford-hybrid-or-electric-vehicle-battery/"),
    batteryMiles: f(100_000, "mfr", "high", undefined, "https://www.ford.com/support/how-tos/warranty/warranties-and-coverage/what-is-the-warranty-on-my-ford-hybrid-or-electric-vehicle-battery/"),
  },
  abstains: { heatPump: HP_ABSTAIN },
});

// ─────────────── TOYOTA RAV4 "64 Series" (a vPIC artifact) ─────────────────
// 26 live listings carry trim "64 Series", which is not a Toyota grade: it is
// vPIC's Series field — the generation code for the new RAV4 (the old one
// decodes "50 Series") — leaking into dealer trim fields, verified against
// live VINs whose selling dealers list SE, XSE and Woodland. The label spans
// every grade, and range and charging genuinely differ by grade, so this row
// carries only what is true of every 2026 RAV4 PHEV (the warranty) and
// abstains on everything the label cannot identify. The related vPIC-side
// artifact — every 2026 pattern decodes Trim "GR Sport" — is handled by
// VPIC_PATTERN_TRIM_ARTIFACTS in match.ts, and `feedLabelRow` below keeps
// this row out of the candidate list that mechanism presents: it is a label,
// not one of the versions the car could be.
R.push({
  id: "rav4-phev-2026-64-series",
  make: "TOYOTA",
  model: "RAV4 Plug-In Hybrid",
  modelAliases: ["RAV4 PLUG-IN", "RAV4 PHEV"],
  modelYears: [2026, 2026],
  trim: ["64 Series"],
  feedLabelRow: true,
  packVariant: "PHEV",
  warranty: {
    batteryYears: f(10, "mfr", "high", undefined, "https://pressroom.toyota.com/the-next-adventure-begins-2026-rav4-arrives-this-winter/"),
    batteryMiles: f(150_000, "mfr", "high", undefined, "https://pressroom.toyota.com/the-next-adventure-begins-2026-rav4-arrives-this-winter/"),
    batteryTransfers: f(true, "mfr", "high", undefined, "https://pressroom.toyota.com/the-next-adventure-begins-2026-rav4-arrives-this-winter/"),
  },
  abstains: {
    epaRangeMi: "The 64 Series label is vPIC's generation code and spans grades rated 48 to 52 miles",
    portStandard: "Charging hardware differs by grade and the 64 Series label does not name one",
    packUsableKwh: "Toyota's 2026 RAV4 materials state no battery capacity figure",
    heatPump: HP_ABSTAIN,
  },
});

// ───────────────────────── LEXUS TX 550h+ ─────────────────────────────────
// Deferred from the first Lexus pass. Lexus's own wording for the range is
// "manufacturer projected estimated" — its hedge, kept at medium — and the
// pack is never stated ("high-capacity lithium-ion battery" is the whole
// disclosure). MY2025 is the one year fueleconomy has rated.
{
  const TX_2024 = "https://pressroom.lexus.com/three-rows-zero-compromise-the-first-ever-2024-lexus-tx/";
  const TX_2026 = "https://pressroom.lexus.com/style-utility-and-comfort-the-2026-lexus-tx/";
  const TX_ABSTAINS = {
    packUsableKwh: "Lexus states no capacity figure for the TX pack in any fetched document",
    batteryWarranty: "Lexus's 10-year hybrid battery policy statement never names the plug-ins",
    heatPump: HP_ABSTAIN,
  };
  const tx = (id: string, years: [number, number], range: EnrichmentRow["range"], src: string): EnrichmentRow => ({
    id,
    make: "LEXUS",
    model: "TX 550h+",
    modelAliases: ["TX 550h Plus", "TX 550h", "TX PLUG-IN HYBRID ELECTRIC VEHICLE", "TX Plug-In Hybrid"],
    modelYears: years,
    packVariant: "PHEV",
    range,
    charging: {
      acOnboardKw: f(7, "mfr", "high", undefined, src),
      portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge", TX_2026),
      dcFastCharging: NO_DCFC_EST,
    },
    abstains: TX_ABSTAINS,
  });
  R.push(
    tx("tx-550h-plus-2024", [2024, 2024], { epaRangeMi: f(33, "mfr", "medium", "Lexus projected estimate", TX_2024) }, TX_2024),
    tx(
      "tx-550h-plus-2025",
      [2025, 2025],
      {
        epaRangeMi: f(33, "mfr", "high", "Electric-only EPA range", epa(49013)),
        epaRangeTotalMi: f(450, "mfr", "high", undefined, epa(49013)),
        mpgeElectric: f(76, "mfr", "high", undefined, epa(49013)),
        mpgeCombined: f(46, "mfr", "high", undefined, epa(49013)),
        mpgGasoline: f(29, "mfr", "high", undefined, epa(49013)),
      },
      TX_2026
    ),
    tx("tx-550h-plus-2026", [2026, 2026], { epaRangeMi: f(33, "mfr", "medium", "Lexus projected estimate", TX_2026) }, TX_2026)
  );
}

// ──────────── BENTLEY CONTINENTAL GT / GTC / FLYING SPUR / BENTAYGA ────────
// The matching-critical fact, control-tested against EPA's certification
// list: from MY2025 every US Continental GT, GTC and Flying Spur is a
// plug-in hybrid (gasoline Bentaygas still appear in the same lists, so the
// absence of gasoline Continentals is real), while MY2024-and-earlier
// Continentals are never PHEVs. So the bare nameplates are safe year-gated
// with no trim guard. The pack is trickier: Bentley publishes 25.9 kWh for
// the Ultra Performance Hybrid (Speed/Mulliner) and NO figure for the
// 680 PS High Performance Hybrid (core/S/Azure, MY2026), so only Speed-keyed
// rows carry the pack and the blanket rows abstain. Warranty abstains
// corpus-wide: Bentley publishes only a 3-year vehicle warranty with no US
// battery terms; the widely-repeated 8yr/80k could not be verified.
{
  const BENTLEY_SPEED_PR = "https://www.bentleymedia.com/en/newsitem/1601-the-new-continental-gt-speed-redefining-the-definitive-grand-tourer";
  const BENTLEY_SPEED_US_PR = "https://www.bentleymedia.com/en/newsitem/1613-bespoke-new-continental-gt-speed-leads-us-debut";
  const BENTAYGA_PR = "https://www.bentleymedia.com/en/newsitem/1171-bringing-serenity-to-the-city-and-beyond-the-new-bentayga-hybrid";
  const BENTAYGA_PAGE = "https://www.bentleymotors.com/en/models/bentayga/bentayga-hybrid.html";
  const BENTLEY_WARRANTY_ABSTAIN = "Bentley publishes a 3-year vehicle warranty and no US battery terms anywhere fetched";
  const BENTLEY_PACK_ABSTAIN = "Bentley has not published the 680 PS High Performance Hybrid's battery capacity";
  const CONTINENTAL_RANGE = (id: number) => ({
    epaRangeMi: f(30, "mfr", "high", "Identical rating for coupe, convertible and Speed, 2025–2026", epa(id)),
    epaRangeTotalMi: f(440, "mfr", "high", undefined, epa(id)),
    mpgeElectric: f(46, "mfr", "high", undefined, epa(id)),
    mpgeCombined: f(32, "mfr", "high", undefined, epa(id)),
    mpgGasoline: f(19, "mfr", "high", undefined, epa(id)),
  });
  R.push(
    {
      // The blanket row: every 2025-26 Continental body and trim. Pack
      // abstained because the two hybrid powertrains may not share one.
      id: "continental-gt-2025-26",
      make: "BENTLEY",
      model: "Continental GT",
      modelAliases: ["Continental", "Continental GTC", "Continental GT Convertible", "Continental GT Azure", "Continental GTC Azure", "Continental GT S", "Continental GTC S", "Continental GT V8"],
      modelYears: [2025, 2026],
      packVariant: "PHEV",
      range: CONTINENTAL_RANGE(48998),
      charging: { portStandard: J1772_EST },
      abstains: { packUsableKwh: BENTLEY_PACK_ABSTAIN, batteryWarranty: BENTLEY_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      // Speed/Mulliner carry the published 25.9 kWh Ultra Performance pack
      // and the 11 kW charger. Keyed on the Speed trim over the same aliases.
      id: "continental-gt-speed-2025-26",
      make: "BENTLEY",
      model: "Continental GT Speed",
      modelAliases: ["Continental GT", "Continental GTC", "Continental", "Continental GTC Speed", "Continental GT Speed Convertible"],
      modelYears: [2025, 2026],
      trim: ["Speed"],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(25.9, "mfr", "high", "Bentley says up to 85 percent is usable", BENTLEY_SPEED_PR) },
      range: CONTINENTAL_RANGE(48999),
      charging: { acOnboardKw: f(11, "mfr", "high", undefined, BENTLEY_SPEED_PR), portStandard: J1772_EST, architectureV: f(400, "mfr", "high", undefined, BENTLEY_SPEED_PR) },
      abstains: { batteryWarranty: BENTLEY_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "flying-spur-2025-26",
      make: "BENTLEY",
      model: "Flying Spur",
      modelAliases: ["Flying Spur Azure", "Flying Spur Mulliner"],
      modelYears: [2025, 2026],
      packVariant: "PHEV",
      range: CONTINENTAL_RANGE(49002),
      charging: { portStandard: J1772_EST },
      abstains: { packUsableKwh: BENTLEY_PACK_ABSTAIN, batteryWarranty: BENTLEY_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "flying-spur-speed-2025-26",
      make: "BENTLEY",
      model: "Flying Spur Speed",
      modelAliases: ["Flying Spur"],
      modelYears: [2025, 2026],
      trim: ["Speed"],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(25.9, "mfr", "high", "Bentley says up to 85 percent is usable", BENTLEY_SPEED_PR) },
      range: CONTINENTAL_RANGE(49003),
      charging: { acOnboardKw: f(11, "mfr", "high", undefined, BENTLEY_SPEED_PR), portStandard: J1772_EST, architectureV: f(400, "mfr", "high", undefined, BENTLEY_SPEED_US_PR) },
      abstains: { batteryWarranty: BENTLEY_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      // The earlier V6 Flying Spur Hybrid — a different car under a model
      // string that names the plug-in itself. Its own pack was not
      // researched; EPA figures only. Bare "Flying Spur" must NOT alias
      // here: gasoline Flying Spurs share those years.
      id: "flying-spur-hybrid-2022-24",
      make: "BENTLEY",
      model: "Flying Spur Hybrid",
      modelYears: [2022, 2024],
      packVariant: "PHEV",
      range: {
        epaRangeMi: f(21, "mfr", "high", "Electric-only EPA range. Identical rating 2022–2024", epa(46245)),
        epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(46245)),
        mpgeElectric: f(46, "mfr", "high", undefined, epa(46245)),
        mpgeCombined: f(26, "mfr", "high", undefined, epa(46245)),
        mpgGasoline: f(19, "mfr", "high", undefined, epa(46245)),
      },
      charging: { portStandard: J1772_EST },
      abstains: {
        packUsableKwh: "The V6 Flying Spur Hybrid's pack was not confirmed from a Bentley document this pass",
        batteryWarranty: BENTLEY_WARRANTY_ABSTAIN,
        heatPump: HP_ABSTAIN,
      },
    },
    {
      id: "bentayga-hybrid-2021-23",
      make: "BENTLEY",
      model: "Bentayga Hybrid",
      modelYears: [2021, 2023],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(17.3, "mfr", "high", undefined, BENTAYGA_PR) },
      range: {
        epaRangeMi: f(18, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2023", epa(47214)),
        epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(47214)),
        mpgeElectric: f(47, "mfr", "high", undefined, epa(47214)),
        mpgeCombined: f(28, "mfr", "high", undefined, epa(47214)),
        mpgGasoline: f(20, "mfr", "high", undefined, epa(47214)),
      },
      charging: { acOnboardKw: f(7.2, "mfr", "high", undefined, BENTAYGA_PR), portStandard: J1772_EST },
      abstains: { batteryWarranty: BENTLEY_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "bentayga-hybrid-2025-27",
      make: "BENTLEY",
      model: "Bentayga Hybrid",
      modelYears: [2025, 2027],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(18, "mfr", "medium", undefined, BENTAYGA_PAGE) },
      range: {
        epaRangeMi: f(20, "mfr", "high", "Electric-only EPA range. Identical rating 2025–2027", epa(48654)),
        epaRangeTotalMi: f(440, "mfr", "high", undefined, epa(48654)),
        mpgeElectric: f(42, "mfr", "high", undefined, epa(48654)),
        mpgeCombined: f(29, "mfr", "high", undefined, epa(48654)),
        mpgGasoline: f(21, "mfr", "high", undefined, epa(48654)),
      },
      charging: { acOnboardKw: f(7.2, "mfr", "medium", undefined, BENTAYGA_PR), portStandard: J1772_EST },
      abstains: { batteryWarranty: BENTLEY_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    }
  );
}

// ──────────── MERCEDES-AMG E 53 HYBRID / C 63 / GLC 63 E PERFORMANCE ───────
// The E 53 Hybrid is a real-range plug-in (28.6 kWh total / 21.2 usable,
// 9.6 kW AC, standard 60 kW DC); its rows are keyed on the Hybrid/PHEV
// tokens the feed's E-Class trims carry, so no petrol E-Class can match.
// The E PERFORMANCE cars carry tiny 6.1 kWh packs and AC-only 3.7 kW
// charging (control-tested: MBUSA's spec tables have a dedicated Charging
// section that lists DC for the E 53 and only AC rows for these), and their
// EPA electric range really is ~1 mile — printed as rated, because telling a
// shopper this is not an EV-mode car is the point. C 63 and GLC 63 are
// PHEV-only nameplates in these years; GT 63 and SL 63 are NOT covered —
// petrol cars share those exact model strings in overlapping years, and the
// S 580e's EPA record conflicts with MBUSA's own figure, so those stay
// honestly silent this pass.
{
  const E53_PR = "https://media.mbusa.com/releases/release-c510507a2b04ee68bb1eaf8344e88f1e-performance-and-efficiency-in-a-new-combination-the-mercedes-amg-e-53-hybrid";
  const E53_WAGON_PR = "https://media.mbusa.com/releases/release-0aacd0cfec6ffa3ea5c65bd4c210f737-2026-mercedes-amg-e-53-hybrid-wagon";
  const C63_QRG = "https://media.mbusa.com/releases/release-1d2ba082ef32b72d00f8f4d0180028da-2024-mercedes-amg-c-63-s-e-performance-quick-reference-guide";
  const GLC63_PR = "https://media.mbusa.com/releases/release-abcf6ba2c88042e4283e711ebe00a2f1-the-all-new-mercedes-amg-glc-performance-suv-in-two-high-performance-versions";
  const MB_WARRANTY_ABSTAIN = "Mercedes' US warranty booklets are PDF-walled and no fetched page states the terms";
  const E53_BATTERY = {
    packGrossKwh: f(28.6, "mfr", "high", undefined, E53_PR),
    packUsableKwh: f(21.2, "mfr", "high", undefined, E53_PR),
    chemistry: f<"NMC">("NMC", "mfr", "medium", undefined, E53_WAGON_PR),
  };
  const E53_CHARGING = {
    acOnboardKw: f(9.6, "mfr", "high", undefined, E53_PR),
    portStandard: f<"CCS1">("CCS1", "est", "medium"),
    dcFastCharging: f<"standard">("standard", "mfr", "high", "10–80% in about 20 minutes", E53_PR),
    dcPeakKw: f(60, "mfr", "high", undefined, E53_PR),
  };
  const E53_TRIMS = ["E 53 Hybrid", "E53 Hybrid", "E 53 Phev", "E53 Phev"];
  R.push(
    {
      id: "amg-e53-hybrid-2025",
      make: "MERCEDES-BENZ",
      model: "AMG E 53 Hybrid",
      modelAliases: ["AMG E 53", "E 53 Hybrid", "E53 Hybrid"],
      modelYears: [2025, 2025],
      packVariant: "PHEV",
      battery: E53_BATTERY,
      range: {
        epaRangeMi: f(43, "mfr", "high", "Sedan", epa(49019)),
        epaRangeTotalMi: f(410, "mfr", "high", undefined, epa(49019)),
        mpgeElectric: f(59, "mfr", "high", undefined, epa(49019)),
        mpgeCombined: f(39, "mfr", "high", undefined, epa(49019)),
        mpgGasoline: f(23, "mfr", "high", undefined, epa(49019)),
      },
      charging: E53_CHARGING,
      abstains: { batteryWarranty: MB_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "amg-e53-hybrid-2025-alt",
      make: "MERCEDES-BENZ",
      model: "E-Class",
      modelAliases: ["E-class"],
      modelYears: [2025, 2025],
      trim: E53_TRIMS,
      packVariant: "PHEV",
      battery: E53_BATTERY,
      range: {
        epaRangeMi: f(43, "mfr", "high", "Sedan", epa(49019)),
        epaRangeTotalMi: f(410, "mfr", "high", undefined, epa(49019)),
        mpgeElectric: f(59, "mfr", "high", undefined, epa(49019)),
        mpgeCombined: f(39, "mfr", "high", undefined, epa(49019)),
        mpgGasoline: f(23, "mfr", "high", undefined, epa(49019)),
      },
      charging: E53_CHARGING,
      abstains: { batteryWarranty: MB_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "amg-e53-hybrid-2026-27",
      make: "MERCEDES-BENZ",
      model: "AMG E 53 Hybrid",
      modelAliases: ["AMG E 53", "E 53 Hybrid", "E53 Hybrid"],
      modelYears: [2026, 2027],
      packVariant: "PHEV",
      battery: E53_BATTERY,
      range: {
        epaRangeMi: f(44, "mfr", "high", "Sedan; the wagon rates 41", epa(49769)),
        epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(49769)),
        mpgeElectric: f(60, "mfr", "high", undefined, epa(49769)),
        mpgeCombined: f(40, "mfr", "high", undefined, epa(49769)),
        mpgGasoline: f(24, "mfr", "high", undefined, epa(49769)),
      },
      charging: E53_CHARGING,
      abstains: { batteryWarranty: MB_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "amg-e53-hybrid-2026-27-alt",
      make: "MERCEDES-BENZ",
      model: "E-Class",
      modelAliases: ["E-class"],
      modelYears: [2026, 2027],
      trim: E53_TRIMS,
      packVariant: "PHEV",
      battery: E53_BATTERY,
      range: {
        epaRangeMi: f(44, "mfr", "high", "Sedan; the wagon rates 41", epa(49769)),
        epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(49769)),
        mpgeElectric: f(60, "mfr", "high", undefined, epa(49769)),
        mpgeCombined: f(40, "mfr", "high", undefined, epa(49769)),
        mpgGasoline: f(24, "mfr", "high", undefined, epa(49769)),
      },
      charging: E53_CHARGING,
      abstains: { batteryWarranty: MB_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "amg-c63-se-2025",
      make: "MERCEDES-BENZ",
      model: "AMG C 63",
      modelAliases: ["AMG C 63 S E Performance", "C 63 S E Performance"],
      modelYears: [2025, 2026],
      packVariant: "PHEV",
      battery: {
        packGrossKwh: f(6.1, "mfr", "high", undefined, C63_QRG),
        packUsableKwh: f(4.8, "mfr", "high", undefined, C63_QRG),
      },
      range: { epaRangeMi: f(1, "mfr", "high", "Battery built for power delivery, not electric-only driving", epa(49018)) },
      charging: { portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge"), dcFastCharging: f<"none">("none", "est", "high", "AC charging only") },
      abstains: { batteryWarranty: MB_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "amg-glc63-se-2025",
      make: "MERCEDES-BENZ",
      model: "AMG GLC 63",
      modelAliases: ["AMG GLC63", "AMG GLC 63 S E Performance", "GLC 63 S E Performance"],
      modelYears: [2025, 2026],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(6.1, "mfr", "high", "Mercedes states no usable split for this pack", GLC63_PR) },
      range: { epaRangeMi: f(1, "mfr", "high", "Battery built for power delivery, not electric-only driving", epa(49022)) },
      charging: { acOnboardKw: f(3.7, "mfr", "high", undefined, GLC63_PR), portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge"), dcFastCharging: f<"none">("none", "est", "high", "AC charging only") },
      abstains: { batteryWarranty: MB_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    }
  );
}

// ──────────── LAND ROVER RANGE ROVER / RANGE ROVER SPORT PHEV ──────────────
// Two generations. P400e (MY2019-2022): EPA rates 19 miles and nothing else
// could be verified — Land Rover's old pages are gone and its media site was
// down — so those rows are EPA-plus-abstentions, and deliberately do NOT
// claim the current cars' DC capability. The L460/L461 cars (P440e MY2023,
// P460e/P550e MY2025+): EPA's pages rate 51 then 53 miles — note the REST
// API's rangeA field says 21 for the 2025 records while the same records'
// own city/highway electric ranges read ~51/56, an internal inconsistency,
// so the page-stated 53 is what ships. 31.8 kWh is verified only for the
// Sport P440e; other variants abstain rather than borrow it. DC fast
// charging is real on this generation (CCS, 80% in under an hour) but Land
// Rover prints both 50 kW and 43 kW as the peak, so the peak-kW field stays
// empty. Warranty abstains: Land Rover's own pages state both 8yr/100k and
// 6yr/60k for hybrids.
{
  const LR_RRS_PR = "https://www.landroverusa.com/our-story/news/new-range-rover-sport.html";
  const LR_CHARGE = "https://www.landroverusa.com/ownership/electric/how-to-charge.html";
  const LR_WARRANTY_ABSTAIN = "Land Rover's own pages state both 8-year/100,000 and 6-year/60,000 for hybrids";
  const LR_L460_CHARGING = {
    acOnboardKw: f(7, "mfr", "high", undefined, LR_CHARGE),
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, LR_CHARGE),
    dcFastCharging: f<"standard">("standard", "mfr", "high", "CCS, 80% in under an hour", LR_CHARGE),
  };
  const LR_P400E_ABSTAINS = {
    packUsableKwh: "The P400e pack size was not confirmed from a Land Rover document this pass",
    portStandard: "The P400e's connector was not confirmed; current-generation CCS guidance does not apply",
    batteryWarranty: LR_WARRANTY_ABSTAIN,
    heatPump: HP_ABSTAIN,
  };
  const lr = (row: Omit<EnrichmentRow, "make">): EnrichmentRow => ({ make: "LAND ROVER", packVariant: "PHEV", ...row });
  R.push(
    ...withAlt(
      lr({
        id: "range-rover-p400e-2019-21",
        model: "Range Rover Plug-In Hybrid",
        modelAliases: ["Range Rover PHEV", "Range Rover P400e"],
        modelYears: [2019, 2021],
        range: {
          epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range. Identical rating 2019–2021", epa(42373)),
          epaRangeTotalMi: f(480, "mfr", "high", undefined, epa(42373)),
          mpgeElectric: f(42, "mfr", "high", undefined, epa(42373)),
          mpgeCombined: f(25, "mfr", "high", undefined, epa(42373)),
          mpgGasoline: f(19, "mfr", "high", undefined, epa(42373)),
        },
        abstains: LR_P400E_ABSTAINS,
      }),
      { model: "Range Rover", trim: ["P400e", "PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      lr({
        id: "range-rover-sport-p400e-2019-22",
        model: "Range Rover Sport Plug-In Hybrid",
        modelAliases: ["Range Rover Sport PHEV", "Range Rover Sport P400e"],
        modelYears: [2019, 2022],
        range: {
          epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range. Identical rating 2019–2022", epa(42374)),
          epaRangeTotalMi: f(480, "mfr", "high", undefined, epa(42374)),
          mpgeElectric: f(42, "mfr", "high", undefined, epa(42374)),
          mpgeCombined: f(25, "mfr", "high", undefined, epa(42374)),
          mpgGasoline: f(19, "mfr", "high", undefined, epa(42374)),
        },
        abstains: LR_P400E_ABSTAINS,
      }),
      { model: "Range Rover Sport", trim: ["P400e", "PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      lr({
        id: "range-rover-p440e-2023",
        model: "Range Rover Plug-In Hybrid",
        modelAliases: ["Range Rover PHEV", "Range Rover P440e"],
        modelYears: [2023, 2023],
        range: {
          epaRangeMi: f(51, "mfr", "high", "Electric-only EPA range", epa(47224)),
          epaRangeTotalMi: f(450, "mfr", "high", undefined, epa(47224)),
          mpgeElectric: f(51, "mfr", "high", undefined, epa(47224)),
          mpgeCombined: f(37, "mfr", "high", undefined, epa(47224)),
          mpgGasoline: f(21, "mfr", "high", undefined, epa(47224)),
        },
        charging: LR_L460_CHARGING,
        abstains: {
          packUsableKwh: "31.8 kWh is verified only for the Sport P440e, not the full-size car",
          batteryWarranty: LR_WARRANTY_ABSTAIN,
          heatPump: HP_ABSTAIN,
        },
      }),
      { model: "Range Rover", trim: ["P440e", "PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      lr({
        id: "range-rover-sport-p440e-2023",
        model: "Range Rover Sport Plug-In Hybrid",
        modelAliases: ["Range Rover Sport PHEV", "Range Rover Sport P440e"],
        modelYears: [2023, 2023],
        battery: { packGrossKwh: f(31.8, "mfr", "high", "Land Rover does not label the figure gross or usable", LR_RRS_PR) },
        range: {
          epaRangeMi: f(51, "mfr", "high", "Electric-only EPA range", epa(47225)),
          epaRangeTotalMi: f(450, "mfr", "high", undefined, epa(47225)),
          mpgeElectric: f(51, "mfr", "high", undefined, epa(47225)),
          mpgeCombined: f(37, "mfr", "high", undefined, epa(47225)),
          mpgGasoline: f(21, "mfr", "high", undefined, epa(47225)),
        },
        charging: LR_L460_CHARGING,
        abstains: { batteryWarranty: LR_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
      }),
      { model: "Range Rover Sport", trim: ["P440e", "PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      lr({
        // EPA holds no 2024 record though 2024 P550e listings are live; same
        // year-hole shape as the 2024 GLE 450e. Charging is stated (the L460
        // hardware), range abstains.
        id: "range-rover-p550e-2024",
        model: "Range Rover Plug-In Hybrid",
        modelAliases: ["Range Rover PHEV", "Range Rover P550e"],
        modelYears: [2024, 2024],
        charging: LR_L460_CHARGING,
        abstains: {
          epaRangeMi: "fueleconomy holds no 2024 record; neighbouring years rate 51 and 53 miles",
          packUsableKwh: "Land Rover has not published this variant's battery capacity",
          batteryWarranty: LR_WARRANTY_ABSTAIN,
          heatPump: HP_ABSTAIN,
        },
      }),
      { model: "Range Rover", trim: ["P550e", "PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      lr({
        id: "range-rover-sport-p550e-2024",
        model: "Range Rover Sport Plug-In Hybrid",
        modelAliases: ["Range Rover Sport PHEV", "Range Rover Sport P550e", "Range Rover Sport P460e"],
        modelYears: [2024, 2024],
        charging: LR_L460_CHARGING,
        abstains: {
          epaRangeMi: "fueleconomy holds no 2024 record; neighbouring years rate 51 and 53 miles",
          packUsableKwh: "Land Rover has not published this variant's battery capacity",
          batteryWarranty: LR_WARRANTY_ABSTAIN,
          heatPump: HP_ABSTAIN,
        },
      }),
      { model: "Range Rover Sport", trim: ["P550e", "P460e", "P440e", "PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      lr({
        // EPA's page states 0-53 miles for the 2025 P550 record; the REST
        // API's rangeA field says 21 on the same record whose own
        // city/highway electric ranges read 50.9/55.9 — an internal
        // inconsistency, so the page figure is the one shipped.
        id: "range-rover-p550e-2025-26",
        model: "Range Rover Plug-In Hybrid",
        modelAliases: ["Range Rover PHEV", "Range Rover P550e"],
        modelYears: [2025, 2026],
        range: {
          epaRangeMi: f(53, "mfr", "high", "Electric-only EPA range", epa(48668)),
          epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(48668)),
          mpgeElectric: f(53, "mfr", "high", undefined, epa(48668)),
          mpgeCombined: f(39, "mfr", "high", undefined, epa(48668)),
          mpgGasoline: f(21, "mfr", "high", undefined, epa(48668)),
        },
        charging: LR_L460_CHARGING,
        abstains: {
          packUsableKwh: "Land Rover has not published this variant's battery capacity",
          batteryWarranty: LR_WARRANTY_ABSTAIN,
          heatPump: HP_ABSTAIN,
        },
      }),
      { model: "Range Rover", trim: ["P550e", "PHEV", "Plug-In Hybrid"] }
    ),
    ...withAlt(
      lr({
        id: "range-rover-sport-p460e-2025-26",
        model: "Range Rover Sport Plug-In Hybrid",
        modelAliases: ["Range Rover Sport PHEV", "Range Rover Sport P460e"],
        modelYears: [2025, 2026],
        range: {
          epaRangeMi: f(53, "mfr", "high", "Electric-only EPA range", epa(48669)),
          epaRangeTotalMi: f(420, "mfr", "high", undefined, epa(48669)),
          mpgeElectric: f(53, "mfr", "high", undefined, epa(48669)),
          mpgeCombined: f(39, "mfr", "high", undefined, epa(48669)),
          mpgGasoline: f(21, "mfr", "high", undefined, epa(48669)),
        },
        charging: LR_L460_CHARGING,
        abstains: {
          packUsableKwh: "Land Rover has not published this variant's battery capacity",
          batteryWarranty: LR_WARRANTY_ABSTAIN,
          heatPump: HP_ABSTAIN,
        },
      }),
      { model: "Range Rover Sport", trim: ["P460e", "P550e", "PHEV", "Plug-In Hybrid"] }
    )
  );
}

// ──────────── McLAREN ARTURA / LAMBORGHINI URUS SE / FERRARI PHEVs ─────────
// PHEV-only nameplates throughout (Artura, 296, SF90), except the Urus —
// where the safe token is exactly "SE": the petrol trims are "S" and
// "Performante", and a "SE Performante" trim key would overlap-swallow
// petrol "Performante" listings, so the guard stays the exact two-letter SE
// and future "SE Performante" listings wait for their own researched row.
// McLaren's US-locale retail page prints a 21-mile WLTP figure directly
// under an EU-emissions block — the EPA number is 11, from its US press
// kits — so nothing here reads a range off a retail page. Ferrari publishes
// a 5-year hybrid-component warranty with no mileage cap; Lamborghini
// publishes no battery terms at all. None of the three publishes an onboard
// charger kW.
{
  const ARTURA_KIT_23 = "https://cars.mclaren.press/press-kits/mclaren-artura-2022-2024";
  const ARTURA_KIT_25 = "https://cars.mclaren.press/press-kits/mclaren-artura-2024";
  const ARTURA_WARRANTY = {
    batteryYears: f(6, "mfr", "high", undefined, ARTURA_KIT_23),
    batteryMiles: f(45_000, "mfr", "high", undefined, ARTURA_KIT_23),
  };
  const ARTURA_BATTERY = { packUsableKwh: f(7.4, "mfr", "high", undefined, ARTURA_KIT_23) };
  const artura = (id: string, years: [number, number], range: EnrichmentRow["range"]): EnrichmentRow => ({
    id,
    make: "MCLAREN",
    model: "Artura",
    modelAliases: ["Artura Spider"],
    modelYears: years,
    packVariant: "PHEV",
    battery: ARTURA_BATTERY,
    range,
    charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
    warranty: ARTURA_WARRANTY,
    abstains: { heatPump: HP_ABSTAIN },
  });
  R.push(
    artura("artura-2023", [2023, 2023], {
      epaRangeMi: f(11, "mfr", "high", "Electric-only EPA range", epa(45395)),
      epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(45395)),
      mpgeElectric: f(39, "mfr", "high", undefined, epa(45395)),
      mpgeCombined: f(22, "mfr", "high", undefined, epa(45395)),
      mpgGasoline: f(18, "mfr", "high", undefined, epa(45395)),
    }),
    // fueleconomy lists only the 2023 Artura; MY24/25 exist per McLaren's own
    // press kits, which state the EPA figures directly.
    artura("artura-2024", [2024, 2024], {
      epaRangeMi: f(11, "mfr", "high", undefined, ARTURA_KIT_23),
      mpgeCombined: f(39, "mfr", "high", undefined, ARTURA_KIT_23),
    }),
    artura("artura-2025", [2025, 2025], {
      epaRangeMi: f(11, "mfr", "high", undefined, ARTURA_KIT_25),
      epaRangeTotalMi: f(340, "mfr", "high", undefined, ARTURA_KIT_25),
      mpgeCombined: f(45, "mfr", "high", undefined, ARTURA_KIT_25),
      mpgGasoline: f(19, "mfr", "high", undefined, ARTURA_KIT_25),
    })
  );

  const URUS_SE_PAGE = "https://www.lamborghini.com/en-en/models/urus/urus-se";
  R.push(
    ...withAlt(
      {
        id: "urus-se-2025-26",
        make: "LAMBORGHINI",
        model: "Urus SE",
        modelYears: [2025, 2026],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(25.9, "mfr", "high", "Total energy, as Lamborghini states it", URUS_SE_PAGE) },
        range: {
          epaRangeMi: f(35, "mfr", "high", "Electric-only EPA range. Identical rating 2025–2026", epa(49004)),
          epaRangeTotalMi: f(450, "mfr", "high", undefined, epa(49004)),
          mpgeElectric: f(48, "mfr", "high", undefined, epa(49004)),
          mpgeCombined: f(26, "mfr", "high", undefined, epa(49004)),
          mpgGasoline: f(20, "mfr", "high", undefined, epa(49004)),
        },
        charging: { portStandard: J1772_EST },
        abstains: {
          batteryWarranty: "Lamborghini publishes a 3-year vehicle warranty and no battery terms",
          heatPump: HP_ABSTAIN,
        },
      },
      { model: "Urus", trim: ["SE"] }
    )
  );

  const FERRARI_WARRANTY_URL = "https://www.ferrari.com/en-EN/corporate/articles/ferrari-presents-two-new-extended-warranty-programmes";
  const FERRARI_WARRANTY = {
    batteryYears: f(5, "mfr", "medium", "Hybrid-component coverage; Ferrari publishes no mileage cap", FERRARI_WARRANTY_URL),
  };
  const ferrari = (id: string, model: string, years: [number, number], packKwh: number, packUrl: string, over: Partial<EnrichmentRow>): EnrichmentRow => ({
    id,
    make: "FERRARI",
    model,
    modelYears: years,
    packVariant: "PHEV",
    battery: { packGrossKwh: f(packKwh, "mfr", "high", undefined, packUrl) },
    charging: { portStandard: J1772_EST },
    warranty: FERRARI_WARRANTY,
    abstains: { heatPump: HP_ABSTAIN },
    ...over,
  });
  const F296_GTB = "https://www.ferrari.com/en-EN/auto/296-gtb";
  const F296_GTS = "https://www.ferrari.com/en-EN/auto/296-gts";
  const SF90_S = "https://www.ferrari.com/en-EN/auto/sf90-stradale";
  const SF90_SP = "https://www.ferrari.com/en-EN/auto/sf90-spider";
  const FERRARI_HOLE = (yrs: string) => `fueleconomy holds no ${yrs} record; neighbouring years carry the rating`;
  R.push(
    ferrari("296-gtb-2022", "296 GTB", [2022, 2022], 7.45, F296_GTB, {
      range: {
        epaRangeMi: f(8, "mfr", "high", "Electric-only EPA range", epa(45398)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(45398)),
        mpgeElectric: f(47, "mfr", "high", undefined, epa(45398)),
        mpgeCombined: f(20, "mfr", "high", undefined, epa(45398)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(45398)),
      },
    }),
    ferrari("296-gtb-2023-24", "296 GTB", [2023, 2024], 7.45, F296_GTB, {
      abstains: { heatPump: HP_ABSTAIN, epaRangeMi: FERRARI_HOLE("2023–24 GTB") },
    }),
    ferrari("296-gtb-2025-26", "296 GTB", [2025, 2026], 7.45, F296_GTB, {
      range: {
        epaRangeMi: f(8, "mfr", "high", "Electric-only EPA range. Identical rating 2025–2026", epa(48658)),
        epaRangeTotalMi: f(350, "mfr", "high", undefined, epa(48658)),
        mpgeElectric: f(47, "mfr", "high", undefined, epa(48658)),
        mpgeCombined: f(20, "mfr", "high", undefined, epa(48658)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(48658)),
      },
    }),
    // EPA files the 2023 GTS as "296 GTB Spider" — kept as an alias so a
    // vPIC-shaped decode matches too.
    ferrari("296-gts-2023", "296 GTS", [2023, 2023], 7.45, F296_GTS, {
      modelAliases: ["296 GTB Spider"],
      range: {
        epaRangeMi: f(7, "mfr", "high", "Electric-only EPA range", epa(47217)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(47217)),
        mpgeElectric: f(47, "mfr", "high", undefined, epa(47217)),
        mpgeCombined: f(20, "mfr", "high", undefined, epa(47217)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(47217)),
      },
    }),
    ferrari("296-gts-2024", "296 GTS", [2024, 2024], 7.45, F296_GTS, {
      modelAliases: ["296 GTB Spider"],
      abstains: { heatPump: HP_ABSTAIN, epaRangeMi: FERRARI_HOLE("2024 GTS") },
    }),
    ferrari("296-gts-2025-26", "296 GTS", [2025, 2026], 7.45, F296_GTS, {
      range: {
        epaRangeMi: f(7, "mfr", "high", "Electric-only EPA range. Identical rating 2025–2026", epa(48659)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(48659)),
        mpgeElectric: f(48, "mfr", "high", undefined, epa(48659)),
        mpgeCombined: f(20, "mfr", "high", undefined, epa(48659)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(48659)),
      },
    }),
    ferrari("sf90-stradale-2021-22", "SF90 Stradale", [2021, 2022], 7.9, SF90_S, {
      modelAliases: ["SF90 Stradale Coupe"],
      range: {
        epaRangeMi: f(9, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2022", epa(44983)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(44983)),
        mpgeElectric: f(51, "mfr", "high", undefined, epa(44983)),
        mpgeCombined: f(20, "mfr", "high", undefined, epa(44983)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(44983)),
      },
    }),
    ferrari("sf90-stradale-2023-24", "SF90 Stradale", [2023, 2024], 7.9, SF90_S, {
      range: {
        epaRangeMi: f(9, "mfr", "high", "Electric-only EPA range. Identical rating 2023–2024", epa(47494)),
        epaRangeTotalMi: f(340, "mfr", "high", undefined, epa(47494)),
        mpgeElectric: f(51, "mfr", "high", undefined, epa(47494)),
        mpgeCombined: f(20, "mfr", "high", undefined, epa(47494)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(47494)),
      },
    }),
    ferrari("sf90-spider-2022-25", "SF90 Spider", [2022, 2025], 7.9, SF90_SP, {
      range: {
        epaRangeMi: f(8, "mfr", "high", "Electric-only EPA range. Identical rating 2022–2025", epa(48660)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(48660)),
        mpgeElectric: f(44, "mfr", "high", undefined, epa(48660)),
        mpgeCombined: f(19, "mfr", "high", undefined, epa(48660)),
        mpgGasoline: f(17, "mfr", "high", undefined, epa(48660)),
      },
    })
  );
}

// ──────────── LEGACY MAINSTREAM PHEVs (Ford, Hyundai, Subaru, BMW, MINI, Toyota) ─
// Older nameplates whose makers' press pages are partly retired — several
// facts cite the Internet Archive's copies of manufacturer pages. Three
// premise corrections from this research that the rows encode: the MINI
// pack grew at MY2020 (not 2021, per MINI USA's own words); the X3
// xDrive30e's net figure is BMW's 9.09 kWh (10.8 is the EU number); and
// "Crosstrek Hybrid" names THREE different cars — a 2014-16 conventional
// hybrid, the 2019-23 plug-in, and a 2026 conventional hybrid — so the
// Subaru rows are hard year-gated to the plug-in generation.
{
  const FUSION_2017_PR = "https://web.archive.org/web/2017/https://media.ford.com/content/fordmedia/fna/us/en/news/2016/01/11/ford-unveils-new-fusion.html";
  const FUSION_2019_PR = "https://web.archive.org/web/20250530052026/https://media.ford.com/content/fordmedia/fna/us/en/news/2018/03/20/sleeker-smarter-2019-ford-fusion.html";
  const FORD_ENERGI_WARRANTY_PR = "https://web.archive.org/web/20160204000330/https://media.ford.com/content/fordmedia/fna/us/en/news/2013/01/17/epa--new-ford-fusion-energi-delivers-620-mile-range--21-in-ev-mo.html";
  const CMAX_PDF = "https://web.archive.org/web/20211201143828/https://media.ford.com/content/dam/fordmedia/Asia%20Pacific/cn/2016/BJAS/Infographics/C-Max%20Energi_Auto%20China%202016.pdf";
  const FORD_ENERGI_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, FORD_ENERGI_WARRANTY_PR),
    batteryMiles: f(100_000, "mfr", "high", undefined, FORD_ENERGI_WARRANTY_PR),
  };
  const fusion = (id: string, years: [number, number], battery: EnrichmentRow["battery"], range: EnrichmentRow["range"]): EnrichmentRow => ({
    id,
    make: "FORD",
    model: "Fusion Energi",
    modelAliases: ["Fusion Energi Plug-in Hybrid", "Fusion Special Service PHEV"],
    modelYears: years,
    packVariant: "PHEV",
    battery,
    range,
    charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
    warranty: FORD_ENERGI_WARRANTY,
    abstains: { heatPump: HP_ABSTAIN },
  });
  const FUSION_76 = { packGrossKwh: f(7.6, "mfr", "high", undefined, FUSION_2017_PR) };
  R.push(
    fusion("fusion-energi-2013-16", [2013, 2016], FUSION_76, {
      epaRangeMi: f(20, "mfr", "high", "Electric-only EPA range. Identical rating 2013–2016", epa(36248)),
      epaRangeTotalMi: f(550, "mfr", "high", undefined, epa(36248)),
      mpgeElectric: f(88, "mfr", "high", undefined, epa(36248)),
      mpgeCombined: f(51, "mfr", "high", undefined, epa(36248)),
      mpgGasoline: f(38, "mfr", "high", undefined, epa(36248)),
    }),
    fusion("fusion-energi-2017", [2017, 2017], FUSION_76, {
      epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range", epa(37470)),
      epaRangeTotalMi: f(610, "mfr", "high", undefined, epa(37470)),
      mpgeElectric: f(97, "mfr", "high", undefined, epa(37470)),
      mpgeCombined: f(57, "mfr", "high", undefined, epa(37470)),
      mpgGasoline: f(42, "mfr", "high", undefined, epa(37470)),
    }),
    fusion("fusion-energi-2018", [2018, 2018], FUSION_76, {
      epaRangeMi: f(21, "mfr", "high", "Electric-only EPA range", epa(39408)),
      epaRangeTotalMi: f(610, "mfr", "high", undefined, epa(39408)),
      mpgeElectric: f(97, "mfr", "high", undefined, epa(39408)),
      mpgeCombined: f(57, "mfr", "high", undefined, epa(39408)),
      mpgGasoline: f(42, "mfr", "high", undefined, epa(39408)),
    }),
    fusion("fusion-energi-2019-20", [2019, 2020], { packGrossKwh: f(9, "mfr", "high", undefined, FUSION_2019_PR) }, {
      epaRangeMi: f(26, "mfr", "high", "Electric-only EPA range. Identical rating 2019–2020", epa(40809)),
      epaRangeTotalMi: f(610, "mfr", "high", undefined, epa(40809)),
      mpgeElectric: f(103, "mfr", "high", undefined, epa(40809)),
      mpgeCombined: f(61, "mfr", "high", undefined, epa(40809)),
      mpgGasoline: f(42, "mfr", "high", undefined, epa(40809)),
    }),
    {
      id: "cmax-energi-2013-16",
      make: "FORD",
      model: "C-Max Energi",
      modelAliases: ["C-MAX Energi", "C-Max Energi Plug-in Hybrid", "C-Max Energi Premium", "C-Max Energi Titanium", "C-Max Energi SEL"],
      modelYears: [2013, 2016],
      packVariant: "PHEV",
      // Ford-authored figure, but from its China-market infographic — the
      // only reachable Ford document stating the C-Max pack. Medium for that.
      battery: { packGrossKwh: f(7.6, "mfr", "medium", undefined, CMAX_PDF) },
      range: {
        epaRangeMi: f(20, "mfr", "high", "Electric-only EPA range. Identical rating 2013–2016", epa(33336)),
        epaRangeTotalMi: f(550, "mfr", "high", undefined, epa(33336)),
        mpgeElectric: f(88, "mfr", "high", undefined, epa(33336)),
        mpgeCombined: f(51, "mfr", "high", undefined, epa(33336)),
        mpgGasoline: f(38, "mfr", "high", undefined, epa(33336)),
      },
      charging: { acOnboardKw: f(3.3, "mfr", "medium", undefined, CMAX_PDF), portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: FORD_ENERGI_WARRANTY,
      abstains: { heatPump: HP_ABSTAIN },
    },
    {
      id: "cmax-energi-2017",
      make: "FORD",
      model: "C-Max Energi",
      modelAliases: ["C-MAX Energi", "C-MAX Energi Plug-In Hybrid"],
      modelYears: [2017, 2017],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(7.6, "mfr", "medium", undefined, CMAX_PDF) },
      range: {
        epaRangeMi: f(20, "mfr", "high", "Electric-only EPA range", epa(38506)),
        epaRangeTotalMi: f(570, "mfr", "high", undefined, epa(38506)),
        mpgeElectric: f(95, "mfr", "high", undefined, epa(38506)),
        mpgeCombined: f(54, "mfr", "high", undefined, epa(38506)),
        mpgGasoline: f(39, "mfr", "high", undefined, epa(38506)),
      },
      charging: { acOnboardKw: f(3.3, "mfr", "medium", undefined, CMAX_PDF), portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: FORD_ENERGI_WARRANTY,
      abstains: { heatPump: HP_ABSTAIN },
    }
  );

  const IONIQ_PR = "https://web.archive.org/web/20250910232754/https://www.hyundainews.com/en-us/releases/2450";
  const IONIQ_SPECS = "https://www.hyundainews.com/assets/documents/original/33114-2019IoniqSpecificationsPPReviewFINAL.pdf";
  const SONATA_PHEV_PR = "https://web.archive.org/web/20250910042518/https://www.hyundainews.com/en-us/releases/2083";
  const SONATA_SPECS = "https://www.hyundainews.com/assets/documents/original/33958-2019SonataHybridPlugInSpecifications81618.pdf";
  const HYUNDAI_LEGACY_WARRANTY_ABSTAIN = "Hyundai's era warranty documents for this model were not reachable this pass";
  const ioniq = (id: string, years: [number, number], range: EnrichmentRow["range"]): EnrichmentRow => ({
    id,
    make: "HYUNDAI",
    model: "Ioniq Plug-In Hybrid",
    modelAliases: ["Ioniq PHEV"],
    modelYears: years,
    packVariant: "PHEV",
    battery: { packGrossKwh: f(8.9, "mfr", "high", undefined, IONIQ_PR) },
    range,
    charging: { portStandard: J1772_EST, dcFastCharging: f<"none">("none", "mfr", "high", undefined, IONIQ_SPECS) },
    abstains: { batteryWarranty: HYUNDAI_LEGACY_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
  });
  // The per-MY warranty handbooks (read as page images — Hyundai's 2020/21
  // PDFs use a shifted font that breaks text extraction) settle the Ioniq
  // term at 10yr/100,000 for the Plug-in Hybrid Battery, MY2019–2022; the
  // MY2018 book is archived nowhere, so that year keeps its abstention.
  // Hyundai's famous "Lifetime" term attaches to the HYBRID battery in its
  // own handbook text — never the plug-in's.
  const HYUNDAI_HANDBOOK_20 = "https://www.hyundaiusa.com/content/dam/hyundai/us/com/pdf/assurance/2020_Owners_Handbook_Warranty_r2.pdf";
  const HYUNDAI_HANDBOOK_21 = "https://www.hyundaiusa.com/content/dam/hyundai/us/com/pdf/assurance/2021_Owners_Handbook_Warranty.pdf";
  const IONIQ_WARRANTY = (src: string) => ({
    batteryYears: f(10, "mfr", "high", "10 years/150,000 miles in CARB states", src),
    batteryMiles: f(100_000, "mfr", "high", undefined, src),
  });
  R.push(
    ioniq("ioniq-phev-2018", [2018, 2018], {
      epaRangeMi: f(29, "mfr", "high", "Electric-only EPA range", epa(39768)),
      epaRangeTotalMi: f(630, "mfr", "high", undefined, epa(39768)),
      mpgeElectric: f(119, "mfr", "high", undefined, epa(39768)),
      mpgeCombined: f(76, "mfr", "high", undefined, epa(39768)),
      mpgGasoline: f(52, "mfr", "high", undefined, epa(39768)),
    }),
    {
      ...ioniq("ioniq-phev-2019-20", [2019, 2020], {
        epaRangeMi: f(29, "mfr", "high", "Electric-only EPA range. Identical rating 2019–2020", epa(40810)),
        epaRangeTotalMi: f(630, "mfr", "high", undefined, epa(40810)),
        mpgeElectric: f(119, "mfr", "high", undefined, epa(40810)),
        mpgeCombined: f(76, "mfr", "high", undefined, epa(40810)),
        mpgGasoline: f(52, "mfr", "high", undefined, epa(40810)),
      }),
      warranty: IONIQ_WARRANTY(HYUNDAI_HANDBOOK_20),
      abstains: { heatPump: HP_ABSTAIN },
    },
    {
      ...ioniq("ioniq-phev-2021-22", [2021, 2022], {
        epaRangeMi: f(29, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2022", epa(43725)),
        epaRangeTotalMi: f(620, "mfr", "high", undefined, epa(43725)),
        mpgeElectric: f(119, "mfr", "high", undefined, epa(43725)),
        mpgeCombined: f(76, "mfr", "high", undefined, epa(43725)),
        mpgGasoline: f(52, "mfr", "high", undefined, epa(43725)),
      }),
      warranty: IONIQ_WARRANTY(HYUNDAI_HANDBOOK_21),
      abstains: { heatPump: HP_ABSTAIN },
    }
  );
  const sonata = (id: string, years: [number, number], range: EnrichmentRow["range"]): EnrichmentRow[] =>
    withAlt(
      {
        id,
        make: "HYUNDAI",
        model: "Sonata Plug-In Hybrid",
        modelAliases: ["Sonata PHEV"],
        modelYears: years,
        packVariant: "PHEV",
        battery: { packGrossKwh: f(9.8, "mfr", "high", undefined, SONATA_PHEV_PR) },
        range,
        charging: { acOnboardKw: f(3.3, "mfr", "high", undefined, SONATA_SPECS), portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
        abstains: { batteryWarranty: HYUNDAI_LEGACY_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
      },
      { model: "Sonata", trim: ["PHEV", "Plug-In Hybrid"] }
    );
  R.push(
    ...sonata("sonata-phev-2016", [2016, 2016], {
      epaRangeMi: f(27, "mfr", "high", "Electric-only EPA range", epa(36998)),
      epaRangeTotalMi: f(600, "mfr", "high", undefined, epa(36998)),
      mpgeElectric: f(99, "mfr", "high", undefined, epa(36998)),
      mpgeCombined: f(59, "mfr", "high", undefined, epa(36998)),
      mpgGasoline: f(40, "mfr", "high", undefined, epa(36998)),
    }),
    ...sonata("sonata-phev-2017", [2017, 2017], {
      epaRangeMi: f(27, "mfr", "high", "Electric-only EPA range", epa(38046)),
      epaRangeTotalMi: f(590, "mfr", "high", undefined, epa(38046)),
      mpgeElectric: f(99, "mfr", "high", undefined, epa(38046)),
      mpgeCombined: f(58, "mfr", "high", undefined, epa(38046)),
      mpgGasoline: f(39, "mfr", "high", undefined, epa(38046)),
    }),
    ...sonata("sonata-phev-2018-19", [2018, 2019], {
      epaRangeMi: f(28, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2019", epa(40066)),
      epaRangeTotalMi: f(600, "mfr", "high", undefined, epa(40066)),
      mpgeElectric: f(99, "mfr", "high", undefined, epa(40066)),
      mpgeCombined: f(59, "mfr", "high", undefined, epa(40066)),
      mpgGasoline: f(39, "mfr", "high", undefined, epa(40066)),
    })
  );

  const CROSSTREK_SPECS = "https://subarumedia.iconicweb.com/mediasite/attachments/2020_Crosstrek_Hybrid_Specs-FINAL.pdf";
  R.push(
    ...withAlt(
      {
        // Year-gated hard: "Crosstrek Hybrid" also names a 2014-16
        // conventional hybrid and a 2026 conventional hybrid; only 2019-2023
        // is the plug-in.
        id: "crosstrek-hybrid-2019-23",
        make: "SUBARU",
        model: "Crosstrek Hybrid",
        modelAliases: ["XV Crosstrek Hybrid"],
        modelYears: [2019, 2023],
        packVariant: "PHEV",
        battery: { packGrossKwh: f(8.8, "mfr", "high", undefined, CROSSTREK_SPECS) },
        range: {
          epaRangeMi: f(17, "mfr", "high", "Electric-only EPA range. Identical rating 2019–2023", epa(41134)),
          epaRangeTotalMi: f(480, "mfr", "high", undefined, epa(41134)),
          mpgeElectric: f(90, "mfr", "high", undefined, epa(41134)),
          mpgeCombined: f(46, "mfr", "high", undefined, epa(41134)),
          mpgGasoline: f(35, "mfr", "high", undefined, epa(41134)),
        },
        charging: {
          portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge", CROSSTREK_SPECS),
          dcFastCharging: NO_DCFC_EST,
        },
        abstains: {
          batteryWarranty: "Subaru's spec sheet and releases state no battery warranty term",
          heatPump: HP_ABSTAIN,
        },
      },
      { model: "Crosstrek", trim: ["Hybrid", "PHEV"] }
    )
  );

  const X3_30E_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0302314EN_US/the-2020-bmw-x3-xdrive30e-phev-sports-activity-vehicle?language=en_US";
  const BMW_X3_WARRANTY_BOOK = "https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/2020/5A0BC06_20MY_BMW_X1_X2_X3_X4_X5_X6_Warranty_FINAL_Print_withCover_043020.pdf";
  const BMW_I8_WARRANTY_2017 = "https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/2017/2017-BMW-i3-i8-NewVehicle-Limited-Warranty%20(BF08-2149193).pdf";
  const BMW_I8_WARRANTY_2019 = "https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/2019/2019-BMW-i8-NewVehicle-Limited-Warranty.pdf";
  const BMW_I8_WARRANTY_2020 = "https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/2020/2469760_20MY_BMW_i3_i8_Warranty_FINAL_Print_withCover_050420.pdf";
  const I8_2019_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0276421EN_US/the-first-ever-2019-bmw-i8-roadster-and-new-2019-bmw-i8-coupe?language=en_US";
  const BMW_LEGACY_ABSTAINS = {
    batteryWarranty: "BMW's own pages state both 8-year/80,000 and 8-year/100,000 for plug-in hybrids",
    heatPump: HP_ABSTAIN,
  };
  R.push(
    ...withAlt(
      {
        id: "x3-xdrive30e-2020-21",
        make: "BMW",
        model: "X3 xDrive30e",
        modelAliases: ["X3 PHEV", "X3 30e"],
        modelYears: [2020, 2021],
        packVariant: "PHEV",
        battery: {
          packGrossKwh: f(12, "mfr", "high", undefined, X3_30E_PR),
          packUsableKwh: f(9.09, "mfr", "high", undefined, X3_30E_PR),
        },
        range: {
          epaRangeMi: f(18, "mfr", "high", "Electric-only EPA range. Identical rating 2020–2021", epa(42524)),
          epaRangeTotalMi: f(340, "mfr", "high", undefined, epa(42524)),
          mpgeElectric: f(60, "mfr", "high", undefined, epa(42524)),
          mpgeCombined: f(32, "mfr", "high", undefined, epa(42524)),
          mpgGasoline: f(24, "mfr", "high", undefined, epa(42524)),
        },
        charging: { acOnboardKw: f(3.7, "mfr", "high", undefined, X3_30E_PR), portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
        // BMW's own MY2020 and MY2021 warranty books name the X3 xDrive30e's
        // high-voltage battery term explicitly — the general BMW-PHEV
        // 80k-vs-100k ambiguity does not apply here.
        warranty: {
          batteryYears: f(8, "mfr", "high", "15 years/150,000 miles TZEV coverage in CARB states", BMW_X3_WARRANTY_BOOK),
          batteryMiles: f(80_000, "mfr", "high", undefined, BMW_X3_WARRANTY_BOOK),
        },
        abstains: { heatPump: HP_ABSTAIN },
      },
      { model: "X3", trim: ["xDrive30e", "30e"] }
    ),
    {
      id: "i8-2014",
      make: "BMW",
      model: "i8",
      modelYears: [2014, 2014],
      packVariant: "PHEV",
      battery: {
        packGrossKwh: f(7.1, "mfr", "high", undefined, I8_2019_PR),
        packUsableKwh: f(5, "mfr", "high", undefined, I8_2019_PR),
      },
      range: {
        epaRangeMi: f(15, "mfr", "high", "Electric-only EPA range", epa(35599)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(35599)),
        mpgeElectric: f(76, "mfr", "high", undefined, epa(35599)),
        mpgeCombined: f(37, "mfr", "high", undefined, epa(35599)),
        mpgGasoline: f(28, "mfr", "high", undefined, epa(35599)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      abstains: BMW_LEGACY_ABSTAINS,
    },
    {
      // BMW's own i8 warranty books: 8yr/100,000 through MY2019, then
      // 8yr/80,000 for MY2020 — a real change, so the years split. The
      // MY2014 book was not found and that row keeps the abstention.
      id: "i8-2015-17",
      make: "BMW",
      model: "i8",
      modelYears: [2015, 2017],
      packVariant: "PHEV",
      battery: {
        packGrossKwh: f(7.1, "mfr", "high", undefined, I8_2019_PR),
        packUsableKwh: f(5, "mfr", "high", undefined, I8_2019_PR),
      },
      range: {
        epaRangeMi: f(15, "mfr", "high", "Electric-only EPA range. Identical rating 2015–2017", epa(37223)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(37223)),
        mpgeElectric: f(76, "mfr", "high", undefined, epa(37223)),
        mpgeCombined: f(37, "mfr", "high", undefined, epa(37223)),
        mpgGasoline: f(28, "mfr", "high", undefined, epa(37223)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: {
        batteryYears: f(8, "mfr", "high", undefined, BMW_I8_WARRANTY_2017),
        batteryMiles: f(100_000, "mfr", "high", undefined, BMW_I8_WARRANTY_2017),
      },
      abstains: { heatPump: HP_ABSTAIN },
    },
    {
      id: "i8-2019",
      make: "BMW",
      model: "i8",
      modelAliases: ["i8 Roadster", "i8 Coupe"],
      modelYears: [2019, 2019],
      packVariant: "PHEV",
      battery: {
        packGrossKwh: f(11.6, "mfr", "high", undefined, I8_2019_PR),
        packUsableKwh: f(9.4, "mfr", "high", undefined, I8_2019_PR),
      },
      range: {
        epaRangeMi: f(18, "mfr", "high", "Electric-only EPA range", epa(40079)),
        epaRangeTotalMi: f(320, "mfr", "high", undefined, epa(40079)),
        mpgeElectric: f(69, "mfr", "high", undefined, epa(40079)),
        mpgeCombined: f(36, "mfr", "high", undefined, epa(40079)),
        mpgGasoline: f(27, "mfr", "high", undefined, epa(40079)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: {
        batteryYears: f(8, "mfr", "high", undefined, BMW_I8_WARRANTY_2019),
        batteryMiles: f(100_000, "mfr", "high", undefined, BMW_I8_WARRANTY_2019),
      },
      abstains: { heatPump: HP_ABSTAIN },
    },
    {
      id: "i8-2020",
      make: "BMW",
      model: "i8",
      modelAliases: ["i8 Roadster", "i8 Coupe"],
      modelYears: [2020, 2020],
      packVariant: "PHEV",
      battery: {
        packGrossKwh: f(11.6, "mfr", "high", undefined, I8_2019_PR),
        packUsableKwh: f(9.4, "mfr", "high", undefined, I8_2019_PR),
      },
      range: {
        epaRangeMi: f(18, "mfr", "high", "Electric-only EPA range", epa(42369)),
        epaRangeTotalMi: f(320, "mfr", "high", undefined, epa(42369)),
        mpgeElectric: f(69, "mfr", "high", undefined, epa(42369)),
        mpgeCombined: f(36, "mfr", "high", undefined, epa(42369)),
        mpgGasoline: f(27, "mfr", "high", undefined, epa(42369)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: {
        batteryYears: f(8, "mfr", "high", "Capacity loss separately covered to 8 years/100,000 miles", BMW_I8_WARRANTY_2020),
        batteryMiles: f(80_000, "mfr", "high", undefined, BMW_I8_WARRANTY_2020),
      },
      abstains: { heatPump: HP_ABSTAIN },
    }
  );

  const MINI_2019_PR = "https://web.archive.org/web/20251106002645/https://www.miniusanews.com/newsrelease.do?mid=1&id=954";
  const MINI_WARRANTY_BOOK_18 = "https://www.miniusa.com/content/dam/mini/PDF/warranties/2018_MINI_New_Passenger_Car_Limited_Warranty.pdf";
  const MINI_WARRANTY_BOOK_20 = "https://www.miniusa.com/content/dam/mini/PDF/warranties/2020_MINI_Warranty.pdf";
  const MINI_WARRANTY = (src: string) => ({
    batteryYears: f(8, "mfr", "high", undefined, src),
    batteryMiles: f(80_000, "mfr", "high", undefined, src),
  });
  const MINI_2021_PR = "https://www.press.bmwgroup.com/usa/article/detail/T0309374EN_US/model-year-2021-mini-lineup-pricing-and-equipment-updates?language=en_US";
  const MINI_ALIASES = ["Cooper S E Countryman ALL4", "Cooper SE Countryman All4", "Countryman Plug-In Hybrid"];
  R.push(
    {
      id: "mini-countryman-phev-2018-19",
      make: "MINI",
      model: "Cooper SE Countryman ALL4",
      modelAliases: MINI_ALIASES,
      modelYears: [2018, 2019],
      packVariant: "PHEV",
      battery: { packUsableKwh: f(7.6, "mfr", "high", "Net capacity, as MINI states it", MINI_2019_PR) },
      range: {
        epaRangeMi: f(12, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2019", epa(38863)),
        epaRangeTotalMi: f(270, "mfr", "high", undefined, epa(38863)),
        mpgeElectric: f(65, "mfr", "high", undefined, epa(38863)),
        mpgeCombined: f(33, "mfr", "high", undefined, epa(38863)),
        mpgGasoline: f(27, "mfr", "high", undefined, epa(38863)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: MINI_WARRANTY(MINI_WARRANTY_BOOK_18),
      abstains: { heatPump: HP_ABSTAIN },
    },
    {
      id: "mini-countryman-phev-2020-23",
      make: "MINI",
      model: "Cooper SE Countryman ALL4",
      modelAliases: MINI_ALIASES,
      modelYears: [2020, 2023],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(10, "mfr", "high", "Grew from 7.6 kWh at MY2020", MINI_2021_PR) },
      range: {
        epaRangeMi: f(18, "mfr", "high", "Electric-only EPA range. Identical rating 2020–2023", epa(42371)),
        epaRangeTotalMi: f(300, "mfr", "high", undefined, epa(42371)),
        mpgeElectric: f(73, "mfr", "high", undefined, epa(42371)),
        mpgeCombined: f(39, "mfr", "high", undefined, epa(42371)),
        mpgGasoline: f(29, "mfr", "high", undefined, epa(42371)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: MINI_WARRANTY(MINI_WARRANTY_BOOK_20),
      abstains: { heatPump: HP_ABSTAIN },
    }
  );

  const PRIUS_GEN1_PR = "https://pressroom.toyota.com/toyota-introduces-2012-prius-plug-in-hybrid/";
  R.push({
    id: "prius-plugin-2012-15",
    make: "TOYOTA",
    model: "Prius Plug-In Hybrid",
    modelAliases: ["PRIUS PLUG-IN", "Prius Plug-in"],
    modelYears: [2012, 2015],
    packVariant: "PHEV",
    battery: { packGrossKwh: f(4.4, "mfr", "high", undefined, PRIUS_GEN1_PR) },
    range: {
      epaRangeMi: f(11, "mfr", "high", "Electric-only EPA range. Identical rating 2012–2015", epa(32484)),
      epaRangeTotalMi: f(540, "mfr", "high", undefined, epa(32484)),
      mpgeElectric: f(95, "mfr", "high", undefined, epa(32484)),
      mpgeCombined: f(58, "mfr", "high", undefined, epa(32484)),
      mpgGasoline: f(50, "mfr", "high", undefined, epa(32484)),
    },
    charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
    abstains: {
      batteryWarranty: "Toyota's 2012 release covers hybrid components; a battery-specific term could not be re-verified",
      heatPump: HP_ABSTAIN,
    },
  });
}

// ──────────── KARMA / FISKER / CADILLAC ELR & CT6 / POLESTAR 1 ─────────────
// Low-volume cars, mostly retired makers — the citations point at the
// Internet Archive's copies of manufacturer brochures and pressrooms. Karma
// is the surprise DC story: 40 kW fast charging on the first Revero, 45 kW
// (CCS, stated by the live MY25 brochure) after. The GM and Fisker DC
// negatives are control-tested keyword absences across owner documents, not
// maker statements — est, not mfr. GM never publishes an onboard-charger kW
// for the ELR/CT6 (volts, amps and hours only) and neither does Polestar,
// so those fields stay empty rather than carry the numbers that circulate.
// A 2015 ELR row exists on purpose: GM's own 2015 owner manual and warranty
// booklet and an EPA record all exist, so "no 2015 ELR" did not survive
// checking.
{
  const REVERO_BROCHURE = "https://web.archive.org/web/20170204022808id_/https://www.karmaautomotive.com/_ui/docs/Karma-Revero-Brochure.pdf";
  const REVERO_GT_BROCHURE = "https://web.archive.org/web/20211228193229id_/https://www.karmaautomotive.com/_ui/docs/Karma-Reverogt-Brochure.pdf";
  const GS6_PR = "https://www.prnewswire.com/news-releases/karma-automotive-launches-gs-6-series-...-301232137.html";
  const REVERO_25_BROCHURE = "https://karmaautomotive.com/wp-content/uploads/2025/07/MY25_REVERO_BROCHURE.pdf";
  const KARMA_WARRANTY_ABSTAIN = "Karma publishes powertrain and vehicle terms but no battery-specific warranty";
  R.push(
    {
      id: "revero-2018-19",
      make: "KARMA",
      model: "Revero",
      modelYears: [2018, 2019],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(21.4, "mfr", "high", undefined, REVERO_BROCHURE) },
      range: {
        epaRangeMi: f(37, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2019", epa(39409)),
        epaRangeTotalMi: f(240, "mfr", "high", undefined, epa(39409)),
        mpgeElectric: f(60, "mfr", "high", undefined, epa(39409)),
        mpgeCombined: f(35, "mfr", "high", undefined, epa(39409)),
        mpgGasoline: f(20, "mfr", "high", undefined, epa(39409)),
      },
      charging: {
        acOnboardKw: f(6.6, "mfr", "high", undefined, REVERO_BROCHURE),
        portStandard: J1772_EST,
        dcFastCharging: f<"standard">("standard", "mfr", "high", "80% in about 24 minutes; connector unstated", REVERO_BROCHURE),
        dcPeakKw: f(40, "mfr", "high", undefined, REVERO_BROCHURE),
      },
      abstains: { batteryWarranty: KARMA_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "revero-gt-2020-21",
      make: "KARMA",
      model: "Revero GT",
      modelAliases: ["Revero"],
      modelYears: [2020, 2021],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(28, "mfr", "high", undefined, REVERO_GT_BROCHURE) },
      range: {
        epaRangeMi: f(61, "mfr", "high", "21-inch wheels", epa(42291)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(42291)),
        mpgeElectric: f(70, "mfr", "high", undefined, epa(42291)),
        mpgeCombined: f(52, "mfr", "high", undefined, epa(42291)),
        mpgGasoline: f(26, "mfr", "high", undefined, epa(42291)),
      },
      charging: {
        acOnboardKw: f(6.6, "mfr", "high", undefined, REVERO_GT_BROCHURE),
        portStandard: J1772_EST,
        dcFastCharging: f<"standard">("standard", "mfr", "high", "90% in about 34 minutes", REVERO_GT_BROCHURE),
        dcPeakKw: f(45, "mfr", "high", undefined, REVERO_GT_BROCHURE),
      },
      abstains: { batteryWarranty: KARMA_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      id: "karma-gs6-2021-22",
      make: "KARMA",
      model: "GS-6",
      modelAliases: ["GS-6 Series", "GS6"],
      modelYears: [2021, 2022],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(28, "mfr", "medium", undefined, GS6_PR) },
      range: {
        epaRangeMi: f(61, "mfr", "high", "21-inch wheels", epa(43606)),
        epaRangeTotalMi: f(330, "mfr", "high", undefined, epa(43606)),
        mpgeElectric: f(70, "mfr", "high", undefined, epa(43606)),
        mpgeCombined: f(52, "mfr", "high", undefined, epa(43606)),
        mpgGasoline: f(26, "mfr", "high", undefined, epa(43606)),
      },
      charging: {
        acOnboardKw: f(6.6, "mfr", "medium", undefined, GS6_PR),
        portStandard: J1772_EST,
        dcFastCharging: f<"standard">("standard", "mfr", "medium", "90% in about 34 minutes", GS6_PR),
        dcPeakKw: f(45, "mfr", "medium", undefined, GS6_PR),
      },
      abstains: { batteryWarranty: KARMA_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    },
    {
      // The relaunched MY2025 Revero: pack and charging from Karma's live
      // brochure; no EPA record exists yet, so range abstains.
      id: "revero-2025",
      make: "KARMA",
      model: "Revero",
      modelYears: [2025, 2025],
      packVariant: "PHEV",
      battery: {
        packGrossKwh: f(28, "mfr", "high", undefined, REVERO_25_BROCHURE),
        chemistry: f<"LFP">("LFP", "mfr", "high", undefined, REVERO_25_BROCHURE),
      },
      charging: {
        acOnboardKw: f(6.6, "mfr", "high", undefined, REVERO_25_BROCHURE),
        portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, REVERO_25_BROCHURE),
        dcFastCharging: f<"standard">("standard", "mfr", "high", "90% in about 34 minutes", REVERO_25_BROCHURE),
        dcPeakKw: f(45, "mfr", "high", undefined, REVERO_25_BROCHURE),
      },
      abstains: {
        epaRangeMi: "fueleconomy holds no rating for the relaunched 2025 Revero yet",
        batteryWarranty: "Karma states a 4-year unlimited-mile vehicle warranty with no battery term",
        heatPump: HP_ABSTAIN,
      },
    },
    {
      id: "fisker-karma-2012",
      make: "FISKER",
      model: "Karma",
      modelYears: [2012, 2012],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(20.1, "mfr", "high", undefined, "https://web.archive.org/web/20120425091956id_/http://www.fiskerautomotive.com/Content/pdf/Fisker_Karma_Specs.pdf") },
      range: {
        epaRangeMi: f(33, "mfr", "high", "Electric-only EPA range", epa(32516)),
        epaRangeTotalMi: f(240, "mfr", "high", undefined, epa(32516)),
        mpgeElectric: f(54, "mfr", "high", undefined, epa(32516)),
        mpgeCombined: f(33, "mfr", "high", undefined, epa(32516)),
        mpgGasoline: f(20, "mfr", "high", undefined, epa(32516)),
      },
      charging: {
        acOnboardKw: f(3.3, "mfr", "high", undefined, "https://web.archive.org/web/20120425091956id_/http://www.fiskerautomotive.com/Content/pdf/Fisker_Karma_Specs.pdf"),
        portStandard: J1772_EST,
        dcFastCharging: NO_DCFC_EST,
      },
      abstains: {
        batteryWarranty: "Fisker published a bumper-to-bumper term only, never a battery-specific one",
        heatPump: HP_ABSTAIN,
      },
    }
  );

  const ELR_2013_PR = "https://web.archive.org/web/20130118233734id_/http://media.gm.com:80/content/media/us/en/cadillac/news.detail.html/content/Pages/news/us/en/2013/Jan/13naias/elr/0115_elr.html";
  const ELR_2016_PAGE = "https://web.archive.org/web/20160212014227id_/http://media.cadillac.com/media/us/en/cadillac/vehicles/elr/2016.tab1.html";
  const CT6_2017_PAGE = "https://web.archive.org/web/20170622232824id_/http://media.cadillac.com/media/us/en/cadillac/vehicles/ct6-plugin/2017.html";
  const ELR_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, ELR_2013_PR),
    batteryMiles: f(100_000, "mfr", "high", undefined, ELR_2013_PR),
  };
  R.push(
    {
      id: "elr-2014-15",
      make: "CADILLAC",
      model: "ELR",
      modelYears: [2014, 2015],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(16.5, "mfr", "high", undefined, ELR_2013_PR) },
      range: {
        epaRangeMi: f(37, "mfr", "high", "Electric-only EPA range. Identical rating 2014–2015", epa(34770)),
        epaRangeTotalMi: f(340, "mfr", "high", undefined, epa(34770)),
        mpgeElectric: f(82, "mfr", "high", undefined, epa(34770)),
        mpgeCombined: f(54, "mfr", "high", undefined, epa(34770)),
        mpgGasoline: f(33, "mfr", "high", undefined, epa(34770)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: ELR_WARRANTY,
      abstains: { heatPump: HP_ABSTAIN },
    },
    {
      id: "elr-2016",
      make: "CADILLAC",
      model: "ELR",
      modelYears: [2016, 2016],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(17.1, "mfr", "high", undefined, ELR_2016_PAGE) },
      range: {
        epaRangeMi: f(40, "mfr", "high", "Electric-only EPA range; the Sport rates 36", epa(36862)),
        epaRangeTotalMi: f(340, "mfr", "high", undefined, epa(36862)),
        mpgeElectric: f(85, "mfr", "high", undefined, epa(36862)),
        mpgeCombined: f(55, "mfr", "high", undefined, epa(36862)),
        mpgGasoline: f(32, "mfr", "high", undefined, epa(36862)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      warranty: {
        batteryYears: f(8, "mfr", "high", "10 years/150,000 miles in ARB states", "https://web.archive.org/web/20160212032825id_/http://media.cadillac.com/media/us/en/cadillac/vehicles/elr/2016.detail.html/content/Pages/news/us/en/2015/apr/0415-elr.html"),
        batteryMiles: f(100_000, "mfr", "high", undefined, ELR_2013_PR),
      },
      abstains: { heatPump: HP_ABSTAIN },
    },
    {
      id: "ct6-plugin-2017",
      make: "CADILLAC",
      model: "CT6 Plug-In",
      modelAliases: ["CT6 PLUG-IN", "CT6 Plug-In Hybrid"],
      modelYears: [2017, 2017],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(18.4, "mfr", "high", "GM says about 75 percent is usable", CT6_2017_PAGE) },
      range: {
        epaRangeMi: f(31, "mfr", "high", "Electric-only EPA range", epa(38650)),
        epaRangeTotalMi: f(440, "mfr", "high", undefined, epa(38650)),
        mpgeElectric: f(62, "mfr", "high", undefined, epa(38650)),
        mpgeCombined: f(39, "mfr", "high", undefined, epa(38650)),
        mpgGasoline: f(26, "mfr", "high", undefined, epa(38650)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      abstains: {
        batteryWarranty: "No CT6 Plug-In warranty booklet is live or archived with a battery term",
        heatPump: HP_ABSTAIN,
      },
    },
    {
      id: "ct6-plugin-2018",
      make: "CADILLAC",
      model: "CT6 Plug-In",
      modelAliases: ["CT6 PLUG-IN", "CT6 Plug-In Hybrid"],
      modelYears: [2018, 2018],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(18.4, "mfr", "high", "GM says about 75 percent is usable", CT6_2017_PAGE) },
      range: {
        epaRangeMi: f(31, "mfr", "high", "Electric-only EPA range", epa(39767)),
        epaRangeTotalMi: f(430, "mfr", "high", undefined, epa(39767)),
        mpgeElectric: f(62, "mfr", "high", undefined, epa(39767)),
        mpgeCombined: f(39, "mfr", "high", undefined, epa(39767)),
        mpgGasoline: f(25, "mfr", "high", undefined, epa(39767)),
      },
      charging: { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST },
      abstains: {
        batteryWarranty: "No CT6 Plug-In warranty booklet is live or archived with a battery term",
        heatPump: HP_ABSTAIN,
      },
    },
    {
      id: "polestar-1-2020-21",
      make: "POLESTAR",
      model: "Polestar 1",
      modelAliases: ["1"],
      modelYears: [2020, 2021],
      packVariant: "PHEV",
      battery: { packGrossKwh: f(34, "mfr", "high", undefined, "https://www.polestar.com/us/polestar-1/performance/") },
      range: {
        epaRangeMi: f(52, "mfr", "high", "Electric-only EPA range. Identical rating 2020–2021", epa(42744)),
        epaRangeTotalMi: f(470, "mfr", "high", undefined, epa(42744)),
        mpgeElectric: f(58, "mfr", "high", undefined, epa(42744)),
        mpgeCombined: f(45, "mfr", "high", undefined, epa(42744)),
        mpgGasoline: f(26, "mfr", "high", undefined, epa(42744)),
      },
      charging: {
        portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, "https://www.polestar.com/us/manual/polestar-1/2021/article/f87875428a149e93c0a801515ca819a7/"),
        dcFastCharging: f<"standard">("standard", "mfr", "high", "CCS; Polestar publishes no peak kW", "https://www.polestar.com/us/manual/polestar-1/2021/article/f87875428a149e93c0a801515ca819a7/"),
      },
      warranty: {
        batteryYears: f(8, "mfr", "high", undefined, "https://web.archive.org/web/20210613144907id_/https://www.polestar.com/us/service-and-assistance/car-warranty"),
        batteryMiles: f(100_000, "mfr", "high", undefined, "https://web.archive.org/web/20210613144907id_/https://www.polestar.com/us/service-and-assistance/car-warranty"),
        sohFloorPct: f(70, "mfr", "high", undefined, "https://web.archive.org/web/20210613144907id_/https://www.polestar.com/us/service-and-assistance/car-warranty"),
      },
      abstains: { heatPump: HP_ABSTAIN },
    }
  );
}

export const RESEARCH_ROWS_6: EnrichmentRow[] = R;
