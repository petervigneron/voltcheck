import type { EnrichmentRow } from "../types";
import type { Listing } from "./types";

/** Is the high-voltage battery warranty on THIS car still in force?
 *
 *  The fact table used to answer a different question. It printed the
 *  cohort's terms — "8 yr / 100,000 mi", "Battery coverage transfers: Yes" —
 *  under a 2017 Bolt with 137,703 miles on it, whose battery warranty ran out
 *  on mileage long ago. Terms are what the manufacturer sold; a shopper is
 *  buying one specific car, and the only version of this fact worth a row is
 *  the one about that car.
 *
 *  Two clocks run, and they are known to different precisions:
 *
 *  MILES are exact. The odometer is dealer-stated, same standing as the price,
 *  and it only ever goes up — so a car past the mileage limit is past it, and
 *  no later discovery reverses that.
 *
 *  YEARS are not. The term runs from the in-service date, which no feed
 *  carries and no VIN encodes; we know only the model year. So the time clock
 *  is bounded rather than computed, and the bounds are read in whichever
 *  direction cannot overstate coverage:
 *
 *    - to call a warranty EXPIRED on time, assume the latest in-service date
 *      the model year allows (leftover new stock sells into the following
 *      calendar year, so: end of modelYear + 1). Only when even that generous
 *      reading has run out do we say expired.
 *    - to call one IN FORCE, assume the earliest (a model year goes on sale
 *      the calendar year before it: start of modelYear - 1). Only when even
 *      that pessimistic reading is still inside the term do we say in force.
 *
 *  Between those bounds the answer is genuinely unknown and the row falls back
 *  to the terms — which is what "check the in-service date" means, said as a
 *  value rather than as advice.
 *
 *  The asymmetry is the point, and it is the same one the price model uses:
 *  telling a shopper a dead warranty is alive can cost them a pack, and a
 *  replacement pack is most of what these cars are worth.
 */
export type BatteryWarranty =
  | { state: "expired"; label: string; why: string }
  | { state: "active"; label: string; why: string }
  | { state: "unknown" };

export function batteryWarranty(
  row: EnrichmentRow | undefined,
  listing: Pick<Listing, "year" | "mileage">,
  now: Date = new Date()
): BatteryWarranty {
  const years = row?.warranty?.batteryYears?.value;
  const miles = row?.warranty?.batteryMiles?.value;
  if (years == null && miles == null) return { state: "unknown" };

  const odo = listing.mileage;
  const year = listing.year;

  // Past the mileage limit: exact, and it cannot come back.
  if (miles != null && odo != null && odo >= miles) {
    return {
      state: "expired",
      label: "Expired",
      why: `${odo.toLocaleString()} mi is past the ${miles.toLocaleString()} mi limit`,
    };
  }

  // Past the term even on the most generous in-service date the model year
  // allows. Compared against the end of that calendar year, so a car is never
  // called expired part-way through the year it might still be covered in.
  const latestExpiryYear = years != null && year != null ? year + 1 + years : undefined;
  if (latestExpiryYear != null && now.getUTCFullYear() > latestExpiryYear) {
    return {
      state: "expired",
      label: "Expired",
      why: `the ${years}-year term ran out by ${latestExpiryYear}`,
    };
  }

  // In force on both clocks, under the reading least favourable to the claim.
  const earliestExpiryYear = years != null && year != null ? year - 1 + years : undefined;
  const timeSafe = earliestExpiryYear != null && now.getUTCFullYear() < earliestExpiryYear;
  const milesSafe = miles != null && odo != null && odo < miles;
  if (timeSafe && milesSafe) {
    return {
      state: "active",
      label: "In force",
      why: `${(miles! - odo!).toLocaleString()} mi left on the ${miles!.toLocaleString()} mi limit`,
    };
  }

  return { state: "unknown" };
}
