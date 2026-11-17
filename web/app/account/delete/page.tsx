import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";

// Where an account is deleted by the person it belongs to (migration 0123).
// Signed out, this sends you to sign in and back.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Delete account — Census",
  robots: { index: false, follow: true },
};

export default async function DeleteAccountPage() {
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    user = await currentUser();
  } catch {
    user = null;
  }
  if (!user) redirect("/account?next=%2Faccount%2Fdelete");
  return (
    <div className="mx-auto max-w-[640px] px-0 py-0 sm:px-6 sm:py-10">
      <DeleteAccountForm email={user.email} />
    </div>
  );
}
