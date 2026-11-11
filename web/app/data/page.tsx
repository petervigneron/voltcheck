import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { DATA_PLAN, holdsKey } from "@/lib/dataKey";
import { checkoutConfigured } from "@/lib/proOffer";
import { DataKeyBuyButton } from "@/components/DataKeyPanel";

// /data: the paid tier of the API, and the only place its buy button lives.
// What a key opens is stated as the endpoints themselves — the claims are
// the routes under app/api/v1/data/, and nothing is promised here that
// those do not serve.
//
// The renewal terms sit directly above the button, in the same type as
// everything else: the price, that it repeats monthly until cancelled, and
// where to cancel. A renewing charge has to be said before the click, not
// in an email afterwards.
//
// Dynamic because it reads the session: a signed-in account with a working
// key is sent to /account rather than offered a second subscription
// (app/api/data/checkout/route.ts refuses that purchase anyway).
//
// COPY: placeholder labels of mine. The owner writes the copy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data key: bulk export and paid API fields | Census EV",
  description:
    "A Census EV data key opens the bulk export of every electric and plug-in hybrid listing in the US and the paid fields of the API. $29 a month, cancel any time.",
  alternates: { canonical: "/data" },
};

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";
const price = `$${(DATA_PLAN.amountCents / 100).toFixed(0)}`;

const OPENS: { path: string; what: string }[] = [
  { path: "GET /api/v1/data/export", what: "Every listing, one file per make, as NDJSON" },
  { path: "GET /api/v1/data/listings", what: "Search, with ask_vs_similar and incentive on each car that has one" },
  { path: "GET /api/v1/data/listings/{vin}", what: "One car, with its price history and the same two fields" },
];

export default async function DataPage() {
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    user = await currentUser();
  } catch {
    user = null;
  }
  let holds = false;
  if (user) {
    try {
      holds = await holdsKey(user.email);
    } catch {
      holds = false;
    }
  }
  const open = checkoutConfigured();

  return (
    <div className="mx-auto max-w-[640px] px-0 py-0 sm:px-6 sm:py-10">
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className={`${CELL} bg-ink px-5 py-6 text-paper sm:px-8`}>
          <span className={EYEBROW}>Census data key</span>
          <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-[-0.01em]">{price} a month</h1>
        </div>
        {OPENS.map((o) => (
          <div key={o.path} className={`${CELL} bg-paper px-5 py-4 sm:px-8`}>
            <code className="block text-[13px] font-bold break-all">{o.path}</code>
            <p className="mt-1 text-[13px] text-ink/70">{o.what}</p>
          </div>
        ))}
        <Link href="/api/v1/openapi.json" className={`${CELL} block bg-paper px-5 py-4 text-[14px] font-bold text-cobalt underline underline-offset-2 hover:bg-putty sm:px-8`}>
          API documentation
        </Link>
        <div className={`${CELL} bg-putty px-5 py-4 sm:px-8`}>
          <p className="text-[13px] leading-relaxed font-semibold text-ink">
            {price} is charged today and again every month until you cancel. Cancel on your account page; the key works to the
            end of the month paid for.
          </p>
        </div>
        {holds ? (
          <Link href="/account" className={`${CELL} block bg-paper px-5 py-4 text-[14px] font-bold text-cobalt underline underline-offset-2 hover:bg-putty sm:px-8`}>
            Your key is on your account page
          </Link>
        ) : !open ? (
          <div className={`${CELL} bg-paper px-5 py-4 text-[13px] font-extrabold tracking-[0.06em] text-ink/60 uppercase sm:px-8`}>Opens soon</div>
        ) : user ? (
          <DataKeyBuyButton label={`Subscribe — ${price} a month`} />
        ) : (
          <Link href="/account?next=/data" className={`${CELL} block bg-ink px-5 py-4 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt sm:px-8`}>
            Sign in to subscribe
          </Link>
        )}
      </div>
    </div>
  );
}
