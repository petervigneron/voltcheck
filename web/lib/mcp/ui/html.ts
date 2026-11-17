// The connector's in-chat card (MCP Apps): one HTML document, returned by
// resources/read for CARD_URI, that Claude renders under a search_listings
// call as a horizontal carousel of up to eight cars.
//
// ---------------------------------------------------------------- README
//
// STATUS: OFF for the published connector. Only a server built with
// `ui: true` (lib/mcp/endpoint.ts) lists the resource and points
// search_listings at it; that server answers at
//
//     https://censusev.com/api/mcp/ui      (its own address)
//     https://censusev.com/api/mcp?ui=1    (the same server, by query)
//
// and /api/mcp without the query is byte for byte what it was before this
// existed (tests/mcp-ui.test.ts pins it).
//
// TO TEST: in Claude (web, desktop, phone), Customize > Connectors > add a
// custom connector by URL, https://censusev.com/api/mcp/ui. Prefer that to
// the ?ui=1 form: Claude's docs say it ignores the query string when it
// matches a custom connector's address to a directory listing, so ?ui=1 can
// be taken for the published listing (claude.com/docs/connectors/building/
// mcp-apps/embedded-sites, "Allowed origins in a custom connector"). Ask for
// cars ("used Ioniq 5 under $30k near 97201"), allow the app when Claude
// asks, and check: the card appears under the tool call; light and dark;
// photos load (from /img/<vin>) and a car without one shows the plain block;
// "View on Census EV" opens our listing page (a custom connector always
// shows Claude's "Open external link" prompt first, by design); one- and
// two-result searches; a search with no matches; the phone's safe area.
// To inspect the frame: Claude Desktop > Help > Troubleshooting > Enable
// Developer Mode, then Cmd+Option+I; iOS via Safari's Web Inspector.
//
// BEFORE IT IS SWITCHED ON BY DEFAULT (by building /api/mcp's default server
// with ui: true):
//   1. The directory listing declares the allowed link URI
//      https://censusev.com (submission portal, "Allowed link URIs"), so the
//      card's one link opens without Claude's confirmation prompt.
//   2. The listing carries 3 to 5 PNG screenshots of the card, at least
//      1000px wide, cropped to the app response without the prompt, each
//      with its prompt text supplied separately (claude.com/docs/connectors/
//      building/submission, "Carousel screenshots for MCP Apps").
//   3. /mcp, /privacy and llms.txt say the connector shows cards and that
//      photos are fetched through censusev.com/img.
//   4. Someone has looked at it in Claude on web, desktop and a phone.
// ------------------------------------------------------------------------
//
// How the document is made. The MCP Apps in-frame client (the `App` class:
// the ui/initialize handshake, ui/notifications/tool-result, ui/open-link,
// size reporting) is @modelcontextprotocol/ext-apps's own prebuilt bundle,
// vendored byte for byte in ext-apps-app-with-deps.ts and inlined here, since
// Claude's docs say to bundle or self-host it in production rather than load
// it from a CDN, and an inline script needs no CSP entry. Its trailing
// `export {...}` clause is cut and the three names this uses are bound from
// it; nothing else in it is touched. Everything else is below, and the
// document asks the network for nothing but https://censusev.com/img/<vin>.
//
// Rules this follows (claude.com/docs/connectors/building/mcp-apps/
// design-guidelines): 3 to 8 items with an image, a title, at most three
// lines of metadata and one call to action; the host's style variables for
// every colour, font size and radius, with system colours (Canvas,
// CanvasText) as the only fallback outside a host; light and dark through the
// host's theme; safe-area insets as padding and scroll-padding; 44px tap
// targets; no vertical scroll of its own; no menus; a skeleton until the
// result arrives. Every value reaches the DOM through textContent or
// setAttribute, never as markup. Copy is labels only (CLAUDE.md, the house
// rule on copy): a missing price prints nothing, not "No price".

