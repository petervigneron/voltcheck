import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ShopAnswer } from "@/components/ShopAnswer";
import { openGraph } from "@/lib/og/meta";
import { shopCarRow, shopCountLine, shopDescription, shopItemListJsonLd, shopModelRow } from "@/lib/listings/shop";
import { findShopQuestion, shopHeading, shopNeighbours, shopPath } from "@/lib/listings/shopQuestions";
import { shopSearch } from "@/lib/listings/shopSearch";

// One question from lib/listings/shop.ts, answered from live inventory. That
// file says why these pages exist and which rules every figure obeys.
//
// Rendered on first request and cached for a day, with an empty
// generateStaticParams: the answers come from the published artifacts, and
// a build must not wait on them (CLAUDE.md, the deploy section; the same
// shape as /market/[month]). /api/revalidate names this path, so a feed
// publish turns every question over. The set is fixed and small (18), so
// these are 18 ISR entries, not a URL space.
//
// The artifact reads are `cache: "no-store"` (lib/api/artifacts.ts). In a
// force-static page that keeps the ~20 MB index out of the data cache
// without making the page dynamic: Next skips the dynamic bail-out under
// force-static (dynamic-rendering.js markCurrentScopeAsDynamic, "it's
// static and it should not throw or postpone here").
//
// shopSearch() throws when an artifact cannot be read, which leaves the
// previous render in place rather than caching an empty answer.
export const dynamic = "force-static";
export const revalidate = 86400;
// A cold instance reads the ~20 MB index and up to a few make partitions.
export const maxDuration = 60;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

// generateMetadata and the page ask the same question in one render.
const answer = cache(shopSearch);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const q = findShopQuestion(slug);
  if (!q) return {};
  const res = await answer(q);
  const title = `${shopHeading(q)} | Census`;
  const description = shopDescription(q, res.total, res.models, res.asOf);
  return {
    title,
    description,
    alternates: { canonical: shopPath(q) },
    openGraph: openGraph(title, description, shopPath(q)),
  };
}

export default async function ShopQuestionPage({ params }: Props) {
  const { slug } = await params;
  const q = findShopQuestion(slug);
  if (!q) notFound();
  const res = await answer(q);
  return (
    <ShopAnswer
      heading={shopHeading(q)}
      countLine={shopCountLine(res.total, res.asOf)}
      models={res.models.map(shopModelRow)}
      cars={res.cars.map(shopCarRow)}
      neighbours={shopNeighbours(q)}
      itemList={res.models.length ? shopItemListJsonLd(q, res.models) : undefined}
    />
  );
}
