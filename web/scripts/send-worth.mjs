// The Pro value watch, weekly: re-run each tracked car's valuation and mail
// the number and how it moved. "Track this car's value" on the /worth result
// (components/TrackValue.tsx, lib/worthWatch.ts) is what puts a row here.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/send-worth.mjs                                     (from web/)
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (reads/updates subscriptions,
// as send-alerts.mjs), SUPABASE_ANON_KEY (lib/listings/db.ts's own reads —
// the valuation runs the same code path the page runs, under the same role),
// RESEND_API_KEY, optionally SITE_ORIGIN / ALERTS_FROM.
//
// What it sends, and what it refuses to:
//   * Only rows whose params begin worth=1 (lib/worthWatch.ts) — the value
//     watch — and only for an address holding a live pass (pro_passes). A
//     lapsed pass keeps its row and stops getting mail; the row is one press
//     away from resuming when the pass is renewed.
//   * The valuation is lib/listings/value.ts valueVehicle — the page's own
//     answer for the same URL. A row that values to ABSTAIN or UNAVAILABLE
//     gets no mail (nothing to say, so print nothing) and is left untouched
//     for next week; the subject and body never soften a silence.
//   * One mail per row per WEEK_MS, whatever cadence the workflow runs at:
//     a row mailed less than six days ago is skipped, so a manual dispatch
//     can never double-mail the week.
//   * The move since the last mail is last_value_usd (0079) against this
//     week's figure — the fitted midpoint for the sold band, the estimate
//     otherwise — and the first mail carries no move at all. A move is
//     printed only when it clears $100: the values are rounded to the
//     hundred and anything under that is rounding, not the market.
import { valueVehicle } from "../lib/listings/value.ts";
import { isWorthWatch, readWorthWatch, worthWatchLabel, worthWatchUrl } from "../lib/worthWatch.ts";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const ORIGIN = (process.env.SITE_ORIGIN || "https://voltcheck.net").replace(/\/$/, "");
const FROM = process.env.ALERTS_FROM || "Voltcheck <alerts@voltcheck.net>";

const WEEK_MS = 6 * 86_400_000;
const MIN_MOVE_USD = 100;

if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_KEY || !process.env.SUPABASE_ANON_KEY) {
  console.log("[worth] not configured (need SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY) — nothing to do");
  process.exit(0);
}

const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const subsRes = await fetch(
  `${SUPABASE_URL}/rest/v1/alert_subscriptions` +
    `?select=id,email,params,label,unsubscribe_token,last_sent_at,last_value_usd&confirmed_at=not.is.null&params=like.worth%3D1*`,
  { headers: svc }
);
if (!subsRes.ok) {
  console.error(`[worth] subscription read failed: ${subsRes.status}`);
  process.exit(1);
}
const subs = (await subsRes.json()).filter((s) => isWorthWatch(s.params));
if (!subs.length) {
  console.log("[worth] no value watches");
  process.exit(0);
}

// Same pass read as send-alerts.mjs: a failed read is "nobody", the safe way.
const proEmails = new Set();
{
  const passRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pro_passes?select=email&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    { headers: svc }
  );
  if (passRes.ok) for (const p of await passRes.json()) proEmails.add(String(p.email).toLowerCase());
  else console.error(`[worth] pro_passes read failed: ${passRes.status} — nothing sent this run`);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n) => `$${Math.abs(n).toLocaleString("en-US")}`;

/** The one number a watch tracks: the sold band's fitted midpoint, else the estimate. */
const figureOf = (v) => (v.tier === "sold" ? v.midUsd : v.tier === "estimate" ? v.valueUsd : undefined);

const now = Date.now();
let sent = 0;
let skipped = 0;
for (const sub of subs) {
  if (!proEmails.has(String(sub.email).toLowerCase())) continue;
  if (sub.last_sent_at && now - Date.parse(sub.last_sent_at) < WEEK_MS) continue;
  const input = readWorthWatch(sub.params);
  if (!input) {
    console.error(`[worth] row ${sub.id} has params this sender cannot read`);
    continue;
  }

  let v;
  try {
    v = await valueVehicle(input);
  } catch (e) {
    console.error(`[worth] valuation threw for ${sub.id}: ${e?.message ?? e}`);
    continue;
  }
  const figure = figureOf(v);
  if (figure === undefined) {
    skipped += 1;
    continue; // abstain or unavailable: nothing to say, row untouched, retried next week
  }

  const label = sub.label || worthWatchLabel(input);
  const move = typeof sub.last_value_usd === "number" ? figure - sub.last_value_usd : undefined;
  const moveLine =
    move !== undefined && Math.abs(move) >= MIN_MOVE_USD
      ? `${move > 0 ? "Up" : "Down"} ${money(move)} since last week`
      : move !== undefined
        ? "Unchanged since last week"
        : "";
  const headline = `${v.headline} est.`;
  const pageUrl = `${ORIGIN}${worthWatchUrl(input)}`;
  const unsubUrl = `${ORIGIN}/alerts/unsubscribe?token=${sub.unsubscribe_token}`;
  const subject = `${label}: ${headline}${moveLine ? ` — ${moveLine.toLowerCase()}` : ""}`;

  const text =
    `${label}\n${headline}\n${moveLine ? `${moveLine}\n` : ""}\n` +
    `${pageUrl}\n\nStop tracking this car: ${unsubUrl}\n`;
  const html =
    `<p style="margin:0 0 4px;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:.1em">${esc(label)}</p>` +
    `<p style="margin:0;font-size:32px;font-weight:800">${esc(headline)}</p>` +
    (moveLine ? `<p style="margin:6px 0 0;font-size:15px;font-weight:700">${esc(moveLine)}</p>` : "") +
    `<p style="margin-top:16px"><a href="${pageUrl}">See the valuation</a></p>` +
    `<p style="color:#666;font-size:12px"><a href="${unsubUrl}">Stop tracking this car</a></p>`;

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: sub.email, subject, text, html, headers: { "List-Unsubscribe": `<${unsubUrl}>` } }),
  });
  if (!send.ok) {
    console.error(`[worth] send failed for ${sub.id}: ${send.status} ${await send.text()}`);
    continue; // last_sent_at untouched — next run retries
  }
  await fetch(`${SUPABASE_URL}/rest/v1/alert_subscriptions?id=eq.${sub.id}`, {
    method: "PATCH",
    headers: { ...svc, Prefer: "return=minimal" },
    body: JSON.stringify({ last_sent_at: new Date(now).toISOString(), last_value_usd: figure }),
  });
  sent += 1;
  await new Promise((r) => setTimeout(r, 1000)); // Resend 2 req/s, and one cohort read per car on the anon role
}
console.log(`[worth] sent ${sent} valuation${sent === 1 ? "" : "s"}, ${skipped} with nothing to say`);
