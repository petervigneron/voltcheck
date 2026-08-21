import type { ReactNode } from "react";

// Inline markup used by the fact-sheet source files: *italic* document
// titles, [text](url) markdown links, bare https:// URLs (the footnote
// definitions end in one), and [^n] footnote reference markers. Handles the
// same four forms wherever they occur, body text and footnote text alike, so
// a citation reads the same everywhere it appears.
const INLINE_RE =
  /\[\^(\d+)\]|\[([^\]]+)\]\(([^)]+)\)|\*([^*\n]+)\*|(https?:\/\/[^\s)]+)/g;

export function renderInline(text: string, nextFootnoteId: (n: number) => string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [whole, fnNum, linkText, linkUrl, italic, bareUrl] = m;
    if (fnNum) {
      const n = Number(fnNum);
      const id = nextFootnoteId(n);
      out.push(
        <sup key={`fn${key++}`}>
          <a id={id} href={`#fn-${n}`} className="text-cobalt no-underline hover:underline">
            {n}
          </a>
        </sup>
      );
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
export function renderTextWithEst(text: string, nextFootnoteId: (n: number) => string): ReactNode {
  if (text.startsWith("Est. ")) {
    return (
      <>
        <strong className="mr-1 text-[11px] font-bold tracking-[0.02em] text-amber-700">Est.</strong>
        {renderInline(text.slice(5), nextFootnoteId)}
      </>
    );
  }
  return renderInline(text, nextFootnoteId);
}
