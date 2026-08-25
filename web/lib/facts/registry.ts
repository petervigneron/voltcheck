// Hand-curated list of published fact sheets. Small and manual on purpose:
// there are six pages, each one audited (docs/agents/factsheet-*.md — see
// factsheet-queries-2026-08-20.md §3 for the audit protocol), and the FAQ
// entries below are hand-written to match only what each page's own content
// actually states. Adding a sheet means adding one entry here plus one
// stripped markdown file in web/content/facts/.
//
// URL shape follows the recommendation in
// docs/agents/factsheet-queries-2026-08-20.md §4: /facts/<make>/<model>/<topic>,
// lowercased and hyphenated to match the make/model vocabulary already live
// in lib/filters.ts. One deviation from that doc, stated here rather than
// silently: no per-model hub page (/facts/<make>/<model>/) yet. Every model
// below has exactly one topic sheet today, so a hub page would either
// duplicate the topic page's content or ship nearly empty — thin-content
// risk for no navigational gain until a model has two or more topics. The
// single /facts index below (BUILD REQUIREMENTS) covers the "give crawlers
// and readers a hub" need in the meantime.
//
// The Chevrolet entry covers both the Bolt EV and Bolt EUV nameplates on one
// page rather than splitting them, also stated rather than silent: the
// source document itself audited the two nameplates as one unit (they share
// a generation and, for the years both exist, an identical heat-pump
// answer), so splitting would mean re-deriving per-nameplate-only claims
// that were never audited as such.

export type FaqEntry = { question: string; answer: string };

export type FactSheetEntry = {
  /** URL path segments: /facts/<make>/<model>/<topic> */
  make: string;
  model: string;
  topic: string;
  /** Markdown filename (without extension) in web/content/facts/. */
  contentFile: string;
  /** <title> tag. */
  pageTitle: string;
  /** Meta description. */
  description: string;
  /** Plain-text breadcrumb label for the page, e.g. "Nissan Ariya charging". */
  breadcrumbLabel: string;
  /** JSON-LD FAQPage entries; only questions the page's own text actually answers. */
  faq: FaqEntry[];
  /** dateModified for FAQPage JSON-LD — tracks the audit record's last-checked date, not build time. */
  dateModified: string;
};

