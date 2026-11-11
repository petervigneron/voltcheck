import type { Metadata } from "next";
import Link from "next/link";
import { MODEL_HUBS } from "@/lib/listings/modelHubs";
import { hubEntry } from "@/lib/listings/hubSource";
import { hubIndexKey } from "@/lib/listings/hubIndex";
import { EMBED_ROWS, embedHeight, embedPath, embedSnippet, embedYears } from "@/lib/embed/card";
import { EmbedBuilder, type EmbedOption } from "@/components/EmbedBuilder";
import { openGraph } from "@/lib/og/meta";

// /embed: where a card is picked and its snippet copied. lib/embed/card.ts
// says what the card is; this page only lists the models and shows one.
//
// Each snippet's frame height is fitted to the rows that model actually has
// today, so a model with one priced year does not ship a card with a blank
// half. That is read from the same hub artifact the cards render from. If
// the artifact cannot be read the page still lists every model at the full
// height: a snippet that is a little tall is better than no page.
//
// COPY: placeholder labels of mine. The owner writes the copy.
export const dynamic = "force-static";
export const revalidate = 86400;

const TITLE = "Embed live EV listings counts and prices | Census EV";
const DESCRIPTION =
  "A small card for any electric or plug-in hybrid model: how many are for sale in the US and the median asking price by model year, updated daily. Copy the HTML into a post or page.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/embed" },
  openGraph: openGraph(TITLE, DESCRIPTION, "/embed"),
};

export default async function EmbedPage() {
  // hubEntry reads one cached artifact, so 246 calls are one fetch.
  const options: EmbedOption[] = (
    await Promise.all(
      MODEL_HUBS.map(async (h) => {
        const rows = await hubEntry(hubIndexKey(h))
          .then((e) => embedYears(e.stats).length)
          .catch(() => undefined);
        return {
          key: `${h.makeSlug}/${h.modelSlug}`,
          name: `${h.make} ${h.model}`,
          path: embedPath(h),
          snippet: embedSnippet(h, rows),
          height: embedHeight(rows ?? EMBED_ROWS),
        };
      }),
    )
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Census
        </Link>{" "}
        / <span className="text-ink/70">Embed</span>
      </nav>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">Embed a model</h1>
      <EmbedBuilder options={options} initial="tesla/model-3" />
    </div>
  );
}
