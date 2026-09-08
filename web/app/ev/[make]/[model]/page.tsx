import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findModelHub, hubPath } from "@/lib/listings/modelHubs";
import { hubIndexKey, type HubStats } from "@/lib/listings/hubIndex";
import { hubEntry } from "@/lib/listings/hubSource";
import { factLinksFor } from "@/lib/facts/links";
import { JsonLd } from "@/components/ListingJsonLd";
import { hubItemListJsonLd } from "@/lib/listings/jsonLd";

// Renders on first request and is CDN-cached from then on — the same shape
// the browse index and the sitemap shards run on, and for the same reason
// their comments give: prerendering 246 pages at build time would put every
// deploy at the database's mercy, which is exactly what killed five deploys
// on 2026-08-16. dynamicParams=false is deliberately NOT used here even
// though the hub list is known: it would force Next to prerender the params
// it validates against. The page validates the slug itself and 404s instead.
export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams(): { make: string; model: string }[] {
  return [];
}

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const monthOf = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "September 2026" from the stats' YYYY-MM-DD, or undefined when there are none. */
function statsMonth(stats: HubStats | undefined): string | undefined {
  if (!stats) return undefined;
  const d = new Date(`${stats.asOf}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? monthOf.format(d) : undefined;
}

export async function generateMetadata(
  props: PageProps<"/ev/[make]/[model]">,
): Promise<Metadata> {
  const { make, model } = await props.params;
  const hub = findModelHub(make, model);
  if (!hub) return {};
  const name = `${hub.make} ${hub.model}`;
  // The month is in the title because that is how the question is asked
  // ("Model Y prices September 2026") and answered by the pages that get
  // cited; the URL stays the same from month to month so the page keeps
  // whatever standing it has earned.
  const { total, stats } = await hubEntry(hubIndexKey(hub));
  const month = statsMonth(stats);
  return {
    title: month
      ? `${name} for sale, ${month}: prices, range and battery | Voltcheck`
      : `Used and new ${name} for sale | Voltcheck`,
    description:
      total > 0
        ? `${nf.format(total)} ${name} for sale in the United States${month ? ` as of ${month}` : ""}, with asking price by model year, battery, range and charging details on each car.`
        : `Every ${name} we can find for sale in the United States, with battery, range and charging details on each car.`,
    alternates: { canonical: hubPath(hub) },
  };
}

export default async function ModelHubPage(props: PageProps<"/ev/[make]/[model]">) {
  const { make, model } = await props.params;
  const hub = findModelHub(make, model);
  if (!hub) notFound();

  const { total, cars, stats } = await hubEntry(hubIndexKey(hub));
  const name = `${hub.make} ${hub.model}`;
  const facts = factLinksFor(hub.make, hub.model);
  const month = statsMonth(stats);
  // A year row earns a place in the table when it has something to say
  // beyond a count; the count alone is already in the heading.
  const yearRows = stats?.years.filter((y) => y.medianUsd !== undefined || y.medianMiles !== undefined) ?? [];
  const conditions = stats
    ? (["new", "used", "certified"] as const).filter((c) => stats.byCondition[c] > 0)
    : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <nav
        aria-label="Breadcrumb"
        className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40"
      >
        <Link href="/" className="hover:text-cobalt">
          Voltcheck
        </Link>{" "}
        /{" "}
        <Link href="/ev" className="hover:text-cobalt">
          Models
        </Link>{" "}
        / <span className="text-ink/70">{name}</span>
      </nav>

      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{name}</h1>
        {total > 0 && (
          <span className="shrink-0 text-sm font-bold text-ink/60">
            {nf.format(total)} {total === 1 ? "car" : "cars"}
          </span>
        )}
      </div>

      {facts.length > 0 && (
        <ul className="mt-6 space-y-1">
          {facts.map((f) => (
            <li key={f.path}>
              <Link href={f.path} className="text-[15px] text-cobalt hover:underline">
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* The numbers. Every figure here is computed nightly from the same
          public feed the grid serves (lib/listings/hubIndex.ts hubStats),
          floored so a median never rests on fewer than STATS_MIN cars, and
          dated so a reader — or a search engine — knows which month it
          describes. Labels and values only; there is deliberately no sentence
          explaining a number, per the house rule on copy. */}
      {stats && total > 0 && (
        <section className="mt-8" aria-labelledby="hub-stats">
          <div className="flex items-baseline justify-between gap-4 border-b border-ink/10 pb-2">
            <h2 id="hub-stats" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/50">
              {month ? `For sale, ${month}` : "For sale"}
            </h2>
            {conditions.length > 0 && (
              <span className="text-[13px] text-ink/60">
                {conditions
                  .map((c) => `${nf.format(stats.byCondition[c])} ${c}`)
                  .join(" · ")}
                {stats.cuts > 0 && <> · {nf.format(stats.cuts)} price cut</>}
              </span>
            )}
          </div>

          {yearRows.length > 0 && (
            <table className="mt-3 w-full text-[14px]">
              <thead className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/50">
                <tr>
                  <th scope="col" className="py-1 text-left font-bold">
                    Model year
                  </th>
                  <th scope="col" className="py-1 text-right font-bold">
                    For sale
                  </th>
                  <th scope="col" className="py-1 text-right font-bold">
                    Median asking
                  </th>
                  <th scope="col" className="py-1 text-right font-bold">
                    Median miles
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {yearRows.map((y) => (
                  <tr key={y.year}>
                    <th scope="row" className="py-2 text-left font-bold text-ink">
                      {y.year}
                    </th>
                    <td className="py-2 text-right text-ink/70">{nf.format(y.n)}</td>
                    <td className="py-2 text-right font-bold text-ink">
                      {y.medianUsd !== undefined ? money.format(y.medianUsd) : ""}
                    </td>
                    <td className="py-2 text-right text-ink/70">
                      {y.medianMiles !== undefined ? nf.format(y.medianMiles) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(stats.configs.length > 0 || stats.heatPump || stats.states.length > 0) && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[13px]">
              {stats.configs.length > 0 && (
                <>
                  <dt className="font-bold text-ink/50">Battery · range</dt>
                  <dd className="text-ink/80">
                    {stats.configs
                      .map((c) => `${c.kwh} kWh · ${c.rangeMi} mi (${nf.format(c.n)})`)
                      .join(", ")}
                  </dd>
                </>
              )}
              {stats.heatPump && (
                <>
                  <dt className="font-bold text-ink/50">Heat pump</dt>
                  <dd className="text-ink/80">
                    {nf.format(stats.heatPump.yes)} yes · {nf.format(stats.heatPump.no)} no
                  </dd>
                </>
              )}
              {stats.states.length > 0 && (
                <>
                  <dt className="font-bold text-ink/50">Where</dt>
                  <dd className="text-ink/80">
                    {stats.states.map((s) => `${s.state} ${nf.format(s.n)}`).join(", ")}
                  </dd>
                </>
              )}
            </dl>
          )}
        </section>
      )}

      {cars.length > 0 && (
        <ul className="mt-8 divide-y divide-ink/10 border-t border-b border-ink/10">
          {cars.map((c) => (
            <li key={c.id}>
              <Link
                href={`/listing/${c.id}`}
                className="flex items-baseline justify-between gap-4 py-3 hover:bg-putty"
              >
                {/* CardRow.title is "2026 Honda Prologue Touring" — year,
                    make and model included. The heading above already says
                    the make and the model, so the row carries what differs:
                    the year and the trim. */}
                <span className="text-[15px] font-bold text-ink">
                  {c.year} {c.trim ?? hub.model}
                </span>
                <span className="shrink-0 text-right text-[13px] text-ink/60">
                  {c.mileage !== undefined && <>{nf.format(c.mileage)} mi</>}
                  {c.realPrice && (
                    <span className="ml-3 font-bold text-ink">{money.format(c.priceUsd)}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* The cars listed above, as an ItemList — names and links only, and
          numberOfItems counts what this page shows rather than the hub's
          total, so the markup can't claim more than the page does. The rows
          are already in hand, so it costs nothing. Kept out of first-child
          position for the reason the listing page's copy gives. */}
      {cars.length > 0 && <JsonLd json={hubItemListJsonLd(name, hubPath(hub), cars)} />}

      {total > cars.length && (
        <p className="mt-6 text-sm">
          <Link href={`/?q=${encodeURIComponent(name)}`} className="text-cobalt hover:underline">
            All {nf.format(total)} {name} listings
          </Link>
        </p>
      )}
    </div>
  );
}
