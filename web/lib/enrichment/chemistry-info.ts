import type { Chemistry } from "@/lib/types";

// Plain-language tradeoffs for each cell chemistry, shown when a shopper hovers
// (or focuses) the Chemistry row on the detail page. These are the general
// characteristics of the chemistry *family*, not a measurement of the specific
// car — the tooltip says so, so an educational aside never reads as a per-VIN
// claim. Kept to short phrases a buyer can act on: how long it lasts, how safe
// it is, how it behaves in the cold, how high to charge it day to day.
export interface ChemistryInfo {
  full: string; // expanded name of the abbreviation
  pros: string[];
  cons: string[];
}

// NMC and NCM are the same chemistry written two ways (nickel-manganese-cobalt);
// they share one entry so the two spellings can't drift apart.
const NICKEL_MANGANESE_COBALT: ChemistryInfo = {
  full: "Nickel manganese cobalt",
  pros: [
    "High energy density — good range for the weight",
    "Holds range better than LFP in the cold",
    "Strong all-round power delivery",
  ],
  cons: [
    "Wears faster than LFP over many charge cycles",
    "Best kept to ~80–90% for daily charging",
    "Contains cobalt (higher cost, sourcing concerns)",
  ],
};

export const CHEMISTRY_INFO: Record<Chemistry, ChemistryInfo> = {
  LFP: {
    full: "Lithium iron phosphate",
    pros: [
      "Longest lifespan — the most charge cycles before it fades",
      "Safest chemistry; very stable under heat or damage",
      "Fine to charge to 100% every day",
      "No cobalt or nickel, so cheaper to build",
    ],
    cons: [
      "Less range for the same size and weight",
      "Loses more range in cold weather",
      "Slower DC fast-charging when cold",
    ],
  },
  NMC: NICKEL_MANGANESE_COBALT,
  NCM: NICKEL_MANGANESE_COBALT,
  NCA: {
    full: "Nickel cobalt aluminum",
    pros: [
      "Very high energy density — maximum range and power",
      "Used in some of the longest-range packs built",
    ],
    cons: [
      "Wears faster than LFP over many charge cycles",
      "Best kept to ~80% for daily charging",
      "More heat-sensitive; contains cobalt",
    ],
  },
  NCMA: {
    full: "Nickel cobalt manganese aluminum",
    pros: [
      "High energy density — long range for the weight",
      "Added aluminum improves stability and lifespan over NMC",
      "Uses less cobalt than older nickel chemistries",
    ],
    cons: [
      "Best kept to ~80–90% for daily charging",
      "More heat-sensitive than LFP",
      "Newer chemistry, so less long-term field history",
    ],
  },
};
