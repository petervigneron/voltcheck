import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FACT_SHEETS, findFactSheet } from "@/lib/facts/registry";
import { loadFactSheet } from "@/lib/facts/content";
import { FactSheet } from "@/components/facts/FactSheet";
import { FactJsonLd } from "@/components/facts/FactJsonLd";
import { FACT_LINK_MODELS } from "@/lib/facts/links";
import { hubPath, hubsForKeys } from "@/lib/listings/modelHubs";

// Static content, known in full at build time — the six sheets in
// lib/facts/registry.ts — so this route is prerendered like any other
// static page rather than reading the database or feed per request (see
// CLAUDE.md's BUILD REQUIREMENTS). dynamicParams=false means a path outside
// the registry 404s instead of falling through to an on-demand render.
export async function generateStaticParams() {
  return FACT_SHEETS.map((s) => ({ make: s.make, model: s.model, topic: s.topic }));
}
export const dynamicParams = false;

export async function generateMetadata(
  props: PageProps<"/facts/[make]/[model]/[topic]">
): Promise<Metadata> {
  const { make, model, topic } = await props.params;
  const entry = findFactSheet(make, model, topic);
  if (!entry) return {};
  const path = `/facts/${entry.make}/${entry.model}/${entry.topic}`;
  return {
    title: entry.pageTitle,
    description: entry.description,
    alternates: { canonical: path },
    openGraph: {
      title: entry.pageTitle,
      description: entry.description,
      type: "article",
      url: path,
    },
  };
}

export default async function FactSheetPage(props: PageProps<"/facts/[make]/[model]/[topic]">) {
  const { make, model, topic } = await props.params;
  const entry = findFactSheet(make, model, topic);
  if (!entry) notFound();

  const parsed = loadFactSheet(entry.contentFile);
  const path = `/facts/${entry.make}/${entry.model}/${entry.topic}`;
  // Resolved through the fact-link row's modelKeys, not the URL segments —
  // one sheet covers two nameplates (Bolt EV and EUV) and so two hubs.
  const linkRow = FACT_LINK_MODELS.find((m) => m.make === entry.make && m.model === entry.model);
  const hubs = linkRow ? hubsForKeys(linkRow.make, linkRow.keys) : [];

  return (
    <>
      <FactJsonLd entry={entry} path={path} />
      <nav aria-label="Breadcrumb" className="mx-auto max-w-2xl px-4 pt-8 text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Voltcheck
        </Link>{" "}
        /{" "}
        <Link href="/facts" className="hover:text-cobalt">
          Fact sheets
        </Link>{" "}
        / <span className="text-ink/70">{entry.breadcrumbLabel}</span>
      </nav>
      <FactSheet parsed={parsed} />
      {/* The sheets are the only pages Google has actually indexed (measured
          2026-09-02), so they are the site's one warm entry point. Linking
          them to the model hubs is what gives a crawler a route onward into
          the listing corpus, which had none. */}
      {hubs.length > 0 && (
        <div className="mx-auto max-w-2xl px-4 pb-16">
          <ul className="space-y-1 border-t border-ink/10 pt-6">
            {hubs.map((h) => (
              <li key={hubPath(h)}>
                <Link href={hubPath(h)} className="text-[15px] text-cobalt hover:underline">
                  {h.make} {h.model} for sale
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
