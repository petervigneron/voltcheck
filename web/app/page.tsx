import type { Metadata } from "next";
import { openGraph } from "@/lib/og/meta";
import { Suspense } from "react";
import Link from "next/link";
import { Browse } from "@/components/Browse";
import { FACT_SHEETS } from "@/lib/facts/registry";
import { SHOP_QUESTIONS, shopHeading, shopPath } from "@/lib/listings/shopQuestions";

// Self-canonical to the apex home URL. Google was reaching the site through
// http:// and www. variants (each 308s to https://censusev.com/), and with
// no canonical here it had nothing pinning the home page to one address. The
// path resolves against layout.tsx's metadataBase (https://censusev.com), so
// this renders <link rel="canonical" href="https://censusev.com/">. Kept on
// the page, not the root layout, because a layout canonical inherits into
// every child route and would wrongly point /vin, /saved, etc. at "/".
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  // The layout's title and description, repeated: this block replaces the
  // layout's, and the home page is the one link most likely to be pasted.
  openGraph: openGraph(
    "Census EV: Every electric car. One site.",
    "Every electric car. One site. New and used, with what actually matters: the real pack, the real range, and what the warranty does for you.",
    "/",
  ),
};

// The browse page is a static shell — prerendered at build, served from the
// CDN, no per-request server work at all. Inventory arrives client-side from
// /api/index (see components/Browse.tsx) and every filter interaction is a
// local computation. useSearchParams in the client tree requires the Suspense
// boundary; its fallback is the shell's skeleton for the first paint.
// The battery-warranty sheets, linked by model name from the home page.
// Until 2026-11-16 the home page reached them only through the footer's one
// link to /facts, which left every sheet two clicks from the page Google
// crawls most, on a domain it was crawling very little. The grid above is
// built in the browser, so this list and the footer are the only links in
// the home page's server HTML. Warranty sheets only: they are the one page
// type that has earned a search impression, and 54 names is a list where 86
// mixed topics would be a directory.
const WARRANTY_SHEETS = FACT_SHEETS.filter(
  (s) => s.topic === "battery-warranty",
)
  .map((s) => ({
    href: `/facts/${s.make}/${s.model}/${s.topic}`,
    label: s.breadcrumbLabel.replace(/ battery warranty$/, ""),
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export default function BrowsePage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="mx-auto max-w-[1400px] px-0 sm:px-6 sm:py-6">
            <div className="border-t-[3px] border-l-[3px] border-ink">
              <div className="h-[63px] border-r-[3px] border-b-[3px] border-ink bg-paper" />
              <div className="grid h-[62px] grid-cols-2 border-r-[3px] border-b-[3px] border-ink bg-putty md:grid-cols-4" />
            </div>
          </div>
        }
      >
        <Browse />
      </Suspense>
      <nav
        aria-labelledby="warranty-sheets"
        className="mx-auto max-w-[1400px] px-5 pt-10 pb-2 sm:px-6"
      >
        <h2
          id="warranty-sheets"
          className="text-[11px] font-bold tracking-[0.08em] text-ink uppercase"
        >
          Battery warranty by model
        </h2>
        <ul className="mt-3 columns-2 gap-x-6 text-[13px] leading-7 sm:columns-3 lg:columns-5">
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
      {/* The /shop questions, beside the warranty sheets and for their
          reason: this block and the footer are the only links in the home
          page's server HTML. The registry is compiled in, so the page still
          reads no data. */}
      <nav
        aria-labelledby="shop-questions"
        className="mx-auto max-w-[1400px] px-5 pt-8 pb-2 sm:px-6"
      >
        <h2
          id="shop-questions"
          className="text-[11px] font-bold tracking-[0.08em] text-ink uppercase"
        >
          <Link href="/shop" className="hover:text-cobalt">
            By budget
          </Link>
        </h2>
        <ul className="mt-3 columns-1 gap-x-6 text-[13px] leading-7 sm:columns-2 lg:columns-3">
          {SHOP_QUESTIONS.map((q) => (
            <li key={q.slug}>
              <Link
                href={shopPath(q)}
                className="text-ink/80 underline decoration-ink/20 underline-offset-2 hover:text-cobalt hover:decoration-cobalt"
              >
                {shopHeading(q)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
