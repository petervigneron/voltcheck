import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { pullDealerOnApi } from "../lib/platforms/dealeron-api.mjs";
import { pullDealerComApi } from "../lib/platforms/dealercom-api.mjs";

// A loopback server, not the network: these two pulls page a whole rooftop and
// the property under test is how many requests they make, which no pure-function
// test can see. Everything else in this suite stays offline.
//
// The failure being locked down (2026-09-04/05): every one of the 28 DealerOn
// rooftops the crawl abandoned is a two-lot GROUP site of 4,300-12,100 cars, and
// both these pulls paged to the end whatever the clock said. crawl.mjs's wall
// (lib/wall.mjs) ends the crawl's WAIT but cannot end the loop — an abandoned
// pull goes on hitting the dealer until the process exits, and hands back
// nothing when it does, because the function never returns. So the loop has to
// stop asking on its own, keep the cars it already read, and say it is not
// complete.

// 17 characters, and unique per (page, index) so a repeated page shows up as a
// short distinct count rather than a passing test.
const vin = (page, i) => `1G1FW6S0${String(page).padStart(4, "0")}${String(i).padStart(5, "0")}`;

function lotServer({ total, pageCards, refusesPageSize = false }) {
  let requests = 0;
  const asked = [];
  const server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("User-agent: *\nAllow: /\n");
    }
    requests++;
    const q = new URL(req.url, "http://x").searchParams;
    const pn = Number(q.get("pn"));
    const pt = Number(q.get("pt"));
    asked.push(pn);
    // The real endpoint's behaviour for a page size it will not honour: 200,
    // and exactly 12 cards. Otherwise it serves page `pt` at the size asked,
    // so the slice has to be computed from pt — not from the request count,
    // which the fallback's restart makes meaningless.
    const size = refusesPageSize && pn !== 24 ? 12 : Math.min(pn, pageCards);
    const n = Math.max(0, Math.min(size, total - (pt - 1) * size));
    const body = JSON.stringify({
      Paging: { PaginationDataModel: { TotalCount: total } },
      DisplayCards: Array.from({ length: n }, (_, i) => ({
        VehicleCard: {
          VehicleVin: vin(pt, i),
          VehicleYear: 2023, VehicleMake: "Chevrolet", VehicleModel: "Bolt EV",
          VehicleCondition: "Used", VehicleFuelType: "Electric", VehicleUrl: "/x",
        },
      })),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
  return { server, requests: () => requests, asked: () => asked };
}

const listen = (server) => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));

test("the DealerOn pull stops asking at the deadline and keeps what it read", async () => {
  const { server, requests } = lotServer({ total: 12000, pageCards: 96 });
  const port = await listen(server);
  try {
    const origin = `http://127.0.0.1:${port}`;
    // Past the deadline after the first page — a 12,000-car lot is 125 pages.
    const r = await pullDealerOnApi([{ dealerId: "1", pageId: "2", origin }], origin, { deadlineAt: Date.now() + 200 });
    assert.ok(requests() < 5, `stopped early, made ${requests()} of 125 requests`);
    assert.ok(r.vehicles.length > 0, "kept the cars it had already read");
    assert.equal(r.ok, true);
    assert.equal(r.complete, false, "a pull that stopped at its deadline must never certify a complete lot");
  } finally {
    server.close();
  }
});

test("a DealerOn deadline already past makes no request at all", async () => {
  const { server, requests } = lotServer({ total: 12000, pageCards: 96 });
  const port = await listen(server);
  try {
    const origin = `http://127.0.0.1:${port}`;
    const r = await pullDealerOnApi([{ dealerId: "1", pageId: "2", origin }], origin, { deadlineAt: Date.now() - 1 });
    assert.equal(requests(), 0);
    assert.equal(r.complete, false);
  } finally {
    server.close();
  }
});

test("with no deadline the DealerOn pull still pages the lot to the end", async () => {
  const { server, requests } = lotServer({ total: 192, pageCards: 96 });
  const port = await listen(server);
  try {
    const origin = `http://127.0.0.1:${port}`;
    const r = await pullDealerOnApi([{ dealerId: "1", pageId: "2", origin }], origin);
    assert.equal(requests(), 2, "192 cars is exactly two pages at the 96 page size");
    assert.equal(r.vehicles.length, 192);
    assert.equal(r.complete, true);
  } finally {
    server.close();
  }
});

function ddcServer({ total, pageRecords }) {
  let requests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("User-agent: *\nAllow: /\n");
    }
    requests++;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        pageInfo: { totalCount: total },
        accounts: {},
        inventory: Array.from({ length: pageRecords }, (_, i) => ({
          vin: vin(requests, i),
          year: 2023, make: "Chevrolet", model: "Bolt EV", uuid: `u${requests}-${i}`,
          inventoryType: "used", link: "/x", fuelType: "Electric",
        })),
      }));
    });
  });
  return { server, requests: () => requests };
}

test("the dealer.com pull stops asking at the deadline", async () => {
  // hendrickcars.com reports 34,168 cars and sonicautomotive.com 43,914, and
  // this endpoint's pageSize really is capped at 48 — 712 and 915 requests that
  // cannot finish inside any per-domain budget.
  const { server, requests } = ddcServer({ total: 34168, pageRecords: 48 });
  const port = await listen(server);
  try {
    const origin = `http://127.0.0.1:${port}`;
    const r = await pullDealerComApi({ siteId: "x" }, origin, { deadlineAt: Date.now() + 200 });
    assert.ok(requests() < 5, `stopped early, made ${requests()} of 712 requests`);
    assert.equal(r.complete, false);
  } finally {
    server.close();
  }
});

// The guard on the page-size raise. PAGE_SIZE was verified on five rooftops;
// a sixth that quietly answers 12 to pn=96 would be paged in twelves — eight
// times more requests than the 24 this replaced — so the first page checks for
// the refusal and drops back to 24 for the rest of the lot.
test("a rooftop that refuses the page size is re-paged at 24, not in twelves", async () => {
  const { server, requests, asked } = lotServer({ total: 96, pageCards: 24, refusesPageSize: true });
  const port = await listen(server);
  try {
    const origin = `http://127.0.0.1:${port}`;
    const r = await pullDealerOnApi([{ dealerId: "1", pageId: "2", origin }], origin);
    assert.equal(asked()[0], 96, "asks for the big page first");
    assert.ok(asked().slice(1).every((n) => n === 24), `fell back to 24, asked ${asked().join(",")}`);
    assert.equal(r.vehicles.length, 96, "and still reads the whole lot");
    assert.equal(r.complete, true);
    assert.ok(requests() <= 6, `${requests()} requests, not the 8+ a twelves walk would take`);
  } finally {
    server.close();
  }
});
