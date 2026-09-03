import type { Metadata } from "next";
import { ForgotForm } from "@/components/ForgotForm";

// "Forgot your password?": an address, and a reset link goes to it if an
// account exists. The page says the same thing whichever is true.

export const metadata: Metadata = {
  title: "Reset your password — Voltcheck",
  robots: { index: false, follow: true },
};

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-[640px] px-0 py-0 sm:px-6 sm:py-10">
      <ForgotForm />
    </div>
  );
}