import { SITE } from "@/lib/api/records";
import { CARD_MAX } from "./card";
import { EXT_APPS_APP_WITH_DEPS } from "./ext-apps-app-with-deps";

/** The ext-apps bundle as a classic block of module code: its export clause
 *  removed, the names this document uses bound to one constant. Throws at
 *  module load if a future bundle is shaped differently, so a bad upgrade
 *  fails the tests rather than a card. */
export function inlineClient(src: string, names: string[]): string {
  if (/<\/script|<!--/i.test(src)) throw new Error("ext-apps bundle contains a sequence that would end an inline script");
  const m = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(src);
  if (!m) throw new Error("ext-apps bundle: no trailing export clause");
  const exported = new Map<string, string>();
  for (const part of m[1].split(",")) {
    const bits = part.trim().split(/\s+/);
    if (bits.length === 1 && bits[0]) exported.set(bits[0], bits[0]);
    else if (bits.length === 3 && bits[1] === "as") exported.set(bits[2], bits[0]);
  }
  const bound = names.map((n) => {
    const local = exported.get(n);
    if (!local) throw new Error(`ext-apps bundle: no export named ${n}`);
    return `${n}:${local}`;
  });
  return `${src.slice(0, m.index)}\nconst __censusExtApps={${bound.join(",")}};\n`;
}

const CSS = `
:root{--sa-t:0px;--sa-r:0px;--sa-b:0px;--sa-l:0px}
html,body{margin:0;background:transparent}
body{font-family:var(--font-sans,system-ui,sans-serif);color:var(--color-text-primary,CanvasText);font-size:var(--font-text-sm-size,14px);line-height:var(--font-text-sm-line-height,1.4);-webkit-text-size-adjust:100%}
[hidden]{display:none!important}
.wrap{padding:calc(var(--sa-t) + 4px) 0 calc(var(--sa-b) + 4px)}
.row{display:flex;gap:12px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;padding:2px calc(var(--sa-r) + 2px) 6px calc(var(--sa-l) + 2px);scroll-padding-inline:calc(var(--sa-l) + 2px) calc(var(--sa-r) + 2px);scrollbar-width:thin}
.card{flex:0 0 auto;width:clamp(200px,72vw,248px);scroll-snap-align:start;display:flex;flex-direction:column;background:var(--color-background-primary,Canvas);border:var(--border-width-regular,1px) solid var(--color-border-tertiary,color-mix(in srgb,CanvasText 15%,transparent));border-radius:var(--border-radius-lg,10px);overflow:hidden}
.photo{position:relative;aspect-ratio:4/3;background:var(--color-background-secondary,color-mix(in srgb,CanvasText 6%,transparent))}
.photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.body{display:flex;flex-direction:column;flex:1;padding:10px 12px 12px}
.title{margin:0 0 4px;font-size:var(--font-heading-sm-size,14px);line-height:var(--font-heading-sm-line-height,1.4);font-weight:var(--font-weight-semibold,600);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:calc(2em * var(--font-heading-sm-line-height,1.4))}
.meta{margin:0;min-height:calc(1em * var(--font-text-sm-line-height,1.4));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--color-text-secondary,CanvasText)}
.meta.price{color:var(--color-text-primary,CanvasText);font-weight:var(--font-weight-semibold,600)}
.act{margin-top:auto;padding-top:12px}
.cta{display:block;width:100%;min-height:44px;padding:0 12px;border:0;border-radius:var(--border-radius-md,8px);background:var(--color-background-inverse,CanvasText);color:var(--color-text-inverse,Canvas);font:inherit;font-weight:var(--font-weight-medium,500);cursor:pointer}
.cta:focus-visible{outline:2px solid var(--color-ring-primary,Highlight);outline-offset:2px}
.foot{margin:0;padding:6px calc(var(--sa-r) + 2px) 0 calc(var(--sa-l) + 2px);color:var(--color-text-tertiary,GrayText);font-size:var(--font-text-xs-size,12px);line-height:var(--font-text-xs-line-height,1.4)}
.bar{height:.9em;margin:.3em 0;border-radius:var(--border-radius-xs,4px);background:var(--color-background-secondary,color-mix(in srgb,CanvasText 8%,transparent))}
.bar.w1{width:85%}.bar.w2{width:55%}.bar.w3{width:70%}.bar.w4{width:60%}
.skel .cta{background:var(--color-background-secondary,color-mix(in srgb,CanvasText 8%,transparent))}
.skel{animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.skel{animation:none}}
`;

