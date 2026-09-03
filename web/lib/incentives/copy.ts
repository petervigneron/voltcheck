// Every shopper-facing string the incentive feature prints, in one place, and
// the gate that keeps all of it dark until the owner has written it.
//
// The owner writes the site's copy (2026-09-02). The strings below are
// structural stand-ins that name the technical constraint each line carries;
// they are the exact places the words go. While any of them still carries
// the "[OWNER COPY]" marker, INCENTIVES_COPY_READY is false and nothing that
// reads from here renders: not the listing-page block, not the browse-rail
// toggle, not the card tile. On 2026-09-02 a deploy carrying the literals was
// cancelled minutes before it promoted; the gate is what makes that
// impossible to repeat. Replace the strings; do not touch the gate.
//
// Importable from client and server code alike (no React, no data).

export const INCENTIVE_COPY = {
  /** Listing-page section heading. Constraint: names programs, promises
   *  nothing; the site never says a shopper qualifies. */
  heading: "[OWNER COPY] Programs this car meets the vehicle conditions of",
  /** Label over the purchaser-side condition list. Constraint: conditions on
   *  the buyer that the site does not and cannot check. */
  purchaserConditions: "[OWNER COPY] Conditions on the buyer",
  /** Label over car-side conditions the listing could not settle (an MSRP
   *  cap, an eligible-vehicle list, a participating dealer). Constraint:
   *  checkable at the dealer, not here. */
  toCheck: "[OWNER COPY] To check on this car",
  /** Label beside further figures that depend on the buyer. Constraint: each
   *  is the program's own figure for a buyer who meets a further condition,
   *  never summed with the base figure. */
  purchaserSideAmounts: "[OWNER COPY] Also, for buyers who meet a further condition",
  /** Sub-heading over utility programs. Constraint: each is for that
   *  utility's own customers, which the listing cannot narrow. */
  utilityHeading: "[OWNER COPY] Utility programs, for that utility's customers",
  /** Link text to the program's own page. */
  programLink: "[OWNER COPY] Program page",
  /** The browse-rail toggle label. Constraint: "might", never "qualifies";
   *  the toggle keeps cars that meet at least one program's car-side
   *  conditions, including cars asking up to 10% over a program's cap. */
  toggleLabel: "[OWNER COPY] Rebate possible",
  /** The toggle's hover title, on and off. */
  toggleTitleOn: "[OWNER COPY] Remove: rebate possible",
  toggleTitleOff: "[OWNER COPY] Only cars that meet a rebate program's vehicle conditions",
  /** Chip text when the toggle is set from the panel. */
  chipLabel: "[OWNER COPY] Rebate possible",
  /** Card tile hover. `{program}` and `{usd}` are substituted; `{cap}` is the
   *  program's price cap when the ask sits over it. Constraint: the figure is
   *  the program's own, the buyer must confirm eligibility themselves. */
  tileTitle: "[OWNER COPY] {program}: up to {usd} for buyers who meet its conditions; confirm eligibility with the program",
  tileTitleOverCap: "[OWNER COPY] {program} caps at {cap}; this car is listed above it",
} as const;

const MARKER = "[OWNER COPY]";

export const INCENTIVES_COPY_READY: boolean = Object.values(INCENTIVE_COPY).every((s) => !s.includes(MARKER));

export function fillCopy(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
