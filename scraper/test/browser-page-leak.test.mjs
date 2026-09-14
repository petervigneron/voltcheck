import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { browserFetch, browserUnavailable, closeBrowser } from "../lib/browser.mjs";

// A page that never stops making requests must not outlive its close.
//
// The first full browser-crawl run (2026-09-13, run 34774649859) lost two of
// its ten parts to "JavaScript heap out of memory" at 4 GB after ~7,000
// loads. The heap snapshot said what the bodies could not: 574 dead pages
// after 1,045 loads, every one still holding every Request, Response and
// console message it had made, because a Route that Playwright's in-process
// server had handed to the route handler was still in the context's
// in-flight set when the page's dispatcher was disposed, and the handler's
// reply then had no object to reach. A Dealer Inspire page fires chat and
// analytics beacons for as long as it is open, so its close lost that race
// more often than not. lib/browser.mjs's closePage is the fix; this is the
// check that it stays fixed.
//
// Measured, not asserted from theory (2026-09-13, 30 loads of the page
// below): through the unfixed browserFetch the heap grew 13.4 MB — a real
// Dealer Inspire page costs ~1.5 MB when lost, this one less — and through
// the fixed one it shrank 3.6 MB, which is the noise of a GC'd heap. The
// bound sits between the two with room on both sides. About 70 seconds.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc");
const heapUsed = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};

const LOADS = 30;
const WARMUP = 4;
const MAX_GROWTH_MB = 6;

function busyServer() {
  // Many sub-resources, so a page the close fails to free costs a measurable
  // amount of heap: every request and response it made is what a dead page
  // retains. The images are aborted by the lane's own route (image requests
  // never leave the process), the scripts are served.
  const subs = Array.from({ length: 150 }, (_, k) => `<img src="/img/${k}.png"><script src="/js/${k}.js"></script>`).join("");
  const filler = `<div>${"lorem ipsum dolor sit amet ".repeat(4000)}</div>`;
  const server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("User-agent: *\nAllow: /\n");
    }
    if (req.url.startsWith("/js/")) {
      res.writeHead(200, { "content-type": "application/javascript", "x-weight": "w".repeat(4096) });
      return res.end("window.k=1;");
    }
    if (req.url.startsWith("/img/")) {
      res.writeHead(200, { "content-type": "image/png" });
      return res.end("x");
    }
    if (req.url.startsWith("/page/")) {
      res.writeHead(200, { "content-type": "text/html" });
      // The beacons are the point: a request every few ms, so a close is
      // almost certain to land with one being intercepted. Not faster than
      // this — at 3 ms the interception itself saturates the process and a
      // load takes ten seconds.
      return res.end(
        `<!doctype html><html><body>${subs}${filler}<div data-ready="1"></div><script>
          setInterval(function () { var i = new Image(); i.src = "/img/b" + Math.random() + ".png"; }, 2);
          setInterval(function () { fetch("/js/b" + Math.random()).catch(function () {}); }, 40);
        </script></body></html>`,
      );
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

test("closing a page mid-stream does not retain it", async () => {
  if (await browserUnavailable()) {
    console.log("skipping: no browser");
    return;
  }
  const server = await busyServer();
  const { port } = server.address();
  // One host, by IP. `localhost` looked like a free second host for the
  // per-host pacing and was not: every beacon tried ::1 first, and a load
  // took 30 s.
  const load = (i) => browserFetch(`http://127.0.0.1:${port}/page/${i}`, { waitFor: "[data-ready]", waitForMs: 5000, settleMs: 200 });
  try {
    for (let i = 0; i < WARMUP; i++) {
      const r = await load(i);
      assert.equal(r.status, 200, `warm-up load ${i}: ${r.status}`);
    }
    const before = heapUsed();
    for (let i = WARMUP; i < WARMUP + LOADS; i++) {
      const r = await load(i);
      assert.equal(r.status, 200, `load ${i}: ${r.status}`);
    }
    const growth = (heapUsed() - before) / 1048576;
    console.log(`heap grew ${growth.toFixed(1)} MB over ${LOADS} loads`);
    assert.ok(growth < MAX_GROWTH_MB, `heap grew ${growth.toFixed(1)} MB over ${LOADS} busy loads (bound ${MAX_GROWTH_MB} MB): closed pages are being retained`);
  } finally {
    await closeBrowser();
    server.close();
  }
});
