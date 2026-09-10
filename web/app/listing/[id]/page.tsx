import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackToResults } from "@/components/BackToResults";
import { findDelistedListing, findListing } from "@/lib/listings/source";
import { Delisted, delistedMetadata } from "./Delisted";
import { enrichListing, displayTrim, packIdentity, specTrim } from "@/lib/listings/enrich";
import { vehicleKind } from "@/lib/listings/kind";
import { trimClaim } from "@/lib/listings/trimClaim";
import { buildChecklist } from "@/lib/checklist";
import { CandidateRows, EnrichmentFacts, Panel } from "@/components/EnrichmentReport";
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
import { ProOnly } from "@/components/ProOnly";
import { fetchPriceTrend } from "@/lib/trend";
import { BatteryRisk } from "@/components/BatteryRisk";
import { Gallery } from "@/components/Gallery";
import { batteryRisk } from "@/lib/nhtsa/battery";
import { batteryWarranty } from "@/lib/listings/warranty";
import { factLinksFor } from "@/lib/facts/links";
import { matchIncentives } from "@/lib/incentives/match";
import { Incentives } from "@/components/Incentives";
import { JsonLd } from "@/components/ListingJsonLd";
import { listingJsonLd } from "@/lib/listings/jsonLd";
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
const getDelisted = cache(findDelistedListing);

// Per-car title/description/canonical/OG. Without this every listing inherited
// the one site-wide title from the root layout, so Google saw thousands of
// identical <title>s — nothing to rank. The description names what this page
// answers that the dealer's listing does not: the battery and warranty behind
// the VIN. No numeric claim goes in the description; the page owns those.
export async function generateMetadata(props: PageProps<"/listing/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const listing = await getListing(id);
  if (!listing) {
    const gone = await getDelisted(id);
    return gone ? delistedMetadata(gone) : {};
  }

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
    <div title={title} className="flex justify-between gap-4 border-b border-ink/10 py-2 text-[14px] last:border-0">
      <span className="shrink-0 text-ink/60">{label}</span>
      <span className="min-w-0 text-right font-semibold break-words">{value}</span>
    </div>
  );
}

