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

  // batch4
  {
    make: "volkswagen",
    model: "id-4",
    topic: "charging",
    contentFile: "id4-charging",
    pageTitle: "Volkswagen ID.4 charging by year: DC speed, CCS port, NACS adapter | Voltcheck",
    description:
      "How fast a Volkswagen ID.4 fast-charges, by model year and battery pack, from Volkswagen's own order guides — including the 2023 split between LG and SK On packs.",
    breadcrumbLabel: "Volkswagen ID.4 charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How fast does the Volkswagen ID.4 charge on a DC fast charger?",
        answer:
          "It depends on the model year and the battery pack. Volkswagen's own order guides state 125 kW for 2021, 135 kW for 2022, and 170 kW for the 82 kWh pack in 2024 and 2025. The 62 kWh pack is rated 140 kW in 2023 and 2024. In 2023 the 82 kWh pack splits by cell supplier: 135 kW with LG Energy Solution components, 170 kW with SK On components. Volkswagen's 2025 press kit gives 175 kW rather than the order guide's 170 kW; both are Volkswagen's own figures.",
      },
      {
        question: "How long does a Volkswagen ID.4 take to charge from 10% to 80%?",
        answer:
          "Around 30 minutes on all 2025 ID.4 trims, per Volkswagen's 2025 press kit.",
      },
      {
        question: "What charging connector does the Volkswagen ID.4 use?",
        answer:
          "A CCS (Combined Charging System) socket. Volkswagen states all ID.4 models are equipped with it. Tesla Supercharger access opened to ID.4 owners on November 18, 2025, and requires a Volkswagen-approved NACS-to-CCS DC adapter, MSRP $200, sold through Volkswagen dealers and parts.vw.com. The adapter is for DC fast charging only, not Level 1 or Level 2 AC equipment or Tesla Destination Chargers.",
      },
      {
        question: "How long does a Volkswagen ID.4 take to charge at home?",
        answer:
          "The onboard AC charger is 11 kW on every trim from 2021 through 2025. Volkswagen states that charges a 2025 ID.4 to full in approximately eight hours on a home or public Level 2 charger. For 2021, Volkswagen's figure was 33 miles of range in about 1 hour on 220V.",
      },
    ],
  },
  {
    make: "ford",
    model: "mustang-mach-e",
    topic: "charging",
    contentFile: "mach-e-charging",
    pageTitle: "Ford Mustang Mach-E charging: DC speed, CCS port, Supercharger adapter | Voltcheck",
    description:
      "What Ford's own order guides say about Mustang Mach-E charging, 2021 through 2025: 150 kW DC, the onboard AC charger by year, and what the Fast Charging Adapter does and does not do.",
    breadcrumbLabel: "Ford Mustang Mach-E charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How fast does the Ford Mustang Mach-E charge on a DC fast charger?",
        answer:
          "Ford's order guide states \"DC Charging: Up to 150kW capability\" in every model year from 2021 through 2025. Ford publishes no separate DC rate for the Standard Range pack in any of those guides, and no 10-80% charge time.",
      },
      {
        question: "What charging connector does the Ford Mustang Mach-E use?",
        answer:
          "An SAE J1772 CCS (Combo Connector System) charge port, on every model year from 2021 through 2025, capable of charging on 120V, 240V and DC fast charge. Ford said in January 2024 it would start transitioning to a NACS port from 2025, but Ford's own 2025 Mach-E order guide still lists the CCS port.",
      },
      {
        question: "Can a Ford Mustang Mach-E charge at a Tesla Supercharger?",
        answer:
          "Yes, at designated Tesla Superchargers in the United States and Canada, using the Ford Fast Charging Adapter (NACS). Ford's January 2024 announcement described access to Tesla's V3 and above Superchargers. The adapter is $200.00 on Ford's accessories site, rated for up to 500 amps and 1,000 volts. It does not work with Level 1 or Level 2 AC chargers, including Tesla Destination Chargers. Ford states that not all Tesla Superchargers are compatible with non-Tesla EVs, and directs owners to check in the Ford app.",
      },
      {
        question: "How long does a Ford Mustang Mach-E take to charge at home?",
        answer:
          "The onboard AC charger is up to 10.5 kW with 48 amps for model years 2021 through 2023, and up to 11 kW with 48 amps for 2024 and 2025. Ford estimates a 2025 Mach-E charges 0% to 100% in 11.7 hours with the Ford Mobile Power Cord, or 7.8 hours with the Ford Charge Station Pro.",
      },
      {
        question: "Does the Ford Mustang Mach-E precondition its battery before fast charging?",
        answer:
          "Ford states that with available Connected Navigation you can precondition the battery on the way to the charger. Ford's wording is \"available,\" not standard.",
      },
    ],
  },
];

export function findFactSheet(make: string, model: string, topic: string): FactSheetEntry | undefined {
  return FACT_SHEETS.find((s) => s.make === make && s.model === model && s.topic === topic);
}
