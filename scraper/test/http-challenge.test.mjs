// fetchRaw's challenge handling: a bot wall served with a 200 (Motive's rate
// challenge, the F5 interstitial) is re-asked with backoff and, if it holds,
// answered as `status: "challenge"` — never handed to a caller as a body it
// would read as an empty dealer. The retry cadence is real time in
// production (3 s / 8 s); the tests inject a 1 ms schedule, which exercises
// the same loop. Each test uses its own hostname so the per-host politeness
// interval doesn't couple them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRaw } from "../lib/http.mjs";

const WALL =
  '<html><head><title>Checking your browser - reCAPTCHA</title></head>' +
  '<body><script src="/recaptcha/challengepage.js"></script></body></html>';
const PAGE = "<html><head><title>Used Cars</title></head><body>Inventory</body></html>";

const page = (body) => new Response(body, { status: 200, headers: { "content-type": "text/html" } });

async function withFetchScript(bodies, fn) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => page(bodies[Math.min(calls++, bodies.length - 1)]);
  try {
    return { result: await fn(), calls };
  } finally {
    globalThis.fetch = real;
  }
}

test("a challenge that clears on the retry hands back the real page", async () => {
  const { result, calls } = await withFetchScript([WALL, PAGE], () =>
    fetchRaw("https://retry.example/inventory/", { challengeBackoffMs: [1, 1] })
  );
  assert.equal(result.status, 200);
  assert.equal(result.body, PAGE);
  assert.equal(calls, 2);
});

test("a wall that holds through both retries answers status challenge, not a body", async () => {
  const { result, calls } = await withFetchScript([WALL], () =>
    fetchRaw("https://walled.example/inventory/", { challengeBackoffMs: [1, 1] })
  );
  assert.equal(result.status, "challenge");
  assert.equal(result.body, null);
  assert.equal(calls, 3); // first ask + the two backed-off retries, then stop
});

test("an ordinary page is not retried", async () => {
  const { result, calls } = await withFetchScript([PAGE], () =>
    fetchRaw("https://plain.example/", { challengeBackoffMs: [1, 1] })
  );
  assert.equal(result.status, 200);
  assert.equal(result.body, PAGE);
  assert.equal(calls, 1);
});
