import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDohAnswer, dohResolver, classifyUdpError, resolveAll, holdUdpLock, DnsStageError } from "../lib/candidate-dns.mjs";

// Answer bodies in the shape both providers send: Cloudflare's
// application/dns-json and Google's /resolve are the same JSON API.
const NOERROR_A = {
  Status: 0, TC: false, RD: true, RA: true, AD: false, CD: false,
  Question: [{ name: "parksmotors.com", type: 1 }],
  Answer: [{ name: "parksmotors.com", type: 1, TTL: 300, data: "23.227.38.65" }],
};
const CNAME_TO_A = {
  Status: 0,
  Question: [{ name: "www.hudsonauto.com", type: 1 }],
  Answer: [
    { name: "www.hudsonauto.com", type: 5, TTL: 300, data: "hudsonauto.com." },
    { name: "hudsonauto.com", type: 1, TTL: 300, data: "104.18.1.1" },
  ],
};
const CNAME_ONLY = { Status: 0, Answer: [{ name: "shop.hudsonauto.com", type: 5, TTL: 300, data: "ghs.example.net." }] };
const NODATA = {
  Status: 0,
  Question: [{ name: "hudsonauto.biz", type: 1 }],
  Authority: [{ name: "hudsonauto.biz", type: 6, TTL: 900, data: "ns1.hudsonauto.biz. hostmaster.hudsonauto.biz. 1 7200 3600 1209600 900" }],
};
const NXDOMAIN = {
  Status: 3,
  Question: [{ name: "parksmotorsllc.us", type: 1 }],
  Authority: [{ name: "us", type: 6, TTL: 900, data: "a.cctld.us. hostmaster.neustar.us. 1 900 900 604800 86400" }],
};
const SERVFAIL = { Status: 2, Question: [{ name: "lame.example.com", type: 1 }], Comment: "Name servers refused query (lame delegation?)" };

test("an A record is a resolving domain, through a CNAME chain or not", () => {
  assert.deepEqual(parseDohAnswer(NOERROR_A), { verdict: "resolves", addresses: ["23.227.38.65"] });
  assert.deepEqual(parseDohAnswer(CNAME_TO_A), { verdict: "resolves", addresses: ["104.18.1.1"] });
});

test("NXDOMAIN and NOERROR-without-an-A-record are absent, as resolve4's ENOTFOUND and ENODATA are", () => {
  assert.equal(parseDohAnswer(NXDOMAIN).verdict, "absent");
  assert.equal(parseDohAnswer(NODATA).verdict, "absent");
  assert.equal(parseDohAnswer(CNAME_ONLY).verdict, "absent");
  assert.equal(parseDohAnswer({ Status: 0, Answer: [{ type: 28, data: "2606:4700::1" }] }).verdict, "absent");
});

test("SERVFAIL is an answer about the domain, kept apart from absent", () => {
  assert.deepEqual(parseDohAnswer(SERVFAIL), { verdict: "servfail", reason: "rcode 2" });
  assert.equal(parseDohAnswer({ Status: 5 }).verdict, "servfail");
});

// The 2026-09-10 incident in one line: a failure to get an answer was scored
// as a domain that does not exist. Anything that is not a DNS answer is an
// error, never absent.
test("a body that is not a DNS answer is an error, never absent", () => {
  for (const body of [null, undefined, "", "<html>rate limited</html>", {}, { Status: "0" }, { Answer: NOERROR_A.Answer }]) {
    assert.equal(parseDohAnswer(body).verdict, "error", JSON.stringify(body));
  }
});

const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, body: null });
function scriptedFetch(script) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const next = script.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  f.calls = calls;
  return f;
}
const offline = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });

test("the first lookup goes to Cloudflare with its JSON accept header and the name URL-encoded", async () => {
  const f = scriptedFetch([reply(NOERROR_A)]);
  const r = await dohResolver({ fetchImpl: f, backoffMs: 0 })("parksmotors.com");
  assert.equal(r.verdict, "resolves");
  assert.equal(r.provider, "cloudflare");
  assert.equal(f.calls[0].url, "https://cloudflare-dns.com/dns-query?type=A&name=parksmotors.com");
  assert.equal(f.calls[0].init.headers.accept, "application/dns-json");
});

