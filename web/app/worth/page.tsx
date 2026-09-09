import type { Metadata } from "next";
import Link from "next/link";
import { WorthForm } from "@/components/WorthForm";
import { valueVehicle, vehicleLabel, type Valuation, type WorthInput } from "@/lib/listings/value";
import { currentPass, currentPassEmail } from "@/lib/pro";
import { fetchPriceTrend, type PriceTrend } from "@/lib/trend";
import { PriceTrendCharts } from "@/components/PriceTrend";
import { TrackValue } from "@/components/TrackValue";
import { parseWorthInput, worthWatchLabel, worthWatchParams } from "@/lib/worthWatch";
import { enrichListing, packIdentity } from "@/lib/listings/enrich";
import type { Listing } from "@/lib/listings/types";

/** The shopper's car as the enrichment layer needs to see it — the same
 *  shape value.ts's cohort pool builds for a listing, with no price. */
function worthListing(input: WorthInput): Listing {
  return {
    id: "worth",
    vin: input.vin ?? "",
    year: input.year,
    make: input.make,
    model: input.model,
    trim: input.trim,
    drive: input.drive,
    mileage: input.mileage,
    priceUsd: 0,
    sellerType: "dealer",
  };
}

// Same posture as /vin/[vin], for the same two reasons. force-dynamic because
// a result is a function of numbers the visitor typed and inventory that moves
// nightly — there is no page here to cache. noindex,follow on a RESULT because
// the query space is effectively infinite and near-duplicate across cars, and
// a crawler working through it would be walking the database for pages nobody
// asked for.
//
// The bare form is a different thing and stays indexable: it is one page, it
// is the entry point people search for, and it self-canonicals to /worth.
export const dynamic = "force-dynamic";

// Spelled out rather than taken from the generated PageProps<"/worth">: the
// static routes on this site (app/alerts/confirm) read their query the same
// way, and it keeps `tsc --noEmit` honest outside a build.
type Params = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Params> };

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * The typed query, or null for the bare form. The parser lives in
 * lib/worthWatch.ts since 2026-09-09 because the value watch's sender reads
 * the same query back out of a subscription row: a malformed VIN is DROPPED,
 * not rejected (it can only ever have upgraded the answer), and mileage is
 * capped at 300,000.
 */
function readInput(sp: Params): WorthInput | null {
  return parseWorthInput((k) => one(sp[k]));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const input = readInput(await props.searchParams);
  if (!input) {
    return {
      title: "What's my EV worth? | Voltcheck",
      description:
        "A free value estimate for any electric or plug-in hybrid, built from what these cars are selling for and what they are listed at right now. No account, no VIN required.",
      alternates: { canonical: "/worth" },
    };
  }
  return {
    title: `What's a ${vehicleLabel(input)} worth? | Voltcheck`,
    description: `An estimate for a ${vehicleLabel(input)} with ${input.mileage.toLocaleString(
      "en-US"
    )} miles, from live listings and Washington State title sales.`,
    robots: { index: false, follow: true },
  };
}

export default async function WorthPage(props: Props) {
  const sp = await props.searchParams;
  const input = readInput(sp);
  const valuation = input ? await valueVehicle(input) : null;

  // Market trends (Pro, owner 2026-09-03): the two charts render under the
  // answer for a pass-holder. Everyone else keeps the page they had; /pro
  // lists the benefit. The pass lookup and the trend read both fail closed.
  let trend: PriceTrend | null = null;
  // The pass also decides whether the result offers to track the car's value
  // (components/TrackValue.tsx); the address is what the watch subscribes.
  let pro = false;
  let passEmail: string | null = null;
  if (input && valuation) {
    try {
      pro = (await currentPass()).active;
      if (pro) {
        passEmail = await currentPassEmail();
        // The trim the valuation matched and, with a VIN, the pack identity
        // the enrichment layer gives the car as described — the same two
        // facts that unlock the trim-level trend on a listing page (0077).
        trend = await fetchPriceTrend({
          make: input.make,
          model: input.model,
          year: input.year,
          vin: input.vin,
          trimKey: valuation.tier === "estimate" ? valuation.matchedTrim?.toUpperCase() : undefined,
          identity: input.vin ? packIdentity(enrichListing(worthListing(input))) : undefined,
        });
      }
    } catch {
      trend = null;
    }
  }

  // Same container and same construction as the browse grid
  // (components/Browse.tsx): one wall of blocks under a max-w-[1400px], each
  // cell drawing its right and bottom keyline so neighbours share an edge.
  // This page used to be a narrow centred card on an empty field, which is a
  // layout the rest of the site does not have anywhere.
  return (
    <div className="mx-auto max-w-[1400px] px-0 sm:px-6 sm:py-6">
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className="border-r-[3px] border-b-[3px] border-ink bg-ink px-5 py-9 text-paper sm:px-8 sm:py-12">
          <h1 className="max-w-[16ch] text-[38px] leading-[0.92] font-extrabold tracking-[-0.04em] sm:text-[56px]">
            What&rsquo;s my car worth?
          </h1>
          <p className="mt-3 text-[17px] font-bold tracking-[-0.01em] text-paper/60 sm:text-[21px]">
            Let&rsquo;s take a look.
          </p>
        </div>

        {/* The answer above the form, by owner request (2026-08-26): once
            someone has searched, the number is what the page is FOR — the
            picker becomes the way to adjust, not the way in, so it moves
            below what it produced. The bare form keeps the old order. */}
        {input && valuation && <Result input={input} v={valuation} pro={pro} email={passEmail} />}
        {trend?.asks && (
          <section className={`${CELL} bg-paper px-5 py-6 sm:px-8`}>
            {/* The same caption the blurred block carries on a car's page —
                the benefit's own title from /pro. The line is the headline's
                own arithmetic day by day and ends on the headline (lib/trend.ts
                valueSeries); the result block above carries the ODbL credit
                for both, since both stand on the same per-mile rate. */}
            <p className="mb-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/55">Market trends</p>
            <PriceTrendCharts
              trend={trend}
              miles={input?.mileage}
              today={
                valuation?.tier === "estimate"
                  ? { period: new Date().toISOString().slice(0, 10), usd: valuation.valueUsd }
                  : valuation?.tier === "sold"
                    ? { period: new Date().toISOString().slice(0, 10), usd: valuation.midUsd }
                    : undefined
              }
              subject={
                input
                  ? `${vehicleLabel(input)}${trend.asks.level === "trim" && valuation?.tier === "estimate" && valuation.matchedTrim ? ` ${valuation.matchedTrim}` : ""}`
                  : undefined
              }
            />
          </section>
        )}

        <WorthForm
          defaults={{
            year: one(sp.year),
            make: one(sp.make),
            model: one(sp.model),
            miles: one(sp.miles),
            vin: one(sp.vin),
            trim: one(sp.trim),
            drive: one(sp.drive),
            cond: one(sp.cond),
          }}
        />
      </div>
    </div>
  );
}

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const CAPTION = "text-[10.5px] font-extrabold uppercase tracking-[0.14em] sm:text-[11px]";

