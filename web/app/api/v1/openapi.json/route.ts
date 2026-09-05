import { json, options } from "@/lib/api/http";
import { OPENAPI } from "@/lib/api/openapi";

export const dynamic = "force-static";

export const OPTIONS = options;
export function GET(): Response {
  return json(OPENAPI, { maxAge: 86400 });
}
