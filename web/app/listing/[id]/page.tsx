import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackToResults } from "@/components/BackToResults";
import { findListing } from "@/lib/listings/source";
import { enrichListing , displayTrim } from "@/lib/listings/enrich";
import { trimClaim } from "@/lib/listings/trimClaim";
import { buildChecklist } from "@/lib/checklist";
import { EnrichmentFacts, Section, NOTE_STYLE } from "@/components/EnrichmentReport";
import { listingTiles } from "@/lib/listings/tiles";
import { Tile } from "@/components/Tile";
import { hasRealPrice } from "@/lib/listings/price";
import { AskSeller } from "@/components/AskSeller";
import { SaveToggle } from "@/components/SaveToggle";
import { DealerLink } from "@/components/DealerLink";
import { RecentSales } from "@/components/RecentSales";
import { fetchRecentSales } from "@/lib/listings/sales";
import { listingPriceSignals } from "@/lib/listings/peers";
import { askVsMarketTile } from "@/lib/listings/card";
import { PriceScatter } from "@/components/PriceScatter";
import { PriceSparkline } from "@/components/PriceSparkline";
import { PriceTrendCharts } from "@/components/PriceTrend";
import { ProBlur } from "@/components/ProBlur";
import { fetchPriceTrend } from "@/lib/trend";
import { BatteryRisk } from "@/components/BatteryRisk";
import { Gallery } from "@/components/Gallery";
import { batteryRisk } from "@/lib/nhtsa/battery";
import { batteryWarranty } from "@/lib/listings/warranty";
import { factLinksFor } from "@/lib/facts/links";
import { matchIncentives } from "@/lib/incentives/match";
import { Incentives } from "@/components/Incentives";
import { proBenefitTitle } from "@/lib/proOffer";

// ISR: each listing page renders once, then serves from the CDN for a day —
// the true cadence of the data underneath it (nightly sync, recheck, price
// audit all run once a day), matching the sitemap and /api/index shards which
// are already 86400. It was 3600, which rewrote each page's cache entry up to
// 24x/day as Googlebot re-crawled the thousands of listing URLs in the
// sitemaps — the bulk of the account's ISR Writes, for staleness the nightly
// data can't fill. A day-stale price here is bounded by the same day the
// browse feed is already cached for (see CLAUDE.md egress note).
//
// This export alone did NOT deliver that day, and nothing noticed for four
// days: a fetch's `next.revalidate` lowers the revalidate of the route that
// rendered it, and the per-VIN reads this page makes were still asking for an
// hour (lib/listings/db.ts REVALIDATE_SECONDS, raised to a day on 2026-08-23,
// with the production measurement that caught it). Changing the number below
// is not enough by itself — check what the page's fetches ask for too.
// The empty generateStaticParams is what opts the route into static rendering;
// every real id renders on first visit and is cached from then on.
export const revalidate = 86400;
export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [];
}

// One fetch per request, shared between generateMetadata and the page body.
// findListing isn't plain-fetch-memoizable (it branches into a full scan and a
// second detail read), so React cache() dedupes it explicitly.
const getListing = cache(findListing);

// Per-car title/description/canonical/OG. Without this every listing inherited
// the one site-wide title from the root layout, so Google saw thousands of
// identical <title>s — nothing to rank. The description names what this page
// answers that the dealer's listing does not: the battery and warranty behind
// the VIN. No numeric claim goes in the description; the page owns those.
export async function generateMetadata(props: PageProps<"/listing/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const listing = await getListing(id);
  if (!listing) return {};

  const claim = trimClaim(listing);
  const trim = claim.assert && displayTrim(listing) ? ` ${claim.trim}` : "";
  const name = `${listing.year} ${listing.make} ${listing.model}${trim}`;
  const miles = listing.mileage != null ? `${listing.mileage.toLocaleString()} mi` : "";
  const price = hasRealPrice(listing) ? `$${listing.priceUsd.toLocaleString()}` : "See dealer for price";
  const where = listing.city ? ` in ${listing.city}, ${listing.state}` : "";
  const path = `/listing/${listing.id}`;
  const image = listing.images?.[0] ?? listing.imageUrl ?? undefined;

  const title = `${name}${miles ? `, ${miles}` : ""} | Voltcheck`;
  const description =
    `${name}${where}, ${price}${miles ? `, ${miles}` : ""}. ` +
    `Voltcheck breaks down the real battery pack, EPA range, and warranty status behind VIN ${listing.vin.toUpperCase()}.`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: "website",
      url: path,
      images: image ? [image] : undefined,
    },
  };
}

