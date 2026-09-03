"use client";

import Link from "next/link";
import { useUser } from "@/lib/useUser";

// The header's account link: "Sign in" for a visitor, "Account" for someone
// signed in. Reads lib/useUser.ts, so it says "Sign in" for the instant
// before the answer arrives — a signed-in shopper sees it flip once per
// page load, which beats the alternative of reading the cookie in the root
// layout and making every page on the site dynamic for one word.

export function AccountLink() {
  const email = useUser();
  return (
    <Link
      href="/account"
      className="flex items-center px-3 hover:bg-cobalt sm:px-5 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
    >
      {email ? "Account" : "Sign in"}
    </Link>
  );
}
