"use client";

import { useEffect, useState } from "react";

// Who is signed in, for client components — the same one-fetch-per-page-load
// module cache as lib/useProState.ts. Three states: undefined while the
// answer is on its way (render the signed-out control, don't flash), then
// the email or null.
//
// Sign-in and sign-out both end in a full navigation, which is what resets
// this cache; nothing here needs to be told.

let cache: string | null | undefined;
let inflight: Promise<string | null> | null = null;

export function useUser(): string | null | undefined {
  const [email, setEmail] = useState<string | null | undefined>(cache);
  useEffect(() => {
    if (cache !== undefined) return;
    inflight ??= fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const b = (await res.json()) as { email?: unknown };
        return typeof b.email === "string" ? b.email : null;
      })
      .catch(() => null);
    let alive = true;
    inflight.then((v) => {
      cache = v;
      if (alive) setEmail(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return email;
}
