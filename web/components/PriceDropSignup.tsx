"use client";

import { useEffect, useState } from "react";
import { readSaved } from "@/lib/saved";
import { postWatchlist, readWatchlistEmail, writeWatchlistEmail } from "@/lib/watchlist";
import { useUser } from "@/lib/useUser";

// The free alert's one control, on the saved-cars tab of /saved: an address
// for "tell me when one of these drops in price". Ships dark until
// NEXT_PUBLIC_ALERTS_ENABLED=1, the same gate as the rest of the alerts lane.
//
// Two states. No address yet: the field and a button; submitting posts the
// current shelf, and the server's "created" means a confirm mail went out.
// Address remembered: the address is shown with a way to turn it off, which
// posts an empty list — the server deletes the row (0060) and the browser
// forgets the address. After that, components/WatchlistSync.tsx keeps the
// list current as the stars change; nothing here needs to.
//
// Copy is the owner's ("price drop alerts on saved cars", 2026-09-02); the
// button words are the alerts lane's existing ones.
//
// Signed in (0063) there is no address to give: the alert is a switch on
// the account, on at once (the address was confirmed at sign-up), and the
// shelf sync keeps its list current from every device. This component asks
// /api/alerts/watchlist which way the switch is and flips it.

const ENABLED = process.env.NEXT_PUBLIC_ALERTS_ENABLED === "1";
const CELL = "border-r-[3px] border-b-[3px] border-ink";

export function PriceDropSignup() {
  const user = useUser();
  if (!ENABLED) return null;
  if (user) return <AccountSwitch />;
  if (user === undefined) return null;
  return <AddressForm />;
}

function AccountSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/alerts/watchlist", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { on?: boolean }).on === true : false))
      .catch(() => false)
      .then((v) => {
        if (alive) setOn(v);
      });
    return () => {
      alive = false;
    };
  }, []);

  const flip = async () => {
    if (busy || on === null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/alerts/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: !on }),
      });
      if (res.ok) setOn(!on);
    } catch {
      // the switch stays where it was
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-stretch border-l-[3px] border-ink">
      <div className={`${CELL} flex min-w-[240px] flex-1 flex-col justify-center bg-saffron px-5 py-4`}>
        <span className="text-[15px] leading-tight font-extrabold tracking-[-0.01em]">
          Price drop alerts on saved cars
        </span>
      </div>
      <button
        type="button"
        onClick={flip}
        disabled={busy || on === null}
        aria-pressed={on === true}
        className={`${CELL} px-6 py-4 text-[13px] font-extrabold tracking-[0.06em] uppercase focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60 ${
          on ? "bg-teal text-paper hover:bg-vermilion" : "bg-ink text-paper hover:bg-cobalt"
        }`}
      >
        {on === null ? "…" : on ? "On — turn off" : "Get alerts"}
      </button>
    </div>
  );
}

function AddressForm() {
  const [known, setKnown] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "kept" | "error">("idle");
  // Read in an effect, like every localStorage reader here, so the server
  // render (no address) matches the first client paint.
  useEffect(() => {
    const sync = () => setKnown(readWatchlistEmail());
    sync();
  }, []);

  const shelfIds = () => [...readSaved()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map((e) => e.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    const status = await postWatchlist(email.trim(), shelfIds());
    if (status === "error" || status === "rejected") {
      setState("error");
      return;
    }
    writeWatchlistEmail(email.trim());
    setKnown(email.trim());
    // "created": a confirm mail is on its way. "updated"/"pending"/anything
    // else: the address already had a list, and it now has this one.
    setState(status === "created" ? "done" : "kept");
  };

  const turnOff = async () => {
    if (!known) return;
    await postWatchlist(known, []);
    writeWatchlistEmail(null);
    setKnown(null);
    setEmail("");
    setState("idle");
  };

  return (
    <div className="flex flex-wrap items-stretch border-l-[3px] border-ink">
      <div className={`${CELL} flex min-w-[240px] flex-1 flex-col justify-center bg-saffron px-5 py-4`}>
        <span className="text-[15px] leading-tight font-extrabold tracking-[-0.01em]">
          Price drop alerts on saved cars
        </span>
      </div>
      {known ? (
        <>
          <div className={`${CELL} flex flex-1 items-center bg-paper px-5 py-4 text-[14px] font-bold`}>{known}</div>
          {state === "done" && (
            <div className={`${CELL} flex items-center bg-teal px-5 py-4 text-paper`}>
              <span className="text-[13px] font-extrabold tracking-[0.06em] uppercase">Check your inbox to confirm</span>
            </div>
          )}
          <button
            type="button"
            onClick={turnOff}
            className={`${CELL} bg-paper px-5 py-4 text-[13px] font-extrabold tracking-[0.06em] text-ink/70 uppercase hover:bg-vermilion hover:text-paper focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`}
          >
            Turn off
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-1 flex-wrap items-stretch">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address for price drop alerts"
            className={`${CELL} min-w-[200px] flex-1 bg-paper px-5 py-4 text-[14px] font-bold focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`}
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className={`${CELL} bg-ink px-6 py-4 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`}
          >
            {state === "sending" ? "…" : "Get alerts"}
          </button>
          {state === "error" && (
            <div className={`${CELL} flex items-center bg-vermilion px-4 py-4 text-paper`}>
              <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">Didn&rsquo;t take — try again</span>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
