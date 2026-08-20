import type { EnrichmentRow } from "../types";
import type { Listing } from "./types";

/** Is the high-voltage battery warranty on THIS car still in force?
 *
 *  The fact table used to answer a different question. It printed the
 *  cohort's terms — "8 yr / 100,000 mi", "Battery coverage transfers: Yes" —
 *  under a 2017 Bolt with 137,703 miles on it. Terms are what the
 *  manufacturer sold; a shopper is buying one specific car.
 *
 *  There are two ways to answer for one car, and they are not close in
 *  quality.
 *
 *  ── The real one: ask the manufacturer about this VIN ─────────────────────
 *
 *  `listing.batteryCoverage` is GM's own record for this car, and where it
 *  exists nothing else gets a vote. It carries the in-service date, which is
 *  what actually starts the clock and which nothing else on this site knows,
 *  and on a recalled Bolt it carries the date and odometer of the replacement
 *  pack — which RESTARTS the clock. GM's own warranty administration bulletin
 *  (MC-10217072, July 2022) is explicit: batteries replaced under the Bolt
 *  recall get a fresh 8-year/100,000-mile Service Replacement Parts Limited
 *  Warranty, and "the replacement parts warranty term begins the date and
 *  mileage at the time of battery replacement."
 *
 *  This is not a rare correction. The 2017 Bolt above had its pack replaced on
 *  2021-12-23 at 34,374 miles, so its battery is covered to 2029-12-23 or
 *  134,374 miles — not the 2025/100,014 its original warranty ran to. Every
 *  2017-2019 Bolt checked so far came back replaced, which is what GM's own
 *  recall bulletin says should happen: N212343881 covers all 2017-2019 Bolt
 *  EVs and its correction reads "Dealers will replace the lithium-ion battery
 *  pack in the vehicle."
 *
 *  ── The fallback: bound what cannot be computed ───────────────────────────
 *
 *  Without that record, miles are exact — the odometer is dealer-stated, same
 *  standing as the price, and only ever goes up — but years are not, because
 *  the term runs from an in-service date we do not have. So the time clock is
 *  bounded rather than computed, and each bound is read in whichever direction
 *  cannot overstate coverage: to call a warranty EXPIRED assume the latest
 *  in-service date the model year allows (leftover new stock sells into the
 *  following calendar year); to call one IN FORCE assume the earliest (a model
 *  year goes on sale the calendar year before it). Between those the answer is
 *  genuinely unknown and the row falls back to the terms.
 *
 *  The asymmetry is the same one the price model uses. Telling a shopper a
 *  dead warranty is alive can cost them a pack, and a replacement pack is most
 *  of what these cars are worth.
 */
/** `label` is the whole of what renders: "Expired" needs no sentence after it,
 *  and an owner asking to see one got the answer he already had, twice. `why`
 *  is the working behind it and belongs in the row's tooltip, where it can be
 *  checked without being read. */
export type BatteryWarranty =
  | { state: "expired"; label: string; why: string }
  | { state: "active"; label: string; why: string }
  | { state: "unknown" };

/** Cohorts where a recall replaced the pack and restarted the warranty, so the
 *  original terms describe a clock this car may no longer be running on.
 *
 *  Recall 21V-560 covers every 2017-2019 Bolt EV and 21V-650 extends to
 *  2020-2022 Bolt EV and 2022 Bolt EUV. Guessing from the cohort is not an
 *  option in either direction: GM made diagnostic software the default remedy
 *  for the 2020-2022 cars in 2023, so many of those kept their original packs,
 *  while the 2017-2019 cars were replaced outright. Without this car's own
 *  record, both "Expired" and "In force" are claims we cannot support — a
 *  2019 Bolt at 110,000 miles reads expired on the original terms and is
 *  covered to 121,731 miles on the pack it actually has.
 *
 *  So this is not a hint to weigh. It is a hard abstention, and it lifts only
 *  when scraper/gm-warranty.mjs has fetched this VIN. */
