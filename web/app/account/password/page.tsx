import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { PasswordForm } from "@/components/PasswordForm";

// Choose a new password. Where a reset link lands (already signed in by
// /account/verify) and where a signed-in shopper changes theirs. Anyone
// else is sent to sign in and brought back here.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New password — Voltcheck",
  robots: { index: false, follow: true },
};

export default async function PasswordPage() {
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    user = await currentUser();
  } catch {
    user = null;
  }
  if (!user) redirect("/account?next=%2Faccount%2Fpassword");
  return (
    <div className="mx-auto max-w-[640px] px-0 py-0 sm:px-6 sm:py-10">
      <PasswordForm email={user.email} />
    </div>
  );
}
