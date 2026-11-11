// The embeddable model card: a small, self-contained HTML document another
// site frames, and the snippet that frames it.
//
// WHY IT EXISTS. The site's measured constraint (2026-11-10) is that nothing
// links to it. A forum post or a blog about the Ioniq 5 has a real use for
// "how many are for sale and what do they ask" that stays current without
// the author touching it, and the snippet that gives them that also carries
// a plain link to the model's page. The link is the point; the card is what
// makes it worth pasting.
//
// THE LINK IS OUTSIDE THE FRAME ON PURPOSE. A link inside an iframe belongs
// to our document, not the host's, and passes nothing. So the snippet is two
// things: the frame, and one ordinary anchor under it that the host page
// itself carries. It says what it is — the model's name, "for sale on Census
// EV" — and it is a normal followed link, because it is a real citation of
// where the figures come from. No hidden text, no keyword anchor, nothing a
// host would be embarrassed to find in their markup.
//
// WHAT THE CARD SAYS is what the model page says, from the same hub artifact
// on the same daily cadence: the count with its month, and the same
// model-year rows (hubIndex.ts's floor of STATS_MIN cars per median applies
// before a row ever reaches here). No figure is computed for the card.
//
// Plain HTML with inline CSS and no script: it has to render inside a
// stranger's page, under whatever CSP they run, and a card that executes
// nothing is one a host can read in full before trusting. Every value that
// reaches the markup is escaped, including our own nameplates.
import type { HubStats } from "@/lib/listings/hubIndex";
import { hubPath, type ModelHub } from "@/lib/listings/modelHubs";

export const ORIGIN = "https://censusev.com";
/** The label a click from a card arrives with (lib/visit.ts visitSrc), so the weekly report can count them. */
export const EMBED_REF = "embed";
/** Model-year rows on a card; the page has them all. */
export const EMBED_ROWS = 4;
export const EMBED_WIDTH = 360;

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const monthOf = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const embedPath = (h: ModelHub): string => `/embed/${h.makeSlug}/${h.modelSlug}`;

/** The model years the card lists: the most numerous that have a median, newest first. */
export function embedYears(stats: HubStats | undefined): { year: number; n: number; medianUsd: number }[] {
  return (stats?.years ?? [])
    .filter((y): y is HubStats["years"][number] & { medianUsd: number } => y.medianUsd !== undefined && y.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, EMBED_ROWS)
    .sort((a, b) => b.year - a.year);
}

/** Tall enough for the rows it has, so the snippet's frame neither scrolls nor leaves a gap. */
export function embedHeight(rows: number): number {
  return 132 + (rows > 0 ? 30 + rows * 29 : 0);
}

function month(asOf: string | undefined): string | undefined {
  if (!asOf) return undefined;
  const d = new Date(`${asOf}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? monthOf.format(d) : undefined;
}

export function embedHtml(hub: ModelHub, total: number, stats: HubStats | undefined): string {
  const name = `${hub.make} ${hub.model}`;
  const href = `${ORIGIN}${hubPath(hub)}?ref=${EMBED_REF}`;
  const when = month(stats?.asOf);
  const years = embedYears(stats);
  // Same rule as the link-preview card: a count goes out only with the month
  // it was counted, and "0 for sale" is not a card worth framing.
  const count = total > 0 && when ? `${nf.format(total)} for sale · ${when}` : "";
  const rows = years
    .map(
      (y) =>
        `<tr><th scope="row">${y.year}</th><td class="n">${nf.format(y.n)}</td><td class="p">${esc(money.format(y.medianUsd))}</td></tr>`,
    )
    .join("");
  const table = rows
    ? `<table><thead><tr><th scope="col">Model year</th><th scope="col" class="r">For sale</th><th scope="col" class="r">Median asking</th></tr></thead><tbody>${rows}</tbody></table>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><link rel="canonical" href="${ORIGIN}${hubPath(hub)}">
<title>${esc(name)} for sale | Census EV</title>
<style>
*{box-sizing:border-box}html,body{margin:0}
body{font:14px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#121212;background:#fff}
a{color:inherit;text-decoration:none}
.c{display:block;border:3px solid #121212;height:100vh;overflow:hidden}
.h{background:#121212;color:#fff;padding:7px 12px;font-size:12px;font-weight:800;letter-spacing:-.02em}
.h span{color:#e0bf5a;margin-left:.3em}
.b{padding:10px 12px 0}
.m{font-size:20px;font-weight:700;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k{margin-top:2px;font-size:13px;color:#555}
table{width:100%;margin-top:8px;border-collapse:collapse}
th,td{padding:5px 0;text-align:left;font-weight:400}
thead th{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#777}
tbody tr{border-top:1px solid #e3e3e3}tbody th{font-weight:700}
.r,.n,.p{text-align:right}.n{color:#555}.p{font-weight:700}
.f{position:absolute;left:15px;right:15px;bottom:11px;font-size:12px;font-weight:700;color:#1f3fd1}
</style></head>
<body><a class="c" href="${esc(href)}" target="_blank" rel="noopener">
<div class="h">CENSUS<span>EV</span></div>
<div class="b"><div class="m"${name.length > 26 ? ' style="font-size:15px"' : ""}>${esc(name)}</div>${count ? `<div class="k">${esc(count)}</div>` : ""}${table}</div>
<div class="f">censusev.com</div>
</a></body></html>
`;
}

/** What a host pastes: the frame, then one ordinary link their own page carries. */
export function embedSnippet(hub: ModelHub, rows = EMBED_ROWS): string {
  const name = `${hub.make} ${hub.model}`;
  return (
    `<iframe src="${ORIGIN}${embedPath(hub)}" title="${esc(name)} for sale" width="${EMBED_WIDTH}" height="${embedHeight(rows)}" ` +
    `style="border:0;max-width:100%" loading="lazy"></iframe>\n` +
    `<p><a href="${ORIGIN}${hubPath(hub)}">${esc(name)} for sale</a> on Census EV</p>`
  );
}
