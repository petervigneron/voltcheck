"use client";

import Link from "next/link";
import { useState } from "react";
import { alertHref, alertKind, alertMails } from "@/lib/alertKinds";
import { removeMyAlert, type MyAlert } from "@/lib/myAlerts";
import { describeSearch } from "@/lib/savedSearches";
import { useMyAlerts } from "@/lib/useMyAlerts";

// The Alerts tab of /saved (tab shell: components/SavedView.tsx): every
// alert subscription on the signed-in account, what each one mails, when it
// last did, and a Remove. The list the senders read, shown to the person it
// mails — until 2026-10-31 nothing on the site showed it (0112's header has
// the subscription that sat unseen for 25 days).

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function AlertRow({ alert }: { alert: MyAlert }) {
  const [busy, setBusy] = useState(false);
  const kind = alertKind(alert.params);
  const label = alert.label || (kind === "search" ? describeSearch(alert.params) : alert.params);
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await removeMyAlert(alert.id);
    if (!ok) setBusy(false);
  };
  return (
    <div className={`${CELL} flex flex-col gap-2 bg-paper px-5 py-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          href={alertHref(kind, alert.params)}
          className="text-[16px] leading-tight font-extrabold tracking-[-0.01em] text-ink hover:text-cobalt"
        >
          {label}
        </Link>
        {alert.lastSentAt && (
          <span className="text-[11px] font-bold tracking-[0.06em] text-ink/50 uppercase tabular-nums">
            Last sent {DATE_FMT.format(new Date(alert.lastSentAt))}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[11px] font-extrabold tracking-[0.08em] text-teal uppercase">{alertMails(kind)}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="ml-auto text-[11px] font-extrabold tracking-[0.08em] text-ink/50 uppercase hover:text-vermilion disabled:opacity-60"
        >
          {busy ? "…" : "Remove"}
        </button>
      </div>
    </div>
  );
}

export function MyAlerts() {
  const alerts = useMyAlerts();

  if (alerts === undefined) {
    return (
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} h-16 animate-pulse bg-putty`} aria-hidden="true" />
      </div>
    );
  }

  if (alerts === null || alerts.length === 0) {
    return (
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-paper px-6 py-8 text-[15px] font-bold text-ink/60`}>
          {alerts === null ? "Sign in to see your alerts." : "No alerts yet."}
        </div>
      </div>
    );
  }

  return (
    <div className="border-l-[3px] border-ink">
      {alerts.map((a) => (
        <AlertRow key={a.id} alert={a} />
      ))}
    </div>
  );
}