// The page's three one-line notices (repurchase, replaced pack, no DC pins).
const NOTICE = "border-[3px] border-ink bg-paper p-4 text-[14px]";

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
  if (!listing) {
    // No live listing. Before 2026-09-07 this was a 404 for every car that
    // had sold — Google indexes a car off the grid, the car goes a week
    // later, and the result is Next's stock error page. A car delisted in
    // the last 30 days gets a page that says so (./Delisted.tsx); older
    // than that, or never ours, is still a 404.
    const gone = await getDelisted(id);
    if (!gone) notFound();
    return <Delisted listing={gone} />;
  }

  const e = enrichListing(listing);
  const tiles = listingTiles(e);
  // A plug-in hybrid is never "missing" a heat pump or fast charging (see
  // lib/listings/tiles.ts): the spec tiles below hold their alarm colour back
  // for the same cars the card does.
  const plugIn = vehicleKind(e) === "PHEV";
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
  // Market trends (0064/0072/0077): what a standard car of this cohort is
  // asked day by day, beside the site-wide index. Rendered for everyone,
  // blurred until the browser holds a pass (components/ProBlur.tsx) — owner,
  // 2026-09-03. Read at the level the cards price on — the VIN prefix, the
  // trim we stand behind and the pack identity — when that clears the floor;
  // the VIN cohort or the model pool otherwise (owner, 2026-09-09: a
  // Lightning Platinum ER was being drawn against every Lightning).
  const trend = await fetchPriceTrend({
    make: listing.make,
    model: listing.model,
    year: listing.year,
    vin: listing.vin,
    trimKey: claim.assert ? specTrim(listing)?.toUpperCase() : undefined,
    identity: packIdentity(e),
  });
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

  const sold =
    recentSales.length > 0 ? (
      <RecentSales sales={recentSales} vsSold={vsSold} scatter={scatter} />
    ) : scatter ? (
      // No transaction data for this cohort, but the live asks are still a
      // real comparison — the chart alone, under the ask-side heading so
      // nobody reads gray circles as sales.
      <Panel title="Asking prices, this cohort">{scatter}</Panel>
    ) : null;

  const trends = trend?.asks ? (
    <div className="min-w-0 border-[3px] border-ink bg-paper p-5">
      <ProBlur label={proBenefitTitle("market-trends")}>
        {/* This car's own asking price as a rule across the trend, and its
            name on the legend beside the site-wide line (owner, 2026-09-07).
            A lease payment where a price should be is no price, so the rule
            follows the same gate as the headline. */}
        <PriceTrendCharts
          trend={trend}
          miles={listing.mileage}
          price={hasRealPrice(listing) ? listing.priceUsd : undefined}
          subject={`${listing.year} ${listing.make} ${listing.model}${trend.asks.level === "trim" && claim.assert ? ` ${claim.trim}` : ""}`}
        />
      </ProBlur>
    </div>
  ) : null;

  // Layout C of the four mockups (owner, 2026-09-10), with the spec block as
  // C2: the ink header runs on into the car's name, price and tiles, built
  // from the same solid blocks as the browse grid; the photo and the summary
  // card sit half on that band; everything below is square keylined panels.
  // The tiles are the card's own, at full size — whatever the card claimed to
  // earn the click, this page repeats in the same colours.
  return (
    <div className="pb-2">
      <div className="bg-ink text-paper">
        <div className={`mx-auto max-w-[1100px] px-4 pt-5 pb-7 ${gallery.length > 0 ? "md:pb-[140px]" : ""}`}>
          <BackToResults />
          {/* The machine-readable copy of this page, for agents that shop on
              someone's behalf. Built from the same summaries the tiles and
              spec rows are built from, so the two cannot disagree — see
              lib/listings/jsonLd.ts for what is and is not allowed in it. */}
          <JsonLd json={listingJsonLd(e)} />

          <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <h1 className="text-[34px] leading-none font-extrabold tracking-[-0.035em] sm:text-[46px]">
                {listing.year} {listing.make} {listing.model}
              </h1>
              {/* The trim only when we're willing to stand behind it. When the
                  dealer's own description names a different version, showing
                  the disagreement is more useful than picking a side: it tells
                  a shopper the one thing to check on the window sticker. */}
              {claim.assert ? (
                <p className="mt-2 text-[18px] font-semibold text-paper/65">{claim.trim}</p>
              ) : claim.reason === "contradicted" ? (
                <p className="mt-2 max-w-xl text-[15px] leading-snug text-paper/70">
                  Listed as {claim.feedTrim}, but the dealer&rsquo;s own description says{" "}
                  {claim.proseTrim.charAt(0) + claim.proseTrim.slice(1).toLowerCase()}
                </p>
              ) : null}
            </div>
            {hasRealPrice(listing) ? (
              <div className="text-[40px] leading-none font-extrabold tracking-[-0.035em] tabular-nums sm:text-[56px]">
                ${listing.priceUsd.toLocaleString()}
              </div>
            ) : (
              <div
                className="text-[26px] leading-none font-extrabold tracking-[-0.02em]"
                title="Voltcheck couldn't confirm this car's advertised price from the dealer's feed; see the dealer's own page"
              >
                See dealer for price
              </div>
            )}
          </div>

          {(tiles.length > 0 || marketTile) && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {marketTile && (
                <ProOnly>
                  <Tile size="lg" kind={marketTile.k} title={marketTile.ti}>
                    {marketTile.t}
                  </Tile>
                </ProOnly>
              )}
              {tiles.map((t, i) => (
                <Tile key={i} size="lg" kind={t.kind} title={t.title}>
                  {t.text}
                </Tile>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] space-y-5 px-4 pt-5 md:pt-0">
        {/* Photo and summary card, pulled up into the band on md+. min-w-0 on
            both columns: grid items refuse to shrink below their content by
            default, so one unshrinkable row (Recently sold's fixed columns)
            once widened the shared track past a phone screen and clipped
            every card's right edge. */}
        <div
          className={`grid items-start gap-5 md:gap-6 ${
            gallery.length > 0 ? "md:-mt-[116px] md:grid-cols-[minmax(0,1fr)_340px]" : "md:pt-5"
          }`}
        >
          {gallery.length > 0 && (
            <div className="min-w-0">
              <Gallery images={gallery} alt={`${listing.year} ${listing.make} ${listing.model}`} />
            </div>
          )}

          <aside className="min-w-0 border-[3px] border-ink bg-paper p-5">
            <div className="flex flex-col gap-2">
              {listing.sourceUrl && (
                <DealerLink
                  href={listing.sourceUrl}
                  listingId={listing.id}
                  className="block border-[3px] border-ink bg-cobalt px-4 py-3 text-center text-[12.5px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-ink focus:outline-none focus-visible:ring-[3px] focus-visible:ring-cobalt focus-visible:ring-offset-2"
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

            {listing.priceHistory && <PriceSparkline history={listing.priceHistory} prior={listing.priorSite} />}

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
          </aside>
        </div>

        {(listing.buybackDisclosed || listing.brandedTitleDisclosed) && (
          <div className={NOTICE}>
            <div className="font-semibold">
              {listing.buybackDisclosed ? "Manufacturer repurchase" : "Branded title"}
            </div>
          </div>
        )}

        {listing.campaignCheck?.packReplaced && (
          <div className={NOTICE}>
            <div className="font-semibold">
              New battery {listing.campaignCheck.packReplacedDate} at{" "}
              {listing.campaignCheck.odometerAtReplacement?.toLocaleString()} miles. Warranty 8yr/100k from
              that date.
            </div>
          </div>
        )}

        {e.listing.photoChecks?.dcFastCharge === "confirmed_absent" && (
          <div className={NOTICE}>
            {/* The charge-port photo showed no DC pins. That verdict is the
                fact; the paragraph explaining how we reached it was three
                lines of our workings on the shopper's screen. */}
            <div className="font-semibold">Cannot DC fast-charge</div>
            <p className="mt-1 text-ink/75">AC Level 1/2 only. No retrofit available.</p>
          </div>
        )}

        {/* Side by side only when both exist, so neither sits half-width
            beside an empty cell. */}
        {(sold || trends) && (
          <div className={`grid items-start gap-5 ${sold && trends ? "md:grid-cols-2" : ""}`}>
            {sold}
            {trends}
          </div>
        )}

        {/* The spec block (mockup C2): the same solid tiles as the band, in
            the same colours — range ochre, equipment present teal, an
            absence vermilion, everything else putty — under an ink bar. */}
        {e.row && (
          <section className="border-[3px] border-ink bg-paper">
            <h2 className="bg-ink px-5 py-3 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase">
              {listing.model}
              {claim.assert && displayTrim(listing) ? ` ${claim.trim}` : ""}
            </h2>
            <div className="p-5">
              <EnrichmentFacts tiles plugIn={plugIn} row={e.row} warranty={batteryWarranty(e.row, listing)} />
            </div>
          </section>
        )}

        {/* Below the spec block on purpose: a recall is a cohort fact and
            this page's headline facts are about the car in front of the
            shopper. See components/BatteryRisk.tsx for why it can't say more
            than "NHTSA has one on file" for most makes. */}
        <BatteryRisk data={battery} vin={listing.vin} packReplaced={listing.campaignCheck?.packReplaced} />

        {/* State and utility purchase programs whose car-side conditions
            this listing meets (lib/incentives/match.ts, site policy).
            Renders nothing when none does. One collapsed line per program;
            the conditions open on a press. Blurred like the trends above
            until the browser holds a Pro pass (owner, 2026-09-03). It never
            says a shopper qualifies. */}
        <Incentives matches={matchIncentives(e)} />

        {/* Cohort answers with their own pages (/facts). The questions are
            the link text — each is one the sheet's own FAQ asks — so the
            block needs no heading and no sentence introducing it. */}
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

        {e.enrichment.candidates && (
          <Panel title="Two versions wear this badge">
            <CandidateRows rows={e.enrichment.candidates} discriminator={e.enrichment.discriminator} plugIn={plugIn} />
          </Panel>
        )}

        {listing.description && (
          <Panel title="Dealer description">
            <p className="text-[14px] leading-relaxed text-ink/80">{listing.description}</p>
          </Panel>
        )}

        <AskSeller items={checklist} keyline />
      </div>
    </div>
  );
}
