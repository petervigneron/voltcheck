import type { ReactNode } from "react";
import type { Citation } from "@/lib/facts/cite";
import { CitationIcon } from "../CitationIcon";

// Inline markup used by the fact-sheet source files: *italic* document
// titles, [text](url) markdown links, bare https:// URLs (the footnote
// definitions end in one), and [^n] footnote reference markers. A marker
// renders as the same ⓘ a listing page puts after a cited value: a link to
// the source document, named on hover (lib/facts/cite.ts) — the number and
// the Sources list it pointed at no longer render.
const INLINE_RE =
  /\[\^(\d+)\]|\[([^\]]+)\]\(([^)]+)\)|\*([^*\n]+)\*|(https?:\/\/[^\s)]+)/g;

export function renderInline(text: string, cite: (n: number) => Citation | undefined): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [whole, fnNum, linkText, linkUrl, italic, bareUrl] = m;
    if (fnNum) {
      const c = cite(Number(fnNum));
      // A marker with no footnote behind it is a source that was lost; the
      // structure test fails the sheet, and the page shows nothing for it.
      if (c) out.push(<Cite key={`fn${key++}`} c={c} />);
    } else if (linkText && linkUrl) {
      out.push(
        <a
          key={`l${key++}`}
          href={linkUrl}
          target={linkUrl.startsWith("http") ? "_blank" : undefined}
          rel={linkUrl.startsWith("http") ? "noopener noreferrer" : undefined}
          className="text-cobalt underline underline-offset-2"
        >
          {linkText}
        </a>
      );
    } else if (italic) {
      out.push(<em key={`i${key++}`}>{italic}</em>);
    } else if (bareUrl) {
      // Strip sentence-ending punctuation the URL regex can't tell apart
      // from a real trailing character (every footnote here ends "...pdf. "
      // or similar) — trimmed chars fall through to plain text below via
      // the adjusted `last` offset, instead of becoming part of the href.
      let url = bareUrl;
      let trimmed = 0;
      while (url.length > 1 && /[.,;:!?]$/.test(url)) {
        url = url.slice(0, -1);
        trimmed++;
      }
      out.push(
        <a
          key={`u${key++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cobalt underline underline-offset-2 break-all"
        >
          {url}
        </a>
      );
      last = m.index + whole.length - trimmed;
      continue;
    } else {
      out.push(whole);
    }
    last = m.index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** "Est. " prefix becomes a small badge; the rest renders through renderInline. Preserves the marking rule in CLAUDE.md verbatim rather than reformatting the sentence. */
export function renderTextWithEst(text: string, cite: (n: number) => Citation | undefined): ReactNode {
  if (text.startsWith("Est. ")) {
    return (
      <>
        <strong className="mr-1 text-[11px] font-bold tracking-[0.02em] text-amber-700">Est.</strong>
        {renderInline(text.slice(5), cite)}
      </>
    );
  }
  return renderInline(text, cite);
}

function Cite({ c }: { c: Citation }) {
  const cls = "ml-0.5 inline-block align-middle text-zinc-300 no-underline hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400";
  if (!c.url) {
    return (
      <span title={c.title} aria-label={`Source: ${c.title}`} className={cls}>
        <CitationIcon />
      </span>
    );
  }
  return (
    <a href={c.url} target="_blank" rel="noopener noreferrer" title={c.title} aria-label={`Source: ${c.title}`} className={cls}>
      <CitationIcon />
    </a>
  );
}
