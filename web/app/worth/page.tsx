import type { Metadata } from "next";
import Link from "next/link";
import { WorthForm } from "@/components/WorthForm";
import { valueVehicle, vehicleLabel, type Valuation, type WorthInput } from "@/lib/listings/value";

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

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

// Spelled out rather than taken from the generated PageProps<"/worth">: the
// static routes on this site (app/alerts/confirm) read their query the same
// way, and it keeps `tsc --noEmit` honest outside a build.
type Params = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Params> };

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * The typed query, or null for the bare form.
 *
 * A malformed VIN is DROPPED, not rejected: it can only ever have upgraded the
 * answer, so a typo costs the sharper tier and nothing else. Mileage is capped
 * at 300,000 — past that the number is a typo or a car no model on this site
 * has anything to say about, and value.ts's own driven-car window (2,000 to
 * 200,000) does the real work either way.
 */
function readInput(sp: Params): WorthInput | null {
  const year = Number(one(sp.year));
  const make = (one(sp.make) ?? "").trim();
  const model = (one(sp.model) ?? "").trim();
  const mileage = Number(String(one(sp.miles) ?? "").replace(/[,\s]/g, ""));
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return null;
  if (!make || !model) return null;
  if (!Number.isFinite(mileage) || mileage < 0 || mileage > 300_000) return null;
  const rawVin = (one(sp.vin) ?? "").trim().toUpperCase();
  const trim = (one(sp.trim) ?? "").trim();
  return {
    year,
    make,
    model,
    mileage: Math.round(mileage),
    vin: VIN_RE.test(rawVin) ? rawVin : undefined,
    trim: trim || undefined,
  };
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold tracking-tight text-ink">What&rsquo;s my EV worth?</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        Tell us the car. We&rsquo;ll price it against what these are selling for and what they&rsquo;re
        listed at right now.
      </p>

      <div className="mt-6">
        <WorthForm
          defaults={{
            year: one(sp.year),
            make: one(sp.make),
            model: one(sp.model),
            miles: one(sp.miles),
            vin: one(sp.vin),
            trim: one(sp.trim),
          }}
        />
      </div>

      {input && valuation && <Result input={input} v={valuation} />}
    </div>
  );
}

function Result({ input, v }: { input: WorthInput; v: Valuation }) {
  const miles = `${input.mileage.toLocaleString("en-US")} miles`;

  if (v.tier === "unavailable" || v.tier === "abstain") {
    return (
      <section className="mt-8 border-[3px] border-ink bg-putty p-5">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">
          {vehicleLabel(input)} · {miles}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink">{v.source}</p>
        {v.tier === "abstain" && (
          <Link
            href={`/?make=${encodeURIComponent(input.make)}&model=${encodeURIComponent(input.model)}`}
            className="mt-3 inline-block text-[12px] font-extrabold uppercase tracking-[0.08em] text-cobalt underline underline-offset-2"
          >
            Browse {input.make} {input.model} listings
          </Link>
        )}
      </section>
    );
  }

  return (
    <section className="mt-8 border-[3px] border-ink bg-paper p-5">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">
        {vehicleLabel(input)} · {miles}
        {v.tier === "estimate" && v.matchedTrim ? ` · ${v.matchedTrim}` : ""}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[34px] font-extrabold leading-none tracking-[-0.03em] text-ink sm:text-[42px]">
          {v.headline}
        </span>
        {/* The site's one visible provenance promise: anything that is not a
            published figure is marked. Same word and same weight as
            components/SourceBadge.tsx, which this cannot reuse directly — that
            component reads a Fact, and this is a computation, not a fact. */}
        {v.estimated && (
          <span className="text-[13px] font-medium text-amber-700 dark:text-amber-500">est.</span>
        )}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink/70">{v.source}</p>

      <p className="mt-4 border-t-[3px] border-ink/10 pt-3 text-[12px] text-ink/50">
        Track this car&rsquo;s value — coming with Pro.
      </p>

      {/* ODbL attribution: required wherever a figure derived from the
          Washington title records renders, so this line is a licence term and
          not a disclaimer. Kept to a bare credit, exactly as
          components/RecentSales.tsx keeps it. */}
      {v.waDerived && (
        <p className="mt-2 text-[11px] text-ink/40">
          <a
            href="https://data.wa.gov/Transportation/Electric-Vehicle-Title-and-Registration-Activity/rpr4-cgyd"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cobalt"
          >
            WA DOL (ODbL)
          </a>
        </p>
      )}
    </section>
  );
}
