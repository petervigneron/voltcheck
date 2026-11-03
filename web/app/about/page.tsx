import type { Metadata } from "next";

// Canonical kept on the page, not the root layout, for the same reason as
// the home page's (web/app/page.tsx): a layout canonical inherits into every
// child route.
export const metadata: Metadata = {
  title: "About | Census",
  description:
    "Census was created by a former journalist and electric car enthusiast who wanted a better way to search for an affordable EV.",
  alternates: { canonical: "/about" },
};

// The copy is the owner's, verbatim (2026-08-31).
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">About Census</h1>

      <p className="mt-6 text-sm leading-relaxed text-ink/80">
        Census was created by a former journalist and electric car enthusiast who wanted a
        better way to search for an affordable EV capable enough for an active family and their
        dogs.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-ink/80">
        Questions? Email{" "}
        <a href="mailto:peter@voltcheck.net" className="font-semibold text-cobalt hover:underline">
          peter@voltcheck.net
        </a>
        .
      </p>
    </div>
  );
}
