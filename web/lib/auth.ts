import { cookies } from "next/headers";
import { AT_COOKIE, decodeJwt } from "./authCore";

// Accounts, the request-bound half: who is signed in on THIS request. Reads
// the cookie proxy.ts has already refreshed. Everything else — the GoTrue
// calls, the cookie builders, the JWT reader — is lib/authCore.ts, kept free
// of next/headers so the proxy and the tests can import it.

export * from "./authCore";

export interface CurrentUser {
  id: string;
  email: string;
  /** The access token, for PostgREST calls the account authorises. */
  jwt: string;
}

/** Who is signed in on this request, or null. Reads the cookie the proxy
 *  has already refreshed; an access token that is nonetheless expired reads
 *  as signed out rather than as a stale identity. */
export async function currentUser(): Promise<CurrentUser | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(AT_COOKIE)?.value;
  } catch {
    return null;
  }
  const claims = decodeJwt(token);
  if (!token || !claims || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  return { id: claims.sub, email: claims.email, jwt: token };
}

