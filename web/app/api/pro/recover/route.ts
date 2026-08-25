import { recoverPass } from "@/lib/pro";
import { sendEmail, siteOrigin } from "@/lib/alerts";
import { handleRecover } from "@/lib/proRecover";

// "Email me my access link again" — the form on /pro posts here.
//
// All of the thinking is in lib/proRecover.ts, including the reason the
// answer never varies. This file is the wiring: the real RPC, the real
// mailer, the real origin.
//
// The 503 is a property of the deployment, not of any address, so it leaks
// nothing the /pro page does not already say out loud. Both keys are needed
// to do the job at all: STRIPE_GRANT_SECRET is what 0045's pro_recover
// demands before it will hand back a token, and without Resend there is
// nowhere for that token to go.

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!process.env.STRIPE_GRANT_SECRET || !process.env.RESEND_API_KEY) {
    return Response.json({ ok: false, reason: "disabled" }, { status: 503 });
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  return handleRecover(raw, {
    recover: recoverPass,
    send: sendEmail,
    origin: siteOrigin,
  });
}