export const FACT_SHEETS: FactSheetEntry[] = [
  {
    make: "nissan",
    model: "ariya",
    topic: "charging",
    contentFile: "ariya-charging",
    pageTitle: "Nissan Ariya charging: DC fast-charge speed, connector, preconditioning | Voltcheck",
    description:
      "How fast the Nissan Ariya charges, its CCS1 port and NACS adapter, and how to precondition the battery before a fast charge. Sourced to Nissan's own brochure and owner's manual.",
    breadcrumbLabel: "Nissan Ariya charging",
    dateModified: "2026-08-20",
    faq: [
      {
        question: "How fast does the Nissan Ariya charge on a DC fast charger?",
        answer:
          "The Nissan Ariya has a peak DC fast-charge rate of 130 kW on every trim, on both the 63 kWh and 87 kWh battery packs. A charger rated above 130 kW will not charge it any faster, since Nissan caps input at 130 kW. Nissan's own estimate for charging from a low-battery warning to 80% is 35 minutes on the 63 kWh battery (Engage FWD, Engage Dual Motor AWD) and 40 minutes on the 87 kWh battery (Venture+, Engage+ Dual Motor AWD, Evolve+, Evolve+ Dual Motor AWD, Empower+, Platinum+ Dual Motor AWD).",
      },
      {
        question: "What charging connector does the Nissan Ariya use?",
        answer:
          "The Ariya's built-in DC fast-charge port is CCS1. It does not have a native NACS port. A Nissan-compliant NACS adapter, MSRP $235, is required to charge at a Tesla Supercharger, and only works at the Supercharger stalls Nissan calls V3 and V4. Nissan says using any other adapter is strictly prohibited.",
      },
      {
        question: "Does the Nissan Ariya precondition its battery automatically before fast charging?",
        answer:
          "No. The Ariya's battery-warming feature, called Battery Heater, is driver-activated through the touchscreen. It does not trigger automatically from route guidance to a charger. Nissan recommends turning it on 30 minutes to 1 hour before arriving at a DC fast charger in cold weather.",
      },
      {
        question: "How long does the Nissan Ariya take to charge at home?",
        answer: "The Ariya's onboard AC charger is 7.2 kW, standard on every US trim.",
      },
    ],
  },
  {
    make: "hyundai",
    model: "ioniq-5",
    topic: "charging",
    contentFile: "ioniq5-charging",
    pageTitle: "Hyundai Ioniq 5 charging by model year: DC speed, NACS port, preconditioning | Voltcheck",
    description:
      "How Hyundai Ioniq 5 charging changed from the CCS1 port (2022-2024) to the native NACS port (2025), by the numbers in Hyundai's own spec sheets and owner's manuals.",
    breadcrumbLabel: "Hyundai Ioniq 5 charging",
    dateModified: "2026-08-20",
    faq: [
      {
        question: "Does the Hyundai Ioniq 5 have a native NACS (Tesla-style) port?",
        answer:
          "Only the 2025 Ioniq 5, excluding the performance Ioniq 5 N. Model years 2022 through 2024, and the 2025 Ioniq 5 N, all ship with a CCS port instead, and need an adapter to reach a Tesla Supercharger.",
      },
      {
        question: "How fast does the 2025 Hyundai Ioniq 5 charge on a DC fast charger?",
        answer:
          "On the native NACS port, the 2025 Ioniq 5 RWD Standard Range (63.0 kWh) charges 10% to 80% in 24 minutes on a 150 kW charger. The RWD and AWD Long Range (84.0 kWh) takes 30 minutes. At a Tesla Supercharger, the native NACS port is currently capped at 125 kW by Hyundai. Using the included CCS adapter on a charger above 250 kW, both packs reach 10% to 80% in 20 minutes.",
      },
      {
        question: "How fast does the 2022-2024 Hyundai Ioniq 5 charge on a DC fast charger?",
        answer:
          "On a 150 kW (400V-class) charger, the 2022-2024 Ioniq 5 with the 77.4 kWh pack charges 10% to 80% in about 25 minutes, Hyundai's own estimate. On a charger above 250 kW (800V-class), the same charge takes about 18 minutes, for the 77.4 kWh pack and, from 2023, the 58.0 kWh Standard Range pack.",
      },
      {
        question: "What NACS adapter does a 2022-2024 Hyundai Ioniq 5 need for a Tesla Supercharger?",
        answer:
          "A Hyundai-issued CCS-to-NACS adapter. It was free to owners and lessees who bought or leased on or before January 31, 2025, claimed through the MyHyundai account. After that date, MSRP is $250, with the dealer setting the final selling price.",
      },
    ],
  },
  {
    make: "ford",
    model: "mustang-mach-e",
    topic: "heat-pump",
    contentFile: "mach-e-heat-pump",
    pageTitle: "Ford Mustang Mach-E heat pump by year: which model years have one | Voltcheck",
    description:
      "Whether the Ford Mustang Mach-E has a heat pump, by model year, sourced to Ford's own order guides. No 2021-2024 Mach-E has one; every 2025 does.",
    breadcrumbLabel: "Ford Mustang Mach-E heat pump",
    dateModified: "2026-08-20",
    faq: [
      {
        question: "Does the 2021-2024 Ford Mustang Mach-E have a heat pump?",
        answer:
          "No. No Mustang Mach-E built for model years 2021 through 2024 has a heat pump, on any trim or battery pack, per Ford's own order guides for each of those years.",
      },
      {
        question: "Does the 2025 Ford Mustang Mach-E have a heat pump?",
        answer:
          "Yes. Every 2025 Mustang Mach-E has a Vapor Injection Heat Pump, standard on Select, and carried by Premium and GT as part of their standard equipment, per Ford's 2025 order guide.",
      },
    ],
  },
  {
    make: "volkswagen",
    model: "id-4",
    topic: "heat-pump",
    contentFile: "id4-heat-pump",
    pageTitle: "Volkswagen ID.4 heat pump: does it have one | Voltcheck",
    description:
      "No US-market Volkswagen ID.4, model years 2021 through 2025, has a heat pump. Sourced to Volkswagen's own US retail order guides.",
    breadcrumbLabel: "Volkswagen ID.4 heat pump",
    dateModified: "2026-08-20",
    faq: [
      {
        question: "Does the Volkswagen ID.4 have a heat pump?",
        answer:
          "No. No US-market Volkswagen ID.4 built for model years 2021 through 2025 has a heat pump, on any trim, drivetrain, or battery pack, per Volkswagen's own US retail order guides for each of those years. It uses an electric-resistance heater instead, with heated front seats and a heated steering wheel standard.",
      },
    ],
  },
  {
    make: "chevrolet",
    model: "bolt-ev-euv",
    topic: "heat-pump",
    contentFile: "bolt-ev-euv-heat-pump",
    pageTitle: "Chevrolet Bolt EV & Bolt EUV heat pump: does either have one | Voltcheck",
    description:
      "Neither the Chevrolet Bolt EV (2017-2023) nor the Bolt EUV (2022-2023) has a heat pump. Sourced to GM's own owner's manuals and order guides.",
    breadcrumbLabel: "Chevrolet Bolt EV & Bolt EUV heat pump",
    dateModified: "2026-08-20",
    faq: [
      {
        question: "Does the Chevrolet Bolt EV or Bolt EUV have a heat pump?",
        answer:
          "No. GM's own owner's manuals and order guides show no heat pump on the Bolt EV for model years 2017 through 2020 or 2023, or on the Bolt EUV for 2023. Model years 2021-2022 rely on a single secondary source rather than a GM document and are marked estimated. Both use an HVAC electric heater instead. The redesigned 2027 Chevrolet Bolt, a different platform launching after the Bolt EUV ended production, does have a heat pump, but is out of scope for this page.",
      },
    ],
  },
  {
    make: "tesla",
    model: "model-y",
    topic: "heat-pump",
    contentFile: "model-y-heat-pump",
    pageTitle: "Tesla Model Y heat pump: which model years have one | Voltcheck",
    description:
      "Every Tesla Model Y, model years 2020 through 2026, has a Heat Pump Assembly, per Tesla's own owner's manual.",
    breadcrumbLabel: "Tesla Model Y heat pump",
    dateModified: "2026-08-20",
    faq: [
      {
        question: "Does the Tesla Model Y have a heat pump?",
        answer:
          "Yes. Every Tesla Model Y built for model years 2020 through 2026 has a Heat Pump Assembly, listed by Tesla among the car's High Voltage Components in its own owner's manual. It shipped with this system from its first customer deliveries in March 2020.",
      },
    ],
  },
  // batch3
  {
    make: "hyundai",
    model: "ioniq-6",
    topic: "charging",
    contentFile: "ioniq6-charging",
    pageTitle: "Hyundai Ioniq 6 charging: DC speed, CCS port, NACS adapter, preconditioning | Voltcheck",
    description:
      "How fast the Hyundai Ioniq 6 charges, why it needs a NACS adapter for a Supercharger, and how its battery conditioning mode works. Sourced to Hyundai's own spec sheets and owner's manuals.",
    breadcrumbLabel: "Hyundai Ioniq 6 charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How fast does the Hyundai Ioniq 6 charge on a DC fast charger?",
        answer:
          "Hyundai's spec sheets for model years 2023, 2024, and 2025 carry identical figures. The RWD Standard Range (53.0 kWh) reaches up to 80% charge in 58 minutes on a 50 kW charger and 18 minutes on the charger Hyundai labels \"Rapid Charging: 350kw.\" The RWD and AWD (77.4 kWh) take 73 minutes and 18 minutes respectively. Every Ioniq 6 is standard-equipped with what Hyundai calls \"Ultra-Fast Charger (up to 800V / 350 kW).\"",
      },
      {
        question: "Does the Hyundai Ioniq 6 have a native NACS port?",
        answer:
          "No. Model years 2023 through 2025 ship with a Combined Charging System (CCS) port. Hyundai names the Ioniq 6 among the models \"equipped with a Combined Charging System (CCS) port\" that reach Tesla Superchargers using an adapter, and lists only \"the 2025 IONIQ 5, upcoming 2026 IONIQ 9, and future EVs\" as getting native NACS ports. A Hyundai CCS-to-NACS adapter was free to owners who bought on or before January 31, 2025; after that, MSRP is $250 with the dealer setting the selling price.",
      },
      {
        question: "How long does the Hyundai Ioniq 6 take to charge at home?",
        answer:
          "The onboard AC charger is 10.9 kW, standard on every trim. AC Level II charge time to 80% is 5 hours 20 minutes on the 53.0 kWh Standard Range pack and 6 hours 55 minutes on the 77.4 kWh pack, identical for model years 2023 through 2025.",
      },
      {
        question: "Does the Hyundai Ioniq 6 precondition its battery before fast charging?",
        answer:
          "The battery heater is standard on every Ioniq 6, and battery conditioning is a driver-selected mode reached through EV Settings on the infotainment screen. Setting a DC charging station as the navigation destination optimizes battery temperature only while that mode is already switched on. The mode also engages on its own if the battery temperature is low during driving or when the scheduled air conditioner/heater is activated, and will not engage when the battery level is too low.",
      },
    ],
  },
  {
    make: "kia",
    model: "ev6",
    topic: "charging",
    contentFile: "ev6-charging",
    pageTitle: "Kia EV6 charging by model year: DC speed, CCS1 to NACS port switch | Voltcheck",
    description:
      "How fast the Kia EV6 charges by model year and trim, and which years have the native NACS port. Sourced to Kia's own specification sheets, press releases, and owner's manual.",
    breadcrumbLabel: "Kia EV6 charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Kia EV6 have a native NACS port?",
        answer:
          "Model year 2025 does. Kia's own words: \"2025 model year Kia EV6 and 2026 model year EV9 come standard with NACS charging ports.\" Model years 2022, 2023, and 2024 ship with a CCS1 port instead, and Kia sells a NACS-to-CCS1 adapter through its dealers for those cars. The 2026 EV6's port type is not stated in any Kia document cited here.",
      },
      {
        question: "How fast does the Kia EV6 charge on a DC fast charger?",
        answer:
          "For model years 2022 through 2024, Kia gives 18 minutes on a 350 kW charger and 63 minutes (58 kWh pack) or 73 minutes (77.4 kWh pack) on a 50 kW charger. For 2025 and 2026, on the larger 63.0 kWh and 84.0 kWh packs, Kia gives 20 minutes on a 350 kW charger for every trim except the 2025 GT at 18 minutes, 24 or 29 minutes on a 150 kW charger, and 61 or 81 minutes on a 50 kW charger. Maximum DC input is 180 kW on the small pack and 240 kW on the large one.",
      },
      {
        question: "How long does the Kia EV6 take to charge at home?",
        answer:
          "The onboard charger is 10.9 kW on every trim and every model year 2022 through 2026. On an 11 kW EVSE at 240V/48A, Kia gives 5 hours 50 minutes (58.0 kWh) or 7 hours 10 minutes (77.4 kWh) for model years 2022 through 2024, and 5 hours 40 minutes (63.0 kWh) or 7 hours 20 minutes (84.0 kWh) for 2025 and 2026.",
      },
      {
        question: "Does the Kia EV6 precondition its battery before fast charging?",
        answer:
          "On the 2025 EV6, battery conditioning is a mode marked \"if equipped\" that the driver turns on and off with a switch on the infotainment screen, and can also start remotely from a smartphone app, in which case it ends when the battery reaches temperature or after 30 minutes. Kia's own words on the navigation link: \"When setting a DC charging station as a waypoint or destination in the navigation system, optimizing the battery temperature during the journey can reduce charging time to room temperature depending on the required time.\"",
      },
    ],
  },
];

export function findFactSheet(make: string, model: string, topic: string): FactSheetEntry | undefined {
  return FACT_SHEETS.find((s) => s.make === make && s.model === model && s.topic === topic);
}
