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
// The lineup is the owner's and it has moved three times: 2026-08-26 cut
// "unlimited alerts" (free alerts are effectively unlimited; shrinking them
// would be the retraction §1 forbids); 2026-09-02 morning made the deal push
// user-defined and shipped a deal-ranked SORT plus a Pro alert cadence;
// 2026-09-02 evening the owner replaced that with the three below, in his own
// words, and ruled that price-drop alerts are for everyone — untiered — so
// the cadence distinction was removed (publish-feed.yml now runs the sender
// for every subscriber after every publish). Later the same evening the owner
// added the standing order — "describe your ideal car ... be notified when it
// becomes available" — and ruled that FREE alerts are price-cut only, so
// new-car emails are the Pro half (send-alerts.mjs). What a pass buys today:
// the deals filter (lib/listings/deal.ts, ≥DEAL_MIN_PCT under similar
// listings, on the grid and in a pass-holder's emails) and the standing
// order (lib/watch.ts). Market trends and rebates are research lanes not yet
// built. 2026-09-03: the owner rewrote all four lines and dropped the
// live/coming chips from the page ("with no visitors, it's not necessary to
// tell people what's live versus what's coming"), so `live` is now only what
// offerState() reads to decide whether a pass may be sold — it renders
// nowhere. The free-forever list left the page the same day: what everyone
// gets is not the Pro page's subject.

import { DEAL_MIN_PCT } from "./listings/deal";

/** A stable handle for one benefit, so a surface can name the benefit it is
 *  gating without copying its title. The titles are the owner's and have
 *  been rewritten four times; an id has not moved. */
export type ProBenefitId = "market-trends" | "deals-filter" | "rebates" | "deal-alert";

export interface ProBenefit {
  id: ProBenefitId;
  /** One line, in the shopper's terms. */
  title: string;
  /** What it does — or, while it is coming, what it will do. */
  detail: string;
  /** True only when a paying shopper would actually get this today. */
  live: boolean;
}

/** The Pro column, in the owner's words (2026-09-03, verbatim — copy on this
 *  site is the owner's, not ours; see docs/MONETIZATION.md §1). The deals
 *  threshold is read from lib/listings/deal.ts so the page and the filter
 *  cannot disagree about the number. */
export const PRO_BENEFITS: ProBenefit[] = [
  {
    // 0061/0062 + components/PriceTrend.tsx on the /worth result, 2026-09-03.
    id: "market-trends",
    title: "Market trends",
    detail: "Track prices over time, and make informed decisions about when to buy or when to sell",
    live: true,
  },
  {
    id: "deals-filter",
    title: "Filter by deals",
    detail: `An extra search filter for vehicles priced ${DEAL_MIN_PCT}% or more below average`,
    live: true,
  },
  {
    // Pro since 2026-09-03: the rail toggle, the card tag and the listing
    // block (components/Incentives.tsx, blurred like the trends) all read
    // the pass. Owner: "it should be paywalled like price trends are".
    id: "rebates",
    title: "Rebate eligibility",
    detail: "Many EVs still qualify for local tax credits or utility rebates",
    live: true,
  },
  {
    // The standing order (lib/watch.ts, components/WatchForm.tsx).
    id: "deal-alert",
    title: "Deal alert",
    detail: "Email notification when a car you want appears on the site or drops into your price range",
    live: true,
  },
];

/** One benefit's title, for a surface that gates on it — today the two
 *  blurred blocks on a car's page (components/ProBlur.tsx). Owner, 2026-09-04:
 *  a visitor "need[s] to know what's actually blurred out below the blur, so
 *  it should say something about the rebate, not just voltcheck pro." Read
 *  from here rather than retyped so a blur caption can never promise
 *  something the /pro page does not sell, the same way the deals threshold is
 *  read from lib/listings/deal.ts. */
export function proBenefitTitle(id: ProBenefitId, benefits: ProBenefit[] = PRO_BENEFITS): string {
  const b = benefits.find((x) => x.id === id);
  if (!b) throw new Error(`no Pro benefit "${id}"`);
  return b.title;
}

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
