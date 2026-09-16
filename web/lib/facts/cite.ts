import type { Footnote } from "./parse";

// A fact sheet cites the way a listing page does (components/FactRow.tsx
// Citation): a small ⓘ after the value that links to the source document
// and names it on hover. The sheet's markdown still carries numbered
// footnotes, because that is what the audit records and the structure test
// pin, but the numbers and the Sources list no longer render — the owner
// (2026-09-16): "we've largely moved to citing via a hovering hyperlink."
//
// Two things a footnote needs before it can be an icon: a URL to link to
// and a short plain-text name for the hover. Neither is stored separately,
// so both are read from the footnote text itself.
export type Citation = { n: number; url?: string; title: string };

const URL_RE = /https?:\/\/[^\s)]+/g;

function firstUrl(text: string): string | undefined {
  const m = URL_RE.exec(text);
  URL_RE.lastIndex = 0;
  if (!m) return undefined;
  let url = m[0];
  while (url.length > 1 && /[.,;:!?]$/.test(url)) url = url.slice(0, -1);
  return url;
}

/** The URL a footnote links to. A footnote with no URL of its own usually
 *  reads "Same booklet as footnote 1, …" — the document is the one another
 *  footnote already linked — so follow that reference, and its reference,
 *  until a URL turns up. A footnote that neither links nor refers to one
 *  that does gets no link, and renders as an icon with hover text only. */
export function citationUrl(footnotes: Footnote[], n: number, seen = new Set<number>()): string | undefined {
  if (seen.has(n)) return undefined;
  seen.add(n);
  const fn = footnotes.find((f) => f.n === n);
  if (!fn) return undefined;
  const own = firstUrl(fn.text);
  if (own) return own;
  // "footnote 1", "footnotes 1 and 2", "footnote 4" — the first one named.
  const refs = [...fn.text.matchAll(/footnotes?\s+(\d+)(?:\s*(?:and|,)\s*(\d+))*/gi)];
  for (const r of refs) {
    for (const num of r.slice(1).filter(Boolean).map(Number)) {
      const url = citationUrl(footnotes, num, seen);
      if (url) return url;
    }
  }
  // Or it names the document by its italic title ("*2022 IONIQ 5
  // Specifications*, … same four PDFs (URLs above)"): link the footnote that
  // carries that title with a URL.
  for (const t of fn.text.matchAll(/\*([^*\n]+)\*/g)) {
    const other = footnotes.find((f) => f.n !== n && !seen.has(f.n) && f.text.includes(`*${t[1]}*`) && firstUrl(f.text));
    if (other) return firstUrl(other.text);
  }
  return undefined;
}

/** The hover text: the footnote with its markup and URLs removed. */
export function citationTitle(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(URL_RE, "")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s.,;:]+$/g, "")
    .trim();
}

export function citations(footnotes: Footnote[]): Map<number, Citation> {
  const out = new Map<number, Citation>();
  for (const f of footnotes) out.set(f.n, { n: f.n, url: citationUrl(footnotes, f.n), title: citationTitle(f.text) });
  return out;
}
