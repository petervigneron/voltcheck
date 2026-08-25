import type { Metadata } from "next";
import Link from "next/link";
import { currentPass, TIERS, type PassState, type TierId } from "@/lib/pro";
import { FREE_FOREVER, PRO_BENEFITS, offerState } from "@/lib/proOffer";
import { ProBuyButton } from "@/components/ProBuyButton";
import { ProRecover } from "@/components/ProRecover";

// The Pro landing page: the promise, the two passes, and the way back in.
//
// Dynamic because it reads the vc_pro cookie. It reads nothing else — no
// feed, no shard, no listing walk — so it renders in milliseconds and cannot
// be taken down by whatever the database is doing. That is deliberate: the
// page a paying shopper lands on from their email is the last one that should
// depend on the heavy path.
//
// Three arrivals to handle, and they are all here:
//   * a stranger, who sees the promise and the prices;
//   * someone with a live pass, who sees what they hold and until when;
//   * someone whose access link failed (?access=expired|invalid), who is here
//     because /pro/access sent them rather than 404ing at them.
//
// Whether the buy buttons appear at all is lib/proOffer.ts's decision, not
// this file's — and as of 2026-08-25 the answer is no, because none of the
// four Pro features is finished. The page says so in as many words instead of
// showing a button that would take $9 for nothing.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Voltcheck Pro",
  description:
    "Everything Voltcheck knows about a specific car is free, permanently. Pro pays for speed, breadth and automation — being told first, and being watched over time.",
  alternates: { canonical: "/pro" },
};

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";

