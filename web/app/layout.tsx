import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { WatchlistSync } from "@/components/WatchlistSync";
import { ShelfSync } from "@/components/ShelfSync";
import { VisitBeacon } from "@/components/VisitBeacon";
import { AccountLink } from "@/components/AccountLink";
import { OG_BASE } from "@/lib/og/meta";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_TITLE = "Census EV: Every electric car. One site.";
const SITE_DESCRIPTION =
  "Every electric car. One site. New and used, with what actually matters: the real pack, the real range, and what the warranty does for you.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  metadataBase: new URL("https://censusev.com"),
  // Link previews (lib/og/meta.ts). A page that names itself builds its own
  // block. What is set here is only what is true of EVERY page, because a
  // page with no block inherits this one whole: a title or url here would
  // make /worth unfurl as the home page (og:url is what Facebook and
  // LinkedIn file a share under). Their title falls back to <title>. The
  // large card is set once: no page defines `twitter`, so it holds everywhere.
  openGraph: OG_BASE,
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-putty text-ink">
        <header className="bg-ink text-paper">
          {/* The wordmark plus three nav links wanted 434px of a 375px phone,
              and the overflow widened the whole document rather than clipping
              quietly: every row below — the band, the filter rail, the grid —
              was laid out to 434 and had its right edge cut off. So the bar
              shrinks to fit at phone sizes, and wraps rather than overflowing
              if it still can't (320px screens), because a header that pushes
              the page sideways breaks every page on the site, not just itself. */}
          {/* Phones get two rows (owner, 2026-11-04, "H3"): the lockup with the
              account link beside it, then the three site sections spread edge to
              edge under a hairline — a deliberate toolbar, not the leftover
              right-aligned cluster a flex-wrap produced once the lockup grew.
              From 640px up it is the one-row bar: lockup, then nav and account
              pushed right. One DOM order serves both; `order` does the rest. */}
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-stretch px-0 sm:flex-nowrap sm:px-6">
            {/* The wordmark is a two-line lockup (owner, 2026-11-04): CENSUS EV
                with EV in the light ochre, and the tagline under it. The second
                line is what lets phones carry the tagline at all — beside the
                wordmark it was a fifth item and wrapped the bar (2026-09-03). */}
            <Link
              href="/"
              className="order-1 flex flex-col justify-center px-4 py-[9px] leading-[1.15] focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt sm:px-5 sm:py-[11px]"
            >
              <span className="text-[18px] font-extrabold tracking-[-0.03em] sm:text-[21px]">
                CENSUS<span className="ml-[0.3em] text-ochre-lt">EV</span>
              </span>
              <span className="mt-[3px] text-[11px] font-medium text-paper/70 sm:text-[12px]">
                Every electric car. One site.
              </span>
            </Link>
            {/* No "Browse" link: the wordmark is the way home. */}
            <nav className="order-3 mx-4 flex basis-full items-stretch justify-between border-t border-paper/15 text-[11.5px] font-extrabold tracking-[0.04em] uppercase sm:order-2 sm:mx-0 sm:ml-auto sm:basis-auto sm:justify-start sm:border-0 sm:text-[12.5px] sm:tracking-[0.06em]">
              <Link
                href="/worth"
                className="flex items-center py-[9px] hover:bg-cobalt focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt sm:px-5 sm:py-0"
              >
                Values
              </Link>
              <Link
                href="/saved"
                className="flex items-center py-[9px] hover:bg-cobalt focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt sm:px-5 sm:py-0"
              >
                Saved
              </Link>
              <Link
                href="/vin"
                className="flex items-center py-[9px] hover:bg-cobalt focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt sm:px-5 sm:py-0"
              >
                VIN check
              </Link>
            </nav>
            <div className="order-2 ml-auto flex items-stretch pr-1 text-[11.5px] font-extrabold tracking-[0.04em] uppercase sm:order-3 sm:ml-0 sm:pr-0 sm:text-[12.5px] sm:tracking-[0.06em]">
              <AccountLink />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-8 bg-ink text-paper/70">
          {/* The one promise the UI visibly keeps on every page: SourceBadge
              marks est/agg figures. The older, longer versions promised
              provenance chips (removed by design) and unknowability
              handling — true, but footer prose; the owner trimmed it. The
              methodology link is the one place that longer explanation still
              lives, one unobtrusive line down, not narrated here. */}
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-[11px] font-semibold tracking-[0.08em] uppercase sm:px-6">
            <span className="text-paper">Every electric car. One site.</span>
            <span>Estimated figures are marked.</span>
            <Link href="/methodology" className="underline decoration-paper/40 underline-offset-2 hover:text-paper hover:decoration-paper">
              How we source this data
            </Link>
            {/* The footer is the only server-rendered nav on the site, so it
                is where a crawler picks up /ev — and /ev is the only route
                into the listing corpus. The browse grid's links are built in
                the browser, which is why 18 of 18 sampled listing pages were
                unknown to Google on 2026-09-02. */}
            <Link href="/ev" className="underline decoration-paper/40 underline-offset-2 hover:text-paper hover:decoration-paper">
              Models
            </Link>
            <Link href="/market" className="underline decoration-paper/40 underline-offset-2 hover:text-paper hover:decoration-paper">
              Market
            </Link>
            <Link href="/facts" className="underline decoration-paper/40 underline-offset-2 hover:text-paper hover:decoration-paper">
              Fact sheets
            </Link>
            <Link href="/data" className="underline decoration-paper/40 underline-offset-2 hover:text-paper hover:decoration-paper">
              Data
            </Link>
            <Link href="/embed" className="underline decoration-paper/40 underline-offset-2 hover:text-paper hover:decoration-paper">
              Embed
            </Link>
            <Link href="/about" className="underline decoration-paper/40 underline-offset-2 hover:text-paper hover:decoration-paper">
              About
            </Link>
          </div>
        </footer>

        {/* Vercel Web Analytics: first-party, cookieless page counts. The
            validation question this answers is "does the delta move organic
            traffic" — nothing here identifies a visitor. */}
        <Analytics />
        {/* One page_view row per page a person opens, with the referring
            site on the first (components/VisitBeacon.tsx). Renders nothing. */}
        <VisitBeacon />
        {/* Keeps the free price-drop alert's list in step with the ☆ on any
            page (components/WatchlistSync.tsx). Renders nothing. */}
        <WatchlistSync />
        {/* Mirrors the shelves to the account for a signed-in shopper
            (components/ShelfSync.tsx). Renders nothing. */}
        <ShelfSync />
      </body>
    </html>
  );
}
