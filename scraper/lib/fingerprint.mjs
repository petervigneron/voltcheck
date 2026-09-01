// Identify which website platform a dealer site runs on, from its homepage
// HTML. Platform → extractor strategy; one fingerprint covers thousands of
// rooftops. Signatures chosen from pages actually crawled in this project.
const SIGNATURES = [
  // DealerVenom (WordPress front end, Toyota-heavy) renders no inventory in
  // HTML — it queries a Typesense index whose client config is inline on every
  // page. lib/platforms/dealervenom.mjs pulls the collection via the search
  // API. `typesenseSearchAdapter` is the vendor's search-client init; the
  // `dealervenom` brand token is the second signal.
  { platform: "dealervenom", res: [/typesenseSearchAdapter/i, /dealervenom/i] },
  // Recharged, a single-rooftop lane: a used-EV specialist big enough to be
  // worth its own module (412 electrified cars). Anchored on a string that
  // CONTAINS its own host — its Organization JSON-LD names its logo — so it
  // cannot fire on anyone else's page, which is the precision a per-site label
  // needs. See lib/platforms/recharged.mjs.
  { platform: "recharged", res: [/https:\/\/recharged\.com\/logo\.svg/i] },
  // Ever, the same shape and for the same reason (1,130 electrified cars):
  // anchored on strings that contain its own host — its schema.org @ids and
  // its asset host. See lib/platforms/evercars.mjs.
  {
    platform: "evercars",
    res: [/evercars\.com\/#(?:organization|website|dealer-)|static\.production\.evercars\.live/i],
  },
  // DealerSync: an independents' website vendor whose rooftops serve on their
  // own apex and ship the vendor's Handlebars TEMPLATE inline — a VIN regex
  // over one of its pages finds `{{Vin}}`. Its own CDN and photo hosts are the
  // signal, never the brand word: a dealer is free to be named "… Sync".
  // lib/platforms/dealersync.mjs reads /Inventory/Search instead.
  { platform: "dealersync", res: [/\b(?:dealer-cdn|images)\.dealersync\.com/i] },
  // Vehica: a WordPress car-dealership theme. Its VDPs carry no JSON-LD at all
  // — the car is an Elementor label/value table — so the whole lot comes out of
  // WordPress's own REST API instead (lib/platforms/vehica.mjs). Anchored on
  // the theme and plugin asset paths, not the bare word, which a dealer could
  // put in its own copy.
  { platform: "vehica", res: [/wp-content\/(?:themes|plugins)\/vehica/i] },
  // OneAudi before dealer.com: Audi's own platform loads a "labels-prod…
  // /dealer.com.js" tag on inventory pages and serves some assets through
  // dealer.com hosts, so 20 of the 21 Audi rooftops that reached "working"
  // fingerprinted "dealer.com" — which sends the crawl down the DDC inventory
  // API on a site that has none. Its renderer and graph hosts are the signal.
  { platform: "oneaudi", res: [/renderer\.one\.audi|omnigraph\.audi\.com|apps\.one\.audi/i] },
  // Motive (app.ridemotive.com) before the big three: its rooftops embed
  // dealer.com pictures, Dealer Inspire widgets and DealerOn tags, and a loose
  // match on any of those beats them to the answer — subaruoftwinfalls.com and
  // mercedesbenzbrooklyn.com both fingerprinted "dealerinspire" while their
  // whole lot was in Motive's Algolia index. The signal is the platform's own
  // app hosts, not the brand name.
  { platform: "ridemotive", res: [/(?:api|assets|images|echo|bronco)\.app\.ridemotive\.com/i] },
  // Remora, also before dealer.com: their rooftops serve some images from
  // pictures.dealer.com and bozard.com fingerprinted "dealer.com" because of
  // it, which would send the crawl down the DDC inventory-API path on a site
  // that has none. Remora server-renders full schema.org Car JSON-LD on every
  // VDP, so the generic extractor handles it — this label only stops the
  // wrong one being tried. Its own hosts are the signal.
  { platform: "remora", res: [/(?:r|images)\.remorainc\.com|(?:vimg|s3|websites\.api)\.remora\.inc/i] },
  // DealerOn first: their sites often serve images from pictures.dealer.com,
  // which would false-positive the Dealer.com check (bit us on lehmers.com).
  { platform: "dealeron", res: [/dealeron-js\.aspx/i, /DealerOn/i, /searchused\.aspx/i, /sdDataLayer/] },
  // Before dealer.com: an Overfuel rooftop whose sister domain is
  // "…autodealer.com" (somersetautodealer.com) trips the loose /Dealer\.com/i
  // substring check, and Overfuel sites also serve some images from
  // pictures.dealer.com. static.overfuel.com is the specific, load-bearing
  // signal, so it wins the tie.
  { platform: "overfuel", res: [/overfuel\.com/i] },
  // dealr.cloud: server-rendered SaaS for independents; its JSON-LD carries
  // no VIN, so lib/platforms/dealrcloud.mjs reads the tile markup instead.
  { platform: "dealrcloud", res: [/cdn\.dealrcloud\.com|dealr-dealer-id/i] },
  // The 2026-08-31 dark-tail wave, all before the loose dealer.com check for
  // the Overfuel reason above: several of these vendors' rooftops load a
  // stray dealer.com-hosted image or a "DDC-" prefixed class from a widget.
  // Every signature is the vendor's own asset/app host, never a brand word.
  //
  // Dealer Spike (powersports/RV/truck rooftops). Its pages load the vendor's
  // CDN and widget hosts on every template seen.
  { platform: "dealerspike", res: [/\b(?:cdn|www)\.dealerspike\.com|\.dealerspike\.net|dealerspikeparts\.com/i] },
  // AutoCorner (small independents; ASP-era CGI backend). The one mark every
  // template shares is the vendor's script include host.
  { platform: "autocorner", res: [/js-include\.autocorner\.com/i] },
  // DealerAccelerate (classic/specialty consignment houses). Its image CDN is
  // on every tile of every rooftop seen.
  { platform: "dealeraccelerate", res: [/\bcdn(?:-dev)?\.dealeraccelerate\.(?:com|net)/i] },
  // AutoRevo. Its rooftops serve the vendor's asset host and image CDNs; the
  // bare word must NOT be the signal — Wix serializes an internal
  // "excludeFromAutoRevoke" flag on every Wix page, which is how 136 Wix
  // sites once fingerprinted as this vendor (2026-08-31 scan).
  { platform: "autorevo", res: [/autorevo-powersites\.com|(?:x-img|cf-img|vms)\.autorevo\.com/i] },
  // eBizAutos (Miami/Fort Lauderdale exotic lots). The rooftop's registry
  // domain is usually a shell that links its inventory on the vendor's host;
  // the photo CDN and the {slug}.ebizautos.com reference are the marks. Kept
  // byte-identical to ASSET_RE in lib/platforms/ebizautos.mjs (test-asserted).
  { platform: "ebizautos", res: [/\b(?:cdn|images|stockphotos)\.ebizautos\.media\b|\b[a-z0-9-]+\.ebizautos\.com\b/i] },
  // DealerFront: a WordPress-plugin template and a hosted-portal template,
  // marked by the plugin's asset path and the portal's footer credit. Never
  // data-carstory-* (CarStory is Vroom's widget, not this vendor's). Kept
  // byte-identical to MARK_RE in lib/platforms/dealerfront.mjs.
  { platform: "dealerfront", res: [/wp-content\/plugins\/dealerfront\/|powered by dealerfront\.com/i] },
  // DealerClick's Next.js product ("DealerNetwork"): the vendor's own app
  // host, its Cloudinary folder, and its image server. The page's JSON-LD is
  // escaped inside the RSC flight stream, which is why these rooftops read as
  // empty — lib/platforms/dealerclick.mjs unescapes it. Kept byte-identical
  // to MARK_RE there.
  { platform: "dealerclick", res: [/goroutes\.dealerclick\.com|dealerclick\/image\/upload|www\.dealernetwork\.com\/images\/inventory/i] },
  // ProMax (CX5 product). Its stylesheet library and inventory image server
  // are the marks; rooftops publish real per-tile Vehicle JSON-LD.
  { platform: "promax", res: [/CX5_Front_Inventory|promaxinventory\.com|www\.promaxunlimited\.com/i] },
  { platform: "dealer.com", res: [/DDC\.dataLayer/, /ddc-/i, /Dealer\.com/i] },
  { platform: "dealerinspire", res: [/dealerinspire/i, /window\.DI_/i, /di-widget/i] },
  { platform: "sincro", res: [/sincro/i, /cdk_?global/i] },
  // Most DealerFire rooftops never say "dealerfire" anywhere in their markup
  // — beavertoncarcompany.com does not — so the platform's own asset host and
  // the per-car data layer it pushes are the signatures that actually fire.
  { platform: "dealerfire", res: [/dealerfire/i, /cdn-ds\.com/i, /pushData\(\s*['"]VehicleObject_/] },
  { platform: "dealereprocess", res: [/dealereprocess/i] },
  // AutoManager WebManager: its own CDN, photo blob and admin host. Pages carry
  // no JSON-LD at all, so lib/platforms/automanager.mjs reads the SRP tiles.
  { platform: "automanager", res: [/automanagerprodcdn\.azureedge\.net|automanager\.blob\.core\.windows\.net|wm\.automanager\.com/i] },
  // AutoFunds / DealerWebsites.com — one product, two names: the pages load
  // "DW_Common" stylesheets through HttpCombiner.ashx and the footer credits
  // autofunds.com. lib/platforms/autofunds.mjs reads the whole lot out of
  // /rss.aspx (one request) and follows the VDP of the cars that could be
  // electrified for the price, fuel and condition the feed omits. The SRP is
  // robots-disallowed on these rooftops, so the feed is the only door.
  { platform: "autofunds", res: [/\bautofunds\.com|images\.autofunds\.net|HttpCombiner\.ashx\?s=DW_/i] },
  // Motorcar Marketing: a vendor that hosts its rooftops on its own apex
  // (amgmotorsllc.motorcarsites.com), which is why nothing else in this list
  // has ever seen one. No JSON-LD anywhere and the theme markup changes per
  // rooftop, so lib/platforms/motorcarsites.mjs walks /vehicle_listings and
  // reads the VDPs. Its own asset and CDN hosts are the signature — never the
  // brand word, since a dealer is free to be named "Motorcar …".
  { platform: "motorcarsites", res: [/\b(?:www\.)?motorcarsites\.com\/(?:dealers|template|img)\//i, /\bwww\.motorcarmarketing\.com\b/i] },
  { platform: "team-velocity", res: [/teamvelocityportal\.com/i, /vdpVehicleExteriorColor/] },
  // Wayne Reaves: every asset is same-origin, so the vendor's only mark on the
  // page is the footer credit that links waynereaves.com/.net. The whole lot
  // comes out of /service/inventory/website — see lib/platforms/waynereaves.mjs.
  { platform: "waynereaves", res: [/waynereaves\.(?:com|net)/i] },
  // Auto Dealers Digital: a WordPress product whose rooftops publish clean
  // JSON-LD on every VDP and a hardcoded "NewCondition" inside it, on used
  // lots. The label is what stops the generic reader taking that at face value
  // — see lib/platforms/autodealersdigital.mjs. Its CDN hosts and its theme
  // directory are the signal; never the brand words, since a dealer is free to
  // be named "Auto Dealers Digital".
  {
    platform: "autodealersdigital",
    // Kept byte-identical to VENDOR_RE in that module; test/autodealersdigital
    // .test.mjs asserts the two agree, because a fingerprint that fires where
    // the extractor does not would send the crawl down a path with no reader.
    res: [
      /\b(?:cdn-(?:thumbor|websites|chat)\.)?autodealersdigital\.com\//i,
      /\/wp-content\/themes\/website-theme-wp-v2\b/i,
      /\bwp-theme-website-theme-wp-v2\b/i,
    ],
  },
  // No JSON-LD anywhere and numeric-id VDP URLs, so nothing generic hooks it;
  // lib/platforms/dealercarsearch.mjs reads its Tealium product list instead.
  // Its data layer names the platform on every page, homepages included.
  { platform: "dealercarsearch", res: [/"site_platform":\s*"dcs"/, /dealercarsearch\.com/i] },
];

export function fingerprint(html) {
  for (const { platform, res } of SIGNATURES) {
    if (res.some((re) => re.test(html))) return platform;
  }
  return "unknown";
}
