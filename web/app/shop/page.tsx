import type { Metadata } from "next";
import Link from "next/link";
import { openGraph } from "@/lib/og/meta";
import { SHOP_QUESTIONS, shopHeading, shopPath } from "@/lib/listings/shopQuestions";

// The index of the /shop questions, in registry order. It reads no data —
// the registry is compiled in — so it prerenders at build in milliseconds
// and no deploy waits on the artifacts for it. That is why it prints no
// counts: a count here would make this the one /shop page a build has to
// fetch the ~20 MB index for (app/shop/[slug]/page.tsx renders on first
// request for exactly that reason).
export const dynamic = "force-static";

const TITLE = "Electric cars by budget | Census";
const DESCRIPTION =
  "Used and new electric cars and plug-in hybrids for sale in the United States under a price, counted from live listings: models, asking prices, range and battery.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/shop" },
  openGraph: openGraph(TITLE, DESCRIPTION, "/shop"),
};

export default function ShopIndexPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Census
        </Link>{" "}
        / <span className="text-ink/70">By budget</span>
      </nav>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">Electric cars by budget</h1>

      <ul className="mt-8 divide-y divide-ink/10 border-t border-b border-ink/10">
        {SHOP_QUESTIONS.map((q) => (
          <li key={q.slug}>
            <Link href={shopPath(q)} className="block py-3 text-[15px] font-bold text-ink hover:bg-putty">
              {shopHeading(q)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
