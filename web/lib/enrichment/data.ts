import type { EnrichmentRow, Fact, Source } from "../types";

// Seed corpus. Every value here was checked against the sources cited in
// docs/ENRICHMENT-SCHEMA.md (researched August 2026). Sparse rows are
// deliberate: a missing field renders as "unknown", never as a guess.
const AS_OF = "2026-08-09";

function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

export const ENRICHMENT_ROWS: EnrichmentRow[] = [
  // ── Tesla Model Y — "AWD" (279 mi) is not "Long Range AWD" (330 mi), and
  // listings routinely blur the two. EPA figures verified against
  // fueleconomy.gov's API 2026-08-09.
  {
    id: "model-y-lr-awd-2022-23",
    make: "TESLA",
    model: "Model Y",
    modelYears: [2022, 2023],
    trim: "Long Range AWD",
    packVariant: "2170",
    battery: {
      packUsableKwh: f(76.5, "est", "medium", "~75–78 kWh; Tesla publishes no usable figure — from BMS logs and teardowns"),
      chemistry: f("NCA", "mfr"),
    },
    range: { epaRangeMi: f(330, "mfr", "high", "Official EPA rating for 'Model Y Long Range AWD'", "https://www.fueleconomy.gov"), testedRangeMi: f(276, "tested", "high", "70-mph test (InsideEVs, 2020 LR AWD): 276 mi; 75-mph (Car and Driver): 220; Edmunds mixed loop (2021): 317. Test cars were EPA 316–326") },
    charging: {
      portStandard: f("NACS", "mfr"),
      superchargerAccess: f("native", "mfr"),
    },
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(120_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr"),
    },
    buyerNotes: [
      {
        headline: "FSD does not follow the car",
        body: "Tesla ended car-to-car FSD transfer 31 Mar 2026, and Luxe-bundle FSD became non-transferable 14 Feb 2026. A car can demo FSD on the test drive and lose it at title transfer. Ask whether FSD was purchased outright and confirm what survives resale in writing.",
        severity: "warning",
      },
    ],
  },
  {
    id: "model-y-awd-4680-2022-23",
    make: "TESLA",
    model: "Model Y",
    modelYears: [2022, 2023],
    trim: "AWD",
    packVariant: "4680",
    plant: "A",
    battery: {
      packUsableKwh: f(67.5, "est", "medium", "~67–68 kWh; Tesla publishes no usable figure — from BMS logs and teardowns"),
      chemistry: f("NCA", "mfr"),
    },
    range: { epaRangeMi: f(279, "mfr", "high", "Official EPA rating for 'Model Y AWD' — a distinct trim from Long Range AWD", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr"),
      superchargerAccess: f("native", "mfr"),
    },
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(120_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr"),
    },
    buyerNotes: [
      {
        headline: "This is the 279-mile ‘Model Y AWD’, not the 330-mile Long Range",
        body: "Tesla’s ‘Model Y AWD’ (279 mi EPA, ~67–68 kWh battery) is a different, cheaper car than the ‘Long Range AWD’ (330 mi, ~75–78 kWh) — and used listings constantly blur the two names. 51 miles of range are at stake at the same asking price.",
        severity: "trap",
        learnMore:
          "In 2022–23 Tesla quietly sold two AWD Model Ys. The ‘Long Range AWD’ has about 75–78 kWh of usable battery and an official EPA rating of 330 miles. The plain ‘Model Y AWD’ — built in Austin with Tesla’s newer 4680 cells — holds about 67–68 kWh and is rated 279 miles. The names differ by one word, dealers frequently list the 279-mile car as ‘Long Range,’ and nothing on the car’s body tells you which is which. How to be sure: the 11th character of the VIN is the factory. F (Fremont) can only be the 330-mile car. A (Austin) could be either — Austin built both — so for an Austin VIN, ask for the window sticker or the EPA label on the door jamb, which names the exact trim. The range figures here are official EPA ratings (we verified them against the EPA’s own database); the usable-kWh figures are community teardown measurements, which is why we mark them as estimates.",
      },
      {
        headline: "FSD does not follow the car",
        body: "Tesla ended car-to-car FSD transfer 31 Mar 2026, and Luxe-bundle FSD became non-transferable 14 Feb 2026. Ask whether FSD was purchased outright and confirm what survives resale in writing.",
        severity: "warning",
      },
    ],
  },
  {
    id: "model-y-lr-awd-2024",
    make: "TESLA",
    model: "Model Y",
    modelYears: [2024, 2024],
    trim: "Long Range AWD",
    battery: {
      packUsableKwh: f(76.5, "est", "medium", "~75–78 kWh; Tesla publishes no usable figure — from BMS logs and teardowns"),
      chemistry: f("NCA", "mfr"),
    },
    range: { epaRangeMi: f(310, "mfr", "high", "Official 2024 EPA rating (308 for the AWD-I motor variant) — note this is lower than the 330 often quoted from 2022–23", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr"),
      superchargerAccess: f("native", "mfr"),
    },
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(120_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr"),
    },
    buyerNotes: [
      {
        headline: "Rated 310 miles — not the 330 the model name earned in earlier years",
        body: "For 2024 the Long Range AWD’s official EPA rating is 310 miles (308 for the AWD-I motor variant). Spec sheets and listings often still quote the 2022–23 figure of 330. Verified against the EPA’s database.",
        severity: "info",
      },
      {
        headline: "FSD does not follow the car",
        body: "Tesla ended car-to-car FSD transfer 31 Mar 2026, and Luxe-bundle FSD became non-transferable 14 Feb 2026. Ask whether FSD was purchased outright and confirm what survives resale in writing.",
        severity: "warning",
      },
    ],
  },

  // ── Tesla Model 3 — the 2020 heat-pump split ──
  {
    id: "model-3-2020",
    make: "TESLA",
    model: "Model 3",
    modelYears: [2020, 2020],
    thermal: { heatPump: f("none", "mfr", "high", "Heat pump arrived with the 2021 refresh, built from ~14 Sept 2020") },
    charging: { portStandard: f("NACS", "mfr"), superchargerAccess: f("native", "mfr") },
    buyerNotes: [
      {
        headline: "A car titled 2020 may still be a 2021 build",
        body: "The 2021 refresh (heat pump included) started production ~14 Sept 2020, so late \"2020\" cars vary. VIN position 10 settles it: L = MY2020 (no heat pump), M = MY2021 (heat pump). Winter range difference is substantial.",
        severity: "trap",
        learnMore:
          "A heat pump warms the cabin far more efficiently than the resistive heater it replaced, and in cold weather that can be the difference between losing a quarter of your range and losing far less. Tesla added it with the Model 3’s 2021 refresh, which started production around September 14, 2020 — so cars sold and titled as ‘2020’ split into two groups depending on when they were built. How we know which is which: the 10th character of the VIN encodes the true model year (L = 2020, no heat pump; M = 2021, heat pump), regardless of what the title says. That character is on every listing’s VIN, so you don’t have to take anyone’s word for it.",
      },
    ],
  },
  {
    id: "model-3-2021-plus",
    make: "TESLA",
    model: "Model 3",
    modelYears: [2021, 2026],
    thermal: { heatPump: f("standard", "mfr") },
    charging: { portStandard: f("NACS", "mfr"), superchargerAccess: f("native", "mfr") },
  },

  // ── Chevrolet Bolt — DC fast charging was a $750 option ──
  {
    id: "bolt-ev-2017-2020",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2017, 2020],
    range: { epaRangeMi: f(238, "mfr", "high", "2017–19: 238; 2020: 259 — EPA figures", "https://www.fueleconomy.gov"), testedRangeMi: f(226, "tested", "high", "70-mph (InsideEVs, 2020): 226 mi; 75-mph (C&D): 220") },
    charging: {
      dcFastCharging: f("optional", "mfr", "high", "RPO code CBT, $750 standalone option — optional on BOTH trims through MY2020"),
      portStandard: f("CCS1", "mfr", "high", "Only when the CBT option is present; without it the car is AC-only"),
    },
    thermal: { heatPump: f("none", "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "GM booklet: \u201ctransferable at no cost to any subsequent person(s)\u201d (verified via extracted booklet text)"),
    },
    buyerNotes: [
      {
        headline: "This car may not be able to fast-charge at all",
        body: "DC fast charging was a $750 option (RPO CBT) on both trims through MY2020, and it is not retrofittable at sensible cost. Check any straight-on charge-port photo: CCS cars show two large DC pins behind a hinged flap below the J1772 ring; non-CCS cars show a plain blank oval. Corroborate with the RPO sticker in the glovebox (code CBT).",
        severity: "trap",
        resolvedBy: "photo_dcfc",
        learnMore:
          "Every Bolt can charge at home or at public Level 2 stations. But the ability to use DC fast chargers — the road-trip kind — was a $750 factory option through 2020, and many buyers skipped it. If the first owner didn’t order it, the car physically lacks the hardware, and adding it later means new port wiring and contactors, not a software unlock: effectively, it’s permanent. How to tell: look at the charge-port photo in any listing. Fast-charge cars show two large pins behind a small flap below the round connector; cars without it show a smooth blank oval. The order code (CBT) also appears on the sticker inside the glovebox. Dealers frequently don’t know this about their own inventory, which is exactly why we check the photo.",
      },
      {
        headline: "The battery may be newer than the car — check the GM program number",
        body: "Under recall 21V560, 2017–2019 cars mostly received new modules with the later chemistry (~+8% capacity; the EPA label was never re-rated). Ask for campaign history from GM's owner centre and look for GM program N212343880/N212343881 (new modules/pack) vs N212343883 (software only). \"21V560 complete\" alone is meaningless. A battery-warranty mileage cap above 100,000 is an independent fingerprint of a replaced pack.",
        severity: "info",
        resolvedBy: "campaign_check",
      },
      {
        headline: "No capacity floor on this battery warranty \u2014 verified",
        body: "GM's Bolt-era booklet sets no percentage trigger at all; it says the battery \u201cmay degrade as little as 10% to as much as 40% of capacity over the warranty period\u201d and covers defects, not degradation. One upside, also verified: batteries replaced under the recall got a fresh 8-year/100k parts warranty from the replacement date (GM bulletin 22-NA-119).",
        severity: "warning",
      },
    ],
  },
  {
    id: "bolt-ev-2021-lt",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2021, 2021],
    trim: "LT",
    range: { epaRangeMi: f(259, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      dcFastCharging: f("optional", "mfr", "high", "RPO CBT still optional on LT in MY2021; standard on Premier"),
    },
    thermal: { heatPump: f("none", "mfr") },
    warranty: { batteryYears: f(8, "mfr"), batteryMiles: f(100_000, "mfr"), batteryTransfers: f(true, "mfr", "high", "GM booklet: \u201ctransferable at no cost to any subsequent person(s)\u201d (verified via extracted booklet text)") },
    buyerNotes: [
      {
        headline: "LT trim: fast charging still optional this year",
        body: "MY2021 made DCFC standard on Premier only. On an LT, verify from the charge-port photo (DC pins + flap vs blank oval) or the glovebox RPO sticker (CBT).",
        severity: "trap",
        resolvedBy: "photo_dcfc",
      },
      {
        headline: "2020–22 packs are mostly original — check the GM program number",
        body: "GM made diagnostic software the default 21V560 remedy for 2020–22 cars in mid-2023 (N212343883), so most kept their original packs. Campaign history from GM's owner centre, filtered by GM program number, is the truth; recall-complete status alone is not.",
        severity: "info",
        resolvedBy: "campaign_check",
      },
    ],
  },
  {
    id: "bolt-ev-2021-premier",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2021, 2021],
    trim: "Premier",
    range: { epaRangeMi: f(259, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov") },
    charging: { dcFastCharging: f("standard", "mfr") },
    thermal: { heatPump: f("none", "mfr") },
    warranty: { batteryYears: f(8, "mfr"), batteryMiles: f(100_000, "mfr"), batteryTransfers: f(true, "mfr", "high", "GM booklet: \u201ctransferable at no cost to any subsequent person(s)\u201d (verified via extracted booklet text)") },
  },
  {
    id: "bolt-2022-plus",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2022, 2023],
    range: { epaRangeMi: f(259, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov"), testedRangeMi: f(260, "tested", "high", "70-mph (InsideEVs, 2022): 260 mi; Edmunds mixed loop: 278") },
    charging: { dcFastCharging: f("standard", "mfr"), portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: f("none", "mfr") },
    warranty: { batteryYears: f(8, "mfr"), batteryMiles: f(100_000, "mfr"), batteryTransfers: f(true, "mfr", "high", "GM booklet: \u201ctransferable at no cost to any subsequent person(s)\u201d (verified via extracted booklet text)") },
    buyerNotes: [
      {
        headline: "2020–22 packs are mostly original — check the GM program number",
        body: "GM made diagnostic software the default 21V560 remedy for 2020–22 cars in mid-2023 (N212343883), so most kept their original packs. Campaign history from GM's owner centre, filtered by GM program number, is the truth; recall-complete status alone is not.",
        severity: "info",
        resolvedBy: "campaign_check",
      },
    ],
  },

  // ── Hyundai Ioniq 5 — ICCU and the warranty most sites state wrong ──
  {
    id: "ioniq5-2022",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2022, 2022],
    battery: { packGrossKwh: f(77.4, "mfr", "medium", "Long-range pack; Hyundai publishes one figure and does not say gross or usable. SE Standard Range is 58 kWh.") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: {
      heatPump: f("awd_only", "mfr", "high", "MY2022: standard on AWD only — RWD cars have no heat pump"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
    buyerNotes: [
      {
        headline: "RWD cars have no heat pump this model year",
        body: "For MY2022 the heat pump is standard on AWD only. Two Ioniq 5s with the same badge differ in winter range. Check the drivetrain before assuming.",
        severity: "trap",
        resolvedBy: "config_resolved",
      },
      {
        headline: "ICCU failure risk — but coverage now runs 15yr/180k",
        body: "The E-GMP charging control unit (ICCU) can fail (P1A9096, 12V charging stops, possible limp mode; NHTSA 24V204/24V200/24V868). In April 2026 Hyundai extended ICCU coverage to 15 years / 180,000 miles — recent enough that no listing site reflects it. Whether the extension transfers to a second owner is undocumented: get it in writing against this VIN.",
        severity: "warning",
      },
      {
        headline: "The battery warranty transfers — most sites say otherwise",
        body: "Aggregators routinely conflate Hyundai's original-owner-only powertrain warranty with the HV battery & EV system coverage, which transfers in full (10yr/100k, 70% SOH floor). On-board charger, BMS, and traction motor are under the transferable coverage.",
        severity: "info",
      },
    ],
  },

  // ── Kia EV6 — the heat pump is a factory option, not a trim feature ──
  {
    id: "ev6-2022-2024",
    make: "KIA",
    model: "EV6",
    modelYears: [2022, 2024],
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: {
      heatPump: f("optional", "mfr", "high", "Factory option: unavailable on Light, optional on Wind and GT-Line, standard only on GT"),
      heatPumpByTrim: { GT: "standard", LIGHT: "none" },
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "Kia manual: everything except the Power Train (Original Owner) warranty is fully transferable"),
      powertrainTransfers: f(false, "mfr"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
    buyerNotes: [
      {
        headline: "Two identical-looking EV6s can differ on the heat pump",
        body: "The heat pump was a standalone factory option on Wind and GT-Line (unavailable on Light, standard on GT). The window sticker is the only authority — ask for it.",
        severity: "trap",
        resolvedBy: "config_resolved",
      },
      {
        headline: "ICCU failure risk — but coverage now runs 15yr/180k",
        body: "The E-GMP ICCU can fail and strand the car (NHTSA 24V204/24V200/24V868). Kia extended ICCU coverage to 15 years / 180,000 miles in April 2026. Whether the extension transfers is undocumented: get it in writing against this VIN.",
        severity: "warning",
      },
    ],
  },
];
