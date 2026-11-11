import { json, options } from "@/lib/api/http";
import { SITE } from "@/lib/api/records";

// The API's front door: where the documentation and the endpoints are, in
// JSON, for an agent that landed on /api/v1 with nothing else to go on.
export const dynamic = "force-static";

export const OPTIONS = options;
export function GET(): Response {
  return json(
    {
      name: "Census API",
      version: "1",
      openapi: `${SITE}/api/v1/openapi.json`,
      mcp: `${SITE}/api/mcp`,
      llms: `${SITE}/llms.txt`,
      endpoints: {
        listings: `${SITE}/api/v1/listings?make=Tesla&model=Model%203&zip=94110&radius_mi=50`,
        listing: `${SITE}/api/v1/listings/{vin}`,
        models: `${SITE}/api/v1/models`,
      },
      // The paid tier (lib/api/paid.ts): a data key, $29 a month, bought at /data.
      data_key: {
        about: `${SITE}/data`,
        auth: "Authorization: Bearer <key>",
        export: `${SITE}/api/v1/data/export`,
        listings: `${SITE}/api/v1/data/listings`,
        listing: `${SITE}/api/v1/data/listings/{vin}`,
      },
    },
    { maxAge: 86400 }
  );
}
