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

  if (make === "HYUNDAI" || make === "KIA" || make === "GENESIS") {
    items.push({
      question: "ICCU extended-coverage terms in writing, including transfer",
      why: "The April 2026 extension to 15yr/180k has no published transfer terms yet.",
    });
  }

  if (make === "KIA" && model.includes("EV6")) {
    items.push({
      question: "Window sticker (heat pump option)",
      why: "It was a standalone factory option on Wind and GT-Line; the sticker is the only authority.",
    });
  }

  return items;
}
