import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { WatchlistSync } from "@/components/WatchlistSync";
import { ShelfSync } from "@/components/ShelfSync";
import { AccountLink } from "@/components/AccountLink";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voltcheck: know the EV behind the listing",
  description:
    "Every EV for sale, new and used, with what actually matters: the real pack, the real range, and what the warranty does for you.",
  metadataBase: new URL("https://voltcheck.net"),
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
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-stretch px-0 sm:px-6">
            <Link
              href="/"
              className="px-4 py-3.5 text-[18px] font-extrabold tracking-[-0.03em] focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt sm:px-5 sm:py-4 sm:text-[21px]"
            >
              VOLTCHECK
            </Link>
            <nav className="ml-auto flex items-stretch text-[11.5px] font-extrabold tracking-[0.04em] uppercase sm:text-[12.5px] sm:tracking-[0.06em]">
              <Link
                href="/"
                className="flex items-center px-3 hover:bg-cobalt sm:px-5 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
              >
                Browse
              </Link>
              <Link
                href="/worth"
                className="flex items-center px-3 hover:bg-cobalt sm:px-5 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
              >
                What&rsquo;s it worth
              </Link>
              <Link
                href="/saved"
                className="flex items-center px-3 hover:bg-cobalt sm:px-5 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
              >
                Saved
              </Link>
              <Link
                href="/vin"
                className="flex items-center px-3 hover:bg-cobalt sm:px-5 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
              >
                VIN check
              </Link>
              <AccountLink />
            </nav>
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
            <Link href="/facts" className="underline decoration-paper/40 underline-offset-2 hover:text-paper hover:decoration-paper">
              Fact sheets
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
