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
  {
    make: "volkswagen",
    model: "id-buzz",
    topic: "heat-pump",
    contentFile: "id-buzz-heat-pump",
    pageTitle: "Volkswagen ID. Buzz heat pump: does it have one | Voltcheck",
    description:
      "No US-market 2025 Volkswagen ID. Buzz has a heat pump. Volkswagen's own press release names an electric resistance heater instead. Sourced to Volkswagen's own documents.",
    breadcrumbLabel: "Volkswagen ID. Buzz heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Volkswagen ID. Buzz have a heat pump?",
        answer:
          "No. No US-market 2025 Volkswagen ID. Buzz has a heat pump, on any of its five trims. Volkswagen's own press release names the heating hardware instead: \"the ID. Buzz also has an electric resistance heater as part of the Climatronic system.\" The word \"pump\" does not appear in Volkswagen's US order guide, press release, At a Glance sheet, or Tech Specs sheet for the 2025 ID. Buzz.",
      },
      {
        question: "How does the Volkswagen ID. Buzz warm its battery before fast charging?",
        answer:
          "With the same electric resistance heater. Volkswagen's own words: \"This heater can also precondition the battery for DC fast charging—either automatically, when a charger is input as a destination in navigation, or manually triggered by the driver.\"",
      },
      {
        question: "What cold-weather equipment does the Volkswagen ID. Buzz have instead?",
        answer:
          "Three-zone Climatronic automatic climate control, a heated steering wheel, and heated windshield washer nozzles are standard. Heated and actively ventilated front seats and heated second-row outboard seats are standard on all five trims. A heated windshield is standard on Pro S Plus 4MOTION and not available on the other four trims.",
      },
    ],
  },
  {
    make: "ford",
    model: "f-150-lightning",
    topic: "heat-pump",
    contentFile: "f-150-lightning-heat-pump",
    pageTitle: "Ford F-150 Lightning heat pump by year: which model years have one | Voltcheck",
    description:
      "Whether the Ford F-150 Lightning has a heat pump, by model year, sourced to Ford's own order guides. No 2022-2024 Lightning has one; every 2025 and 2026 does.",
    breadcrumbLabel: "Ford F-150 Lightning heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the 2022-2024 Ford F-150 Lightning have a heat pump?",
        answer:
          "No. No F-150 Lightning built for model years 2022, 2023, or 2024 has a heat pump, on any series or battery, per Ford's own order guides for each of those years. The word \"pump\" does not appear anywhere in any of the three guides. Ford's order guides for those years do not name the truck's cabin heating system at all.",
      },
      {
        question: "Does the 2025 or 2026 Ford F-150 Lightning have a heat pump?",
        answer:
          "Yes. Every F-150 Lightning built for model years 2025 and 2026 has a Vapor Injection Heat Pump. Ford lists it under MECHANICAL on the SuperCrew Pro Series standard-equipment page — the base series — in both years, and Ford's guides state that each series includes the standard equipment of the previous series except where an exception is noted. No later series page notes an exception to it.",
      },
    ],
  },
  {
    make: "nissan",
    model: "leaf",
    topic: "heat-pump",
    contentFile: "leaf-heat-pump",
    pageTitle: "Nissan Leaf heat pump by year: hybrid heater system, trim by trim | Voltcheck",
    description:
      "Which Nissan Leaf model years and trims get the Hybrid heater system, and which year Nissan actually says \"heat pump.\" Sourced to Nissan's own brochures and press release.",
    breadcrumbLabel: "Nissan Leaf heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Nissan Leaf have a heat pump?",
        answer:
          "Nissan's US brochures for the 2018 through 2025 Leaf never use the words \"heat pump.\" They list a row called \"Hybrid heater system\" instead, given per trim, and no Nissan document cited here says what that system contains. The 2026 Leaf is different: Nissan's own words are \"LEAF has a standard, energy-efficient heat pump to help warm the cabin.\"",
      },
      {
        question: "Which Nissan Leaf trims have the Hybrid heater system?",
        answer:
          "For 2018 it is not offered on S, is part of the SV All-Weather Package on SV, and is standard on SL. For 2019 and 2020 it is not offered on S or S PLUS, is part of the SV/SV PLUS All-Weather Package on the SV trims, and is standard on the SL trims. For 2021 and 2022 it is standard on SV, SV PLUS, and SL PLUS, and still not offered on S or S PLUS. For 2023, 2024, and 2025 the lineup is two trims: not offered on S, standard on SV PLUS. In all eight model years a Leaf S has none.",
      },
      {
        question: "Does the 2026 Nissan Leaf have a heat pump?",
        answer:
          "Yes, standard on every trim. Nissan also describes a separate optional battery heater on that car, which the driver can engage to warm the battery before charging in cold weather, and says the 2026 Leaf captures waste heat from the drive motor and the on-board charger and re-purposes it to warm the battery.",
      },
    ],
  },
  {
    make: "nissan",
    model: "ariya",
    topic: "heat-pump",
    contentFile: "ariya-heat-pump",
    pageTitle: "Nissan Ariya heat pump: what Nissan's own documents say | Voltcheck",
    description:
      "No Nissan document published for the US-market Ariya says it has a heat pump. Nissan's own high-voltage component list names a PTC heater. Eight Nissan documents checked.",
    breadcrumbLabel: "Nissan Ariya heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Nissan Ariya have a heat pump?",
        answer:
          "No Nissan document published for the US-market Ariya says it has one. Eight Nissan documents were checked for this page — the 2023, 2024, and 2025 owner's manuals and brochures, plus the 2023 and 2024 press-kit specification sets — and the word \"pump\" appears in none of them in connection with the Ariya's climate system. Nissan's own twelve-item list of the Ariya's high-voltage components names a PTC heater in the heating position, alongside the air conditioner compressor.",
      },
      {
        question: "What cold-weather equipment does the Nissan Ariya have?",
        answer:
          "A battery heater, standard on every trim for 2023 and 2024 per Nissan's own press-kit specification tables and the 2024 brochure grid. Dual-zone Automatic Temperature Control is standard across the trim span. Heated front seats, a heated steering wheel, heated outboard rear seats, and climate-controlled heated-and-cooled front seats are each broken out by trim.",
      },
      {
        question: "How was the Nissan Ariya's heat pump claim checked?",
        answer:
          "Nissan's 2023 Ariya press kit carries 519 specification table rows across 46 tables, and the word \"pump\" occurs zero times in its text; the 2024 press kit carries 532 rows, also zero. Three owner's manuals and three brochures were searched in full with the same result. As a control, Nissan's US newsroom does use the words plainly for a different Nissan: \"LEAF has a standard, energy-efficient heat pump to help warm the cabin.\"",
      },
    ],
  },
  {
    make: "tesla",
    model: "model-3",
    topic: "charging",
    contentFile: "model-3-charging",
    pageTitle: "Tesla Model 3 charging: Supercharger speed, home rate by circuit, adapters | Voltcheck",
    description:
      "How fast a Tesla Model 3 charges at a Supercharger and at home by circuit size, which trims cap at 32 amps, and which adapters it needs. Sourced to Tesla's own manual and support pages.",
    breadcrumbLabel: "Tesla Model 3 charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How fast does the Tesla Model 3 charge at a Supercharger?",
        answer:
          "Tesla publishes a distance rather than a time to 80%: \"Model 3 Up to 175 miles in 15 minutes.\" V3 Superchargers peak at up to 250 kW, and a V4 Supercharger does not make a Model 3 faster — Tesla's own words are that in North America V4 Superchargers charge up to 250 kW for Model S, Model 3, Model X and Model Y, with only Cybertruck able to take 325 kW. Tesla also says not every car reaches 250 kW, because rates vary with pack size and age, state of charge, ambient temperature, and vehicle configuration.",
      },
      {
        question: "How fast does a Tesla Model 3 charge at home?",
        answer:
          "Tesla's Wall Connector provides up to 11.5 kW / 48 amps. On Tesla's own table the Model 3 gains 44 miles of range per hour at 48 A, 37 at 40 A, 30 at 32 A, 22 at 24 A, 15 at 16 A, and 11 at 12 A, all approximate. Tesla's footnote caps the Model 3 Rear-Wheel Drive at 32 A (7.7 kW), up to 30 miles per hour, so a bigger circuit buys that trim nothing.",
      },
      {
        question: "What adapter does a Tesla Model 3 need at a CCS charger?",
        answer:
          "Tesla's CCS Combo 1 Adapter, rated 500V DC. Tesla's own words: \"Use only to connect the charge cable on a CCS Combo 1 charging station to a Tesla vehicle that is capable of Combo 1 DC charging,\" and \"Not all Tesla vehicles are equipped with CCS charging capability. To determine if your vehicle is compatible, touch Controls > Software > Additional Vehicle Information on the touchscreen, or contact Tesla.\" A separate SAE J1772 adapter is needed for J1772 AC stations.",
      },
      {
        question: "Does the Tesla Model 3 precondition its battery before fast charging?",
        answer:
          "Yes, automatically, when the car is navigating to one. Tesla's own words: \"Your vehicle preconditions its high voltage Battery when navigating to Supercharger.\" The same works for non-Tesla fast chargers if the charger is entered as the navigation destination, though third-party stations are hidden on the map until enabled under Controls > Navigation > Third-Party Charging Stations. At home it is not automatic: without a scheduled Precondition, the car only warms the battery if it is too cold to charge.",
      },
    ],
  },
  {
    make: "tesla",
    model: "model-y",
    topic: "charging",
    contentFile: "model-y-charging",
    pageTitle: "Tesla Model Y charging: Supercharger speed, home rate by circuit, adapters | Voltcheck",
    description:
      "How fast a Tesla Model Y charges at a Supercharger and at home by circuit size, why RWD and AWD cars cap at 32 amps, and which adapters they need. Sourced to Tesla's own manual and support pages.",
    breadcrumbLabel: "Tesla Model Y charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How fast does the Tesla Model Y charge at a Supercharger?",
        answer:
          "Tesla publishes a distance rather than a time to 80%: \"Model Y Up to 162 miles in 15 minutes.\" That is the lowest figure in Tesla's own table, below Model S at 200 miles and Model 3 and Model X at 175 miles. V3 Superchargers peak at up to 250 kW, and a V4 Supercharger does not make a Model Y faster — Tesla's own words are that in North America V4 Superchargers charge up to 250 kW for Model S, Model 3, Model X and Model Y, with only Cybertruck able to take 325 kW.",
      },
      {
        question: "How fast does a Tesla Model Y charge at home?",
        answer:
          "Tesla's Wall Connector provides up to 11.5 kW / 48 amps. On Tesla's own table the Model Y gains 44 miles of range per hour at 48 A, 37 at 40 A, 30 at 32 A, 22 at 24 A, 15 at 16 A, and 11 at 12 A, all approximate. But Tesla's footnote caps both the Model Y Rear-Wheel Drive and the Model Y All-Wheel Drive at 32 A (7.7 kW), up to 30 miles per hour, so on those cars a 60 A circuit gains the same as a 40 A one.",
      },
      {
        question: "What adapter does a Tesla Model Y need at a CCS charger?",
        answer:
          "Tesla's CCS Combo 1 Adapter, rated 500V DC. Tesla's own words: \"Use only to connect the charge cable on a CCS Combo 1 charging station to a Tesla vehicle that is capable of Combo 1 DC charging,\" and \"Not all Tesla vehicles are equipped with CCS charging capability. To determine if your vehicle is compatible, touch Controls > Software > Additional Vehicle Information on the touchscreen, or contact Tesla.\" A separate SAE J1772 adapter is needed for J1772 AC stations.",
      },
      {
        question: "Does the Tesla Model Y precondition its battery before fast charging?",
        answer:
          "Yes, automatically, when the car is navigating to one. Tesla's own words: \"Your vehicle preconditions its high voltage Battery when navigating to Supercharger.\" The same works for non-Tesla fast chargers if the charger is entered as the navigation destination, though third-party stations are hidden on the map until enabled under Controls > Navigation > Third-Party Charging Stations. At home it is not automatic: without a scheduled Precondition, the car only warms the battery if it is too cold to charge.",
      },
    ],
  },
];

export function findFactSheet(make: string, model: string, topic: string): FactSheetEntry | undefined {
  return FACT_SHEETS.find((s) => s.make === make && s.model === model && s.topic === topic);
}