function underPackReplacementRecall(l: Pick<Listing, "make" | "model" | "year">): boolean {
  if (l.make.trim().toUpperCase() !== "CHEVROLET") return false;
  const model = l.model.trim().toUpperCase();
  if (model !== "BOLT EV" && model !== "BOLT EUV") return false;
  return l.year >= 2017 && l.year <= 2022;
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function batteryWarranty(
  row: EnrichmentRow | undefined,
  listing: Pick<Listing, "year" | "mileage" | "make" | "model" | "batteryCoverage">,
  now: Date = new Date()
): BatteryWarranty {
  const odo = listing.mileage;

  // ── The manufacturer's own record for this VIN ───────────────────────────
  const cov = listing.batteryCoverage;
  if (cov) {
    const expiresAt = Date.parse(cov.expiresDate);
    const outOfTime = Number.isFinite(expiresAt) && now.getTime() > expiresAt;
    const outOfMiles = cov.expiresMileage != null && odo != null && odo >= cov.expiresMileage;
    if (outOfTime || outOfMiles) {
      return {
        state: "expired",
        label: "Expired",
        // Which limit ran out first, and on which pack, is the working — the
        // tooltip's job, not the row's.
        why: `${cov.fromReplacement ? "Replacement pack, fitted " + MONTH_YEAR.format(Date.parse(cov.startDate)) + ": " : ""}${
          outOfMiles
            ? `past ${cov.expiresMileage!.toLocaleString()} mi`
            : `ran out ${MONTH_YEAR.format(new Date(expiresAt))}`
        }`,
      };
    }
    // The expiry date rides in the value because it is the fact, not a gloss
    // on it: coverage running to 2029 on a 2017 car is the thing worth seeing.
    const milesLeft = cov.expiresMileage != null && odo != null ? cov.expiresMileage - odo : undefined;
    return {
      state: "active",
      label: `In force to ${MONTH_YEAR.format(new Date(expiresAt))}`,
      why: `${cov.fromReplacement ? "Replacement pack, fitted " + MONTH_YEAR.format(Date.parse(cov.startDate)) + ". " : ""}${
        milesLeft != null ? `${milesLeft.toLocaleString()} mi left of ${cov.expiresMileage!.toLocaleString()}` : "Mileage limit unknown"
      }`,
    };
  }

  // ── No record. Some cohorts cannot be answered from terms at all ─────────
  if (underPackReplacementRecall(listing)) return { state: "unknown" };

  const years = row?.warranty?.batteryYears?.value;
  const miles = row?.warranty?.batteryMiles?.value;
  if (years == null && miles == null) return { state: "unknown" };
  const year = listing.year;

  // Past the mileage limit: exact, and it cannot come back.
  if (miles != null && odo != null && odo >= miles) {
    return { state: "expired", label: "Expired", why: `${odo.toLocaleString()} mi is past the ${miles.toLocaleString()} mi limit` };
  }

  // Past the term even on the most generous in-service date the model year
  // allows. Compared against the end of that calendar year, so a car is never
  // called expired part-way through a year it might still be covered in.
  const latestExpiryYear = years != null && year != null ? year + 1 + years : undefined;
  if (latestExpiryYear != null && now.getUTCFullYear() > latestExpiryYear) {
    return { state: "expired", label: "Expired", why: `${years}-year term ran out by ${latestExpiryYear}` };
  }

  // In force on both clocks, under the reading least favourable to the claim.
  const earliestExpiryYear = years != null && year != null ? year - 1 + years : undefined;
  const timeSafe = earliestExpiryYear != null && now.getUTCFullYear() < earliestExpiryYear;
  const milesSafe = miles != null && odo != null && odo < miles;
  if (timeSafe && milesSafe) {
    // "In force" with nothing after it answered the question and then dropped
    // it: in force for how long? The mileage headroom is exact — the odometer
    // is dealer-stated and only climbs — so it can be stated flat. The time
    // side cannot: the term runs from an in-service date we don't have, so we
    // give the floor that assumption can't undercut. Read least-favourably (the
    // earliest in-service the model year allows), coverage is guaranteed on the
    // clock through the end of earliestExpiryYear - 1, so that many whole years
    // from now is a minimum, marked "+". Whichever limit lands first ends it,
    // hence "or".
    const milesLeft = miles! - odo!;
    const minYearsLeft = earliestExpiryYear! - 1 - now.getUTCFullYear();
    const label =
      minYearsLeft >= 1
        ? `In force · ${milesLeft.toLocaleString()} mi or ${minYearsLeft}+ yr left`
        : `In force · ${milesLeft.toLocaleString()} mi left`;
    return {
      state: "active",
      label,
      why: `${milesLeft.toLocaleString()} mi left of ${miles!.toLocaleString()}. The ${years}-year term runs from an in-service date we don't have, so the years shown are a floor — read from the earliest in-service this model year allows.`,
    };
  }

  return { state: "unknown" };
}
