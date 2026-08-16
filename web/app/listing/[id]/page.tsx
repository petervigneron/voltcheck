import Link from "next/link";
import { notFound } from "next/navigation";
import { findListing } from "@/lib/listings/source";
import { enrichListing , displayTrim } from "@/lib/listings/enrich";
import { trimClaim } from "@/lib/listings/trimClaim";
import { buildChecklist } from "@/lib/checklist";
import { EnrichmentFacts, Section, NOTE_STYLE } from "@/components/EnrichmentReport";
import { listingTiles } from "@/lib/listings/tiles";
import { Tile } from "@/components/Tile";
import { hasRealPrice } from "@/lib/listings/price";
import { AskSeller } from "@/components/AskSeller";
import { RecentSales } from "@/components/RecentSales";
import { fetchRecentSales } from "@/lib/listings/sales";
import { askVsSold, fetchCompIndex } from "@/lib/listings/comps";

// ISR: each listing page renders once, then serves from the CDN for an hour —
// same cadence as the data underneath it (nightly sync, recheck, price audit).
// The empty generateStaticParams is what opts the route into static rendering;
// every real id renders on first visit and is cached from then on.
export const revalidate = 3600;
export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [];
}

function Spec({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 py-1.5 text-sm last:border-0">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default async function ListingPage(props: PageProps<"/listing/[id]">) {
  const { id } = await props.params;
  const listing = await findListing(id);
  if (!listing) notFound();

  const e = enrichListing(listing);
  const tiles = listingTiles(e);
  const checklist = buildChecklist(
    { vin: listing.vin, usMarket: true, make: listing.make.toUpperCase(), model: listing.model, modelYear: listing.year },
    listing.condition
  );
  const gallery = listing.images?.length ? listing.images : listing.imageUrl ? [listing.imageUrl] : [];
  // Recent real-world sales of the same make/model — transaction prices.
  // The VIN goes with it so sales of this car's own version sort first.
  const recentSales = await fetchRecentSales(listing.make, listing.model, listing.vin);
  // Same title records as the list above, but fitted to this car's exact
  // variant and odometer rather than eyeballed across model years.
  // Whether we'll print the dealer's trim as a fact. Corpus-free: the
  // contradiction judgement was made at sync time and rides the payload
  // (scraper/lib/trim-suspect.mjs), so this page needs nothing but its own row.
  const claim = trimClaim(listing);
  // A disclosed manufacturer repurchase gets no fitted-price comparison here,
  // same rule as the browse grid (lib/listings/buildIndex.ts): the model is
  // fitted on clean-title sales, and the seller's own text says this car
  // differs from those in a way the model cannot price.
  const vsSold = listing.buybackDisclosed
    ? undefined
    : askVsSold(
        await fetchCompIndex(),
        listing.vin,
        listing.year,
        listing.mileage,
        listing.priceUsd,
        hasRealPrice(listing)
      );

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <Link href="/" className="text-xs text-zinc-400 hover:text-emerald-500">
        ← back to results
      </Link>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Right: sticky summary. First in the DOM so price and key facts lead
            on mobile; on md+ it takes the right column. */}
        <div className="h-fit space-y-4 md:sticky md:top-4 md:col-start-2 md:row-start-1">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h1 className="text-xl font-bold leading-tight">
              {listing.year} {listing.make} {listing.model}
            </h1>
            {/* The trim only when we're willing to stand behind it. When the
                dealer's own description names a different version, showing the
                disagreement is more useful than picking a side: it tells a
                shopper the one thing to check on the window sticker. */}
            {claim.assert ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{claim.trim}</p>
            ) : claim.reason === "contradicted" ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Listed as {claim.feedTrim}, but the dealer&rsquo;s own description says{" "}
                {claim.proseTrim.charAt(0) + claim.proseTrim.slice(1).toLowerCase()}
              </p>
            ) : null}
            {hasRealPrice(listing) ? (
              <div className="mt-3 text-3xl font-bold tabular-nums">${listing.priceUsd.toLocaleString()}</div>
            ) : (
              <div
                className="mt-3 text-2xl font-bold"
                title={`The dealer's feed listed $${listing.priceUsd.toLocaleString()}, which is not a plausible price for this car; see the dealer's own page`}
              >
                See dealer for price
              </div>
            )}

            {tiles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tiles.map((t, i) => (
                  <Tile key={i} kind={t.kind} title={t.title}>
                    {t.text}
                  </Tile>
                ))}
              </div>
            )}

            <div className="mt-4">
              <Spec
                label="Condition"
                value={
                  listing.condition === "new" ? "New" : listing.condition === "certified" ? "Certified pre-owned" : "Used"
                }
              />
              <Spec
                label="Mileage"
                value={
                  listing.mileage != null
                    ? `${listing.mileage.toLocaleString()} mi${listing.mileage === 0 ? " (dealer-listed)" : ""}`
                    : undefined
                }
              />
              <Spec label="Previous owners" value={listing.previousOwners} />
              <Spec label="Drivetrain" value={listing.drive} />
              <Spec label="Exterior" value={listing.exteriorColor} />
              <Spec label="Interior" value={listing.interiorColor} />
              <Spec label="Stock #" value={listing.stockNumber} />
              <Spec label="VIN" value={listing.vin} />
              <Spec label="Seller" value={listing.dealerName ?? (listing.sellerType === "dealer" ? "Dealer" : "Private seller")} />
              <Spec label="Location" value={listing.city ? `${listing.city}, ${listing.state}` : undefined} />
            </div>

            {listing.sourceUrl && (
              <a
                href={listing.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-500"
              >
                View original listing ↗
              </a>
            )}
          </div>
        </div>

        {/* Left: gallery + narrative */}
        <div className="space-y-5 md:col-start-1 md:row-start-1">
          {gallery.length > 0 && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element -- external dealer CDN */}
              <img
                src={gallery[0]}
                alt={`${listing.year} ${listing.make} ${listing.model}`}
                className="aspect-[16/10] w-full rounded-xl object-cover bg-zinc-100 dark:bg-zinc-800"
              />
              {gallery.length > 1 && (
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {gallery.slice(1, 5).map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element -- external dealer CDN
                    <img key={src} src={src} alt="" className="aspect-[4/3] w-full rounded-lg object-cover bg-zinc-100 dark:bg-zinc-800" loading="lazy" />
                  ))}
                </div>
              )}
            </div>
          )}

          {listing.buybackDisclosed && (
            <div className={`rounded-lg border p-4 ${NOTE_STYLE}`}>
              <div className="text-sm font-semibold">Manufacturer repurchase (dealer information)</div>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                The dealer&rsquo;s description below discloses that this vehicle was repurchased by its
                manufacturer. Price comparisons are not shown for repurchased cars.
              </p>
            </div>
          )}

          {listing.campaignCheck?.packReplaced && (
            <div className={`rounded-lg border p-4 ${NOTE_STYLE}`}>
              <div className="text-sm font-semibold">
                New battery {listing.campaignCheck.packReplacedDate} at{" "}
                {listing.campaignCheck.odometerAtReplacement?.toLocaleString()} miles. Warranty 8yr/100k from
                that date.
              </div>
            </div>
          )}

          {e.listing.photoChecks?.dcFastCharge === "confirmed_absent" && (
            <div className={`rounded-lg border p-4 ${NOTE_STYLE}`}>
              {/* The charge-port photo showed no DC pins. That verdict is the
                  fact; the paragraph explaining how we reached it was three
                  lines of our workings on the shopper's screen. */}
              <div className="text-sm font-semibold">Cannot DC fast-charge</div>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                AC Level 1/2 only. No retrofit available.
              </p>
            </div>
          )}

          {recentSales.length > 0 && <RecentSales sales={recentSales} vsSold={vsSold} />}

          {e.row && (
            <Section title={`${listing.model}${claim.assert && displayTrim(listing) ? ` ${claim.trim}` : ""}`}>
              <EnrichmentFacts row={e.row} />
            </Section>
          )}

          {e.enrichment.candidates && (
            <Section title="Two versions wear this badge">
              {e.enrichment.discriminator && (
                <p className="mb-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
                  {e.enrichment.discriminator}
                </p>
              )}
              <div className="space-y-6">
                {e.enrichment.candidates.map((row) => (
                  <div key={row.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                    <div className="mb-2 text-sm font-semibold">
                      {row.range?.epaRangeMi
                        ? `${row.range.epaRangeMi.value} mi version${row.battery?.packUsableKwh ? ` · ≈${Math.round(row.battery.packUsableKwh.value)} kWh` : ""}`
                        : (Array.isArray(row.trim) ? row.trim[0] : row.trim) ?? row.id}
                    </div>
                    <EnrichmentFacts row={row} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {listing.description && (
            <Section title="Dealer description">
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{listing.description}</p>
            </Section>
          )}

          <AskSeller items={checklist} />
        </div>
      </div>
    </div>
  );
}
