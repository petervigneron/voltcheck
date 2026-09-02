// Which website vendor serves a rooftop, read from DNS — no HTTP request.
//
// The 2026-09-02 walled-independents recon (docs/wall-clusters-2026-09-02.md)
// clustered 2,495 rooftops that 403 our fetcher on every path by their CNAME
// chains and ASNs, and 97% of them were four vendors. A rooftop whose
// homepage is a firewall page cannot be fingerprinted from the page — that
// is the whole problem — but its www CNAME says who serves it:
//
//   www.faricykia.com        → pod40.dealerinspire.com          (Dealer Inspire)
//   www.themountainhyundai.com → saas.www.dealereprocess.org    (DealerEProcess)
//   www.jordanmotors.co      → alpha.dcdws.net → dealers.dealercenterwebsite.net.cdn.cloudflare.net
//                                                                (DealerCenter Web Sites; dcdws is
//                                                                 DealerCenter, NOT dealer.com)
//
// These are the vendors' OWN hosts, never a brand word in the dealer's
// domain (the AutoRevoke lesson in lib/fingerprint.mjs). 105 Dealer Inspire
// rooftops have no CNAME and sit as bare A records in Cars Commerce's ASN
// (74.119.99.0/24); those are caught by IP prefix. A rooftop with none of
// these marks is null, and the caller treats null as "not a browser-lane
// vendor", never as a guess.
import dns from "node:dns/promises";

const resolver = new dns.Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const VENDOR_CNAME = [
  ["dealerinspire", /\.dealerinspire\.com$/i],
  ["dealereprocess", /\.dealereprocess\.org$/i],
  ["dealercenter", /\.dcdws\.net$|\.dealercenterwebsite\.net(\.cdn\.cloudflare\.net)?$/i],
];
// Cars Commerce (Dealer Inspire's owner) — the only vendor here that also
// serves rooftops with no CNAME at all. Measured on 2026-09-02: every one of
// the 105 CNAME-less rooftops in the Dealer Inspire cluster sat in this /24.
const DEALERINSPIRE_PREFIX = /^74\.119\.99\./;

const cache = new Map();

/** Pure classifier, exported for tests: vendor for a CNAME chain + A records. */
export function vendorFromDns({ chain = [], a = [] }) {
  for (const host of chain) for (const [vendor, re] of VENDOR_CNAME) if (re.test(host.replace(/\.$/, ""))) return vendor;
  if (a.some((ip) => DEALERINSPIRE_PREFIX.test(ip))) return "dealerinspire";
  return null;
}

async function cnameChain(host) {
  const chain = [];
  let h = host;
  for (let i = 0; i < 6; i++) {
    let c;
    try {
      c = await resolver.resolveCname(h);
    } catch {
      break;
    }
    if (!c?.length) break;
    chain.push(c[0]);
    h = c[0];
  }
  return chain;
}

/** "dealerinspire" | "dealereprocess" | "dealercenter" | null, from DNS only. Cached per process. */
export async function vendorByDns(domain) {
  const d = String(domain ?? "").toLowerCase().replace(/^www\./, "");
  if (!d) return null;
  if (cache.has(d)) return cache.get(d);
  const p = (async () => {
    const chain = [...(await cnameChain(`www.${d}`)), ...(await cnameChain(d))];
    let a = [];
    try {
      a = await resolver.resolve4(`www.${d}`);
    } catch {
      try {
        a = await resolver.resolve4(d);
      } catch {}
    }
    return vendorFromDns({ chain, a });
  })().catch(() => null);
  cache.set(d, p);
  return p;
}
