import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The near-a-ZIP results (app/ev/[make]/[model]/near/[zip]/page.tsx) are
  // force-dynamic so they never become ISR entries — the URL space is every
  // ZIP times every model times every filter. A page component cannot set a
  // response header, so the CDN lifetime is set here: Next's page runtime
  // leaves a Cache-Control already on the response alone instead of writing
  // its dynamic `private, no-store` over it. An hour at the edge, a day of
  // stale-while-revalidate: the artifacts behind it move once a night, the
  // same posture as /api/v1/listings (lib/api/http.ts).
  //
  // Not on RSC requests (`missing: rsc`): those vary on router headers, and
  // a client-side navigation is a visitor's, not the repeat fetch this is for.
  async headers() {
    return [
      {
        source: "/ev/:make/:model/near/:zip",
        missing: [{ type: "header", key: "rsc" }],
        headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