// The document's own script. Plain ES2020, no template literals (it lives in
// one), no markup sinks: tests/mcp-ui.test.ts fails on innerHTML,
// outerHTML, insertAdjacentHTML or document.write anywhere in the document.
const SCRIPT = `
{
  const SITE = ${JSON.stringify(SITE)};
  const IMG_PREFIX = SITE + "/img/";
  const PAGE_PREFIX = SITE + "/";
  const MAX = ${CARD_MAX};
  const E = __censusExtApps;
  const nf = new Intl.NumberFormat("en-US");
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const wrap = document.getElementById("wrap");
  const row = document.getElementById("row");
  const foot = document.getElementById("foot");

  const el = function (tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null && text !== "") n.textContent = String(text);
    return n;
  };
  const num = function (x) { return typeof x === "number" && isFinite(x) ? x : undefined; };
  const str = function (x) { return typeof x === "string" ? x : ""; };

  const skeleton = function () {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const c = el("div", "card skel");
      c.setAttribute("aria-hidden", "true");
      c.appendChild(el("div", "photo"));
      const b = el("div", "body");
      b.appendChild(el("div", "bar w1"));
      b.appendChild(el("div", "bar w2"));
      b.appendChild(el("div", "bar w3"));
      b.appendChild(el("div", "bar w4"));
      const a = el("div", "act");
      a.appendChild(el("div", "cta"));
      b.appendChild(a);
      c.appendChild(b);
      out.push(c);
    }
    row.replaceChildren.apply(row, out);
    row.setAttribute("aria-busy", "true");
  };

  const open = function (url) {
    if (typeof url !== "string" || url.indexOf(PAGE_PREFIX) !== 0) return;
    try { app.openLink({ url: url }).catch(function () {}); } catch (e) { /* host refused */ }
  };

  const place = function (car) {
    const loc = car.location || {};
    const city = str(loc.city), state = str(loc.state);
    return city && state ? city + ", " + state : city || state;
  };

  const lines = function (car) {
    const price = num(car.price_usd);
    const miles = num(car.mileage);
    const dist = num(car.distance_mi);
    const second = [];
    if (miles !== undefined) second.push(nf.format(miles) + " mi");
    const p = place(car);
    if (p) second.push(p);
    if (dist !== undefined) second.push(nf.format(dist) + " mi away");
    const third = [];
    const range = num(car.range_mi);
    if (range !== undefined) third.push(nf.format(range) + " mi " + (car.range_electric_only ? "electric range" : "range") + (car.range_estimated ? " (est.)" : ""));
    const kwh = num(car.battery_kwh);
    if (kwh !== undefined) third.push(nf.format(kwh) + " kWh" + (car.battery_estimated ? " (est.)" : ""));
    return [price !== undefined ? usd.format(price) : "", second.join(" \\u00b7 "), third.join(" \\u00b7 ")];
  };

  const card = function (car) {
    const title = str(car.title);
    const c = el("article", "card");
    const photo = el("div", "photo");
    const img = str(car.image);
    if (img.indexOf(IMG_PREFIX) === 0) {
      const i = document.createElement("img");
      i.setAttribute("alt", title);
      i.setAttribute("loading", "lazy");
      i.setAttribute("decoding", "async");
      i.setAttribute("referrerpolicy", "no-referrer");
      i.addEventListener("error", function () { i.remove(); });
      i.setAttribute("src", img);
      photo.appendChild(i);
    }
    c.appendChild(photo);
    const b = el("div", "body");
    b.appendChild(el("h3", "title", title));
    const l = lines(car);
    b.appendChild(el("p", "meta price", l[0]));
    b.appendChild(el("p", "meta", l[1]));
    b.appendChild(el("p", "meta", l[2]));
    const a = el("div", "act");
    const btn = el("button", "cta", "View on Census EV");
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-label", "View " + title + " on Census EV");
    const url = str(car.url);
    btn.addEventListener("click", function () { open(url); });
    a.appendChild(btn);
    b.appendChild(a);
    c.appendChild(b);
    return c;
  };

  const asOf = function (iso) {
    const d = new Date(str(iso));
    return isNaN(d.getTime()) ? "" : "as of " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const render = function (result) {
    const sc = result && !result.isError ? result.structuredContent : undefined;
    if (!sc || !Array.isArray(sc.cars)) { wrap.hidden = true; return; }
    const cars = sc.cars.filter(function (c) { return c && typeof c === "object"; }).slice(0, MAX);
    row.removeAttribute("aria-busy");
    row.replaceChildren.apply(row, cars.map(card));
    row.hidden = cars.length === 0;
    const total = num(sc.total);
    const parts = [];
    if (total !== undefined) parts.push(nf.format(total) + (total === 1 ? " match" : " matches"));
    const when = asOf(sc.as_of);
    if (when) parts.push(when);
    parts.push("Census EV");
    foot.textContent = parts.join(" \\u00b7 ");
    foot.hidden = false;
    wrap.hidden = false;
  };

  const insets = function (i) {
    if (!i || typeof i !== "object") return;
    const root = document.documentElement.style;
    const px = function (v) { const n = num(v); return (n === undefined ? 0 : Math.max(0, Math.min(200, n))) + "px"; };
    root.setProperty("--sa-t", px(i.top));
    root.setProperty("--sa-r", px(i.right));
    root.setProperty("--sa-b", px(i.bottom));
    root.setProperty("--sa-l", px(i.left));
  };

  const context = function (ctx) {
    if (!ctx) return;
    try { if (ctx.theme) E.applyDocumentTheme(ctx.theme); } catch (e) { /* keep the fallbacks */ }
    try { if (ctx.styles && ctx.styles.variables) E.applyHostStyleVariables(ctx.styles.variables); } catch (e) { /* keep the fallbacks */ }
    if (ctx.safeAreaInsets) insets(ctx.safeAreaInsets);
  };

  skeleton();
  const app = new E.App({ name: "Census EV cars", version: "1.0.0" });
  // Handlers before connect(), so the first notifications are not missed.
  app.ontoolresult = render;
  app.ontoolcancelled = function () { wrap.hidden = true; };
  app.onhostcontextchanged = context;
  app.connect().then(function () { context(app.getHostContext()); }).catch(function () {});
}
`;

const BODY = `<div class="wrap" id="wrap"><section class="row" id="row" aria-label="Cars"></section><p class="foot" id="foot" hidden></p></div>`;

/** The card document. Built once, at module load. */
export const CARD_HTML = [
  "<!doctype html>",
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta name="color-scheme" content="light dark">',
  "<title>Census EV</title>",
  `<style>${CSS}</style></head><body>`,
  BODY,
  `<script type="module">${inlineClient(EXT_APPS_APP_WITH_DEPS, ["App", "applyDocumentTheme", "applyHostStyleVariables"])}${SCRIPT}</script>`,
  "</body></html>",
].join("\n");

/** What this document added to the vendored client, for the tests: every
 *  byte of the page that is ours. */
export const CARD_OWN_PARTS = { CSS, SCRIPT, BODY };
