import type { Metadata } from "next";
import Link from "next/link";
import type { DelistedListing } from "@/lib/listings/db";
import { enrichListing, displayTrim } from "@/lib/listings/enrich";
import { vehicleKind } from "@/lib/listings/kind";
import { trimClaim } from "@/lib/listings/trimClaim";
import { hasRealPrice } from "@/lib/listings/price";
import { EnrichmentFacts } from "@/components/EnrichmentReport";
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
//
// Drawn in the live listing page's dialect (2026-09-10): the ink band, the
// spec tiles under an ink bar, square keylined panels. The band carries no
// tiles here — the card's tiles are a live listing's claims.

const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Spec({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-ink/10 py-2 text-[14px] last:border-0">
      <span className="shrink-0 text-ink/60">{label}</span>
      <span className="min-w-0 text-right font-semibold break-words">{value}</span>
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
    <div className="pb-2">
      <div className="bg-ink text-paper">
        <div className="mx-auto max-w-[1100px] px-4 pt-5 pb-8">
          <BackToResults />
          <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold tracking-[0.1em] text-paper/60 uppercase">
                No longer listed · {lastSeen(listing)}
              </div>
              <h1 className="mt-2 text-[34px] leading-none font-extrabold tracking-[-0.035em] sm:text-[46px]">
                {listing.year} {listing.make} {listing.model}
              </h1>
              {claim.assert && <p className="mt-2 text-[18px] font-semibold text-paper/65">{claim.trim}</p>}
            </div>
            {/* Recessive: this was an asking price, and nobody is asking it now. */}
            {hasRealPrice(listing) && (
              <div className="text-right">
                <div className="text-[34px] leading-none font-extrabold tracking-[-0.035em] text-paper/55 tabular-nums sm:text-[44px]">
                  ${listing.priceUsd.toLocaleString()}
                </div>
                <div className="mt-1.5 text-[12px] font-semibold text-paper/55">Last asking price</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-4 pt-5">
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_340px] md:gap-6">
          <aside className="min-w-0 border-[3px] border-ink bg-paper p-5 md:col-start-2 md:row-start-1">
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

            {hub && (
              <Link
                href={hubPath(hub)}
                className="mt-4 block border-[3px] border-ink bg-cobalt px-4 py-3 text-center text-[12.5px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-ink focus:outline-none focus-visible:ring-[3px] focus-visible:ring-cobalt focus-visible:ring-offset-2"
              >
                {hub.make} {hub.model} for sale now →
              </Link>
            )}
          </aside>

          <div className="min-w-0 space-y-5 md:col-start-1 md:row-start-1">
            {e.row && (
              <section className="border-[3px] border-ink bg-paper">
                <h2 className="bg-ink px-5 py-3 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase">
                  {listing.model}
                  {claim.assert && displayTrim(listing) ? ` ${claim.trim}` : ""}
                </h2>
                <div className="p-5">
                  <EnrichmentFacts
                    tiles
                    plugIn={vehicleKind(e) === "PHEV"}
                    row={e.row}
                    warranty={batteryWarranty(e.row, listing)}
                  />
                </div>
              </section>
            )}

            {factLinks.length > 0 && (
              <nav aria-label="Fact sheets" className="border-[3px] border-ink bg-paper px-5 py-1">
                <ul className="divide-y divide-ink/10">
                  {factLinks.map((l) => (
                    <li key={l.path}>
                      <Link
                        href={l.path}
                        className="flex items-center justify-between gap-4 py-3 text-[14px] font-semibold hover:text-cobalt"
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
    </div>
  );
}
