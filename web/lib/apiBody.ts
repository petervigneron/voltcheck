/** Read a small JSON body, or null when it is absent, oversized or not an
 *  object. Every account route takes at most a few hundred bytes; the cap
 *  is the polite refusal before anything is parsed. */
export async function readJsonBody(req: Request, max = 2048): Promise<Record<string, unknown> | null> {
  try {
    const raw = await req.text();
    if (!raw || raw.length > max) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A same-site path to send a shopper on to after signing in — never an
 *  absolute URL, so the `next` parameter cannot be used to bounce someone
 *  off the site from a link that looked like ours. */
export function safeNext(v: unknown, fallback = "/account"): string {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || v.includes("\\") || v.length > 512) return fallback;
  return v;
}