function Result({ input, v, pro, email }: { input: WorthInput; v: Valuation; pro: boolean; email: string | null }) {
  const miles = `${input.mileage.toLocaleString("en-US")} miles`;
  const subject = (
    <>
      {vehicleLabel(input)} · {miles}
      {v.tier === "estimate" && v.matchedTrim ? ` · ${v.matchedTrim}` : ""}
      {v.tier === "estimate" && v.matchedDrive ? ` · ${v.matchedDrive}` : ""}
    </>
  );

  // Two silences, two colours, because they are opposite statements. ABSTAIN
  // is the tool working — too few comparable cars to put a number on, said
  // plainly — so it is putty, the neutral the rest of the site is built on.
  // UNAVAILABLE is a read that failed, and vermilion is this palette's word
  // for something absent; it is the same block the browse grid raises when
  // the inventory won't load.
  if (v.tier === "unavailable" || v.tier === "abstain") {
    const failed = v.tier === "unavailable";
    return (
      <section className={`${CELL} ${failed ? "bg-vermilion text-paper" : "bg-putty text-ink"}`}>
        <div className={`${CAPTION} px-5 pt-5 sm:px-8 sm:pt-7 ${failed ? "text-paper/60" : "text-ink/50"}`}>
          {subject}
        </div>
        <p className="max-w-[52ch] px-5 pt-2 pb-5 text-[19px] leading-[1.25] font-bold tracking-[-0.015em] sm:px-8 sm:pb-7 sm:text-[23px]">
          {v.source}
        </p>
        {v.tier === "abstain" && (
          <div className="border-t-[3px] border-ink">
            <Link
              href={`/?make=${encodeURIComponent(input.make)}&model=${encodeURIComponent(input.model)}`}
              className="flex items-center gap-2 bg-paper px-5 py-4 text-[12.5px] font-extrabold tracking-[0.06em] text-ink uppercase hover:bg-cobalt hover:text-paper focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt sm:px-8"
            >
              Browse {input.make} {input.model} listings <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`${CELL} bg-paper`}>
      <div className={`${CAPTION} border-b-[3px] border-ink bg-putty px-5 py-2.5 text-ink/55 sm:px-8`}>
        {subject}
      </div>

      <div className="px-5 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* The listing cards print a price at 32px; this page exists to
              answer one question and prints its answer bigger. */}
          <span className="text-[52px] leading-[0.9] font-extrabold tracking-[-0.045em] text-ink tabular-nums sm:text-[68px]">
            {v.headline}
          </span>
          {/* The site's one visible provenance promise: anything that is not a
              published figure is marked. Same word and same weight as
              components/SourceBadge.tsx, which this cannot reuse directly — that
              component reads a Fact, and this is a computation, not a fact. */}
          {v.estimated && <span className={`${CAPTION} text-amber-700`}>est.</span>}
        </div>

      </div>

      {/* The same browse link the abstention carries, same words, by owner
          request (2026-08-26): a seller who just learned the number's next
          question is what cars like theirs are listed at. */}
      <div className="border-t-[3px] border-ink">
        <Link
          href={`/?make=${encodeURIComponent(input.make)}&model=${encodeURIComponent(input.model)}`}
          className="flex items-center gap-2 bg-paper px-5 py-4 text-[12.5px] font-extrabold tracking-[0.06em] text-ink uppercase hover:bg-cobalt hover:text-paper focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt sm:px-8"
        >
          Browse {input.make} {input.model} listings <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="flex flex-wrap border-t-[3px] border-ink">
        <TrackValue params={worthWatchParams(input)} label={worthWatchLabel(input)} pro={pro} email={email} />
        {/* ODbL attribution: required wherever a figure derived from the
            Washington title records renders, so this line is a licence term and
            not a disclaimer. Kept to a bare credit, exactly as
            components/RecentSales.tsx keeps it. */}
        {v.waDerived && (
          <a
            href="https://data.wa.gov/Transportation/Electric-Vehicle-Title-and-Registration-Activity/rpr4-cgyd"
            target="_blank"
            rel="noopener noreferrer"
            className={`${CAPTION} flex items-center border-l-[3px] border-ink bg-putty px-5 py-3.5 text-ink/45 hover:text-cobalt sm:px-8`}
          >
            WA DOL (ODbL)
          </a>
        )}
      </div>
    </section>
  );
}