function Spec({ label, value, title }: { label: string; value?: string | number | null; title?: string }) {
  if (value == null || value === "") return null;
  return (
    <div title={title} className="flex justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 py-1.5 text-sm last:border-0">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

const LISTED_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Renders only for cars whose appearance is honestly a listing date
// (migration 0028's guards) — everything else stays quiet rather than
// printing tracking-start noise as an age. ISR makes the day count stale by
// up to an hour, which cannot move it by a day's width in a wrong direction
// often enough to matter.
function listedValue(listedOn: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(listedOn)) / 86_400_000));
  const when = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return `${LISTED_FMT.format(new Date(listedOn))} (${when})`;
}

export default async function ListingPage(props: PageProps<"/listing/[id]">) {
  const { id } = await props.params;
  const listing = await getListing(id);
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
  const recentSales = await fetchRecentSales(
    listing.make,
    listing.model,
    listing.vin,
    listing.year,
    listing.mileage
  );
  // Same title records as the list above, but fitted to this car's exact
  // variant and odometer rather than eyeballed across model years.
  // Whether we'll print the dealer's trim as a fact. Corpus-free: the
  // contradiction judgement was made at sync time and rides the payload
  // (scraper/lib/trim-suspect.mjs), so this page needs nothing but its own row.
  const claim = trimClaim(listing);
  // What NHTSA holds against this car's make/model/year: battery recalls, and
  // a count of the battery complaints owners have filed. Read from a file the
  // scraper refreshes monthly, on the server, on this page only — the browse
  // index has no room for it and a count with no fleet size behind it is not
  // something two cards should be compared on. Silent for any cohort whose
  // name we could not place in NHTSA's own vocabulary.
  const battery = await batteryRisk(listing.make, listing.model, listing.year);
  // Market trends (0061/0062): what a standard car of this cohort fetched by
  // quarter and is asked by week. Rendered for everyone, blurred until the
  // browser holds a pass (components/ProBlur.tsx) — owner, 2026-09-03. The
  // VIN narrows it to this car's own cohort when that clears the floor.
  const trend = await fetchPriceTrend({ make: listing.make, model: listing.model, year: listing.year, vin: listing.vin });
  // Both price signals, decided by the same gates as the browse grid
  // (lib/listings/peers.ts). vsSold (the Washington-title-fit) is computed
  // but, since 2026-08-20 (docs/agents/pricing-model-2026-08-20.md), never
  // rendered as its own claim — see the comment at ListingCard.tsx's
  // askVsMarket tile for why. vsMarket, the ask-side comparison against the
  // same cohort listed right now, is this page's only price-comparison tile,
  // matching the card. Whatever claim the card made to earn the click, this
  // page repeats and can defend; a claim that vanishes here reads as
  // retracted.
  const { vsSold, vsMarket, peerAsks } = await listingPriceSignals(listing);
  const factLinks = factLinksFor(listing.make, listing.model);
  const marketTile = vsMarket ? askVsMarketTile(vsMarket) : undefined;
  // The price-vs-mileage picture, only when this car itself can be plotted —
  // a chart that can't locate its subject is decoration. PriceScatter adds
  // its own ≥4-other-points floor.
  const scatter =
    hasRealPrice(listing) && listing.mileage != null && listing.mileage > 0 ? (
      <PriceScatter
        sales={recentSales}
        peerAsks={peerAsks}
        self={{ mileage: listing.mileage, priceUsd: listing.priceUsd }}
      />
    ) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <BackToResults />

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Right: sticky summary. First in the DOM so price and key facts lead
            on mobile; on md+ it takes the right column. min-w-0 on both
            columns: grid items refuse to shrink below their content by
            default, so one card with an unshrinkable row (Recently sold's
            fixed columns) widened the shared track past a phone screen and
            clipped every card's right edge — VIN, seller, the button. */}
        <div className="min-w-0 h-fit space-y-4 md:sticky md:top-4 md:col-start-2 md:row-start-1">
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
                title="Voltcheck couldn't confirm this car's advertised price from the dealer's feed; see the dealer's own page"
              >
                See dealer for price
              </div>
            )}

            {listing.priceHistory && <PriceSparkline history={listing.priceHistory} prior={listing.priorSite} />}

            {(tiles.length > 0 || marketTile) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {marketTile && (
                  <Tile kind={marketTile.k} title={marketTile.ti}>
                    {marketTile.t}
                  </Tile>
                )}
                {tiles.map((t, i) => (
                  <Tile key={i} kind={t.kind} title={t.title}>
                    {t.text}
                  </Tile>
                ))}
              </div>
            )}

            <div className="mt-4">
              {/* No row at all when the seller never said. This used to read
                  "Used" for anything that wasn't new or certified, which
                  turned an absent field into a printed claim about the car —
                  the same else-branch the platform extractors used to carry
                  (scraper/lib/condition.mjs). Spec renders nothing for
                  undefined, so the line simply isn't there. */}
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
              <Spec
                label="Mileage"
                value={
                  listing.mileage != null
                    ? `${listing.mileage.toLocaleString()} mi${listing.mileage === 0 ? " (dealer-listed)" : ""}`
                    : undefined
                }
              />
              {listing.listedOn && (
                <Spec
                  label="Listed"
                  value={listedValue(listing.listedOn)}
                  title="When this car appeared on the seller's site, from Voltcheck's nightly check — shown only when the seller was already being tracked when it appeared. The true listing date can be up to a day earlier."
                />
              )}
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
              <DealerLink
                href={listing.sourceUrl}
                listingId={listing.id}
                className="mt-4 block rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-500"
              >
                View original listing ↗
              </DealerLink>
            )}
            <SaveToggle
              variant="detail"
              id={listing.id}
              title={`${listing.year} ${listing.make} ${listing.model}`}
              priceUsd={hasRealPrice(listing) ? listing.priceUsd : undefined}
            />
          </div>
        </div>

        {/* Left: gallery + narrative */}
        <div className="min-w-0 space-y-5 md:col-start-1 md:row-start-1">
          {gallery.length > 0 && (
            <Gallery images={gallery} alt={`${listing.year} ${listing.make} ${listing.model}`} />
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

          {recentSales.length > 0 ? (
            <RecentSales sales={recentSales} vsSold={vsSold} scatter={scatter} />
          ) : scatter ? (
            // No transaction data for this cohort, but the live asks are
            // still a real comparison — the chart alone, under the ask-side
            // heading so nobody reads gray circles as sales.
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Asking prices, this cohort
              </h2>
              {scatter}
            </div>
          ) : null}

          {trend && (trend.sales || trend.asks) && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <ProBlur label={proBenefitTitle("market-trends")}>
                <PriceTrendCharts trend={trend} miles={listing.mileage} />
                {trend.sales && (
                  <a
                    href="https://data.wa.gov/Transportation/Electric-Vehicle-Title-and-Registration-Activity/rpr4-cgyd"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-zinc-400 hover:text-cobalt"
                  >
                    WA DOL (ODbL)
                  </a>
                )}
              </ProBlur>
            </div>
          )}

          {e.row && (
            <Section title={`${listing.model}${claim.assert && displayTrim(listing) ? ` ${claim.trim}` : ""}`}>
              <EnrichmentFacts row={e.row} warranty={batteryWarranty(e.row, listing)} />
            </Section>
          )}

          {/* Below the enrichment card on purpose: a recall is a cohort fact
              and this page's headline facts are about the car in front of
              the shopper. See components/BatteryRisk.tsx for why it can't
              say more than "NHTSA has one on file" for most makes. */}
          <BatteryRisk data={battery} vin={listing.vin} packReplaced={listing.campaignCheck?.packReplaced} />

          {/* State and utility purchase programs whose car-side conditions
              this listing meets (lib/incentives/match.ts, site policy).
              Renders nothing when none does. One collapsed line per
              program; the conditions open on a press. Blurred like the
              trends above until the browser holds a Pro pass (owner,
              2026-09-03). It never says a shopper qualifies. */}
          <Incentives matches={matchIncentives(e)} />

          {/* Cohort answers with their own pages (/facts). The questions are
              the link text — each is one the sheet's own FAQ asks — so the
              block needs no heading and no sentence introducing it. */}
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
