import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findModelHub, hubPath } from "@/lib/listings/modelHubs";
import { factLinksFor } from "@/lib/facts/links";
import { SPEC_HEADS, SPEC_HUBS, SPEC_WORDS, hasSpecs, specColumns, specLines, specPath, yearSpan, type SpecCell } from "@/lib/facts/specs";
import { CitationIcon } from "@/components/CitationIcon";
import { openGraph } from "@/lib/og/meta";

// /ev/<make>/<model>/specs: one model's versions by model year, with the
// facts a shopper compares. lib/facts/specs.ts says where every cell comes
// from and why this page exists; this file only draws the table.
//
// Prerendered at build, unlike the model page above it: the whole page is
// code (the enrichment table and the hub list), so it reads no database and
// no feed and cannot put a deploy at the database's mercy. dynamicParams is
// off so a model without a page is a 404 and not an on-demand render.
export function generateStaticParams(): { make: string; model: string }[] {
  return SPEC_HUBS.map((h) => ({ make: h.makeSlug, model: h.modelSlug }));
}
export const dynamicParams = false;

const years = (from: number, to: number) => (from === to ? String(from) : `${from}–${to}`);

export async function generateMetadata(props: PageProps<"/ev/[make]/[model]/specs">): Promise<Metadata> {
  const { make, model } = await props.params;
  const hub = findModelHub(make, model);
  if (!hub || !hasSpecs(hub)) return {};
  const name = `${hub.make} ${hub.model}`;
  const lines = specLines(hub);
  const heads = specColumns(lines).map((k) => SPEC_WORDS[k]);
  const [from, to] = yearSpan(lines);
  const title = `${name} specs by model year: ${heads.filter((h) => !h.startsWith("10")).slice(0, 3).join(", ")} | Census EV`;
  const description = `${name}, ${years(from, to)}: ${heads.join(", ")} for each version, with the source of every figure.`;
  return { title, description, alternates: { canonical: specPath(hub) }, openGraph: openGraph(title, description, specPath(hub)) };
}

function Cell({ c }: { c: SpecCell | undefined }) {
  if (!c) return null;
  return (
    <>
      {c.text}
      {c.est && <span className="ml-1 text-[11px] font-bold tracking-[0.02em] text-amber-700">(est.)</span>}
      {c.sourceUrl && (
        <a
          href={c.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Source, checked ${c.asOf}`}
          aria-label={`Source, checked ${c.asOf}`}
          className="ml-1 inline-block align-middle text-ink/30 no-underline hover:text-cobalt"
        >
          <CitationIcon />
        </a>
      )}
    </>
  );
}

export default async function SpecsPage(props: PageProps<"/ev/[make]/[model]/specs">) {
  const { make, model } = await props.params;
  const hub = findModelHub(make, model);
  if (!hub || !hasSpecs(hub)) notFound();
  const name = `${hub.make} ${hub.model}`;
  const lines = specLines(hub);
  const cols = specColumns(lines);
  const facts = factLinksFor(hub.make, hub.model);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Census
        </Link>{" "}
        /{" "}
        <Link href="/ev" className="hover:text-cobalt">
          Models
        </Link>{" "}
        /{" "}
        <Link href={hubPath(hub)} className="hover:text-cobalt">
          {name}
        </Link>{" "}
        / <span className="text-ink/70">Specs</span>
      </nav>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">{name} specs by model year</h1>

      <div className="mt-6 overflow-x-auto border-[3px] border-ink bg-paper">
        <table className="w-full min-w-[860px] text-left text-[14px]">
          <thead>
            <tr className="border-b-[3px] border-ink text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-ink/60">
              <th scope="col" className="px-4 py-2.5">
                Model year
              </th>
              <th scope="col" className="px-3 py-2.5">
                Version
              </th>
              {cols.map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-right last:pr-4">
                  {SPEC_HEADS[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {lines.map((l, i) => (
              <tr key={i}>
                <th scope="row" className="whitespace-nowrap px-4 py-2.5 font-bold text-ink">
                  {years(l.from, l.to)}
                </th>
                <td className="min-w-[9rem] px-3 py-2.5 text-ink/80">{l.version}</td>
                {cols.map((k) => (
                  <td key={k} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums last:pr-4">
                    <Cell c={l.cells[k]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-8 divide-y divide-ink/10 border-t border-b border-ink/10">
        <li>
          <Link href={hubPath(hub)} className="flex items-center justify-between gap-4 py-3 text-[15px] font-bold text-ink hover:bg-putty">
            {name} for sale
            <span aria-hidden className="text-cobalt">
              →
            </span>
          </Link>
        </li>
        {facts.map((f) => (
          <li key={f.path}>
            <Link href={f.path} className="flex items-center justify-between gap-4 py-3 text-[15px] font-bold text-ink hover:bg-putty">
              {f.label}
              <span aria-hidden className="text-cobalt">
                →
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/vin" className="flex items-center justify-between gap-4 py-3 text-[15px] font-bold text-ink hover:bg-putty">
            Check a VIN
            <span aria-hidden className="text-cobalt">
              →
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
