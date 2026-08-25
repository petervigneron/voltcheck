// What Voltcheck Pro currently is, and whether we are in a position to sell
// it. Deliberately separate from lib/pro.ts: that file is the billing spine
// (tokens, Stripe, entitlement), this one is the claim the /pro page makes.
//
// It holds no secrets, touches no database and imports nothing from Next, so
// the page's honesty is a pure function that a test can pin.
//
// ── Why a `live` flag on every benefit ─────────────────────────────────────
//
// docs/MONETIZATION.md §1 lists four Pro features. As of 2026-08-25 every one
// of them is unbuilt, and the house rule ("claim only what is true") makes
// that a fact the page has to carry rather than a detail to gloss:
//
//   * Real-time deal push — the alerts lane (0029, .github/workflows/
//     alerts.yml) is a once-a-day digest, and it is free.
//   * Unlimited alerts — alerts ARE effectively unlimited today: 0029 caps an
//     address at 20 searches as an anti-abuse measure and knows nothing about
//     paying. There is no free-vs-Pro distinction to sell. Lowering the free
//     allowance to 1 to create one would be exactly the retraction §1 exists
//     to prevent ("the free alert limit is a ratchet ... it can never be
//     lowered"), and would land while nobody can buy the way out of it.
//   * Deal-ranked screener — control-tested absent: components/Filters.tsx
//     offers price / year / mileage / range / distance and no deal sort.
//   * Valuation tracking — the valuation tool itself is not built.
//
// So the page says "coming" four times, and offerState() refuses to take
// money for it. Flipping the first `live: true` is what opens the funnel.

export interface ProBenefit {
  /** One line, in the shopper's terms. */
  title: string;
  /** What it does — or, while it is coming, what it will do. */
  detail: string;
  /** True only when a paying shopper would actually get this today. */
  live: boolean;
}

/** The Pro column of docs/MONETIZATION.md §1, with its honesty attached. */
export const PRO_BENEFITS: ProBenefit[] = [
  {
    title: "Every qualifying deal, pushed",
    detail:
      "A car priced under what its cohort sold for reaches you the day it lists, without you running the search again.",
    live: false,
  },
  {
    title: "Unlimited saved-search alerts",
    detail: "Watch as many searches as you are actually shopping, not one.",
    live: false,
  },
  {
    title: "Deal-ranked screener",
    detail: "The whole market sorted by our estimate of what each car is worth, not by asking price.",
    live: false,
  },
  {
    title: "Valuation tracking",
    detail: "Tell me when my own car's value moves, so I know when to sell.",
    live: false,
  },
];

/** The free-forever line of docs/MONETIZATION.md §1, printed so it is a
 *  public promise rather than an internal note. Every item here is live. */
export const FREE_FOREVER: string[] = [
  "Every listing, every battery and range fact, every price history",
  "The ask-vs-sold delta, on the card and on the car's page",
  "The VIN check, on any EV, whether or not it is listed here",
  "Saved-search email alerts",
];

export type OfferState =
  /** Benefits exist and Stripe is configured — the buttons work. */
  | "open"
  /** There is something to sell but no processor configured. */
  | "no-processor"
  /** Nothing a buyer would get. Do not take the money. */
  | "nothing-to-sell";

/** Whether Stripe is wired up in this environment. Mirrors the guard in
 *  app/api/checkout/route.ts, so the page and the endpoint can never disagree
 *  about whether a button would work. */
export const checkoutConfigured = (): boolean => !!process.env.STRIPE_SECRET_KEY;

/** Should the page offer to sell a pass?
 *
 *  "Nothing to sell" is checked FIRST and on purpose. It is the stronger
 *  reason and the one that outlives an env var: setting the Stripe keys must
 *  not be enough to start charging for features that do not exist yet. */
export function offerState(benefits: ProBenefit[] = PRO_BENEFITS): OfferState {
  if (!benefits.some((b) => b.live)) return "nothing-to-sell";
  if (!checkoutConfigured()) return "no-processor";
  return "open";
}