test("lookups alternate between the providers", async () => {
  const f = scriptedFetch([reply(NXDOMAIN), reply(NXDOMAIN)]);
  const resolveA = dohResolver({ fetchImpl: f, backoffMs: 0 });
  await resolveA("a.com");
  await resolveA("b.com");
  assert.match(f.calls[0].url, /^https:\/\/cloudflare-dns\.com\//);
  assert.match(f.calls[1].url, /^https:\/\/dns\.google\/resolve\?type=A&name=b\.com$/);
});

test("NXDOMAIN is final: it is not retried", async () => {
  const f = scriptedFetch([reply(NXDOMAIN)]);
  const r = await dohResolver({ fetchImpl: f, backoffMs: 0 })("parksmotorsllc.us");
  assert.equal(r.verdict, "absent");
  assert.equal(f.calls.length, 1);
});

test("an HTTP error from one provider is retried on the other", async () => {
  const f = scriptedFetch([reply(null, 503), reply(NOERROR_A)]);
  const r = await dohResolver({ fetchImpl: f, backoffMs: 0 })("parksmotors.com");
  assert.equal(r.verdict, "resolves");
  assert.equal(r.provider, "google");
});

test("SERVFAIL gets a second opinion from the other provider", async () => {
  const f = scriptedFetch([reply(SERVFAIL), reply(NOERROR_A)]);
  assert.equal((await dohResolver({ fetchImpl: f, backoffMs: 0 })("x.com")).verdict, "resolves");
  const g = scriptedFetch([reply(SERVFAIL), reply(SERVFAIL), reply(SERVFAIL)]);
  assert.equal((await dohResolver({ fetchImpl: g, backoffMs: 0 })("lame.example.com")).verdict, "servfail");
});

test("a dead network is an error, not an absent domain", async () => {
  const f = scriptedFetch([offline(), offline(), offline()]);
  const r = await dohResolver({ fetchImpl: f, backoffMs: 0 })("parksmotors.com");
  assert.deepEqual([r.verdict, r.reason], ["error", "ECONNREFUSED"]);
  assert.equal(f.calls.length, 3);
});

test("a body that fails to parse as JSON is an error", async () => {
  const bad = { ok: true, status: 200, json: async () => JSON.parse("<html>"), body: null };
  const f = scriptedFetch([bad, bad, bad]);
  const r = await dohResolver({ fetchImpl: f, backoffMs: 0 })("parksmotors.com");
  assert.deepEqual([r.verdict, r.reason], ["error", "malformed answer"]);
});

test("UDP codes sort the same way: ENOTFOUND/ENODATA absent, ESERVFAIL servfail, the rest ours", () => {
  assert.equal(classifyUdpError("ENOTFOUND"), "absent");
  assert.equal(classifyUdpError("ENODATA"), "absent");
  assert.equal(classifyUdpError("ESERVFAIL"), "servfail");
  for (const code of ["ECONNREFUSED", "ETIMEOUT", "EREFUSED", "ECANCELLED", undefined]) assert.equal(classifyUdpError(code), "error");
});

const doms = (n) => Array.from({ length: n }, (_, i) => `d${i}.com`);

test("the stage stops when the network collapses instead of scoring the tail absent", async () => {
  let calls = 0;
  const resolveA = async (d) => {
    calls++;
    const i = Number(d.slice(1, -4));
    if (i >= 20) return { verdict: "error", reason: "ECONNREFUSED" };
    return i % 2 ? { verdict: "resolves" } : { verdict: "absent" };
  };
  await assert.rejects(resolveAll(doms(200), resolveA, { concurrency: 1, window: 10 }), DnsStageError);
  assert.ok(calls <= 30, `stopped after ${calls} lookups`);
});

test("a few unanswered lookups get a slow retry and are recovered", async () => {
  const flaky = new Set(["d3.com", "d7.com"]);
  const resolveA = async (d) => {
    if (flaky.delete(d)) return { verdict: "error", reason: "timeout" };
    return d === "d7.com" ? { verdict: "resolves" } : { verdict: "absent" };
  };
  const out = await resolveAll(doms(300), resolveA, { concurrency: 4 });
  assert.deepEqual([...out.resolves], ["d7.com"]);
  assert.deepEqual(out.unanswered, []);
  assert.equal(out.tally.error, 0);
  assert.equal(out.tally.absent, 299);
});

test("more than 1% still unanswered after the retry refuses to return a short list", async () => {
  const resolveA = async (d) => (["d1.com", "d2.com", "d3.com"].includes(d) ? { verdict: "error", reason: "timeout" } : { verdict: "absent" });
  await assert.rejects(resolveAll(doms(100), resolveA, { concurrency: 4 }), /3 of 100 lookups never got an answer/);
  const ok = await resolveAll(doms(300), resolveA, { concurrency: 4 });
  assert.equal(ok.unanswered.length, 3);
});

test("absent and SERVFAIL are answers, not unanswered", async () => {
  const resolveA = async (d) => ({ verdict: d.endsWith("1.com") ? "servfail" : "absent", reason: "rcode 2" });
  const out = await resolveAll(doms(50), resolveA, { concurrency: 4 });
  assert.equal(out.unanswered.length, 0);
  assert.equal(out.tally.servfail, 5);
});

test("one UDP stage at a time: the second waits for the first, and a dead holder's lock is taken over", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "udp-lock-")), "lock");
  const release1 = await holdUdpLock({ path, pollMs: 5 });
  let second = false;
  const waiting = holdUdpLock({ path, pollMs: 5 }).then((r) => { second = true; return r; });
  await new Promise((s) => setTimeout(s, 40));
  assert.equal(second, false);
  release1();
  (await waiting)();
  assert.equal(second, true);
  await writeFile(path, "2147483646"); // a pid that is not running
  const release3 = await holdUdpLock({ path, pollMs: 5 });
  release3();
});
