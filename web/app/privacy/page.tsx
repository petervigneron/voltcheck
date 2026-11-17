import type { Metadata } from "next";
import Link from "next/link";

// What the site records about the people who use it. Every sentence below
// was written from the code on 2026-11-17, not from a template:
//   visits and clicks   lib/visit.ts, lib/events.ts, app/api/events/route.ts
//   location            app/api/whereami/route.ts, lib/shopperZip.ts
//   saved cars          lib/saved.ts, components/ShelfSync.tsx (0063)
//   accounts, cookies   lib/authCore.ts (vc_at, vc_rt), app/pro/access
//   alerts              0029_alert_subscriptions.sql, app/alerts/unsubscribe
//   payments            app/api/checkout, app/api/stripe/webhook
//   deletion            0123_account_delete.sql, app/api/account/delete
//   API and connector   app/api/v1, app/api/mcp (neither writes a record)
// A change to any of those is a change to this page. A privacy page that
// has drifted from the code is a false claim with the owner's name on it.
export const metadata: Metadata = {
  title: "Privacy | Census EV",
  description:
    "What Census EV records when you use the site, an account, price alerts, a purchase, the API or the AI connector, and what it does not.",
  alternates: { canonical: "/privacy" },
};

const h2 = "mt-10 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60";
const p = "mt-3 text-sm leading-relaxed text-ink/80";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Privacy</h1>
      <p className="mt-2 text-[12px] text-ink/50">November 17, 2026</p>

      <p className={p}>
        Census EV does not show ads, does not sell or share personal information, and loads no advertising or
        social-media trackers.
      </p>

      <h2 className={h2}>Browsing the site</h2>
      <p className={p}>
        We record which pages are opened, the site a visit came from, and when a car is saved or a link to a seller is
        clicked. Each record carries a random ID kept in your browser so that visits can be counted. The ID is not
        linked to an account or an email address, and we do not store your IP address or browser details with it.
        Vercel, which hosts the site, receives your IP address in order to serve pages and provides cookieless page
        counts.
      </p>
      <p className={p}>
        Your approximate location, taken from your IP address, is used to sort cars by distance and is not stored. A
        ZIP code you type and the cars and searches you save are kept in your browser.
      </p>

      <h2 className={h2}>Accounts</h2>
      <p className={p}>
        An account holds your email address, a password stored in hashed form, and your saved cars and searches.
        Signing in sets two cookies that keep you signed in. They are the only cookies the site sets, apart from one
        that records a purchased pass.
      </p>

      <h2 className={h2}>Price alerts</h2>
      <p className={p}>
        An alert holds your email address and the search or cars it watches. Every alert email has an unsubscribe
        link, and using it deletes the alert.
      </p>

      <h2 className={h2}>Purchases</h2>
      <p className={p}>
        Payments are taken by Stripe. We never see or store a card number. We keep the email address a purchase was
        made with, what was bought and when.
      </p>

      <h2 className={h2}>API and AI connector</h2>
      <p className={p}>
        The public API and the{" "}
        <Link href="/mcp" className="font-semibold text-cobalt hover:underline">
          connector
        </Link>{" "}
        need no account. A request carries only the search it asks for: no conversation, name or email reaches us,
        and we keep no record of what was searched. A paid data key is tied to the email address that bought it.
      </p>

      <h2 className={h2}>Who handles data for us</h2>
      <p className={p}>
        Vercel hosts the site. Supabase stores the database and handles sign-in. Stripe takes payments. Resend sends
        our email. Each receives only what its job needs.
      </p>

      <h2 className={h2}>Keeping and deleting</h2>
      <p className={p}>
        You can delete your account on the{" "}
        <Link href="/account/delete" className="font-semibold text-cobalt hover:underline">
          account page
        </Link>
        . That removes your sign-in, saved cars and searches, price alerts, and any pass or data key. Stripe keeps its
        record of a payment. Visit records carry no name, email address or IP address and are kept. For anything
        else we hold about you, email{" "}
        <a href="mailto:peter@censusev.com" className="font-semibold text-cobalt hover:underline">
          peter@censusev.com
        </a>
        .
      </p>
    </div>
  );
}
