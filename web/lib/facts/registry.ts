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
          "It depends on the model year and the battery pack. Volkswagen's own order guides state 125 kW for 2021, 135 kW for 2022, and 170 kW for the 82 kWh pack in 2024 and 2025. The 62 kWh pack is rated 140 kW in 2023 and 2024. In 2023 the 82 kWh pack splits by cell supplier: 135 kW with LG Energy Solution components, 170 kW with SK On components. Volkswagen's press kits state different 82 kWh figures for three of those years: 175 kW for 2024 and 2025 where the order guides say 170 kW, and a flat 170 kW for every 2023 Pro model where the order guide gives the LG-pack cars 135 kW. Both documents are Volkswagen's own, so both figures are stated here.",
      },
      {
        question: "How long does a Volkswagen ID.4 take to charge from 10% to 80%?",
        answer:
          "Around 30 minutes, per Volkswagen's 2023, 2024 and 2025 press kits — the 2025 sentence generalises to all ID.4 trims from a paragraph naming the Pro, Pro S and Pro S Plus, and Volkswagen publishes no separate figure for the 62 kWh Limited and S Limited cars built early in the 2025 model year. For 2021, Volkswagen's own figure is five to 80 percent charged in about 38 minutes, at that year's 125 kW rate.",
      },
      {
        question: "What charging connector does the Volkswagen ID.4 use?",
        answer:
          "A CCS (Combined Charging System) socket. Volkswagen states that all ID.4 models are equipped with one, in the same sentence in its 2021, 2023, 2024 and 2025 ID.4 press kits; model year 2022 is the one gap, because Volkswagen published no 2022 ID.4 press kit and no year's order guide names a port type. Tesla Supercharger access opened to ID.4 owners on November 18, 2025, and requires a Volkswagen-approved NACS-to-CCS DC adapter, MSRP $200, sold through Volkswagen dealers and parts.vw.com. The adapter is for DC fast charging only, not Level 1 or Level 2 AC equipment or Tesla Destination Chargers.",
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
          "Ford's order guide states \"DC Charging: Up to 150kW capability\" in every model year from 2021 through 2025. That line is printed in the Select trim's standard-equipment list, and the higher trims inherit it — each of their pages opens \"ALL SELECT SERIES EQUIPMENT PLUS:\" and adds to that list — which holds in all five guides. Ford publishes no separate DC rate for the Standard Range pack in any of them, and no 10-80% charge time.",
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
  {
    make: "ford",
    model: "f-150-lightning",
    topic: "charging",
    contentFile: "f150-lightning-charging",
    pageTitle: "Ford F-150 Lightning charging: charge times, onboard charger by year | Voltcheck",
    description:
      "Ford's own charge times for the F-150 Lightning, 2023 through 2025, and the onboard-charger change that turns an 8-hour overnight into 13. Sourced to Ford's spec sheets and order guides.",
    breadcrumbLabel: "Ford F-150 Lightning charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How long does a Ford F-150 Lightning take to DC fast charge?",
        answer:
          "Ford publishes a 15% to 80% time, not a 10% to 80% time. For 2023 on a 150 kW charger: 44 minutes on the 98 kWh Standard Range pack, 41 minutes on the 131 kWh Extended Range pack. For 2024 on a 150 kW+ charger: 32 minutes Standard Range, 38 minutes Extended Range. For 2025 on a 150 kW+ charger: 32 minutes on the 98 kWh pack and 38 minutes on both the 123 kWh and 131 kWh Extended Range packs. The 2024 truck is markedly quicker than the 2023 one on the same pack.",
      },
      {
        question: "What is the F-150 Lightning's peak DC charging speed?",
        answer:
          "Ford does not publish one. Every Ford document behind this page states DC fast charging as a test condition — a 150 kW charger, or 150 kW+ — rather than a peak the truck can draw, and Ford's order guides state a Level 2 peak rate per configuration while stating no DC peak at all.",
      },
      {
        question: "How fast does an F-150 Lightning charge at home?",
        answer:
          "It depends on the onboard charger, which changed. In 2023 the Extended Range pack came with a 19.2 kW / 17.6 kW dual onboard charger and the Standard Range pack with 11.3 kW / 10.5 kW. From 2024, Ford's order guides list 11.2 kW for the 98 kWh Standard Range battery and 11.5 kW for an Extended Range truck with single onboard charging — the 131 kWh pack, and from 2025 the 123 kWh pack too. The 19.2 kW dual charger is a fleet configuration in both 2024 and 2025, not a retail one: Ford's 2024 order guide marks its order code 99M \"F\" for Fleet Only Option, its 2024 spec sheet labels the row Fleet Only, and its 2025 spec sheet adds \"Fleet configuration only, not available for retail sale.\" Ford's 2025 order guide is not consistent with itself on this: on the Flash series page 99M sits under \"Fleet Only Options\" marked \"F\", but on the Pro series page the same code is marked \"O\", an ordinary option. The Pro page's marking is the only Ford source pointing the other way. A retail 2024 or 2025 Extended Range truck should be assumed to have the 11.5 kW single charger. Ford's 15-100% times: for 2024, 10 hours Standard Range and 13 hours Extended Range on a 48A or 80A station; for 2025, 10, 12 and 13 hours on the 98, 123 and 131 kWh packs.",
      },
      {
        question: "Does the F-150 Lightning come with the Ford Charge Station Pro?",
        answer:
          "In 2023 it was included with the Extended Range pack and optional with Standard Range. Ford's 2024 order guide lists the Ford Charge Station Pro under Deleted in its Major Product Changes. Ford's 2025 spec sheet lists it as an Available Ford Accessory. The Charge Station Pro is the unit that carries Ford Intelligent Backup Power capability.",
      },
      {
        question: "Can an F-150 Lightning charge at a Tesla Supercharger?",
        answer:
          "Yes, with the Ford Fast Charging Adapter (NACS). Ford's January 31, 2024 announcement said the adapter gives F-150 Lightning and Mustang Mach-E owners access to Tesla's V3 and above Superchargers. The adapter is $200.00 on Ford's accessories site and works for DC fast charging only, not Level 1 or Level 2 AC chargers or Tesla Destination Chargers.",
      },
    ],
  },
  {
    make: "chevrolet",
    model: "bolt-ev-euv",
    topic: "charging",
    contentFile: "bolt-ev-euv-charging",
    pageTitle: "Chevrolet Bolt EV & EUV charging: why some can't fast charge at all | Voltcheck",
    description:
      "GM sold DC fast charging as an option on the Bolt EV through 2021, so some used cars cannot fast charge at any speed. Charge times by model year, from GM's own manuals and order guides.",
    breadcrumbLabel: "Chevrolet Bolt EV & Bolt EUV charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Do all Chevrolet Bolt EVs have DC fast charging?",
        answer:
          "No. GM sold it as an option, RPO code CBT, listed as available rather than standard on both trims in GM's 2017 and 2019 Bolt EV order guides, and GM's 2017 and 2020 owner's manuals title the section \"DC Charging (If Equipped).\" It is standard by 2022: the 2022 Bolt EUV manual drops the qualifier, and GM's 2023 Bolt EV order guide lists CBT as standard equipment on both trims. The years checked for this page and found optional are 2017, 2019 and 2020; 2018 and 2021 were not checked. In any of those years the option is invisible in the model name and the trim, so the car has to be checked individually.",
      },
      {
        question: "How fast does a Chevrolet Bolt EV or Bolt EUV DC fast charge?",
        answer:
          "GM publishes no peak kW figure. It states the charger instead: at least 80 kW of available power in 2017 and 2020, and a charger capable of 150 amps in 2022 and 2023. In about 30 minutes from a depleted battery GM says a 2017 or 2020 Bolt EV adds an estimated 90 miles of range, a 2022 Bolt EUV up to 95 miles, and for 2023 up to 100 miles for the Bolt EV and up to 95 miles for the Bolt EUV.",
      },
      {
        question: "How long does a Chevrolet Bolt EV take to charge at home?",
        answer:
          "The Bolt EV's onboard charger is 7.2 kW in 2017 and 2019 and 11.5 kW by 2023. A 2017 Bolt EV takes about 9.5 hours on a 240-volt station at 32 amps and about 50 hours on a 120-volt outlet at 12 amps. A 2022 Bolt EUV takes about 7 hours at 240 volts and 48 amps, about 10 hours at 32 amps, and about 55 hours at 120 volts and 12 amps. GM's 2023 figures are about 7 hours at 240 volts/48 amps and about 55 hours at 120 volts/12 amps.",
      },
      {
        question: "Can a Chevrolet Bolt EV charge at a Tesla Supercharger?",
        answer:
          "Chevrolet states that Bolt EV customers can, using GM's NACS DC adapter, MSRP $225 with a 12-month limited warranty. The car still needs the DC fast-charging hardware, which was optional through 2021. Chevrolet has told owners of select 2019 and 2020 Bolt EVs to get a software update that helps secure the charge-port lock while using an adapter. The adapter does not work on Level 2 Tesla chargers.",
      },
    ],
  },
  {
    make: "nissan",
    model: "leaf",
    topic: "charging",
    contentFile: "leaf-charging",
    pageTitle: "Nissan Leaf charging: CHAdeMO, the optional fast-charge port, and 2026's NACS | Voltcheck",
    description:
      "Nissan sold the Leaf's fast-charge port as an option, and it is CHAdeMO, not CCS or NACS. What Nissan's own manuals say about charging a Leaf, and what changes for 2026.",
    breadcrumbLabel: "Nissan Leaf charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "What charging connector does the Nissan Leaf use?",
        answer:
          "CHAdeMO for DC fast charging, and SAE J1772 for AC. Nissan's own manual says a quick-charge-equipped Leaf \"is compatible with most CHAdeMO (Japanese industry standard) connectors on charging stations,\" and adds that \"While supported by NISSAN, this connector may not become the US SAE standard.\" The all-new 2026 Leaf changes this: a J1772 port on the driver's-side fender and a NACS fast-charge port on the passenger's-side fender, which Nissan says unlocks over 20,000 Tesla Superchargers.",
      },
      {
        question: "Do all Nissan Leafs have DC fast charging?",
        answer:
          "No. Nissan's own words, unchanged from the 2019 manual to the 2024 one: \"Quick charge capability is only available on vehicles manufactured with the quick charge option, which includes the quick charge port. If your vehicle does not have such a port, quick charging cannot be used.\" It is a per-car check, not a per-trim one.",
      },
      {
        question: "How fast does a Nissan Leaf fast charge?",
        answer:
          "Nissan states the station's power rather than the car's peak: quick charge uses public stations up to 50 kW for 40 kWh battery models and up to 100 kW for the larger pack. Its time to 80% is published as a table keyed to the battery temperature gauge rather than a single figure. On a 50 kW charger a 40 kWh Leaf takes approximately 40 minutes at the gauge's middle reading, approximately 40-90 or 40-80 minutes either side of it, and more than 90 minutes cold or more than 80 minutes hot. The 60 kWh and 62 kWh packs take approximately 60 minutes at the middle reading on a 50 kW charger, or approximately 45 minutes on a 100 kW charger, rising to more than 150 minutes cold and more than 100 minutes hot in both columns. The 2026 Leaf charges at up to 150 kW and, per Nissan, goes 10% to 80% in 35 minutes.",
      },
      {
        question: "Does fast charging hurt a Nissan Leaf's battery?",
        answer:
          "Nissan's own manual asks owners to limit it: \"NISSAN recommends using normal charging for usual charging of the vehicle. Use of quick charge should be minimized in order to help prolong Li-ion battery life.\" Nissan also lists avoiding sustained high battery temperatures, including from extended highway driving with multiple quick charges, among the ways to extend battery life, and states that quick-charging power is limited when the battery temperature is near the red zone.",
      },
    ],
  },
  {
    make: "volkswagen",
    model: "id-buzz",
    topic: "charging",
    contentFile: "id-buzz-charging",
    pageTitle: "Volkswagen ID. Buzz charging: 200 kW, 26 minutes, and a plan that doesn't transfer | Voltcheck",
    description:
      "How fast the 2025 Volkswagen ID. Buzz charges, how its automatic battery preconditioning works, and why its Plug&Charge plan stops at the first owner. Volkswagen's own figures.",
    breadcrumbLabel: "Volkswagen ID. Buzz charging",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How fast does the Volkswagen ID. Buzz charge on a DC fast charger?",
        answer:
          "Up to 200 kW, standard on every 2025 trim. Volkswagen states the 91 kWh battery goes from 10 to 80 percent in about 26 minutes at that rate.",
      },
      {
        question: "Does the Volkswagen ID. Buzz precondition its battery before fast charging?",
        answer:
          "Yes, automatically. Volkswagen states that when the native navigation's route guidance with the Electric Vehicle Route Planner is active, preconditioning starts automatically on the way to the next quick-charging station. Without route guidance it can be activated by hand from the charging menu in the infotainment system. Volkswagen says preconditioning cuts charging time by several minutes, particularly in winter.",
      },
      {
        question: "What charging connector does the Volkswagen ID. Buzz use?",
        answer:
          "No Volkswagen document behind this page names the port outright. Volkswagen describes its adapter as a DC fast-charging adapter for North American Charging System (NACS) to Combined Charging System (CCS) port, in a release about ID.4 and ID. Buzz owners, which is where the CCS answer comes from. Tesla Supercharger access opened to ID. Buzz owners on November 18, 2025, and requires that Volkswagen-approved adapter, MSRP $200, sold through Volkswagen dealers and parts.vw.com. It is for DC fast charging only, not Level 1 or Level 2 AC equipment or Tesla Destination Chargers.",
      },
      {
        question: "Does the ID. Buzz charging plan transfer to a second owner?",
        answer:
          "No. Volkswagen's disclosure for the 2025 ID. Buzz Charging Plan says so in one word — \"Non-transferable.\" — and adds that it is not available for commercial use such as ride-hailing and ridesharing. Volkswagen's Plug&Charge terms say the same thing at more length: the feature is available upon purchase of a new, unused 2025 ID. Buzz, can only be used by the original purchaser or owner for the duration of the included charging plan, and is \"Not valid for subsequent owners.\" The plan is 500 kWh of complimentary DC Fast and L2 charging plus thirty-six months of Pass+ membership, beginning at vehicle purchase.",
      },
      {
        question: "How fast does the Volkswagen ID. Buzz charge at home?",
        answer:
          "The onboard AC charger is 11 kW, standard on every 2025 trim. The charging cable is not included; Volkswagen sells a 2-in-1 240V/120V cable as an accessory.",
      },
    ],
  },
  {
    make: "tesla",
    model: "model-3",
    topic: "battery-warranty",
    contentFile: "model-3-battery-warranty",
    pageTitle: "Tesla Model 3 battery warranty: years, miles, and the 70% floor | Voltcheck",
    description:
      "What Tesla's own Battery and Drive Unit Limited Warranty covers on a Model 3 — 8 years and 100,000 or 120,000 miles by trim, a 70% capacity floor, and what Tesla excludes.",
    breadcrumbLabel: "Tesla Model 3 battery warranty",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How long is the Tesla Model 3 battery warranty?",
        answer:
          "Eight years, with the mileage cap set by trim. Tesla's warranty document states 8 years or 100,000 miles for Model 3 Standard or Standard Range Plus, and 8 years or 120,000 miles for Model 3 Long Range or Performance, whichever comes first, each with minimum 70% retention of battery capacity over the warranty period. Tesla's support page states the same two tiers in current trim names: Model 3 RWD at 100,000 miles, and Model 3 Premium RWD, Premium AWD and Performance AWD at 120,000 miles.",
      },
      {
        question: "Does the Tesla Model 3 battery warranty cover normal degradation?",
        answer:
          "No. Tesla writes that the battery \"will experience gradual energy or power loss with time and use\" and that loss of battery energy or power over time or resulting from battery usage is not covered, except as specified in the warranty. The Battery and Drive Unit Limited Warranty states the floor only as \"minimum 70% retention of Battery capacity over the warranty period,\" without defining how retention is measured. Tesla does phrase the 70% floor as a defect standard — free from defects that would cause capacity retention to fall below 70% — but that wording belongs to the separate Battery ZEV Limited Warranty, which Tesla limits to model year 2026 and later. Tesla also states that range estimates are an imperfect measure of battery capacity, and that the measurement method is at Tesla's sole discretion.",
      },
      {
        question: "Does the Tesla Model 3 battery warranty transfer to a second owner?",
        answer:
          "Yes. Tesla's warranty document states it \"is transferable at no cost to any person(s) who subsequently and lawfully assume(s) ownership of the vehicle after the first retail purchaser.\" Tesla's support page adds that it transfers when a vehicle ownership transfer is performed through Tesla.",
      },
      {
        question: "What is excluded from the Tesla Model 3 battery warranty?",
        answer:
          "Tesla excludes damage from intentional actions, including ignoring active vehicle warnings or service notifications, from a collision or accident, and from the servicing or opening of the battery or drive unit by non-Tesla or non-certified personnel. Also excluded: attempting to extend or reduce the battery's life by physical means or programming, exposing the battery to direct flame, and flooding it. Battery fires run the other way, covered even if the result of driver error, but with a carve-back: coverage does not extend to damage already sustained before the fire, or to any damage if the fire occurred after the vehicle had already been totaled. Separately from these exclusions, Tesla's Voided Warranty section lists circumstances in which the whole warranty can be voided for a car, including a defaced VIN, a tampered odometer, a branded title, or an insurer's total-loss determination.",
      },
    ],
  },
  {
    make: "tesla",
    model: "model-y",
    topic: "battery-warranty",
    contentFile: "model-y-battery-warranty",
    pageTitle: "Tesla Model Y battery warranty: 100,000 or 120,000 miles, by trim | Voltcheck",
    description:
      "Tesla publishes the Model Y's battery coverage twice, in two different sets of trim names. Both lists are quoted here, with what the 70% capacity floor actually promises.",
    breadcrumbLabel: "Tesla Model Y battery warranty",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How long is the Tesla Model Y battery warranty?",
        answer:
          "Eight years, with the mileage cap set by trim, and Tesla publishes the trims under two different sets of names. Tesla's warranty document states 8 years or 100,000 miles for Model Y Standard or Standard Range Plus and 8 years or 120,000 miles for Model Y Long Range or Performance. Tesla's support page instead lists Model Y RWD and Model Y AWD at 100,000 miles, and Model Y Premium RWD, Premium AWD, Performance AWD and Y L Premium Launch Series at 120,000 miles. Both carry a minimum 70% retention of battery capacity. If your car's name is in neither list, matching on drivetrain letters alone is not safe — AWD appears in both rows of the support table — and the warranty booklet delivered with that car is the authority for it.",
      },
      {
        question: "Does the Tesla Model Y battery warranty cover normal degradation?",
        answer:
          "No. Tesla writes that the battery \"will experience gradual energy or power loss with time and use\" and that loss of battery energy or power over time or resulting from battery usage is not covered, except as specified in the warranty. The Battery and Drive Unit Limited Warranty states the floor only as \"minimum 70% retention of Battery capacity over the warranty period,\" without defining how retention is measured. Tesla does phrase the 70% floor as a defect standard, but that wording belongs to the separate Battery ZEV Limited Warranty, which Tesla limits to model year 2026 and later. Tesla also states that range estimates are an imperfect measure of battery capacity, and that the measurement method is at Tesla's sole discretion.",
      },
      {
        question: "Does the Tesla Model Y battery warranty transfer to a second owner?",
        answer:
          "Yes. Tesla's warranty document states it \"is transferable at no cost to any person(s) who subsequently and lawfully assume(s) ownership of the vehicle after the first retail purchaser.\" Tesla's support page adds that it transfers when a vehicle ownership transfer is performed through Tesla.",
      },
      {
        question: "Do the ZEV warranties apply to my Tesla Model Y?",
        answer:
          "Two conditions gate them. Model year: Tesla's own note reads \"The ZEV Limited Warranties apply only to vehicles of Model Year 2026 and later.\" Warranty Region: Tesla states the four ZEV Limited Warranties apply to vehicles with a Warranty Region of the United States and Canada, except as its document specifically notes. Where they apply, the Battery ZEV Limited Warranty runs 8 years or 100,000 miles and the High-Priced Propulsion-Related Parts ZEV Limited Warranty runs 7 years or 70,000 miles.",
      },
    ],
  },
  {
    make: "hyundai",
    model: "ioniq-5",
    topic: "battery-warranty",
    contentFile: "ioniq5-battery-warranty",
    pageTitle: "Hyundai Ioniq 5 battery warranty: 10 years, 100,000 miles, and the transfer question | Voltcheck",
    description:
      "What Hyundai's own warranty handbook covers on an Ioniq 5 battery, what its two paragraphs about the 70% figure actually say, and what it does not say about a second owner.",
    breadcrumbLabel: "Hyundai Ioniq 5 battery warranty",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How long is the Hyundai Ioniq 5 battery warranty?",
        answer:
          "Hyundai covers the High Voltage Battery under its Hybrid, Plug-in Hybrid, and Electric Vehicle Warranty for 10 years from the date of original retail delivery or date of first use, or 100,000 miles, whichever occurs first. The same coverage extends to the Battery Management System, traction motor and housing, power control units and other components attached to the battery. Hyundai's 2022 handbook states the same term as its 2025 one.",
      },
      {
        question: "Does the Hyundai Ioniq 5 battery warranty transfer to a second owner?",
        answer:
          "Hyundai's handbook does not say either way. Its Warranty Transferability section names six coverages that transfer and names the 10-year/100,000-mile Powertrain Limited Warranty as one that does not; the Hybrid, Plug-in Hybrid, and Electric Vehicle Warranty appears in neither list. In Hyundai's summary table, the electric-vehicle Direct Energy Components row shows 10 years/100,000 miles with no original-owner footnote, while the Powertrain row directly below carries a footnote reading \"Original Owner 10 Years/100,000 Miles, Subsequent Owner(s) 5 Years/60,000 Miles.\"",
      },
      {
        question: "Does Hyundai guarantee the Ioniq 5 battery keeps 70% capacity?",
        answer:
          "Hyundai's handbook says two different things in the same section. One paragraph states that loss of battery capacity over time is \"covered not to degrade more than 70% of the original battery capacity.\" The What is Not Covered paragraph states that loss of battery energy or power over time or resulting from battery usage \"is NOT covered.\" What Hyundai states unambiguously is the repair standard: a repair or replacement will maintain at least equal energy capacity to the original battery before the failure, but no less than 70% of the original battery capacity, and a replacement may be new or refurbished.",
      },
      {
        question: "Does the 150,000-mile California battery warranty apply to an Ioniq 5?",
        answer:
          "Hyundai's 150,000-mile note names the Plug-in Hybrid Battery on a vehicle certified for sale in California as a transitional zero-emission vehicle (TZEV). The Ioniq 5 is battery-electric, not a plug-in hybrid.",
      },
    ],
  },
  {
    make: "kia",
    model: "ev6",
    topic: "battery-warranty",
    contentFile: "ev6-battery-warranty",
    pageTitle: "Kia EV6 battery warranty: two coverages, and when the clock started | Voltcheck",
    description:
      "Kia covers an EV6's electric drivetrain and its battery capacity separately, both for 10 years or 100,000 miles from the date of first service — a date that can precede the first sale. From Kia's own EV warranty manual.",
    breadcrumbLabel: "Kia EV6 battery warranty",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "How long is the Kia EV6 battery warranty?",
        answer:
          "Kia states two separate coverages, each 10 years or 100,000 miles from the Date of First Service, whichever comes first. The EV System Warranty covers the electric motor, high voltage battery, electric power control unit and on-board charger, and Kia's manual states it does not cover any other electrical components, such as the traditional 12 volt battery, alternator or starter components. Lithium-Ion Polymer Battery Capacity Coverage separately covers capacity loss below 70% of the original battery capacity, and covers repairs needed to return capacity to 70%.",
      },
      {
        question: "When does the Kia EV6 battery warranty start?",
        answer:
          "At the Date of First Service, which Kia's warranty manual defines as the first date the vehicle is delivered to the first retail purchaser, is leased, or is placed into service as a company vehicle such as a demonstrator, rental or fleet vehicle, whichever is earliest. A demonstrator or rental EV6 started its ten years when it went into service, not when it was first sold to a customer.",
      },
      {
        question: "Does the Kia EV6 battery warranty transfer to a second owner?",
        answer:
          "Yes. Kia's EV warranty manual states that any remaining portion of any warranty, except the 120-month/100,000-mile Power Train (Original Owner) warranty, is fully transferable to subsequent owners. Kia's coverage chart shows the same split: the Power Train row carries an Original Owner Only band and a footnote cutting subsequent owners to 60 months/60,000 miles, while the Electric Vehicle (EV) System row shows 120 months and 100,000 miles with neither. Kia's website restricts only the Powertrain Limited Warranty, to the original purchaser and to buyers of a Certified Pre-Owned Kia.",
      },
      {
        question: "What is not covered by the Kia EV6 battery warranty?",
        answer:
          "Kia excludes EV System and Lithium-Ion Polymer Battery damage caused by ambient temperatures above 122F for over 24 hours; storage below -22F for over seven days; leaving the vehicle over 14 days at a zero or near zero state of charge; physically damaging or intentionally reducing the battery's life; direct flame; immersion in water or fluids; opening the battery enclosure or having it serviced by someone other than a Kia certified EV technician; neglecting correct charging procedures; use of incompatible charging devices; and damage to the charge port or vehicle components caused by a public charger, non-Kia supplied charge cord, or other third party EVSE.",
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
          "On the 2023 and 2024 Ioniq 6, whose owner's manuals are the only ones this answer rests on: the battery heater is standard on every trim, and battery conditioning is a driver-selected mode reached through EV Settings on the infotainment screen. Setting a DC charging station as the navigation destination optimizes battery temperature only while that mode is already switched on. The mode also engages on its own if the battery temperature is low during driving or when the scheduled air conditioner/heater is activated, and will not engage when the battery level is too low. No 2025 Ioniq 6 owner's manual could be retrieved from Hyundai's own host, so no 2025-specific preconditioning behavior is claimed.",
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
        question: "How does the 2025 Volkswagen ID. Buzz warm its battery before fast charging?",
        answer:
          "On the 2025 ID. Buzz, with the same electric resistance heater. Volkswagen's own words: \"This heater can also precondition the battery for DC fast charging—either automatically, when a charger is input as a destination in navigation, or manually triggered by the driver.\" Model year 2025 is the ID. Buzz's first US model year and the only one this page covers.",
      },
      {
        question: "What cold-weather equipment does the 2025 Volkswagen ID. Buzz have instead?",
        answer:
          "On the 2025 ID. Buzz, the only US model year covered here: three-zone Climatronic automatic climate control, a heated steering wheel, and heated windshield washer nozzles are standard. Heated and actively ventilated front seats and heated second-row outboard seats are standard on all five trims. A heated windshield is standard on Pro S Plus 4MOTION and not available on the other four trims.",
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
      "Which Nissan Leaf model years and trims get the Hybrid heater system, and which year Nissan actually says \"heat pump.\" On the 2026 Leaf it is standard on SV+ and Platinum+ and not offered on S+. Sourced to Nissan's own brochures and press kit.",
    breadcrumbLabel: "Nissan Leaf heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Nissan Leaf have a heat pump?",
        answer:
          "Nissan's US brochures for the 2018 through 2025 Leaf never use the words \"heat pump.\" They list a row called \"Hybrid heater system\" instead, given per trim, and no Nissan document from those years says what that system contains. The 2026 Leaf is a new generation and Nissan treats it differently: its press release says \"LEAF has a standard, energy-efficient heat pump to help warm the cabin,\" and its press-kit specification grid heads the row \"Hybrid heater system (heat pump),\" glossing the term. That gloss is Nissan's, for the 2026 car. Nissan does not say whether it also describes the 2018-2025 hardware, so this page does not carry it back.",
      },
      {
        question: "Which Nissan Leaf trims have the Hybrid heater system?",
        answer:
          "For 2018 it is not offered on S, is part of the SV All-Weather Package on SV, and is standard on SL. For 2019 and 2020 it is not offered on S or S PLUS, is part of the SV/SV PLUS All-Weather Package on the SV trims, and is standard on the SL trims. For 2021 and 2022 it is standard on SV, SV PLUS, and SL PLUS, and still not offered on S or S PLUS. For 2023, 2024, and 2025 the lineup is two trims: not offered on S, standard on SV PLUS. In all eight model years a Leaf S has none.",
      },
      {
        question: "Does the 2026 Nissan Leaf have a heat pump?",
        answer:
          "On two of its three trims. Nissan's own 2026 LEAF Press Kit specification grid gives the row \"Hybrid heater system (heat pump)\" an \"S\" for standard on SV+ and PLATINUM+, and a dash on the base S+ — and Nissan's legend for that grid defines only \"S – Standard\" and \"O – Optional,\" so a dash is neither. It is not in the press kit's factory-installed options either, so an S+ buyer cannot add it. Nissan's press release separately calls the heat pump \"standard\" without naming a trim; the per-trim grid is what this answer follows. The battery heater is separate: the grid marks it optional on SV+ and PLATINUM+ and not offered on S+, and the press kit prices it at $300. Nissan also says the 2026 Leaf captures waste heat from the drive motor and the on-board charger and re-purposes it to warm the battery.",
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
      "No Nissan document published for the US-market Ariya, model years 2023 through 2025, says it has a heat pump. Nissan's own high-voltage component list names a PTC heater. Twelve Nissan documents checked.",
    breadcrumbLabel: "Nissan Ariya heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Nissan Ariya have a heat pump?",
        answer:
          "For the US-market Ariya, model years 2023 through 2025: no Nissan document published for it says it has one. Twelve Nissan documents were checked for this page — the 2023, 2024, and 2025 owner's manuals, brochures, press-kit specification sets, and Quick Reference Guides — and the word \"pump\" appears in none of them in connection with the Ariya's climate system, apart from one conditional line of shared Nissan-EV boilerplate that reads \"(heat pump, if so equipped)\" and appears identically in the Leaf guides. Nissan's own twelve-item list of the Ariya's high-voltage components names a PTC heater in the heating position, alongside the air conditioner compressor. Non-US Ariya builds are out of scope: Nissan UK does list a heat pump as standard on the European car, which is a different specification.",
      },
      {
        question: "What cold-weather equipment does the Nissan Ariya have?",
        answer:
          "A battery heater, standard on every trim for 2023 and 2024 per Nissan's own press-kit specification tables and the 2024 brochure grid. Dual-zone Automatic Temperature Control is standard across the trim span. Heated front seats, a heated steering wheel, heated outboard rear seats, and climate-controlled heated-and-cooled front seats are each broken out by trim.",
      },
      {
        question: "How was the Nissan Ariya's heat pump claim checked?",
        answer:
          "Nissan's 2023 Ariya press kit carries 519 specification table rows across 46 tables, and the word \"pump\" occurs zero times in its text; the 2024 press kit carries 532 rows and the 2025 press kit 527, both also zero. All three carry a \"Battery heater\" row marked standard, so the tables are granular enough to have listed a heat pump had there been one. Three owner's manuals, three brochures, and three Quick Reference Guides were searched in full with the same result, with controls run alongside — \"PTC heater\" is found in every manual and \"Battery heater\" in every brochure — so the zero is a finding, not a failed search. As a control on wording, Nissan's US newsroom does use the words plainly for a different Nissan: \"LEAF has a standard, energy-efficient heat pump to help warm the cabin,\" and the 2026 LEAF press kit heads a specification row \"Hybrid heater system (heat pump).\"",
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
          "Tesla publishes a distance rather than a time to 80%, and publishes two of them at different scopes. Its support site gives the nameplate figure, \"Model 3 Up to 175 miles in 15 minutes.\" Its compare page gives a per-trim figure for the Model 3 Rear-Wheel Drive, \"Up to 170 mi\" in 15 minutes, measured at a constant 65 mph. Tesla does not reconcile the two. V3 Superchargers peak at up to 250 kW, and a V4 Supercharger does not make a Model 3 faster — Tesla's own words are that in North America V4 Superchargers charge up to 250 kW for Model S, Model 3, Model X and Model Y, with only Cybertruck able to take 325 kW. Tesla also says not every car reaches 250 kW, because rates vary with pack size and age, state of charge, ambient temperature, and vehicle configuration.",
      },
      {
        question: "How fast does a Tesla Model 3 charge at home?",
        answer:
          "Tesla's Wall Connector provides up to 11.5 kW / 48 amps. Tesla's table is keyed to the circuit breaker, which is not the amperage delivered: a 60 A breaker gives 48 A output, 50 A gives 40 A, 40 A gives 32 A, and so on down. On that table the Model 3 gains 44 miles of range per hour on a 60 A breaker, 37 on 50 A, 30 on 40 A, 22 on 30 A, 15 on 20 A, and 11 on 15 A, all approximate. Tesla's footnote caps the Model 3 Rear-Wheel Drive at 32 A (7.7 kW), up to 30 miles per hour — the 40 A breaker row — so a bigger breaker buys that trim nothing.",
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
          "Tesla publishes a distance rather than a time to 80%, and publishes two of them at different scopes. Its support site gives the nameplate figure, \"Model Y Up to 162 miles in 15 minutes.\" Its compare page gives a per-trim figure for the Model Y Rear-Wheel Drive, \"Up to 160 mi\" in 15 minutes, measured at a constant 65 mph. Tesla does not reconcile the two. In the support site's five-row table the Model Y sits above the Cybertruck at 137 miles and below Model S at 200 and Model 3 and Model X at 175. V3 Superchargers peak at up to 250 kW, and a V4 Supercharger does not make a Model Y faster — Tesla's own words are that in North America V4 Superchargers charge up to 250 kW for Model S, Model 3, Model X and Model Y, with only Cybertruck able to take 325 kW.",
      },
      {
        question: "How fast does a Tesla Model Y charge at home?",
        answer:
          "Tesla's Wall Connector provides up to 11.5 kW / 48 amps. Tesla's table is keyed to the circuit breaker, which is not the amperage delivered: a 60 A breaker gives 48 A output, 50 A gives 40 A, 40 A gives 32 A, and so on down. On that table the Model Y gains 44 miles of range per hour on a 60 A breaker, 37 on 50 A, 30 on 40 A, 22 on 30 A, 15 on 20 A, and 11 on 15 A, all approximate. Tesla's footnote caps both the Model Y Rear-Wheel Drive and the Model Y All-Wheel Drive at 32 A (7.7 kW), up to 30 miles per hour. That is the 40 A breaker row, so on those cars the 40 A row and everything below it still applies and only the 60 A and 50 A rows do not — a 60 A circuit gains the same as a 40 A one.",
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

  // batch5
  {
    make: "tesla",
    model: "model-3",
    topic: "heat-pump",
    contentFile: "model-3-heat-pump",
    pageTitle: "Tesla Model 3 heat pump: which cars have one, by build date | Voltcheck",
    description:
      "Tesla says Model 3 cars built between about July 2017 and October 2020 do not have a heat pump, and cars built afterward do. Sourced to Tesla's own owner's manual.",
    breadcrumbLabel: "Tesla Model 3 heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Tesla Model 3 have a heat pump?",
        answer:
          "It depends on when the car was built, and Tesla states the boundary as a manufacture date rather than a model year. Tesla's own words in the Model 3 Owner's Manual: \"Vehicles manufactured between approximately July 2017 and October 2020 do not have a heat pump,\" and \"Vehicles manufactured afterward have a heat pump.\" The word \"approximately\" is Tesla's. No Tesla document behind this page maps that date to a model year, so a Model 3 built near October 2020 cannot be resolved from its model year alone.",
      },
      {
        question: "How do I tell if a used Tesla Model 3 has a heat pump?",
        answer:
          "Tesla publishes a per-car check, in its own words: \"to determine if your vehicle has a heat pump, touch Controls > Software > Additional Vehicle Information.\" The instruction appears on both the Operating Climate Controls page and the Cold Weather Best Practices page of the Model 3 Owner's Manual's 2017-2023 edition.",
      },
      {
        question: "Tesla's manual lists a Heat Pump Assembly for the Model 3 — doesn't that settle it?",
        answer:
          "No. The Electric Vehicle Components page lists \"Heat Pump Assembly\" among the Model 3's High Voltage Components with no year, trim or \"if equipped\" qualifier, and it reads that way in both editions of the manual, the 2017-2023 edition and the current 2024+ edition. The 2017-2023 edition covers cars Tesla itself says do not have a heat pump, so that list cannot be read as a per-year answer for that span.",
      },
      {
        question: "Which Model 3 trims have a heat pump?",
        answer:
          "This page makes no trim claim. Tesla's statement is by manufacture date only, and no Tesla document behind this page distinguishes Rear-Wheel Drive, Long Range or Performance on this point.",
      },
    ],
  },
  {
    make: "hyundai",
    model: "ioniq-5",
    topic: "heat-pump",
    contentFile: "ioniq5-heat-pump",
    pageTitle: "Hyundai Ioniq 5 heat pump: AWD only, every model year | Voltcheck",
    description:
      "The Hyundai Ioniq 5's heat pump is AWD-only in every trim and every model year from 2022 through 2025, per Hyundai's own equipment grids. No rear-wheel-drive Ioniq 5 has one.",
    breadcrumbLabel: "Hyundai Ioniq 5 heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Hyundai Ioniq 5 have a heat pump?",
        answer:
          "Only if it is all-wheel drive. Hyundai's own Features grid gives the Heat Pump row the value \"AWD only\" in every trim column in 2022, 2023 and 2024 (SE, SEL, Limited) and \"AWD-only\" in every trim column in 2025 (SE, SEL, XRT, Limited). Every rear-wheel-drive Ioniq 5 in those model years is a car without a heat pump, including every SE Standard Range, which Hyundai builds only as RWD.",
      },
      {
        question: "Which Hyundai Ioniq 5 trims have a heat pump?",
        answer:
          "The trim is not what decides it — the drivetrain is, and the answer is the same in all of them. For 2025, the XRT is the one trim that resolves on its own: Hyundai lists an XRT range figure only in the AWD column of its 2025 range table, and XRT appears in neither the RWD column nor the RWD Standard Range column.",
      },
      {
        question: "What does a rear-wheel-drive Hyundai Ioniq 5 use to heat the cabin?",
        answer:
          "A PTC heater. Hyundai's grid carries a separate PTC Heater row directly above the Heat Pump row and marks it standard in every trim column in 2022, 2023, 2024 and 2025.",
      },
      {
        question: "Does the 2026 Hyundai Ioniq 5 have a heat pump?",
        answer:
          "Hyundai's own 2026 Model Year Changes document lists the 2026 IONIQ 5 as a Carry-over Model, and its table of changes from the 2025 model year names only the included charging cable and three color items. No HVAC change is listed. No 2026 IONIQ 5 features grid was found on Hyundai's newsroom to confirm the Heat Pump row directly, so that carry-over statement is all this page carries for 2026.",
      },
    ],
  },
  {
    make: "hyundai",
    model: "ioniq-6",
    topic: "heat-pump",
    contentFile: "ioniq6-heat-pump",
    pageTitle: "Hyundai Ioniq 6 heat pump: standard on every one but the Standard Range | Voltcheck",
    description:
      "Hyundai marks the Ioniq 6's heat pump standard on SE Long Range, SEL and Limited for 2023 through 2025, and absent on the 53 kWh SE Standard Range. From Hyundai's own equipment grids.",
    breadcrumbLabel: "Hyundai Ioniq 6 heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Hyundai Ioniq 6 have a heat pump?",
        answer:
          "Every Ioniq 6 for model years 2023, 2024 and 2025 does except the Standard Range car. Hyundai's own equipment grid says it two ways: for 2023 and 2024 the SE cell reads \"S (LR only)\" while SEL and Limited read \"S\"; for 2025 Hyundai splits the Standard Range into its own SE (SR) column and marks it \"-\", with SE, SEL and Limited reading \"S\". Both notations name the same car, because the 53.0 kWh Standard Range battery is sold only as an SE.",
      },
      {
        question: "Do you need all-wheel drive to get a heat pump on a Hyundai Ioniq 6?",
        answer:
          "No. Hyundai marks the SEL and Limited cells with a plain \"S\" and attaches no drivetrain condition to them, in 2023, 2024 and 2025 alike. This is where the Ioniq 6 differs from the Ioniq 5, whose grid gives the same row the value \"AWD only\" in every trim column.",
      },
      {
        question: "What does a Hyundai Ioniq 6 Standard Range heat the cabin with instead?",
        answer:
          "This page does not say, because Hyundai does not. Hyundai's Ioniq 6 HVAC table has no PTC Heater row to read — its rows are dual automatic temperature control, 2nd row air vents, external temperature, heat pump, cabin air filter, and rear window defroster with timer, and nothing else. Hyundai does print a PTC Heater row in the Ioniq 5's version of the same table, so the row exists in its vocabulary; it is simply not in the Ioniq 6's grid.",
      },
      {
        question: "Does the 2026 Hyundai Ioniq 6 have a heat pump?",
        answer:
          "Not covered here. Hyundai's own 2026 Model Year Changes document lists the 2026 IONIQ 6 as a Product Enhancement Model and its page for the car reads, in full, \"Product Enhancement Model, details to come.\" No 2026 IONIQ 6 features grid was found on Hyundai's newsroom, so no 2026 claim is made.",
      },
    ],
  },
  {
    make: "kia",
    model: "ev6",
    topic: "heat-pump",
    contentFile: "ev6-heat-pump",
    pageTitle: "Kia EV6 heat pump: optional on most trims, so check the car | Voltcheck",
    description:
      "Kia marks the EV6's heat pump Optional on Wind and GT-Line in every model year from 2022 to 2026, standard only on the GT, and not available on the Light. From Kia's own Features & Options files.",
    breadcrumbLabel: "Kia EV6 heat pump",
    dateModified: "2026-08-25",
    faq: [
      {
        question: "Does the Kia EV6 have a heat pump?",
        answer:
          "It depends on the individual car, not just the trim. Kia's own Features & Options grid marks the heat pump Optional on the Wind and GT-Line in every model year from 2022 through 2026, Standard on the GT from 2023 on, and Not Available on the 2022 Light and on the Light Short Range from 2024 on. For 2024 through 2026 the Light Long Range is Optional too. Kia's legend, printed in each file: S = Standard, O = Optional, - = Not Available.",
      },
      {
        question: "Which Kia EV6 trims always have a heat pump?",
        answer:
          "The GT, from its first model year 2023 onward — Kia marks it Standard there. No Light (2022) and no Light Short Range (2024 onward) has one; Kia marks those Not Available. Every Wind and GT-Line, in every model year, has to be checked individually.",
      },
      {
        question: "Is the Kia EV6 heat pump tied to all-wheel drive?",
        answer:
          "Kia's documents do not state a rule, and this page does not claim one. What the documents show is that in each of the five model years the Heat Pump row and the All Wheel Drive (AWD) row carry identical marks, cell for cell, in every trim column. Kia also does not sell the heat pump as a named line item: its 2022 and 2025 EV6 pricing sheets list no factory-installed or port-installed option named for one.",
      },
      {
        question: "How can I tell whether a used Kia EV6 has a heat pump?",
        answer:
          "Not from the model name or the trim, on a Wind or GT-Line of any year. Kia's own 2025 EV6 Owner's Manual confirms the car is built both ways: its air conditioning table gives two refrigerant charges, \"With heat pump\" 850±25 g and \"Without heat pump\" 750±25 g, both R-1234yf.",
      },
    ],
  },
];

export function findFactSheet(make: string, model: string, topic: string): FactSheetEntry | undefined {
  return FACT_SHEETS.find((s) => s.make === make && s.model === model && s.topic === topic);
}
