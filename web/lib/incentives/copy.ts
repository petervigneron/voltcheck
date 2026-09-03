// The shopper-facing words the incentive feature prints, and the gate that
// keeps the feature dark while any of them is still a placeholder.
//
// Two strings, both the owner's (2026-09-03). Everything else the feature
// shows is data: the program's own name (linked to its page), the program's
// own figure or its cap, and the program's conditions as sentences from the
// registry. The value is the answer; no label sits over it.
//
// The "[OWNER COPY]" marker is how a placeholder is recognised. While any
// string carries it, INCENTIVES_COPY_READY is false and nothing renders: not
// the listing block, not the rail toggle, not the card tile. On 2026-09-02 a
// deploy carrying placeholder literals was cancelled minutes before it
// promoted; the gate is what makes that impossible to repeat.
//
// Importable from client and server code alike (no React, no data).

export const INCENTIVE_COPY = {
  /** The rail toggle's button text; also the chip when set from the panel.
   *  Owner's word, 2026-09-03. The toggle keeps cars that meet at least one
   *  program's vehicle conditions, including cars asking up to 10% over a
   *  price-paid cap (never over an MSRP cap). */
  toggleLabel: "Rebate eligible",
  /** One line at the foot of the listing-page block. Owner's direction,
   *  2026-09-03: each car page is clear that eligibility is the shopper's
   *  to confirm. */
  confirmLine: "Eligibility is for the shopper to confirm with the program.",
  /** The card's tag when the program the car leads with is a state or
   *  regional one. "{ST}" is the dealer's state code. Owner's pattern,
   *  2026-09-03 ("something like 'CA resident rebate'"), replacing the
   *  figure-and-name tile that overran a narrow card ("$4,000 California
   *  Clean Cars 4 All"). The figures stay on the car's own page. */
  residentTag: "{ST} resident rebate",
  /** The same tag when only a utility's program names the car: a PECO
   *  customer is a Pennsylvanian, but not every Pennsylvanian is a PECO
   *  customer, so "resident" would claim too much. Not yet the owner's
   *  word — flagged for him 2026-09-03. */
  utilityTag: "{ST} utility rebate",
} as const;

const MARKER = "[OWNER COPY]";

export const INCENTIVES_COPY_READY: boolean = Object.values(INCENTIVE_COPY).every((s) => !s.includes(MARKER));
