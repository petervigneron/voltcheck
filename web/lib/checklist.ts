import type { ChecklistItem, VinDecode } from "./types";

// Compact, matter-of-fact pointers for facts only the seller can provide.
// Rendered de-emphasized (collapsed) — useful reference, not a lecture.
// History questions only apply to cars that have a history; new cars keep
// just the configuration items.
export function buildChecklist(decode: VinDecode, condition?: string): ChecklistItem[] {
  const isNew = condition === "new";
  const items: ChecklistItem[] = isNew
    ? []
    : [
        {
          question: "Battery health report",
          why: "The seller can pull one from the car; it's the only real degradation data, and nothing remote can measure it.",
        },
        {
          question: "Build date (door-jamb sticker) and original in-service date",
          why: "Settles mid-year running changes; the in-service date, not the model year, starts the warranty clock.",
        },
      ];

  const make = (decode.make ?? "").toUpperCase();
  const model = (decode.model ?? "").toUpperCase();

  if (!isNew && make === "CHEVROLET" && model.includes("BOLT")) {
    items.unshift({
      question: "GM campaign history for this VIN: which 21V560 program number?",
      why: "N212343880/81 = new modules or pack, N212343883 = software only. Free at GM's owner centre; \"recall complete\" alone doesn't say which.",
    });
  }

  if (!isNew && make === "TESLA") {
    items.push({
      question: "Is FSD owned or subscribed, and does it survive this transfer?",
      why: "Car-to-car FSD transfers ended March 2026; wiped FSD means $99/month for the next owner.",
    });
  }

  if (!isNew && make === "FORD" && model.includes("MACH")) {
    items.push({
      question: "Was the OTA battery-capacity unlock applied?",
      why: "Moves usable capacity by several kWh; not visible in any VIN lookup.",
    });
  }

  // Phrased as a question because every other item here is one, and because
  // the old wording ("ICCU extended-coverage terms in writing, including
  // transfer") was an instruction to the shopper, not something to ask the
  // seller. It carries no `why`: the question names the extension, the term
  // and the vehicle, and every sentence tried under it either restated those
  // ("the April 2026 extension to 15yr/180k...", the original) or told the
  // shopper how to conduct their own purchase ("...so get the answer in
  // writing"), which is not our place. The Ioniq 5 rows already print
  // "ICCU: 15 years / 180,000 miles" as an extendedCoverage fact on the same
  // page, so a why here put 15yr/180k on one screen three times.
  if (make === "HYUNDAI" || make === "KIA" || make === "GENESIS") {
    items.push({
      question: "Does the April 2026 15yr/180k ICCU extension apply to this vehicle?",
    });
  }

  if (make === "KIA" && model.includes("EV6")) {
    items.push({
      question: "Window sticker (heat pump option)",
      why: "It was a standalone factory option on Wind and GT-Line; the sticker is the only authority.",
    });
  }

  // Was a blanket "rental/rideshare voids the HV warranty" buyer note, first
  // on the Buzz rows (data5.ts, 2881c41) and identically on all 12 ID.4 rows
  // (data2.ts) — a cohort fact (VW's own warranty terms), not something we
  // can tell from a VIN. VW's booklet states it for every VW EV, not just
  // one model, so the rule applies fleet-wide rather than being duplicated
  // per model; the question is real, it just needs the seller's title
  // history to answer for this car.
  if (!isNew && make === "VOLKSWAGEN") {
    items.push({
      question: "Was this vehicle ever titled or used as a rental or rideshare vehicle?",
      why: "VW's HV battery warranty is void for commercial use, even for a later retail owner; only the seller's title history can answer this.",
    });
  }

  return items;
}
