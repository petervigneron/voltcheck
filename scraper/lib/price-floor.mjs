// Junk-price floors — the scraper's one copy, mirrored in
// web/lib/listings/price.ts (NEW_PRICE_FLOOR_USD / LATE_MODEL_USED_FLOOR_USD /
// RECENT_USED_PRICE_FLOOR_USD / PRICE_FLOOR_USD). Two copies, keep them in sync.
//
// A dealer feed intermittently publishes a number that isn't the price in the
// price slot — almost always a monthly payment, a "startup"/subscription fee,
// or a down payment. Verified live on dealer.com JSON-LD offers.price
// (2026-08-19): $1,280 on a 2024 Wrangler 4xe (beckchryslerdodgejeep.com)
// with every DDC price field zeroed, and earlier $1,493 on a 2023 Model Y
// and $1,150 on a 2023 EQE. The house rule's asymmetric caution says a false
// bargain is the most expensive error, so below the floor we abstain rather
// than print a number that isn't a price.
//
// A single flat used floor could not tell a real cheap car from a payment,
// because "cheap" depends on the car. Three false bargains reported live
// 2026-08-20, one per band, each clearing the old flat $5k/$1k floors:
//   - a 2026 Mustang Mach-E at $5,500 (pricefordofsimivalley.com) — its own
//     new-inventory page listed no condition, so it dodged the $15k new floor
//     and landed on the $5k recent-used one; four VINs, all $5,500, while the
//     dealer's sibling Mach-Es ask $43k–$48k;
//   - a 2024 Rolls-Royce Spectre CPO at $5,399 (ogaracoachsandiego.com) — a
//     ~$420k car, the $5,399 a monthly payment that cleared the $5k floor;
//   - a 2019 Tesla Model X at $1,990 (motorenvy.com) — literally "USD
//     1,990/mo", a subscription price, and 2019 fell below the recent-year
//     cutoff so it only had to clear the $1k floor.
//
// So the used floor is now tiered by model year, cut where the live data
// actually separates real asks from payments (2026-08-20 inventory, live
// used/certified rows):
//   - 2020+ : cheapest real ask observed is $8,795 (a high-mileage 2022
//     Mirai); the payments in this band top out at $5,399. Floor $7,000 sits
//     in that gap.
//   - 2018–2019 : cheapest real ask is $5,995 (a 2018 Mirai); the only
//     payment is the $1,990 Model X. Floor $4,000 sits in that gap.
//   - <=2017 (or unknown year) : real cars go down to $2,400 (old Leafs,
//     Volts, i3s) and no payments were seen. Keep the low $1,000 floor.
// No new EV lists under $15,000, so new keeps its own high floor regardless
// of year.
export const NEW_PRICE_FLOOR = 15_000;
export const LATE_MODEL_USED_FLOOR = 7_000;
export const RECENT_USED_FLOOR = 4_000;
export const USED_PRICE_FLOOR = 1_000;
export const LATE_MODEL_YEAR = 2020;
export const RECENT_USED_YEAR = 2018;

// The minimum a served number must clear to be believable as this car's
// asking price. An unknown year can't establish recency, so it keeps the low
// used floor — same conservatism as an unknown condition.
export function priceFloor({ isNew, year }) {
  if (isNew) return NEW_PRICE_FLOOR;
  const y = Number(year);
  if (y >= LATE_MODEL_YEAR) return LATE_MODEL_USED_FLOOR;
  if (y >= RECENT_USED_YEAR) return RECENT_USED_FLOOR;
  return USED_PRICE_FLOOR;
}
