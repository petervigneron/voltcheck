import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findModelHub, hubPath, type ModelHub } from "@/lib/listings/modelHubs";
import { zipCoords } from "@/lib/zips";
import { hubItemListJsonLd } from "@/lib/listings/jsonLd";
import {
  isNearZip,
  nearAsking,
  nearBasePath,
  nearCountLine,
  nearHeading,
  nearLinks,
  nearRow,
  parseNearParams,
} from "@/lib/listings/near";
import { nearSearch } from "@/lib/listings/nearSearch";
import { NearResults } from "@/components/NearResults";

// One model's cars around a ZIP, server-rendered, for the readers that
// cannot run the browse grid: an assistant fetching a URL on a shopper's
// behalf. lib/listings/near.ts says why it exists.
//
// CACHING — the part that costs money. The URL space is every ZIP times
// every model times every filter, so this page must never be an ISR entry:
// per-URL ISR writes are what put $50 on the 2026-09 Vercel bill. Hence
// force-dynamic (no prerender, no ISR entry, no data-cache entry — the
// artifact reads are `cache: "no-store"`, which is right here and would be
// wrong in an ISR page). Repeats of one URL are meant to be answered by the
// CDN instead: a page component cannot set a response header, so the
// Cache-Control for this path is set in next.config.ts `headers()`, and
// Next's page runtime keeps a Cache-Control that is already on the response
// rather than writing its dynamic `private, no-store` over it
// (app-page-runtime: `if (!res.getHeader('Cache-Control'))`).
//
// It reads no cookie and no header, so one cached copy is right for every
// visitor.
//
// noindex,follow and canonical to the model page: a parameterised result is
// not a page to rank, and the robots line is what lets a crawler follow the
// car links without filing the result. It stays fetchable — robots.txt does
// not disallow it, because a disallowed URL is one a well-behaved assistant
// will not read. Not in any sitemap.
export const dynamic = "force-dynamic";
// A cold instance reads the ~20 MB slim index once; the API route allows the same.
export const maxDuration = 60;

type Props = {
  params: Promise<{ make: string; model: string; zip: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function resolve(props: Props): Promise<{ hub: ModelHub; zip: string; origin: [number, number] } | null> {
  const { make, model, zip } = await props.params;
  const hub = findModelHub(make, model);
  if (!hub || !isNearZip(zip)) return null;
  const origin = await zipCoords(zip);
  return origin ? { hub, zip, origin } : null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const r = await resolve(props);
  if (!r) return {};
  const p = parseNearParams(await props.searchParams);
  const title = `${nearHeading(`${r.hub.make} ${r.hub.model}`, r.zip, p)} | Census`;
  return {
    title,
    alternates: { canonical: hubPath(r.hub) },
    // nofollow as well as noindex. Each result links to about ten wider and
    // narrower versions of itself, and every one of those is a new address
    // with a cold cost of megabytes: a crawler told to follow them would
    // walk filters without end. The links to cars are on the model page,
    // which is the canonical, so nothing a crawler needs is lost. An
    // assistant fetching one page for one question is not affected.
    robots: { index: false, follow: false },
  };
}

export default async function NearPage(props: Props) {
  const r = await resolve(props);
  if (!r) notFound();
  const { hub, zip, origin } = r;
  const p = parseNearParams(await props.searchParams);
  const name = `${hub.make} ${hub.model}`;
  const heading = nearHeading(name, zip, p);

  const res = await nearSearch(hub, origin, p);
  const rows = res.cars.map((c) => nearRow(c.rec, c.distanceMi, hub.model));

  return (
    <NearResults
      name={name}
      hubHref={hubPath(hub)}
      zip={zip}
      heading={heading}
      countLine={nearCountLine(res.total, p, res.asOf)}
      rows={rows}
      years={res.total > 0 ? res.breakdown.by_year : []}
      asking={nearAsking(res.breakdown)}
      links={nearLinks(hub, zip, p, res.breakdown)}
      itemList={
        res.cars.length > 0
          ? hubItemListJsonLd(heading, nearBasePath(hub, zip), res.cars.map((c) => ({ id: c.rec.id, title: c.rec.title })))
          : undefined
      }
    />
  );
}
