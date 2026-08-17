import Link from "next/link";
import { alertRpc } from "@/lib/alerts";

// The unsubscribe link carried by every alert email. Deletes the row outright
// (0029: an address we no longer have is the only kind we can't leak), so a
// re-clicked link finds nothing — that still renders as "you're out", because
// for the shopper it's true either way.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function UnsubscribePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await props.searchParams;
  const t = typeof token === "string" && UUID_RE.test(token) ? token : null;
  if (t) await alertRpc<boolean>("alert_unsubscribe", { _token: t });

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em]">
        {t ? "You're unsubscribed." : "This link didn't work."}
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        {t
          ? "That alert is deleted — address and all. Sign up again any time from a search."
          : "It may have been trimmed by your mail app. The unsubscribe link is in every alert email."}
      </p>
      <Link href="/" className="mt-6 inline-block text-sm font-bold text-cobalt underline">
        Back to the cars
      </Link>
    </div>
  );
}