const money = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export default async function ProPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { access } = await props.searchParams;
  const arrival = typeof access === "string" ? access : null;

  // currentPass already swallows a failing RPC and answers "not active", but
  // the cookie store can throw on its own. A shopper who cannot be identified
  // gets the logged-out page, which is a worse page and not a broken one — a
  // 500 here would take down the only route that explains how to get back in.
  let pass: PassState = { active: false };
  try {
    pass = await currentPass();
  } catch {
    pass = { active: false };
  }

  const offer = offerState();
  const tiers = Object.entries(TIERS) as [TierId, (typeof TIERS)[TierId]][];

  return (
    <div className="mx-auto max-w-[1000px] px-0 py-0 sm:px-6 sm:py-10">
      {/* ── Who is here ──────────────────────────────────────────────── */}
      {pass.active ? (
        <div className="border-t-[3px] border-l-[3px] border-ink">
          <div className={`${CELL} bg-teal px-5 py-5 text-paper`}>
            <span className={EYEBROW}>Your pass</span>
            <p className="mt-1 text-[19px] leading-tight font-extrabold tracking-[-0.01em]">
              {pass.tier && TIERS[pass.tier] ? TIERS[pass.tier].label : "Pro pass"} — active
              {pass.expires_at ? ` through ${day(pass.expires_at)}` : ""}.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-paper/85">
              It does not renew and you will not be charged again. This browser will remember it
              until then; on another device, open the link from your purchase email, or have it
              sent again below.
            </p>
          </div>
        </div>
      ) : arrival === "expired" ? (
        <div className="border-t-[3px] border-l-[3px] border-ink">
          <div className={`${CELL} bg-saffron px-5 py-5`}>
            <span className={EYEBROW}>That pass has ended</span>
            <p className="mt-1 text-[17px] leading-tight font-extrabold tracking-[-0.01em]">
              The link works; the pass behind it has run out.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink/80">
              Passes expire on their own — that is the point of them. Nothing was charged when it
              did.
            </p>
          </div>
        </div>
      ) : arrival === "invalid" ? (
        <div className="border-t-[3px] border-l-[3px] border-ink">
          <div className={`${CELL} bg-saffron px-5 py-5`}>
            <span className={EYEBROW}>That link didn&rsquo;t work</span>
            <p className="mt-1 text-[17px] leading-tight font-extrabold tracking-[-0.01em]">
              Mail apps sometimes trim a long link in half.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink/80">
              Have a fresh one sent to the address you paid with, at the bottom of this page.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── The promise ──────────────────────────────────────────────── */}
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className={`${CELL} bg-ink px-5 py-8 text-paper sm:px-8 sm:py-10`}>
          <span className={EYEBROW}>Voltcheck Pro</span>
          <h1 className="mt-2 max-w-[22ch] text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[40px]">
            Pay for the push, never for the facts.
          </h1>
          <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-paper/85">
            Everything we know about a specific car is free forever — the listing, the pack, the
            range, the warranty clock, the price history, the ask-vs-sold delta, the VIN check.
            Pro buys speed, breadth and automation: being told first, seeing the whole market
            ranked at once, being watched over time. If a number a free shopper can see today ever
            moves behind this, we have broken the promise, not improved the product.
          </p>
        </div>
      </div>

      {/* ── Free forever ─────────────────────────────────────────────── */}
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-paper px-5 py-6 sm:px-8`}>
          <span className={`${EYEBROW} text-ink/55`}>Free forever, for everyone</span>
          <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {FREE_FOREVER.map((item) => (
              <li key={item} className="flex gap-2 text-[14px] leading-snug font-bold">
                <span aria-hidden="true" className="text-teal">
                  ▸
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── What Pro adds ────────────────────────────────────────────── */}
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-putty px-5 py-6 sm:px-8`}>
          <span className={`${EYEBROW} text-ink/55`}>What a pass adds</span>
          <ul className="mt-3 space-y-4">
            {PRO_BENEFITS.map((b) => (
              <li key={b.title}>
                {/* The status chip rides the title's baseline; the detail is
                    its own block underneath. Keeping the detail out of the
                    flex row is deliberate — as a flex item its max-width made
                    it small enough to fit beside the chip, and it read as a
                    caption of the badge rather than of the feature. */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[15px] font-extrabold tracking-[-0.01em]">{b.title}</span>
                  <span
                    className={`px-2 py-0.5 text-[9.5px] font-extrabold tracking-[0.14em] uppercase ${
                      b.live ? "bg-teal text-paper" : "bg-saffron text-ink"
                    }`}
                  >
                    {b.live ? "Live" : "Coming"}
                  </span>
                </div>
                <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-ink/75">
                  {b.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── The passes ───────────────────────────────────────────────── */}
      {offer !== "open" && (
        <div className="border-l-[3px] border-ink">
          <div className={`${CELL} bg-saffron px-5 py-5 sm:px-8`}>
            <span className={EYEBROW}>Purchasing opens soon</span>
            <p className="mt-1 max-w-[62ch] text-[14px] leading-relaxed font-bold">
              {offer === "nothing-to-sell"
                ? "None of the four is finished yet, so there is nothing here worth your money. The prices below are settled and will not move; the passes go on sale the day the first one lands."
                : "Checkout isn't switched on yet. The prices below are settled and will not move."}
            </p>
          </div>
        </div>
      )}

      <div className="grid border-l-[3px] border-ink sm:grid-cols-2">
        {tiers.map(([id, t]) => (
          <div key={id} className={`${CELL} flex flex-col bg-paper`}>
            <div className="flex-1 px-5 py-6 sm:px-6">
              <span className={`${EYEBROW} text-ink/55`}>{t.label}</span>
              <p className="mt-1 text-[38px] leading-none font-extrabold tracking-[-0.04em]">
                {money(t.amountCents)}
              </p>
              <p className="mt-3 text-[14px] leading-relaxed font-bold">{t.blurb}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink/65">
                {t.days} days, once. No account, no renewal, nothing to cancel — the pass simply
                ends.
              </p>
            </div>
            {offer === "open" ? (
              <ProBuyButton tier={id} label={`Get the ${t.label}`} />
            ) : (
              <div className={`${CELL} bg-putty px-5 py-4`}>
                <span className="text-[13px] font-extrabold tracking-[0.06em] text-ink/55 uppercase">
                  Opens soon
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── How the pass works ───────────────────────────────────────── */}
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-paper px-5 py-6 sm:px-8`}>
          <span className={`${EYEBROW} text-ink/55`}>How a pass works</span>
          <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-ink/80">
            There are no accounts and no passwords here, so there is nothing of yours to leak. A
            pass is a link, emailed to the address you pay with; opening it on a device is what
            signs that device in. Card details go to Stripe and never touch this site. A pass
            expires on the day it says and cannot renew itself, because the thing that would have
            to remember to charge you again does not exist.
          </p>
        </div>
      </div>

      {/* ── Recovery ─────────────────────────────────────────────────── */}
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-putty px-5 py-6 sm:px-8`}>
          <span className={`${EYEBROW} text-ink/55`}>Lost the email?</span>
          <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-ink/80">
            Enter the address you paid with and we&rsquo;ll send the link again. We won&rsquo;t say
            whether that address has a pass — the same answer comes back either way, so this form
            can&rsquo;t be used to find out who bought one.
          </p>
          <div className="mt-4 max-w-[560px]">
            <ProRecover />
          </div>
        </div>
      </div>

      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-paper px-5 py-5 text-[13px] font-bold sm:px-8`}>
          <Link href="/" className="text-cobalt underline underline-offset-2">
            Back to the cars
          </Link>
          <span className="px-3 text-ink/30">·</span>
          <Link href="/methodology" className="text-cobalt underline underline-offset-2">
            Where this data comes from
          </Link>
        </div>
      </div>
    </div>
  );
}
