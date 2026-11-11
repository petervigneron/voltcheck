import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { currentPass, TIERS } from "@/lib/pro";
import { AccountForms } from "@/components/AccountForms";
import { AccountPanel } from "@/components/AccountPanel";
import { DataKeyPanel } from "@/components/DataKeyPanel";
import { accountKey } from "@/lib/dataKey";
import { safeNext } from "@/lib/apiBody";

// /account: sign in or create an account; or, signed in, who you are, what
// you hold, and the way out. Dynamic because it reads the session cookie;
// it reads nothing heavy, so it renders in milliseconds whatever the
// database is doing — the page a confirmation link lands on must not be
// the one that falls over.
//
// Arrivals it explains: ?verify=failed (a confirmation or reset link that
// did not verify — used already, expired, or trimmed by a mail client) and
// ?next=<path>, carried through sign-in so a shopper sent here from /pro or
// /saved goes back there.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account — Census",
  robots: { index: false, follow: true },
};

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export default async function AccountPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/saved");
  const verifyFailed = sp.verify === "failed";

  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    user = await currentUser();
  } catch {
    user = null;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-[640px] px-0 py-0 sm:px-6 sm:py-10">
        {verifyFailed && (
          <div className="border-t-[3px] border-l-[3px] border-ink">
            <div className={`${CELL} bg-saffron px-5 py-5`}>
              <span className={EYEBROW}>That link didn&rsquo;t work</span>
              <p className="mt-1 text-[15px] leading-snug font-bold">
                It may have been used already, or expired. Sign in below, or ask for a new one.
              </p>
            </div>
          </div>
        )}
        <AccountForms next={next} />
      </div>
    );
  }

  // The pass, live or ended. A pass that ran out used to print nothing at
  // all, so the only account that ever bought one read here exactly like an
  // account that never had (0087). The way back is the row below it, which
  // has always been there and goes to the buy buttons.
  let passLine: string | null = null;
  try {
    const pass = await currentPass();
    const label = pass.tier && TIERS[pass.tier] ? TIERS[pass.tier].label : "Pro pass";
    if (pass.active) {
      passLine = `${label}${pass.expires_at ? ` through ${day(pass.expires_at)}` : ""}`;
    } else if (pass.expired && pass.expires_at) {
      passLine = `${label} ended ${day(pass.expires_at)}`;
    }
  } catch {
    passLine = null;
  }

  // The data key, if this account has ever bought one (migration 0117).
  // keyForEmail asks Stripe first when the stored month has ended, so the
  // line printed here is the renewal as it stands, not as last cached. An
  // account with no key gets no block — the way to one is the /data row.
  let dataKey: Awaited<ReturnType<typeof accountKey>> = null;
  try {
    dataKey = await accountKey(user.email, day);
  } catch {
    dataKey = null;
  }
  const justBought = sp.key === "new";

  return (
    <div className="mx-auto max-w-[640px] px-0 py-0 sm:px-6 sm:py-10">
      <AccountPanel email={user.email} passLine={passLine} />
      {dataKey ? (
        <DataKeyPanel apiKey={dataKey.apiKey} status={dataKey.status} line={dataKey.line} justBought={justBought} />
      ) : (
        justBought && (
          // Checkout redirects here the instant the card clears; the signed
          // webhook that mints the key can land a few seconds later.
          <div className="mt-6 border-[3px] border-ink bg-saffron px-5 py-5 sm:px-8">
            <span className={EYEBROW}>Payment received</span>
            <p className="mt-1 text-[15px] leading-snug font-bold">
              Your key is being issued and will be emailed to you. Reload this page in a moment to see it here.
            </p>
          </div>
        )
      )}
    </div>
  );
}
