import type { Metadata } from "next";

// Canonical kept on the page, not the root layout, for the same reason as
// the home page's (web/app/page.tsx): a layout canonical inherits into every
// child route and would point every other page at "/methodology" too.
export const metadata: Metadata = {
  title: "Where this data comes from | Voltcheck",
  description:
    "How Voltcheck sources every spec, price, and warranty fact on the site, and what it does when a claim can't be proven.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Where this data comes from</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink/70">
        Every spec on this site is either a fact we can prove, or it isn&rsquo;t shown.
      </p>

      <h2 className="mt-8 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">
        Primary sources, used wherever they exist
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink/80">
        <li>The manufacturer&rsquo;s own spec sheets, press materials, and window stickers</li>
        <li>EPA range and efficiency, from fueleconomy.gov&rsquo;s own data</li>
        <li>Vehicle decode data — make, model, year, plant — from NHTSA&rsquo;s vPIC database</li>
        <li>Battery recalls and complaints, from NHTSA</li>
        <li>Washington State DOL title records, for what similar cars actually sold for</li>
      </ul>

      <p className="mt-6 text-sm leading-relaxed text-ink/80">
        Where no primary source exists, we use named secondary sources — a spec aggregator, an
        outlet&rsquo;s own instrumented test — and mark the figure <strong>est</strong>. An
        estimate is never shown the way a manufacturer figure is.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-ink/80">
        When we can&rsquo;t support a claim, we show nothing: no default value, no best guess, no
        &ldquo;typically.&rdquo; A blank field means we don&rsquo;t know — and neither does anyone
        printing a number there.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-ink/80">
        Some things — battery health, an exact build date, whether an option was actually
        installed on one specific car — can&rsquo;t be known from a listing at all. Where that
        matters, a listing&rsquo;s &ldquo;Worth asking the seller&rdquo; panel names the question
        instead of us guessing at an answer.
      </p>
    </div>
  );
}
