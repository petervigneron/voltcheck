import type { Metadata } from "next";
import Link from "next/link";
import type { DelistedListing } from "@/lib/listings/db";
import { enrichListing, displayTrim } from "@/lib/listings/enrich";
import { trimClaim } from "@/lib/listings/trimClaim";
import { hasRealPrice } from "@/lib/listings/price";
import { EnrichmentFacts, Section } from "@/components/EnrichmentReport";
import { batteryWarranty } from "@/lib/listings/warranty";
import { factLinksFor } from "@/lib/facts/links";
import { hubFor, hubPath } from "@/lib/listings/modelHubs";
import { BackToResults } from "@/components/BackToResults";

// The listing page for a car that is no longer listed (delisted within the
// last 30 days — supabase/migrations/0071 says why 30).
//
// What it deliberately does NOT carry, each because it would be a claim
// about a car nobody is selling:
//   * no Offer JSON-LD and no "View original listing" — the dealer's page is
//     gone or shows another car;
//   * no ask-vs-market tile, comps, scatter or trend — a car that isn't for
//     sale is not "8% below market", and a last ask read against today's
//     cohort is exactly the false-bargain error the house rule is about;
//   * no "Listed N days ago" — first_seen_at is when tracking started, and
//     the row's listed_on guard (0028) isn't available for delisted rows.
// What it does carry is what is still true of the car: its identity, what
// it was last asking, the odometer and colours the seller published, and
// the cohort facts (battery, range, charging, warranty) that a shopper
// researching this VIN came for. Those do not expire with the listing.
//
// The state is a value, not a sentence: "No longer listed" with the day the
// site last saw the car on the seller's page. We never say "sold" — we know
// the seller stopped listing it, not what happened to it.

const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Spec({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 py-1.5 text-sm last:border-0">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function carName(l: DelistedListing): string {
  const claim = trimClaim(l);
  const trim = claim.assert && displayTrim(l) ? ` ${claim.trim}` : "";
  return `${l.year} ${l.make} ${l.model}${trim}`;
}

/** The last day the site saw this car on the seller's page — the observed
 *  fact. delisted_at is when the recheck concluded it was gone, two or three
 *  days later, and stands in only when listing_seen has no row. */
function lastSeen(l: DelistedListing): string {
  return DAY_FMT.format(new Date(l.lastSeenAt ?? l.delistedAt));
}

export function delistedMetadata(l: DelistedListing): Metadata {
  const name = carName(l);
  const miles = l.mileage != null ? `, ${l.mileage.toLocaleString()} mi` : "";
  const path = `/listing/${l.id}`;
  const title = `${name}${miles} | Voltcheck`;
  const description = `No longer listed as of ${lastSeen(l)}. The battery pack, EPA range and warranty behind VIN ${l.vin.toUpperCase()}.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, type: "website", url: path },
  };
}

export function Delisted({ listing }: { listing: DelistedListing }) {
  const e = enrichListing(listing);
  const claim = trimClaim(listing);
  const hub = hubFor(listing.make, listing.model);
  const factLinks = factLinksFor(listing.make, listing.model);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <BackToResults />
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="min-w-0 h-fit space-y-4 md:sticky md:top-4 md:col-start-2 md:row-start-1">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
              No longer listed · {lastSeen(listing)}
            </div>
            <h1 className="mt-1 text-xl font-bold leading-tight">
              {listing.year} {listing.make} {listing.model}
            </h1>
            {claim.assert && <p className="text-sm text-zinc-500 dark:text-zinc-400">{claim.trim}</p>}

            {hasRealPrice(listing) && (
              <div className="mt-3">
                <div className="text-3xl font-bold tabular-nums text-zinc-500 dark:text-zinc-400">
                  ${listing.priceUsd.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Last asking price</div>
              </div>
            )}

            <div className="mt-4">
              <Spec
                label="Condition"
                value={
                  listing.condition === "new"
                    ? "New"
                    : listing.condition === "certified"
                      ? "Certified pre-owned"
                      : listing.condition === "used"
                        ? "Used"
                        : undefined
                }
              />
              <Spec label="Mileage" value={listing.mileage != null ? `${listing.mileage.toLocaleString()} mi` : undefined} />
              <Spec label="Drivetrain" value={listing.drive} />
              <Spec label="Exterior" value={listing.exteriorColor} />
              <Spec label="Interior" value={listing.interiorColor} />
              <Spec label="VIN" value={listing.vin} />
              <Spec label="Seller" value={listing.dealerName ?? (listing.sellerType === "dealer" ? "Dealer" : "Private seller")} />
              <Spec label="Location" value={listing.city ? `${listing.city}, ${listing.state}` : undefined} />
            </div>

            {hub && (
              <Link
                href={hubPath(hub)}
                className="mt-4 block rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-500"
              >
                {hub.make} {hub.model} for sale now →
              </Link>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-5 md:col-start-1 md:row-start-1">
          {e.row && (
            <Section title={`${listing.model}${claim.assert && displayTrim(listing) ? ` ${claim.trim}` : ""}`}>
              <EnrichmentFacts row={e.row} warranty={batteryWarranty(e.row, listing)} />
            </Section>
          )}

          {factLinks.length > 0 && (
            <nav
              aria-label="Fact sheets"
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-2"
            >
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {factLinks.map((l) => (
                  <li key={l.path}>
                    <Link
                      href={l.path}
                      className="flex items-center justify-between gap-4 py-2.5 text-sm font-medium hover:text-emerald-600"
                    >
                      {l.label}
                      <span aria-hidden>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
