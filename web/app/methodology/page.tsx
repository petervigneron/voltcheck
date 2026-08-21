import type { Metadata } from "next";

// Canonical kept on the page, not the root layout, for the same reason as
// the home page's (web/app/page.tsx): a layout canonical inherits into every
// child route and would point every other page at "/methodology" too.
export const metadata: Metadata = {
  title: "Where this data comes from | Voltcheck",
  description:
    "The manufacturer, EPA, NHTSA, and state title sources behind every spec, price, and warranty fact on Voltcheck.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Where this data comes from</h1>

      <h2 className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">
        Primary sources
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink/80">
        <li>The manufacturer&rsquo;s spec sheets, press materials, and window stickers</li>
        <li>EPA range and efficiency, from fueleconomy.gov&rsquo;s data</li>
        <li>Vehicle decode data (make, model, year, plant) from NHTSA&rsquo;s vPIC database</li>
        <li>Battery recalls and complaints, from NHTSA</li>
        <li>Washington State DOL title records</li>
      </ul>

      <p className="mt-6 text-sm leading-relaxed text-ink/80">
        Where no primary source exists, we use named secondary sources (a spec aggregator, an
        outlet&rsquo;s own instrumented test) and mark the figure <strong>est</strong>.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-ink/80">
        When we can&rsquo;t support a claim, we show nothing: no default value, no best guess, no
        &ldquo;typically.&rdquo;
      </p>

      <p className="mt-4 text-sm leading-relaxed text-ink/80">
        Some information about electric cars (battery health, build date) can be estimated but is
        difficult to know without a physical inspection. In these cases, we recommend contacting
        sellers directly.
      </p>
    </div>
  );
}
