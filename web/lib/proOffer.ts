// What Voltcheck Pro currently is, and whether we are in a position to sell
// it. Deliberately separate from lib/pro.ts: that file is the billing spine
// (tokens, Stripe, entitlement), this one is the claim the /pro page makes.
//
// It holds no secrets, touches no database and imports nothing from Next, so
// the page's honesty is a pure function that a test can pin.
//
// ── Why a `live` flag on every benefit ─────────────────────────────────────
//
// docs/MONETIZATION.md §1 lists the Pro features, and the house rule ("claim
// only what is true") makes each one's state a fact the page has to carry
// rather than a detail to gloss. From 2026-08-25 to 2026-09-02 every one was
// unbuilt and the page said "coming" four times; offerState() refused to take
// money for it.
//
// The lineup changed on 2026-08-26 (owner): "unlimited saved-search alerts"
// was CUT — alerts are effectively unlimited already (0029 caps an address at
// 20 searches as an anti-abuse measure and knows nothing about paying), and
// lowering the free allowance to manufacture scarcity would be exactly the
// retraction §1 exists to prevent. What replaced it is the thing the free
// lane genuinely does not do: CADENCE. The free digest goes out once a day
// (.github/workflows/alerts.yml, 11:30 PT); a pass has the same
// subscriptions re-run after every feed publish (publish-feed.yml's
// pro-alerts job, send-alerts.mjs --pro), so a match reaches the shopper the
// crawl it lands in.
//
// And on 2026-09-02 the deal push became USER-DEFINED (owner): "email me any
// Ioniq 5 SEL AWD under 50,000 miles for under $30,000" is a saved search with
// the Pro cadence, not a separate feature ranking cars by our own estimate.
// Whether a car qualifies is the shopper's criteria, which the site can always
// stand behind; "under what its cohort sold for" is a sold-price claim the
// site withholds outside Washington (card.ts askVsSold) and could not push.
//
// The screener is the one benefit that IS our estimate: the browse sort
// "Under market: most" orders the grid by the ask-vs-market delta every card
// already prints (lib/listings/dealSort.ts). Nothing new is claimed; what a
// free shopper sees on one card, a pass lets them sort the country by.

export interface ProBenefit {
  /** One line, in the shopper's terms. */
  title: string;
  /** What it does — or, while it is coming, what it will do. */
  detail: string;
  /** True only when a paying shopper would actually get this today. */
  live: boolean;
}

/** The Pro column of docs/MONETIZATION.md §1 (lineup of 2026-08-26 and
 *  2026-09-02), with its honesty attached. */
export const PRO_BENEFITS: ProBenefit[] = [
  {
    title: "Your search, pushed after every crawl",
    detail:
      "Save a search as exact as you like — an Ioniq 5 SEL AWD under 50,000 miles for under $30,000 — and a car that matches reaches you the crawl it lands in. Free alerts go out once a day; a pass sends after each of the day's crawls.",
    live: true,
  },
  {
    title: "Price cuts, the crawl we see them",
    detail:
      "A cut on any car matching a search you watch is mailed as soon as a crawl records it, hours ahead of the daily digest.",
    live: true,
  },
  {
    title: "Deal-ranked screener",
    detail:
      "Sort the whole market by how far each car sits under similar listings, adjusted for mileage, instead of by asking price.",
    live: true,
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
  "Saved-search email alerts, once a day",
];

export type OfferState =
  /** Benefits exist and Stripe is configured — the buttons work. */
  | "open"
  /** There is something to sell but no processor that can take real money. */
  | "no-processor"
  /** Nothing a buyer would get. Do not take the money. */
  | "nothing-to-sell";

/** Whether Stripe is wired up in this environment with a LIVE key. Mirrors
 *  the guard in app/api/checkout/route.ts (via offerState), so the page and
 *  the endpoint can never disagree about whether a button would work.
 *
 *  A test-mode key is not "configured" here, on purpose. Production carried
 *  sk_test_ keys from 2026-08-27 until the first benefit shipped, and the
 *  moment a benefit flipped live the page would otherwise have shown a real
 *  shopper a button whose checkout rejects every real card. The switch to
 *  live keys is the owner's step in the Stripe dashboard, and until it is
 *  taken the page keeps saying "opens soon". STRIPE_ALLOW_TEST_CHECKOUT=1 is
 *  the local/preview override for exercising the funnel end to end with
 *  Stripe's test cards. */
export const checkoutConfigured = (): boolean => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return false;
  return /^(sk|rk)_live_/.test(key) || process.env.STRIPE_ALLOW_TEST_CHECKOUT === "1";
};

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
