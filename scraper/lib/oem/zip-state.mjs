// ZIP3 → state, for locators that give a dealer ZIP but no state.
//
// Factored out of stellantis.mjs when the Audi lane needed the same mapping.
// Unlike grid.mjs (which left hyundai.mjs's inline copy alone because the
// construction there is intricate working code), this one is a static lookup
// table: two copies would drift the moment a range is corrected, so both
// callers import this.
//
// Ranges are the USPS ZIP3 allocations. A ZIP3 that falls in no range returns
// undefined rather than a guess — a wrong state puts a car in the wrong
// search results, which is worse than an absent one.
const ZIP3_STATE = [
  [5, 5, "NY"], [6, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"],
  [50, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"],
  [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"],
  [300, 319, "GA"],
  // Florida, checked against the USPS ZIP3 allocation 2026-08-23. In use:
  // 320-339, 341, 342, 344, 346, 347, 349. Unallocated and therefore left out
  // on purpose: 343, 345, 348. 344 is Ocala/Marion County (34470-34483) and
  // was missing, so a Genesis CPO car at ZIP 34471 published with no state and
  // fell out of state-filtered searches. 340 is not Florida at all — it is
  // APO/FPO "AA", Armed Forces Americas — so the range starts at 341.
  [320, 339, "FL"], [341, 342, "FL"], [344, 344, "FL"], [346, 347, "FL"], [349, 349, "FL"],
  [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"],
  [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [569, 569, "DC"], [570, 577, "SD"],
  [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"],
  [700, 715, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"],
  [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [889, 898, "NV"], [900, 961, "CA"],
  [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];

export function stateFromZip(zip) {
  const z = String(zip ?? "");
  if (!/^\d{5}/.test(z)) return undefined;
  const p = Number(z.slice(0, 3));
  for (const [lo, hi, st] of ZIP3_STATE) if (p >= lo && p <= hi) return st;
  return undefined;
}
