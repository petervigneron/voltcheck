// A small, purpose-built parser for the fact-sheet markdown format used in
// web/content/facts/*.md. Not a general markdown engine: the source files
// follow one fixed shape (H1 title, ## sections, an optional ### subheading
// inside a section, bullet lists with one level of nesting, a "See it for
// yourself" links section, a "---" divider, a "## Footnotes" definition
// list, and an optional "## Scope note"). Keeping the parser narrow instead
// of pulling in a generic markdown library is what makes stripping the
// audit-record section a one-line guarantee: this parser doesn't know that
// heading exists, so it can't accidentally render it. See
// docs/agents/factsheet-queries-2026-08-20.md for why the source docs look
// like this, and CLAUDE.md's "house rule on claims" for why the est./scope
// markers below have to survive intact.

export type ListItem = { text: string; sub?: string[] };
export type FactBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: ListItem[] }
  | { type: "h3"; text: string }
  | { type: "table"; header: string[]; rows: string[][] };

export type FactSection = {
  heading: string;
  blocks: FactBlock[];
};

export type Footnote = { n: number; text: string };

export type ParsedFactSheet = {
  title: string;
  sections: FactSection[];
  seeItYourself: { label: string; url: string }[];
  footnotes: Footnote[];
  /** One paragraph per array entry. Null if the sheet carries no scope note (none currently don't). */
  scopeNote: string[] | null;
};

const KNOWN_TRAILING_HEADINGS = new Set(["See it for yourself", "Footnotes", "Scope note"]);

function parseBlocks(raw: string): FactBlock[] {
  const blocks: FactBlock[] = [];
  const lines = raw.split("\n");
  let i = 0;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) {
      blocks.push({ type: "p", text: paraBuf.join(" ").trim() });
      paraBuf = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      flushPara();
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      flushPara();
      // GitHub-style table: header row, |---| separator row, body rows.
      // A row's leading/trailing pipes are shed before splitting; escaped
      // pipes are not supported because no sheet needs a literal "|".
      const splitRow = (l: string) =>
        l
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const isSeparator = (l: string) => /^\|?[\s:|-]+\|?$/.test(l.trim()) && l.includes("-");
      const header = splitRow(tableLines[0]);
      const rows = tableLines
        .slice(1)
        .filter((l) => !isSeparator(l))
        .map(splitRow);
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (/^-\s+/.test(line)) {
      flushPara();
      const items: ListItem[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        const text = lines[i].replace(/^-\s+/, "").trim();
        const sub: string[] = [];
        i++;
        while (i < lines.length && /^\s{2,}-\s+/.test(lines[i])) {
          sub.push(lines[i].replace(/^\s{2,}-\s+/, "").trim());
          i++;
        }
        items.push(sub.length ? { text, sub } : { text });
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    paraBuf.push(line.trim());
    i++;
  }
  flushPara();
  return blocks;
}

export function parseFactSheet(raw: string): ParsedFactSheet {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (!lines[0]?.startsWith("# ")) {
    throw new Error("Fact sheet must start with an H1 title");
  }
  const title = lines[0].slice(2).trim();
  const rest = lines.slice(1).join("\n");

  // Split on top-level "## " headings. A lone "---" divider line is a
  // separator, not content, and is dropped.
  const parts = rest.split(/\n(?=## )/g).map((s) => s.trim()).filter(Boolean);

  const sections: FactSection[] = [];
  const seeItYourself: { label: string; url: string }[] = [];
  const footnotes: Footnote[] = [];
  let scopeNote: string[] | null = null;

  for (const part of parts) {
    if (!part.startsWith("## ")) continue;
    const nl = part.indexOf("\n");
    const headingLine = nl === -1 ? part : part.slice(0, nl);
    const heading = headingLine.replace(/^##\s+/, "").trim();
    let body = nl === -1 ? "" : part.slice(nl + 1);
    // Drop a trailing "---" divider some sections (See it for yourself) end with.
    body = body.replace(/\n?---\s*$/, "").trim();

    if (heading === "See it for yourself") {
      const linkRe = /^-\s*\[([^\]]+)\]\(([^)]+)\)\s*$/gm;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(body))) {
        seeItYourself.push({ label: m[1], url: m[2] });
      }
      continue;
    }

    if (heading === "Footnotes") {
      // Entries look like: [^12]: text possibly spanning until the next [^n]:
      const entries = body.split(/\n(?=\[\^\d+\]:)/g);
      for (const entry of entries) {
        const fm = entry.match(/^\[\^(\d+)\]:\s*([\s\S]+)$/);
        if (!fm) continue;
        footnotes.push({ n: Number(fm[1]), text: fm[2].replace(/\n/g, " ").trim() });
      }
      continue;
    }

    if (heading === "Scope note") {
      scopeNote = body
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\n/g, " ").trim())
        .filter(Boolean);
      continue;
    }

    if (KNOWN_TRAILING_HEADINGS.has(heading)) continue;

    sections.push({ heading, blocks: parseBlocks(body) });
  }

  footnotes.sort((a, b) => a.n - b.n);

  return { title, sections, seeItYourself, footnotes, scopeNote };
}
