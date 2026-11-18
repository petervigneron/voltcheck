import Link from "next/link";
import { JsonLd } from "@/components/ListingJsonLd";
import type { NearAsking, NearLink, NearRow } from "@/lib/listings/near";

// The body of /ev/<make>/<model>/near/<zip>. Presentational only — every
// string arrives already shaped by lib/listings/near.ts — so it renders in a
// test (tests/near-page.test.tsx) exactly as it does on the site.
//
// The table and the other-search links are plain <a>, not next/link: a
// 50-row table of Links would prefetch every car page the moment it scrolled
// into view, and the readers this page is built for run no JavaScript anyway.
// The breadcrumb is Link, as on the model page.
//
// House rule on copy: labels and values. An absent value is an empty cell,
// never a word saying it is absent.

const nf = new Intl.NumberFormat("en-US");

export interface NearResultsProps {
  name: string;
  hubHref: string;
  zip: string;
  heading: string;
  countLine: string;
  rows: NearRow[];
  years: { year: number; n: number }[];
  asking?: NearAsking;
  links: { wider: NearLink[]; narrower: NearLink[] };
  itemList?: Record<string, unknown>;
}

const TH = "py-1 pr-3 font-bold";

function LinkRow({ label, links }: { label: string; links: NearLink[] }) {
  if (!links.length) return null;
  return (
    <>
      <dt className="font-bold text-ink/50">{label}</dt>
      <dd className="flex flex-wrap gap-x-4 gap-y-1">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="text-cobalt hover:underline">
            {l.label}
          </a>
        ))}
      </dd>
    </>
  );
}

export function NearResults(p: NearResultsProps) {
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
        <Link href={p.hubHref} className="hover:text-cobalt">
          {p.name}
        </Link>{" "}
        / <span className="text-ink/70">Near {p.zip}</span>
      </nav>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">{p.heading}</h1>
      <p className="mt-2 text-sm font-bold text-ink/60">{p.countLine}</p>

      {p.rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/50">
              <tr className="border-b border-ink/10">
                <th scope="col" className={`${TH} text-left`}>Car</th>
                <th scope="col" className={`${TH} text-right`}>Price</th>
                <th scope="col" className={`${TH} text-right`}>Miles</th>
                <th scope="col" className={`${TH} text-left`}>Location</th>
                <th scope="col" className={`${TH} text-right`}>Distance</th>
                <th scope="col" className={`${TH} text-right`}>Range</th>
                <th scope="col" className={`${TH} text-right`}>Battery</th>
                <th scope="col" className="py-1 text-right font-bold">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {p.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="py-2 pr-3 text-left align-top font-bold">
                    <a href={r.href} className="text-ink hover:text-cobalt hover:underline">
                      {r.car}
                    </a>
                    {(r.condition || r.flags.length > 0) && (
                      <span className="block text-[12px] font-normal text-ink/60">
                        {[r.condition, ...r.flags].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </th>
                  <td className="py-2 pr-3 text-right align-top font-bold text-ink">{r.price ?? ""}</td>
                  <td className="py-2 pr-3 text-right align-top text-ink/70">{r.miles ?? ""}</td>
                  <td className="py-2 pr-3 text-left align-top text-ink/70">{r.place ?? ""}</td>
                  <td className="py-2 pr-3 text-right align-top text-ink/70 whitespace-nowrap">{r.distance ?? ""}</td>
                  <td className="py-2 pr-3 text-right align-top text-ink/70 whitespace-nowrap">{r.range ?? ""}</td>
                  <td className="py-2 pr-3 text-right align-top text-ink/70 whitespace-nowrap">{r.battery ?? ""}</td>
                  <td className="py-2 text-right align-top text-ink/70 whitespace-nowrap">{r.lastSeen ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The cars above, names and links only; numberOfItems counts the rows
          shown, not the search's total, so the markup claims no more than
          the page does. Same builder as the model page's. */}
      {p.itemList && <JsonLd json={p.itemList} />}

      {(p.years.length > 0 || p.asking) && (
        <section className="mt-10 grid gap-8 sm:grid-cols-2">
          {p.years.length > 0 && (
            <table className="w-full text-[14px]">
              <thead className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/50">
                <tr className="border-b border-ink/10">
                  <th scope="col" className="py-1 text-left font-bold">Model year</th>
                  <th scope="col" className="py-1 text-right font-bold">For sale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {p.years.map((y) => (
                  <tr key={y.year}>
                    <th scope="row" className="py-2 text-left font-bold text-ink">{y.year}</th>
                    <td className="py-2 text-right text-ink/70">{nf.format(y.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {p.asking && (
            <div>
              <h2 className="border-b border-ink/10 pb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink/50">
                Asking price · {nf.format(p.asking.n)} {p.asking.n === 1 ? "car" : "cars"}
              </h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[14px]">
                <dt className="font-bold text-ink/50">Lowest</dt>
                <dd className="text-right font-bold text-ink">{p.asking.min}</dd>
                <dt className="font-bold text-ink/50">Median</dt>
                <dd className="text-right font-bold text-ink">{p.asking.median}</dd>
                <dt className="font-bold text-ink/50">Highest</dt>
                <dd className="text-right font-bold text-ink">{p.asking.max}</dd>
              </dl>
            </div>
          )}
        </section>
      )}

      {(p.links.wider.length > 0 || p.links.narrower.length > 0) && (
        <dl className="mt-10 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
          <LinkRow label="Wider" links={p.links.wider} />
          <LinkRow label="Narrower" links={p.links.narrower} />
        </dl>
      )}

    </div>
  );
}
