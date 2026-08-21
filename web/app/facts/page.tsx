import type { Metadata } from "next";
import Link from "next/link";
import { FACT_SHEETS } from "@/lib/facts/registry";

// Canonical kept on the page, not the layout — same reason as
// web/app/methodology/page.tsx: a layout canonical would point every child
// route (every /facts/... sheet) back at /facts too.
export const metadata: Metadata = {
  title: "EV fact sheets | Voltcheck",
  description:
    "Sourced answers to the questions shoppers actually ask about specific EVs: charging speed, connector type, and which model years have a heat pump.",
  alternates: { canonical: "/facts" },
};

export default function FactSheetsIndex() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">EV fact sheets</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        One page per question, sourced to the manufacturer&rsquo;s own documents wherever one exists.
        Every non-manufacturer figure is marked{" "}
        <strong className="text-[11px] font-bold tracking-[0.02em] text-amber-700">Est.</strong>
      </p>

      <ul className="mt-8 divide-y divide-ink/10 border-t border-b border-ink/10">
        {FACT_SHEETS.map((s) => (
          <li key={`${s.make}/${s.model}/${s.topic}`}>
            <Link
              href={`/facts/${s.make}/${s.model}/${s.topic}`}
              className="flex items-center justify-between gap-4 py-4 hover:bg-putty"
            >
              <span className="text-[15px] font-bold text-ink">{s.breadcrumbLabel}</span>
              <span aria-hidden className="text-cobalt">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
