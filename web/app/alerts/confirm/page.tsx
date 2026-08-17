import Link from "next/link";
import { alertRpc } from "@/lib/alerts";

// The confirm link from the double-opt-in email. The token is the capability
// (migration 0029): a valid one flips confirmed_at, anything else changes
// nothing. Idempotent, so a re-clicked link still reads as success.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConfirmPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await props.searchParams;
  const t = typeof token === "string" && UUID_RE.test(token) ? token : null;
  const ok = t ? await alertRpc<boolean>("alert_confirm", { _token: t }) : false;

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      {ok ? (
        <>
          <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Alert on.</h1>
          <p className="mt-3 text-sm text-zinc-600">
            You&rsquo;ll get an email when new cars match your search or their prices are cut. Every
            email has an unsubscribe link.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold tracking-[-0.02em]">This link didn&rsquo;t work.</h1>
          <p className="mt-3 text-sm text-zinc-600">
            It may have been trimmed by your mail app. Sign up again from the search page to get a
            fresh one.
          </p>
        </>
      )}
      <Link href="/" className="mt-6 inline-block text-sm font-bold text-cobalt underline">
        Back to the cars
      </Link>
    </div>
  );
}
