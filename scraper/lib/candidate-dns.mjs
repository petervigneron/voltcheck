// Does this guessed domain exist? The DNS stage of resolve-dealers.mjs.
//
// A roll turns every licensee into dozens of candidate domains (Missouri's
// 4,938 rows made 297,152), nearly all of them guesses nobody registered, and
// only the ones that resolve are fetched. So this stage makes more network
// requests than the rest of the resolver put together, and on 2026-09-10 it
// took the house down with it. Four rolls resolving in parallel put 500+ UDP
// queries in flight; after ~600k lookups the home router's NAT flow table was
// exhausted, every resolve4 returned ECONNREFUSED, the tail of three rolls
// silently scored zero resolving candidates, and every HTTP identity fetch
// made under that load failed as well: 20,000 fetches, 0 verified dealers, a
// log that read exactly like "none of these dealers has a website". The
// router dropped for the whole machine twice (01:10Z and 02:14Z).
//
// Two things here answer that.
//
// 1. DNS over HTTPS by default. A process holds a few dozen pooled TCP
//    connections to Cloudflare and Google instead of a UDP flow per query.
//    Measured that night: 880/s against Cloudflare (300 in flight) and 928/s
//    against Google (200) where UDP managed 161/s at 200; the nine-roll DNS
//    pass ran at ~2,450 lookups/s aggregate against ~180 over UDP; and on a
//    5,685-candidate control Cloudflare, Google and UDP resolved 866, 866 and
//    867 (UDP's run also threw 14 errors). Raising UDP concurrency was tried
//    first and rejected: at 1,000 in flight throughput fell to 84/s and
//    accuracy fell with it, 707 resolving where 853 was right.
//
// 2. A lookup that got no answer is never scored as a domain that does not
//    exist. The old stage caught every resolve4 failure alike, so a dead
//    network and NXDOMAIN were the same thing to it. Here "error" is a verdict
//    of its own: errors get one slow retry pass, a window in which most
//    lookups go unanswered stops the stage on the spot, and a stage still
//    holding more than 1% unanswered at the end refuses to hand its short
//    list to the fetch stage.
import { link, readFile, unlink, writeFile } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resolver } from "node:dns/promises";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const DOH_PROVIDERS = [
  { name: "cloudflare", url: "https://cloudflare-dns.com/dns-query?type=A&name=", headers: { accept: "application/dns-json" } },
  { name: "google", url: "https://dns.google/resolve?type=A&name=", headers: {} },
];

// One lookup's verdict, in resolve4's own terms so the transports are
// interchangeable:
//   resolves  an A record, through any CNAME chain (resolve4 succeeds)
//   absent    NXDOMAIN, or NOERROR with no A record (ENOTFOUND / ENODATA)
//   servfail  the resolver answered but could not answer for the domain
//             (lame delegation, broken zone): a statement about the domain
//   error     no answer at all (transport, timeout, HTTP status, malformed
//             body): a statement about US, never about the dealer
export function parseDohAnswer(body) {
  if (!body || typeof body !== "object" || !Number.isInteger(body.Status)) return { verdict: "error", reason: "malformed answer" };
  if (body.Status === 3) return { verdict: "absent", reason: "NXDOMAIN" };
  if (body.Status !== 0) return { verdict: "servfail", reason: `rcode ${body.Status}` };
  const addresses = (Array.isArray(body.Answer) ? body.Answer : [])
    .filter((a) => a?.type === 1 && typeof a.data === "string")
    .map((a) => a.data);
  return addresses.length ? { verdict: "resolves", addresses } : { verdict: "absent", reason: "NODATA" };
}

