import type { Metadata } from "next";
import Link from "next/link";
import { MODEL_HUBS, hubPath } from "@/lib/listings/modelHubs";
import { hubIndexKey } from "@/lib/listings/hubIndex";
import { hubTotals } from "@/lib/listings/hubSource";

// Same caching shape as the hubs it links: renders on first request, CDN
// cached for a day. See the hub page for why nothing here is prerendered.
export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Every electric and plug-in model for sale | Voltcheck",
  description:
    "One page per nameplate, covering every electric and plug-in hybrid model on sale in the United States.",
  alternates: { canonical: "/ev" },
};

const nf = new Intl.NumberFormat("en-US");

export default async function ModelIndexPage() {
  const totals = await hubTotals();

  // Grouped by make, and each group ordered by how many cars are actually
  // live — the same principle as the hub rows: the feed's own shape decides
  // the order, not an opinion about which nameplate matters.
  const byMake = new Map<string, typeof MODEL_HUBS>();
  for (const h of MODEL_HUBS) {
    const list = byMake.get(h.make) ?? [];
    list.push(h);
    byMake.set(h.make, list);
  }
  const makes = [...byMake.entries()]
    .map(([make, hubs]) => ({
      make,
      hubs: [...hubs].sort(
        (a, b) => (totals[hubIndexKey(b)] ?? 0) - (totals[hubIndexKey(a)] ?? 0),
      ),
      total: hubs.reduce((n, h) => n + (totals[hubIndexKey(h)] ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total || a.make.localeCompare(b.make));

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <nav
        aria-label="Breadcrumb"
        className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40"
      >
        <Link href="/" className="hover:text-cobalt">
          Voltcheck
        </Link>{" "}
        / <span className="text-ink/70">Models</span>
      </nav>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">Models</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        One page per nameplate, electric and plug-in hybrid, new and used.
      </p>

      {makes.map(({ make, hubs }) => (
        <section key={make} className="mt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">{make}</h2>
          <ul className="mt-2 divide-y divide-ink/10 border-t border-b border-ink/10">
            {hubs.map((h) => {
              const n = totals[hubIndexKey(h)] ?? 0;
              return (
                <li key={hubPath(h)}>
                  <Link
                    href={hubPath(h)}
                    className="flex items-baseline justify-between gap-4 py-3 hover:bg-putty"
                  >
                    <span className="text-[15px] font-bold text-ink">{h.model}</span>
                    {n > 0 && (
                      <span className="shrink-0 text-[13px] text-ink/60">{nf.format(n)}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
