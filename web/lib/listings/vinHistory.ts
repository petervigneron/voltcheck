// What this exact car's past listings can be said to have done — the rows
// behind components/VinHistory.tsx, decided here so the component prints and
// judges nothing.
//
// Two facts, both from the materialized view of the same name (migration
// 0085), which is where the evidence argument lives. The short version:
//
//   * the car was listed on another SITE, at a price, on a date. A site, not
//     a seller — most survivors are same-owner rooftop pairs
//     (machens.com -> machensfordcapitalcity.net), so "another dealer" would
//     be a claim the data does not make (0061).
//   * the car left and came back. Only when the delist came from the car's
//     own page (a recheck 404, not a crawl that missed half a lot) and the
//     absence ran a week or more. 0083: 48% of the crawl's delists Sep 7-11
//     were undone within three days.
//
// The 7-day floor is enforced in the view AND again here. That is not
// belt-and-braces for its own sake: this module is the only thing standing
// between a shopper and a sentence about a car vanishing, and the view is a
// nightly snapshot that a future migration could widen without anyone
// re-reading this file.
//
// NOT here, deliberately: the odometer (measured and rejected — 0085's header
// has the 473 cars and why every readable one was a typo, not a rollback),
// and firstSeenAt, which the view carries but nothing prints, because the
// guarded listing date already has a row on this page (Listing.listedOn,
// migration 0028) and the unguarded one is our tracking start wearing a
// listing date's clothes.

/** One row of the view, as the database hands it over. */
export interface VinHistory {
  /** When this VIN first entered the archive. Carried, never printed. */
  firstSeenAt?: string;
  priorSite?: { domain: string; priceUsd: number; lastSeenAt: string };
  absences?: { goneAt: string; backAt: string }[];
}

/** An absence shorter than this is a crawl flickering, not a car leaving. */
export const MIN_ABSENCE_DAYS = 7;
const MIN_ABSENCE_MS = MIN_ABSENCE_DAYS * 86_400_000;

/** label + value, in the summary card's dialect. `at` orders the block. */
export interface VinHistoryRow {
  label: string;
  value: string;
  at: number;
}

const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const day = (iso: string) => DAY_FMT.format(new Date(iso));
const usd = (n: number) => `$${n.toLocaleString()}`;
const ms = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);

// PLACEHOLDER COPY — owner writes the final words. "No longer listed" is the
// site's existing phrase for a listing that ended (app/listing/[id]/Delisted.tsx)
// and is used here for the same reason it is used there: we know the seller
// stopped listing the car, never that it sold.
export const PRIOR_SITE_LABEL = "Previously listed";
export const ABSENCE_LABEL = "No longer listed";

/**
 * The rows to print, oldest first. Empty means print nothing — there is no
 * empty state for this block and no sentence reporting that a car has no
 * history, which is the great majority of them.
 *
 * `realPrice` is the caller's junk floor (lib/listings/price.ts hasRealPrice,
 * closed over this car's year and condition): a lease payment logged under an
 * earlier domain is not a price that car was once listed at.
 */
export function vinHistoryRows(
  history: VinHistory | undefined,
  realPrice: (priceUsd: number) => boolean
): VinHistoryRow[] {
  if (!history) return [];
  const rows: VinHistoryRow[] = [];

  const prior = history.priorSite;
  if (prior && prior.domain && realPrice(prior.priceUsd) && Number.isFinite(ms(prior.lastSeenAt))) {
    rows.push({
      label: PRIOR_SITE_LABEL,
      // Three values, no sentence: where, how much, when we last saw it
      // there. "Until" is not available — a price row is written on change,
      // so the last one says when that price was standing, not when the
      // listing ended.
      value: `${prior.domain} · ${usd(prior.priceUsd)} · ${day(prior.lastSeenAt)}`,
      at: ms(prior.lastSeenAt),
    });
  }

  for (const gap of history.absences ?? []) {
    const gone = ms(gap.goneAt);
    const back = ms(gap.backAt);
    if (!Number.isFinite(gone) || !Number.isFinite(back)) continue;
    if (back - gone < MIN_ABSENCE_MS) continue;
    rows.push({ label: ABSENCE_LABEL, value: `${day(gap.goneAt)} – ${day(gap.backAt)}`, at: gone });
  }

  return rows.sort((a, b) => a.at - b.at);
}
