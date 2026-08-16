import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
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
          <div className="mx-auto flex max-w-[1400px] items-stretch px-0 sm:px-6">
            <Link
              href="/"
              className="px-5 py-4 text-[21px] font-extrabold tracking-[-0.03em] focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
            >
              VOLTCHECK
            </Link>
            <nav className="ml-auto flex items-stretch text-[12.5px] font-extrabold tracking-[0.06em] uppercase">
              <Link
                href="/"
                className="flex items-center px-5 hover:bg-cobalt focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
              >
                Browse
              </Link>
              <Link
                href="/vin"
                className="flex items-center px-5 hover:bg-cobalt focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
              >
                VIN check
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-8 bg-ink text-paper/70">
          <div className="mx-auto max-w-[1400px] px-5 py-4 text-[11px] font-semibold tracking-[0.08em] uppercase sm:px-6">
            Facts carry their source and check-date. When something is unknowable, we say so.
          </div>
        </footer>
      </body>
    </html>
  );
}