// Lookups alternate providers, and a retry goes to the other one, so a
// provider having a bad minute costs a retry rather than a false "absent".
export function dohResolver({ providers = DOH_PROVIDERS, fetchImpl = globalThis.fetch, attempts = 3, timeoutMs = 8000, backoffMs = 300 } = {}) {
  let turn = 0;
  return async function resolveA(domain) {
    const first = turn++;
    let last;
    for (let k = 0; k < attempts; k++) {
      const p = providers[(first + k) % providers.length];
      try {
        const res = await fetchImpl(p.url + encodeURIComponent(domain), { headers: p.headers, signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) last = parseDohAnswer(await res.json());
        else {
          await res.body?.cancel?.();
          last = { verdict: "error", reason: `HTTP ${res.status}` };
        }
      } catch (e) {
        const reason = e?.name === "TimeoutError" ? "timeout" : e?.name === "SyntaxError" ? "malformed answer" : (e?.cause?.code ?? e?.code ?? "fetch failed");
        last = { verdict: "error", reason };
      }
      last.provider = p.name;
      if (last.verdict === "resolves" || last.verdict === "absent") return last;
      if (k + 1 < attempts) await sleep(backoffMs * (k + 1));
    }
    return last;
  };
}

// c-ares' codes, sorted the same way. EREFUSED is the public resolver
// refusing us (rate limiting), so it is an error, not an answer.
const UDP_ANSWERS = { ENOTFOUND: "absent", ENODATA: "absent", ESERVFAIL: "servfail" };
export const classifyUdpError = (code) => UDP_ANSWERS[code] ?? "error";

export function udpResolver(servers = ["1.1.1.1", "8.8.8.8"]) {
  const resolver = new Resolver();
  resolver.setServers(servers);
  return async function resolveA(domain) {
    try {
      // A CNAME to a name with no A record (fairfaxbmw.com → a Bodis parking
      // name, 2026-09-10) is a success with no addresses to c-ares, not
      // ENODATA. It is the same answer parseDohAnswer calls NODATA.
      const addresses = await resolver.resolve4(domain);
      return addresses.length ? { verdict: "resolves", addresses } : { verdict: "absent", reason: "NODATA" };
    } catch (e) {
      return { verdict: classifyUdpError(e?.code), reason: e?.code ?? String(e) };
    }
  };
}

// UDP stays available (--dns udp) for a machine that cannot reach the DoH
// hosts, but its in-flight count is capped for the whole machine, not per
// process: the 2026-09-10 flood was four processes, each under any
// per-process cap anyone would have picked. One UDP stage at a time holds
// this lock and the rest wait. The pid is written before the lock file
// appears (link, not open), so a reader never sees an empty lock, and a lock
// whose pid is dead is taken over.
export const UDP_MAX_IN_FLIGHT = 100;
export async function holdUdpLock({ path = join(tmpdir(), "voltcheck-udp-dns.lock"), log = () => {}, pollMs = 5000 } = {}) {
  const mine = `${path}.${process.pid}`;
  let announced = false;
  for (;;) {
    await writeFile(mine, String(process.pid));
    try {
      await link(mine, path);
      const release = () => {
        try { unlinkSync(path); } catch {}
        process.off("exit", release);
      };
      process.on("exit", release);
      return release;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    } finally {
      await unlink(mine).catch(() => {});
    }
    const holder = Number((await readFile(path, "utf-8").catch(() => "")).trim());
    if (!pidAlive(holder)) {
      await unlink(path).catch(() => {});
      continue;
    }
    if (!announced) log(`waiting for pid ${holder}'s UDP DNS stage to finish (${path})`);
    announced = true;
    await sleep(pollMs);
  }
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

export class DnsStageError extends Error {}

const topReasons = (reasons) =>
  [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => `${r} x${n}`).join(", ");

// The stage itself. Returns the resolving set, or throws DnsStageError when
// the answers cannot be trusted: a short list handed on to the fetch stage
// is the failure this module exists to prevent.
export async function resolveAll(domains, resolveA, { concurrency, log = () => {}, window = 1000, collapseShare = 0.5, maxUnansweredShare = 0.01, retryConcurrency = 8 } = {}) {
  const resolves = new Set();
  const tally = { resolves: 0, absent: 0, servfail: 0, error: 0 };
  const reasons = new Map();
  let unanswered = [];
  let next = 0, done = 0, badInWindow = 0, collapsed = null;
  const t0 = Date.now();
  const perSec = () => Math.round(done / Math.max(0.001, (Date.now() - t0) / 1000));
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, domains.length)) }, async () => {
    while (next < domains.length && !collapsed) {
      const domain = domains[next++];
      const r = await resolveA(domain);
      tally[r.verdict]++;
      if (r.verdict === "resolves") resolves.add(domain);
      else if (r.verdict !== "absent") {
        badInWindow++;
        reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
        if (r.verdict === "error") unanswered.push(domain);
      }
      if (++done % window === 0) {
        if (badInWindow > window * collapseShare) collapsed ??= `${badInWindow} of the last ${window} lookups got no usable answer (${topReasons(reasons)})`;
        badInWindow = 0;
      }
      if (done % 5000 === 0) log(`  dns ${done}/${domains.length} (${resolves.size} resolve, ${tally.error} unanswered, ${perSec()}/s)`);
    }
  }));
  if (collapsed) {
    throw new DnsStageError(`DNS stage stopped after ${done} of ${domains.length} lookups: ${collapsed}. That is our network or the resolver, not a run of dealers without websites, so nothing was scored.`);
  }
  const rate = perSec();
  if (unanswered.length) {
    const again = unanswered;
    unanswered = [];
    log(`  retrying ${again.length} unanswered lookups, ${retryConcurrency} at a time`);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(retryConcurrency, again.length) }, async () => {
      while (i < again.length) {
        const domain = again[i++];
        const r = await resolveA(domain);
        if (r.verdict === "error") { unanswered.push(domain); continue; }
        tally.error--;
        tally[r.verdict]++;
        if (r.verdict === "resolves") resolves.add(domain);
      }
    }));
  }
  if (unanswered.length > domains.length * maxUnansweredShare) {
    throw new DnsStageError(`${unanswered.length} of ${domains.length} lookups never got an answer, even on retry (${topReasons(reasons)}). Refusing to score them as absent.`);
  }
  return { resolves, tally, unanswered, perSec: rate };
}
