// Retry for transient failures on the pipeline's own service calls
// (Supabase REST/gateway, vPIC, data.wa.gov) — NOT for dealer-site crawling,
// which has its own politeness rules in http.mjs and treats errors as answers.
//
// Why these waits: the 2026-08-16 diagnosis in db-sync.mjs. The Nano database
// walks into its memory ceiling under the night's churn, the OOM killer takes
// Postgres down mid-statement, and recovery holds the door shut for ~2 minutes
// of 500/503/520/521. A politer-looking schedule (10/20/30s) spent all its
// retries inside that window and the night failed anyway; these waits outlast
// a full recovery cycle. The nightly red streak of 08-14→08-17 was this
// defect class over and over — each script that talked to the database with a
// bare fetch became the next domino once the one before it was fixed (db-sync
// 08-14/15/16, recheck 08-15/08-17) — hence one shared implementation instead
// of per-script copies that drift.
//
// Statuses deliberately exclude 4xx like 401/413: a bad token or oversized
// body fails identically every time, and retrying only delays the real error.
export const TRANSIENT = new Set([429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

// doFetch: () => Promise<Response>. A dying database resets connections
// mid-request, which fetch() surfaces as a throw rather than a status — same
// transient event, same retry (status 0 below). The caller still checks
// res.ok; after the last wait the failing response is returned, not thrown,
// so call sites keep their own exit semantics.
//
// `fatal(res)` — optional, async — lets a caller name a response that LOOKS
// transient but is not. The case that needed it: PostgREST answers a
// statement_timeout (Postgres 57014) as HTTP 500, and a statement that ran
// out of its budget once will run out of it again in thirty seconds. The
// schedule above was built for a database that is down, not for a query that
// is too big; applied to 57014 it spent ~10.5 minutes per view re-running the
// same 60-second timeout four times, and refresh-variants.mjs's two outgrown
// views turned a one-minute failure into a 54-minute one every night from
// 2026-10-14 (nightly's finalize-audits ran into its 60-minute cap and the
// whole run read "cancelled"). The body is read once here and handed back
// re-readable, so the caller's own res.text() still works.
export async function fetchWithRetry(label, doFetch, { waits = [30, 120, 240], fatal } = {}) {
  const attempt = async () => {
    try {
      return await doFetch();
    } catch (e) {
      return { ok: false, status: 0, text: async () => String(e?.cause?.code ?? e?.message ?? e) };
    }
  };
  let res = await attempt();
  for (const waitS of waits) {
    if (res.ok || !(res.status === 0 || TRANSIENT.has(res.status))) break;
    if (fatal) {
      const body = await res.text();
      res = { ok: res.ok, status: res.status, text: async () => body };
      if (await fatal(res, body)) {
        console.error(`${label}: HTTP ${res.status} is not transient — not retrying`);
        break;
      }
    }
    const why = res.status === 0 ? `network error (${(await res.text()).slice(0, 120)})` : `HTTP ${res.status}`;
    console.error(`${label}: ${why} — retrying in ${waitS}s`);
    await new Promise((r) => setTimeout(r, waitS * 1000));
    res = await attempt();
  }
  return res;
}
