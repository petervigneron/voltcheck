import type { Metadata } from "next";
import Link from "next/link";
import { currentPass, currentPassEmail, TIERS, type PassState, type TierId } from "@/lib/pro";
import { PRO_BENEFITS, offerState } from "@/lib/proOffer";
import { ProBuyButton } from "@/components/ProBuyButton";
import { WatchForm } from "@/components/WatchForm";
import { currentUser } from "@/lib/auth";

// The Pro landing page: the benefits and the two passes. Since 0063 a pass
// belongs to an account (currentPass asks pro_mine for the signed-in
// address), so buying needs sign-in and the way back in on another device is
// signing in — the "send my link again" form left with it.
//
// Dynamic because it reads the session cookies. It reads nothing else — no
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
// this file's. From 2026-08-25 the answer was no because nothing was built;
// from 2026-09-02 three benefits are live and the remaining gate is a LIVE
// Stripe key (a test key keeps the page at "opens soon" — see
// checkoutConfigured). Either way the page says so in as many words instead
// of showing a button that would take $9 for nothing.

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

  // The address behind the pass, for the standing order below (0059). Null on
  // any failure: the form then asks for the address instead of pre-filling it.
  let passEmail: string | null = null;
  if (pass.active) {
    try {
      passEmail = await currentPassEmail();
    } catch {
      passEmail = null;
    }
  }

  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    user = await currentUser();
  } catch {
    user = null;
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
              It does not renew and you will not be charged again.
              {user ? " Sign in on any device and it is there." : " Sign in on any device with the address you paid with and it is there."}
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
              <Link href="/account?next=%2Fpro" className="text-cobalt underline underline-offset-2">Sign in</Link> with the address you paid with and your pass is there.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── The standing order (pass-holders) ─────────────────────────── */}
      {pass.active && (
        <div className="border-l-[3px] border-ink">
          <div className={`${CELL} bg-paper px-5 py-6 sm:px-8`}>
            {/* Owner's copy, verbatim (2026-09-02). */}
            <p className="max-w-[40ch] text-[19px] leading-tight font-extrabold tracking-[-0.01em]">
              Describe your ideal car and at your ideal price, and be notified when it becomes
              available
            </p>
            <div className="mt-4">
              <WatchForm email={passEmail} />
            </div>
          </div>
        </div>
      )}

      {/* ── The promise ──────────────────────────────────────────────── */}
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className={`${CELL} bg-ink px-5 py-8 text-paper sm:px-8 sm:py-10`}>
          <span className={EYEBROW}>Voltcheck Pro</span>
          <h1 className="mt-2 max-w-[22ch] text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[40px]">
            Pro member benefits
          </h1>
          {/* Owner's copy, verbatim (2026-09-02). Not ours to edit. */}
          <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-paper/85">
            Voltcheck makes searching for electric and plug-in hybrid cars easy. We&rsquo;ve built
            the most comprehensive plug-in-car marketplace anywhere, and we make EV-relevant information simple
            to find. Many car dealers don&rsquo;t know the battery size, range, or charging speed of
            the cars on their lot, and other car sites don&rsquo;t even collect that information.
            Voltcheck lets you search for cars, or research a car you&rsquo;ve got your eye on, with
            one or two clicks.
          </p>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-paper/85">
            Pro members get a few additional benefits:
          </p>
        </div>
      </div>

      {/* ── What Pro adds ────────────────────────────────────────────── */}
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-putty px-5 py-6 sm:px-8`}>
          {/* No live/coming chip per line (owner, 2026-09-03): `live` still
              decides whether a pass can be sold, it just is not printed. */}
          <ul className="space-y-4">
            {PRO_BENEFITS.map((b) => (
              <li key={b.title}>
                <span className="text-[15px] font-extrabold tracking-[-0.01em]">{b.title}</span>
                {b.detail && (
                  <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-ink/75">
                    {b.detail}
                  </p>
                )}
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
                ? "None of these is finished yet, so there is nothing here worth your money. The prices below are settled and will not move; the passes go on sale the day the first one lands."
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
            </div>
            {offer === "open" && user ? (
              <ProBuyButton tier={id} label={`Get the ${t.label}`} />
            ) : offer === "open" ? (
              <Link
                href="/account?next=%2Fpro"
                className={`${CELL} block w-full bg-ink px-5 py-4 text-left text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`}
              >
                Sign in to get the {t.label}
              </Link>
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
