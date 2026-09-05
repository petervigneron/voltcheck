import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findModelHub, hubPath } from "@/lib/listings/modelHubs";
import { hubIndexKey } from "@/lib/listings/hubIndex";
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

export async function generateMetadata(
  props: PageProps<"/ev/[make]/[model]">,
): Promise<Metadata> {
  const { make, model } = await props.params;
  const hub = findModelHub(make, model);
  if (!hub) return {};
  const name = `${hub.make} ${hub.model}`;
  return {
    title: `Used and new ${name} for sale | Voltcheck`,
    description: `Every ${name} we can find for sale in the United States, with battery, range and charging details on each car.`,
    alternates: { canonical: hubPath(hub) },
  };
}

export default async function ModelHubPage(props: PageProps<"/ev/[make]/[model]">) {
  const { make, model } = await props.params;
  const hub = findModelHub(make, model);
  if (!hub) notFound();

  const { total, cars } = await hubEntry(hubIndexKey(hub));
  const name = `${hub.make} ${hub.model}`;
  const facts = factLinksFor(hub.make, hub.model);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {/* The cars listed below, as an ItemList — names and links only, and
          numberOfItems counts what this page shows rather than the hub's
          total, so the markup can't claim more than the page does. The rows
          are already in hand, so it costs nothing. */}
      {cars.length > 0 && (
        <JsonLd json={hubItemListJsonLd(name, hubPath(hub), cars)} />
      )}
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
