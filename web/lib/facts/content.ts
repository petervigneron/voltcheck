import { readFileSync } from "node:fs";
import path from "node:path";
import { parseFactSheet, type ParsedFactSheet } from "./parse";

const CONTENT_DIR = path.join(process.cwd(), "content", "facts");

// Reads a checked-in markdown file, not the database or the feed — these
// pages are static content and must not cost a request-time DB read (see
// CLAUDE.md's BUILD REQUIREMENTS). Parsed once per build/request and cheap
// either way (a few KB of text), so no extra caching layer here.
export function loadFactSheet(file: string): ParsedFactSheet {
  const raw = readFileSync(path.join(CONTENT_DIR, `${file}.md`), "utf8");
  return parseFactSheet(raw);
}
