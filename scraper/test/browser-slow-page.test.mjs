import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { browserFetch, closeBrowser } from "../lib/browser.mjs";

// A Dealer Inspire rooftop serves its cars and then never finishes loading.
//
// Measured 2026-09-10 on the sixteen California rooftops that had hit the
// previous day's crawl deadline: dgdg.com committed its used-vehicles
// response in 485 ms with 41 `data-vehicle` blobs — its whole first page of
// cars — already in the HTML, and did not fire `domcontentloaded` inside
// 45 s. `page.goto` hands back a response only if its wait completes, so the
// lane recorded six of the eight rooftops in that wave as "no SRP answered
// … error:TimeoutError" — a served lot of 359, 198, 155, 202, 57 and 62 cars
// read as no lot at all, which is the worst shape a crawl bug can take here
// (it is indistinguishable from a dead rooftop).
//
// The blocker is a DEFERRED script, which is why the body is complete and the
// event still never comes: the parser reaches the end of the document, so
// `page.content()` has every card, and `domcontentloaded` waits on a defer
// that is still in flight. That is what this server reproduces.
function hangingServer() {
  const held = [];
  const server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (req.url === "/hang") {
      // Answered, never finished — the deferred script that holds the event.
      res.writeHead(200, { "content-type": "application/javascript" });
      held.push(res);
      return;
    }
    if (req.url === "/dead") {
      req.socket.destroy(); // nothing served at all
      return;
    }
    if (req.url === "/redirected") {
      // Every Dealer Inspire SRP path redirects once before it serves.
      res.writeHead(301, { location: "/used-vehicles/" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<!doctype html><html><head><script defer src="/hang"></script></head>` +
        `<body><div class="vehicle" data-vin="1FT6W1EV3PWG00001">Lightning</div></body></html>`
    );
  });
  server.unref();
  return { server, held };
}

test("a page that served its cars and never fired domcontentloaded is read, not thrown away", async (t) => {
  const { server, held } = hangingServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const r = await browserFetch(`http://127.0.0.1:${port}/used-vehicles/`, { timeoutMs: 2000, settleMs: 50 });
    if (r.status === "browser_unavailable") return t.skip("no Playwright browser on this machine");
    // The navigation's own response, recorded as it landed rather than
    // returned by a goto that never resolved.
    assert.equal(r.status, 200);
    assert.match(r.body ?? "", /data-vin="1FT6W1EV3PWG00001"/);
  } finally {
    for (const res of held) res.destroy();
    server.close();
  }
});

test("the status is the page that served the cars, not the redirect that pointed at it", async (t) => {
  const { server, held } = hangingServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const r = await browserFetch(`http://127.0.0.1:${port}/redirected`, { timeoutMs: 2000, settleMs: 50 });
    if (r.status === "browser_unavailable") return t.skip("no Playwright browser on this machine");
    // Reading the FIRST navigation response instead of the last reported 301
    // for eight of the sixteen rooftops on 2026-09-10 and the lane, which
    // takes a non-200 as no lot, threw all eight away.
    assert.equal(r.status, 200);
    assert.match(r.body ?? "", /data-vin="1FT6W1EV3PWG00001"/);
  } finally {
    for (const res of held) res.destroy();
    server.close();
  }
});

test("nothing served is still an error — the timeout is forgiven, a dead socket is not", async (t) => {
  const { server, held } = hangingServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const r = await browserFetch(`http://127.0.0.1:${port}/dead`, { timeoutMs: 2000, settleMs: 50 });
    if (r.status === "browser_unavailable") return t.skip("no Playwright browser on this machine");
    // The control the forgiveness above needs: a rooftop whose host is gone
    // must keep its `error:` status, or lib/browser.mjs's alternate-host
    // retry stops firing and crawl.mjs stops calling the visit partial.
    assert.equal(typeof r.status, "string");
    assert.match(r.status, /^error:/);
    assert.equal(r.body, null);
  } finally {
    for (const res of held) res.destroy();
    server.close();
  }
});

test.after(async () => {
  await closeBrowser();
});
