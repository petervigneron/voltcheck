// Nightly alert digests: match every confirmed subscription against the live
// card index and mail what's new. Run from .github/workflows/alerts.yml after
// the nightly pipeline settles; exits 0 quietly when the keys aren't
// configured, so the workflow is safe to schedule before the email domain
// exists.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/send-alerts.mjs                                    (from web/)
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (reads/updates subscriptions —
// deliberately absent from Vercel, this is the one place it lives),
// RESEND_API_KEY, and optionally SITE_ORIGIN / ALERTS_FROM.
//
// Reads inventory from the site's own /api/index shards, not the database:
// CDN-cached, already packed, and — the real reason — it is exactly what the
// browse grid shows, filtered by exactly the same predicates
// (lib/listings/match.ts). An alert is a promise that visiting the search
// will show the car; reading anything else lets the two drift.
//
// What counts as news, and why it can't overclaim:
//   new listing — the row's listedOn is newer than the last digest. listedOn
//     exists only where migration 0028's guards say the appearance date is
//     real, so "newly listed" here can never mean "newly crawled".
//   price cut — the row's cut (≥$500 within 14 days, lib/listings/price.ts)
//     is newer than the last digest. Same bar the card colour uses.
// Both windows are additionally capped at 7 days back, so a subscription
// that predates a sender outage gets a bounded catch-up, not an archive.
//
// Pro is not a cadence here (owner, 2026-09-02: price-drop alerts are for
// everyone, untiered) — every confirmed subscription is matched on every run,
// and publish-feed.yml runs this after every feed publish as well as the
// daily schedule in alerts.yml. A pass changes ONE thing: a subscription whose
// address holds a live pass (pro_passes, migration 0045) may use the deals
// filter (?deal=1, lib/listings/deal.ts), which match.ts applies only when
// MatchContext.pro is true — the same rule the grid follows. Because
// last_sent_at advances per send, the two schedules cannot double-mail.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SHARDS, unpackIndex } from "../lib/listings/pack.ts";
import { buildTests, rowMatches } from "../lib/listings/match.ts";
import { milesBetween } from "../lib/geo.ts";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const ORIGIN = (process.env.SITE_ORIGIN || "https://voltcheck.net").replace(/\/$/, "");
const FROM = process.env.ALERTS_FROM || "Voltcheck <alerts@voltcheck.net>";

const CATCHUP_MS = 7 * 86_400_000;
const MAX_PER_SECTION = 12;

if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_KEY) {
  console.log("[alerts] not configured (need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY) — nothing to do");
  process.exit(0);
}

const svc = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const subsRes = await fetch(
  `${SUPABASE_URL}/rest/v1/alert_subscriptions` +
    `?select=id,email,params,label,unsubscribe_token,created_at,last_sent_at&confirmed_at=not.is.null`,
  { headers: svc }
);
if (!subsRes.ok) {
  console.error(`[alerts] subscription read failed: ${subsRes.status}`);
  process.exit(1);
}
const subs = await subsRes.json();
if (!subs.length) {
  console.log("[alerts] no confirmed subscriptions");
  process.exit(0);
}

// Which addresses hold a live pass. service_role bypasses 0045's zero-policy
// RLS; emails only, the token column is never selected. A failed read is
// logged and treated as "nobody": the deals filter goes quiet for that run,
// which is the safe direction — no alert may fire on a filter it cannot
// justify, and every other alert still goes out.
const proEmails = new Set();
{
  const passRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pro_passes?select=email&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    { headers: svc }
  );
  if (passRes.ok) for (const p of await passRes.json()) proEmails.add(String(p.email).toLowerCase());
  else console.error(`[alerts] pro_passes read failed: ${passRes.status} — deals filters inert this run`);
}

// The same shard fan-out and same-id dedupe as lib/listings/useCardIndex.ts.
const shards = await Promise.all(
  Array.from({ length: SHARDS }, async (_, i) => {
    const res = await fetch(`${ORIGIN}/api/index/${i}`);
    if (!res.ok) throw new Error(`index shard ${i}: ${res.status}`);
    return unpackIndex(await res.json());
  })
);
const seen = new Set();
const rows = shards.flat().filter((r) => !seen.has(r.id) && (seen.add(r.id), true));
console.log(`[alerts] ${rows.length} cars in index, ${subs.length} confirmed subscriptions`);

// ZCTA centroids for subscriber zips — same table lib/zips.ts serves the site
// from, read straight off disk since this is Node, not a bundle.
const zips = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../data/zips.json"), "utf8")
);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n) => `$${n.toLocaleString("en-US")}`;
const carLine = (r) => {
  const price = r.realPrice ? money(r.priceUsd) : "see dealer for price";
  const where = r.city ? ` — ${r.city}, ${r.state}` : r.state ? ` — ${r.state}` : "";
  return { title: r.title, price, where, url: `${ORIGIN}/listing/${r.id}` };
};

