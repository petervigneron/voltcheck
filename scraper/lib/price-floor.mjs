// Junk-price floors — the scraper's one copy, mirrored in
// web/lib/listings/price.ts (PRICE_FLOOR_USD / NEW_PRICE_FLOOR_USD /
// RECENT_USED_PRICE_FLOOR_USD). Two copies, keep them in sync.
//
// No new EV lists under $15k; old Leafs are real cars at real four-figure
// prices. But a RECENT used EV under $5k is not a price — it's a payment.
// Dealer feeds intermittently publish a finance figure in the price slot:
// verified live 2026-08-19 on dealer.com JSON-LD offers.price —
// beckchryslerdodgejeep.com served $1,280 on a 2024 Wrangler 4xe
// (1C4RJXP62RW249692) with every DDC price field zeroed, and the same
// artifact had earlier reached production as $1,493 on a 2023 Model Y
// (caritenorthorlando.com) and $1,150 on a 2023 EQE (mercedesbenzsouthorlando
// .com), plus transient $1,996 dips in listing_price_history
// (hyundaioflasvegas.com). The cheapest real 2020+ EV ask we have ever
// observed is well above $5k, so below it we abstain rather than print a
// false bargain — the house rule's asymmetric caution.
export const NEW_PRICE_FLOOR = 15_000;
export const USED_PRICE_FLOOR = 1_000;
export const RECENT_USED_PRICE_FLOOR = 5_000;
export const RECENT_EV_YEAR = 2020;

// The minimum a served number must clear to be believable as this car's
// asking price. An unknown year can't establish "recent", so it keeps the
// low used floor — same conservatism as an unknown condition.
export function priceFloor({ isNew, year }) {
  if (isNew) return NEW_PRICE_FLOOR;
  return Number(year) >= RECENT_EV_YEAR ? RECENT_USED_PRICE_FLOOR : USED_PRICE_FLOOR;
}
