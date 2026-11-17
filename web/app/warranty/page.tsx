import type { Metadata } from "next";
import Link from "next/link";
import { MODEL_HUBS } from "@/lib/listings/modelHubs";
import { warrantyModels } from "@/lib/listings/warrantyCheck";
import { FACT_SHEETS } from "@/lib/facts/registry";
import { WarrantyChecker } from "@/components/WarrantyChecker";
import { openGraph } from "@/lib/og/meta";

// /warranty: make, model, model year and an odometer reading in, the
// high-voltage battery warranty out. lib/listings/warrantyCheck.ts says what
// the answer is and when it goes quiet; this page lists the models and the
// fact sheets.
//
// force-static: everything the picker needs is compiled in from the
// enrichment rows, so there is nothing to fetch. A linked result
// (?make=&model=&year=&miles=) is read by the picker after hydration, and
// every such URL canonicals to the bare /warranty.
//
// COPY: placeholder labels of mine. The owner writes the copy.
export const dynamic = "force-static";

const TITLE = "EV battery warranty checker: years and miles left by model | Census EV";
const DESCRIPTION =
  "Pick an electric or plug-in hybrid by make, model and year, enter the odometer reading, and see the manufacturer's high-voltage battery warranty term and whether it is still in force.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/warranty" },
  openGraph: openGraph(TITLE, DESCRIPTION, "/warranty"),
};

const WARRANTY_SHEETS = FACT_SHEETS.filter((s) => s.topic === "battery-warranty")
  .map((s) => ({
    href: `/facts/${s.make}/${s.model}/${s.topic}`,
    label: s.breadcrumbLabel.replace(/ battery warranty$/, ""),
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "EV battery warranty checker",
  description: DESCRIPTION,
  url: "https://censusev.com/warranty",
  applicationCategory: "AutomotiveApplication",
  operatingSystem: "Any",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Census EV", url: "https://censusev.com" },
};

export default function WarrantyPage() {
  const models = warrantyModels(MODEL_HUBS);
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Census
        </Link>{" "}
        / <span className="text-ink/70">Warranty</span>
      </nav>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">Battery warranty checker</h1>
      <WarrantyChecker models={models} />

      <nav aria-labelledby="warranty-sheets" className="mt-14">
        <h2 id="warranty-sheets" className="text-[11px] font-bold tracking-[0.08em] text-ink uppercase">
          Battery warranty by model
        </h2>
        <ul className="mt-3 columns-2 gap-x-6 text-[13px] leading-7 sm:columns-3">
          {WARRANTY_SHEETS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="text-ink/80 underline decoration-ink/20 underline-offset-2 hover:text-cobalt hover:decoration-cobalt"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
