import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchMarket } from "@/lib/market";
import { monthReports, nextMonth, prevMonth, type MonthReport } from "@/lib/marketMonths";
import { openGraph } from "@/lib/og/meta";

// One finished month of /market, at an address that stops changing once the
// month is over. lib/marketMonths.ts says why it exists and which months
// qualify; every figure is one /market already prints.
//
// Rendered on first request and cached for a day, with an empty
// generateStaticParams: the months come from the database, and a build must
// not wait on it (CLAUDE.md, the deploy section). /api/revalidate names
// this path beside /market.
export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams(): { month: string }[] {
  return [];
}

const nf = new Intl.NumberFormat("en-US");
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
const monthLong = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const monthOnly = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function load(month: string): Promise<{ report: MonthReport; all: MonthReport[] } | undefined> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return undefined;
  const all = monthReports(await fetchMarket());
  const report = all.find((r) => r.month === month);
  return report ? { report, all } : undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ month: string }> }): Promise<Metadata> {
  const { month } = await params;
  const found = await load(month).catch(() => undefined);
  if (!found) return {};
  const { report } = found;
  const parts: string[] = [];
  if (report.sold)
    parts.push(
      `Used electric car sale prices in Washington: ${pct(report.sold.change)} from ${monthOnly(prevMonth(month))}, ${nf.format(report.sold.sales)} sales.`,
    );
  if (report.asking)
    parts.push(`Mileage-adjusted asking prices across the US: ${pct(report.asking.change)}, ${nf.format(report.asking.cars)} cars.`);
  const title = `Used EV prices, ${monthLong(month)} | Census EV`;
  const description = parts.join(" ");
  return {
    title,
    description,
    alternates: { canonical: `/market/${month}` },
    openGraph: openGraph(title, description, `/market/${month}`),
  };
}

const sectionLabel = "text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60";

export default async function MarketMonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const found = await load(month);
  if (!found) notFound();
  const { report, all } = found;
  const has = (ym: string) => all.some((r) => r.month === ym);
  const before = prevMonth(month);
  const after = nextMonth(month);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Census
        </Link>{" "}
        /{" "}
        <Link href="/market" className="hover:text-cobalt">
          Market
        </Link>{" "}
        / <span className="text-ink/70">{monthLong(month)}</span>
      </nav>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">Used EV prices, {monthLong(month)}</h1>

      {report.sold && (
        <section className="mt-8 border-[3px] border-ink bg-paper p-5">
          <h2 className={sectionLabel}>Washington sales prices · same model and model year · mileage-adjusted</h2>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums text-violet">{pct(report.sold.change)}</span>
            <span className="text-sm font-semibold text-ink/70">from {monthOnly(before)}</span>
          </p>
          <p className="mt-1 text-[13px] text-ink/60">{nf.format(report.sold.sales)} sales · WA DOL (ODbL)</p>
        </section>
      )}

      {report.asking && (
        <section className="mt-8 border-[3px] border-ink bg-paper p-5">
          <h2 className={sectionLabel}>Mileage-adjusted asking prices · all used cars on the site</h2>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums text-violet">{pct(report.asking.change)}</span>
            <span className="text-sm font-semibold text-ink/70">
              {day(report.asking.from)} to {day(report.asking.to)}
            </span>
          </p>
          <p className="mt-1 text-[13px] text-ink/60">{nf.format(report.asking.cars)} cars</p>
        </section>
      )}

      <p className="mt-8 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold">
        {has(before) && (
          <Link href={`/market/${before}`} className="text-cobalt underline underline-offset-2">
            {monthLong(before)}
          </Link>
        )}
        {has(after) && (
          <Link href={`/market/${after}`} className="text-cobalt underline underline-offset-2">
            {monthLong(after)}
          </Link>
        )}
        <Link href="/methodology" className="text-ink/60 underline underline-offset-2 hover:text-cobalt">
          How we source this data
        </Link>
      </p>
    </div>
  );
}
