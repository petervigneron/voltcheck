import Link from "next/link";
import { JsonLd } from "@/components/ListingJsonLd";
import type { NearRow } from "@/lib/listings/near";
import type { ShopModelRow } from "@/lib/listings/shop";
import type { ShopLink } from "@/lib/listings/shopQuestions";

// The body of /shop/<slug>. Presentational only — every string arrives
// already shaped by lib/listings/shop.ts and near.ts — so it renders in a
// test (tests/shop-page.test.tsx) exactly as it does on the site.
//
// Plain <a> for the table links, not next/link, for the near page's reason
// (components/NearResults.tsx): a long table of Links prefetches every page
// it scrolls past, and the readers this page is built for run no JavaScript.
//
// House rule on copy: labels and values. An absent value is an empty cell.
// The model table's order is stated in its column header and nowhere else.

export interface ShopAnswerProps {
  heading: string;
  countLine: string;
  models: ShopModelRow[];
  cars: NearRow[];
  neighbours: { lower?: ShopLink; higher?: ShopLink };
  itemList?: Record<string, unknown>;
}

const TH = "py-1 pr-3 font-bold";
const HEAD = "text-[11px] font-bold uppercase tracking-[0.06em] text-ink/50";

export function ShopAnswer(p: ShopAnswerProps) {
  const more = [p.neighbours.lower, p.neighbours.higher].filter((l): l is ShopLink => l !== undefined);
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Census
        </Link>{" "}
        /{" "}
        <Link href="/shop" className="hover:text-cobalt">
          By budget
        </Link>
      </nav>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">{p.heading}</h1>
      <p className="mt-2 text-sm font-bold text-ink/60">{p.countLine}</p>

      {p.models.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className={HEAD}>
              <tr className="border-b border-ink/10">
                <th scope="col" className={`${TH} text-left`}>Model</th>
                <th scope="col" className={`${TH} text-right`}>Cars, most first</th>
                <th scope="col" className={`${TH} text-right`}>Lowest asking</th>
                <th scope="col" className={`${TH} text-right`}>Median asking</th>
                <th scope="col" className={`${TH} text-right`}>Range</th>
                <th scope="col" className={`${TH} text-right`}>Battery</th>
                <th scope="col" className="py-1 text-left font-bold">Model years</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {p.models.map((m) => (
                <tr key={m.key}>
                  <th scope="row" className="py-2 pr-3 text-left align-top font-bold">
                    {m.href ? (
                      <a href={m.href} className="text-ink hover:text-cobalt hover:underline">
                        {m.name}
                      </a>
                    ) : (
                      <span className="text-ink">{m.name}</span>
                    )}
                  </th>
                  <td className="py-2 pr-3 text-right align-top text-ink/70">{m.cars}</td>
                  <td className="py-2 pr-3 text-right align-top font-bold text-ink">{m.lowest ?? ""}</td>
                  <td className="py-2 pr-3 text-right align-top font-bold text-ink">{m.median ?? ""}</td>
                  <td className="py-2 pr-3 text-right align-top text-ink/70 whitespace-nowrap">{m.range ?? ""}</td>
                  <td className="py-2 pr-3 text-right align-top text-ink/70 whitespace-nowrap">{m.battery ?? ""}</td>
                  <td className="py-2 text-left align-top text-ink/70">{m.years}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The models above, names and links, as the model page's ItemList is
          its cars: numberOfItems is what the table holds. */}
      {p.itemList && <JsonLd json={p.itemList} />}

      {p.cars.length > 0 && (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className={HEAD}>
              <tr className="border-b border-ink/10">
                <th scope="col" className={`${TH} text-left`}>Car</th>
                <th scope="col" className={`${TH} text-right`}>Price, lowest first</th>
                <th scope="col" className={`${TH} text-right`}>Miles</th>
                <th scope="col" className={`${TH} text-right`}>Range</th>
                <th scope="col" className="py-1 text-left font-bold">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {p.cars.map((r) => (
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
                  <td className="py-2 pr-3 text-right align-top text-ink/70 whitespace-nowrap">{r.range ?? ""}</td>
                  <td className="py-2 text-left align-top text-ink/70">{r.place ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-10 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold">
        {more.map((l) => (
          <Link key={l.href} href={l.href} className="text-cobalt underline underline-offset-2">
            {l.label}
          </Link>
        ))}
        <Link href="/warranty" className="text-ink/60 underline underline-offset-2 hover:text-cobalt">
          Warranty
        </Link>
        <Link href="/market" className="text-ink/60 underline underline-offset-2 hover:text-cobalt">
          Market
        </Link>
      </p>
    </div>
  );
}
