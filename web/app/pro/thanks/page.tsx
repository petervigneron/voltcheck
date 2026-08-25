import type { Metadata } from "next";
import Link from "next/link";

// Where Stripe sends a buyer after a completed checkout — the success_url in
// lib/pro.ts createCheckout, carrying ?session={CHECKOUT_SESSION_ID}.
//
// This page grants nothing and verifies nothing. It cannot: the only thing
// allowed to turn a payment into a pass is the signed webhook, and a
// success_url is just a redirect anyone can type. So the copy is careful
// about what it asserts — checkout finished, the access link follows once
// Stripe confirms the money — rather than announcing a pass that the webhook
// may still be a second away from creating, or that an async payment method
// has not actually paid for yet.
//
// The session id is echoed nowhere and used for nothing except deciding
// whether this visitor plausibly came from Stripe. Someone who typed the URL
// gets a page that does not congratulate them on a purchase they did not
// make.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thanks — Voltcheck Pro",
  // A transactional dead end with no index value, and one that would read as
  // a purchase confirmation to anyone who found it in search results.
  robots: { index: false, follow: true },
};

const SESSION_RE = /^cs_[A-Za-z0-9_]{8,200}$/;

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";

export default async function ProThanksPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await props.searchParams;
  const fromStripe = typeof session === "string" && SESSION_RE.test(session);

  return (
    <div className="mx-auto max-w-[760px] px-0 py-0 sm:px-6 sm:py-10">
      <div className="border-t-[3px] border-l-[3px] border-ink">
        {fromStripe ? (
          <>
            <div className={`${CELL} bg-teal px-5 py-8 text-paper sm:px-8`}>
              <span className={EYEBROW}>Voltcheck Pro</span>
              <h1 className="mt-2 text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[36px]">
                Thanks — check your email.
              </h1>
              <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-paper/85">
                Checkout is finished. Your access link goes to the address you gave Stripe as soon
                as Stripe confirms the payment, which is usually within a minute.
              </p>
            </div>
            <div className={`${CELL} bg-paper px-5 py-6 sm:px-8`}>
              <span className={`${EYEBROW} text-ink/55`}>What arrives</span>
              <p className="mt-3 max-w-[64ch] text-[13.5px] leading-relaxed text-ink/80">
                One email with one link. <strong>That link is your pass</strong> — there is no
                account and no password to go with it, so keep the email. Opening the link signs
                this device in and any other device you open it on. The pass ends on the date the
                email names, does not renew, and cannot charge you again.
              </p>
              <p className="mt-3 max-w-[64ch] text-[13.5px] leading-relaxed text-ink/80">
                Nothing after a few minutes? Look in spam for{" "}
                <span className="font-bold">alerts@voltcheck.net</span>, then have the link sent
                again from the Pro page — the form at the bottom does exactly that.
              </p>
            </div>
          </>
        ) : (
          <div className={`${CELL} bg-paper px-5 py-8 sm:px-8`}>
            <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em]">
              Nothing to confirm here.
            </h1>
            <p className="mt-3 max-w-[58ch] text-[14px] leading-relaxed text-ink/80">
              This page is where Stripe sends you after a purchase, and it wasn&rsquo;t Stripe that
              sent you. If you already have a pass and lost the email, the Pro page can send the
              link again.
            </p>
          </div>
        )}

        <div className={`${CELL} bg-putty px-5 py-5 text-[13px] font-bold sm:px-8`}>
          <Link href="/pro" className="text-cobalt underline underline-offset-2">
            Voltcheck Pro
          </Link>
          <span className="px-3 text-ink/30">·</span>
          <Link href="/" className="text-cobalt underline underline-offset-2">
            Back to the cars
          </Link>
        </div>
      </div>
    </div>
  );
}