const now = Date.now();
let sent = 0;
for (const sub of subs) {
  const params = new URLSearchParams(sub.params ?? "");
  const zip = (params.get("zip") ?? "").trim().slice(0, 5);
  const origin = /^\d{5}$/.test(zip) ? zips[zip] : undefined;
  const tests = buildTests((k) => params.get(k) ?? "", {
    distanceMi: origin ? (r) => (r.loc ? milesBetween(origin, r.loc) : undefined) : undefined,
    pro: proEmails.has(String(sub.email).toLowerCase()),
  });
  const matches = rows.filter((r) => rowMatches(tests, r));

  const since = Math.max(Date.parse(sub.last_sent_at ?? sub.created_at ?? 0) || 0, now - CATCHUP_MS);
  const fresh = matches.filter((r) => r.listedOn && Date.parse(r.listedOn) > since);
  const freshIds = new Set(fresh.map((r) => r.id));
  const cuts = matches.filter((r) => r.cut && Date.parse(r.cut.at) > since && !freshIds.has(r.id));
  if (!fresh.length && !cuts.length) continue;

  const searchUrl = `${ORIGIN}/${sub.params ? `?${sub.params}` : ""}`;
  const unsubUrl = `${ORIGIN}/alerts/unsubscribe?token=${sub.unsubscribe_token}`;
  const label = sub.label || "your search";
  const subject =
    (fresh.length ? `${fresh.length} new listing${fresh.length === 1 ? "" : "s"}` : "") +
    (fresh.length && cuts.length ? ", " : "") +
    (cuts.length ? `${cuts.length} price cut${cuts.length === 1 ? "" : "s"}` : "") +
    ` — ${label}`;

  const textSection = (title, items, fmt) =>
    items.length
      ? `${title}\n` +
        items.slice(0, MAX_PER_SECTION).map(fmt).join("\n") +
        (items.length > MAX_PER_SECTION ? `\n…and ${items.length - MAX_PER_SECTION} more: ${searchUrl}` : "") +
        "\n\n"
      : "";
  const htmlSection = (title, items, fmt) =>
    items.length
      ? `<h3 style="margin:16px 0 6px">${title}</h3><ul style="padding-left:18px;margin:0">` +
        items.slice(0, MAX_PER_SECTION).map(fmt).join("") +
        `</ul>` +
        (items.length > MAX_PER_SECTION
          ? `<p><a href="${searchUrl}">…and ${items.length - MAX_PER_SECTION} more</a></p>`
          : "")
      : "";

  const text =
    textSection("New listings", fresh, (r) => {
      const c = carLine(r);
      return `- ${c.title}, ${c.price}${c.where}\n  ${c.url}`;
    }) +
    textSection("Price cuts", cuts, (r) => {
      const c = carLine(r);
      return `- ${c.title}, ${c.price} (cut ${money(r.cut.amountUsd)})${c.where}\n  ${c.url}`;
    }) +
    `See the full search: ${searchUrl}\nUnsubscribe: ${unsubUrl}\n`;
  const html =
    htmlSection("New listings", fresh, (r) => {
      const c = carLine(r);
      return `<li style="margin:4px 0"><a href="${c.url}">${esc(c.title)}</a>, ${esc(c.price)}${esc(c.where)}</li>`;
    }) +
    htmlSection("Price cuts", cuts, (r) => {
      const c = carLine(r);
      return `<li style="margin:4px 0"><a href="${c.url}">${esc(c.title)}</a>, ${esc(c.price)} <b>(cut ${money(r.cut.amountUsd)})</b>${esc(c.where)}</li>`;
    }) +
    `<p style="margin-top:16px"><a href="${searchUrl}">See the full search</a></p>` +
    `<p style="color:#666;font-size:12px"><a href="${unsubUrl}">Unsubscribe</a></p>`;

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: sub.email,
      subject,
      text,
      html,
      headers: { "List-Unsubscribe": `<${unsubUrl}>` },
    }),
  });
  if (!send.ok) {
    console.error(`[alerts] send failed for subscription ${sub.id}: ${send.status} ${await send.text()}`);
    continue; // last_sent_at untouched — tomorrow's run retries this window
  }
  await fetch(`${SUPABASE_URL}/rest/v1/alert_subscriptions?id=eq.${sub.id}`, {
    method: "PATCH",
    headers: { ...svc, Prefer: "return=minimal" },
    body: JSON.stringify({ last_sent_at: new Date(now).toISOString() }),
  });
  sent += 1;
  await new Promise((r) => setTimeout(r, 600)); // Resend free tier: 2 req/s
}
console.log(`[alerts] sent ${sent} digest${sent === 1 ? "" : "s"}`);
