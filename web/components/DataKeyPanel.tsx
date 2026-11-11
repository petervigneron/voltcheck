"use client";

import { useState } from "react";

// The data key on /account and the buy button on /data: show the key, start
// a subscription, stop it renewing, or let it renew again. Every action is
// a POST the server decides (app/api/data/*); this component only reports
// what came back, including when nothing did.
//
// Cancelling is one button on the page the key is shown on, with no
// confirmation maze: a renewal that is easy to start has to be as easy to
// stop. It asks once, because it is the one click here that changes what a
// card will be charged.
//
// COPY: placeholder labels, the fewest words that make each control
// readable. The owner writes the copy.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";
const BUTTON = `${CELL} block w-full px-5 py-4 text-left text-[13px] font-extrabold tracking-[0.06em] uppercase focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60 sm:px-8`;

type Busy = "idle" | "going" | "error";

async function post(url: string, body?: unknown): Promise<{ ok: boolean; url?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await res.json()) as { ok?: boolean; url?: string };
    return { ok: res.ok && !!j.ok, url: j.url };
  } catch {
    return { ok: false };
  }
}

export function DataKeyBuyButton({ label }: { label: string }) {
  const [busy, setBusy] = useState<Busy>("idle");
  async function go() {
    if (busy === "going") return;
    setBusy("going");
    const r = await post("/api/data/checkout");
    if (r.ok && r.url) {
      window.location.href = r.url;
      return;
    }
    setBusy("error");
  }
  return (
    <>
      <button type="button" onClick={go} disabled={busy === "going"} className={`${BUTTON} bg-ink text-paper hover:bg-cobalt`}>
        {busy === "going" ? "Opening checkout…" : label}
      </button>
      {busy === "error" && (
        <div className={`${CELL} bg-vermilion px-5 py-3 text-paper sm:px-8`}>
          <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">Couldn&rsquo;t open checkout — try again</span>
        </div>
      )}
    </>
  );
}

export function DataKeyPanel({
  apiKey,
  status,
  line,
  justBought,
}: {
  apiKey: string;
  /** "ended" also covers a key whose paid period has run out. */
  status: "active" | "canceling" | "ended";
  /** "renews March 4, 2027", "ends …", "ended …". */
  line: string;
  /** Arrived from Checkout before the webhook has necessarily landed. */
  justBought?: boolean;
}) {
  const [busy, setBusy] = useState<Busy>("idle");

  async function setRenew(renew: boolean) {
    if (busy === "going") return;
    if (!renew && !window.confirm("Stop this key renewing? It keeps working until the date shown.")) return;
    setBusy("going");
    const r = await post("/api/data/renewal", { renew });
    if (r.ok) {
      // The server's word, re-read: the page renders from the database row.
      window.location.assign(new URL("/account", window.location.origin).href);
      return;
    }
    setBusy("error");
  }

  return (
    <div className="mt-6 border-t-[3px] border-l-[3px] border-ink">
      <div className={`${CELL} bg-paper px-5 py-5 sm:px-8`}>
        <span className={EYEBROW}>Census data key · {line}</span>
        {status === "ended" ? (
          <p className="mt-2 text-[13px] text-ink/70">The key is kept. Subscribing again turns the same key back on.</p>
        ) : (
          <code className="mt-2 block text-[13px] leading-relaxed break-all select-all">{apiKey}</code>
        )}
        {justBought && <p className="mt-2 text-[13px] text-ink/70">It has also been emailed to you.</p>}
      </div>
      {status === "active" && (
        <button type="button" onClick={() => setRenew(false)} disabled={busy === "going"} className={`${BUTTON} bg-paper text-ink/70 hover:bg-vermilion hover:text-paper`}>
          {busy === "going" ? "…" : "Cancel renewal"}
        </button>
      )}
      {status === "canceling" && (
        <button type="button" onClick={() => setRenew(true)} disabled={busy === "going"} className={`${BUTTON} bg-paper text-cobalt hover:bg-putty`}>
          {busy === "going" ? "…" : "Keep renewing"}
        </button>
      )}
      {status === "ended" && <DataKeyBuyButton label="Subscribe again — $29 a month" />}
      {busy === "error" && (
        <div className={`${CELL} bg-vermilion px-5 py-3 text-paper sm:px-8`}>
          <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">That did not go through — nothing was changed</span>
        </div>
      )}
    </div>
  );
}
