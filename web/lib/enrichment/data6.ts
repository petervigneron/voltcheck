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
// the same rows. Bare "XC90"/"XC60" (a handful of listings) stay unmatched:
// their T8 trims ("T8 Plus 7-Seater") can't be keyed with the 2-character
// "T8" token the trim matcher requires exact, and a mild-hybrid B5/B6 wears
// the same bare nameplate.
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
    modelAliases: ["RAV4 PLUG-IN", "RAV4 PHEV"],
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

  const bmw = (row: EnrichmentRow): EnrichmentRow => ({
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

export const RESEARCH_ROWS_6: EnrichmentRow[] = R;
