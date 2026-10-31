"use client";

import { useEffect, useState } from "react";
import { type MyAlert, readMyAlerts, refreshMyAlerts, subscribeMyAlerts } from "./myAlerts";

/** The signed-in shopper's alerts: undefined while loading, null signed out
 *  (or unavailable), else the list. Loads once per page, like useUser. */
export function useMyAlerts(): MyAlert[] | null | undefined {
  const [alerts, setAlerts] = useState<MyAlert[] | null | undefined>(readMyAlerts());
  useEffect(() => {
    const sync = () => setAlerts(readMyAlerts());
    const off = subscribeMyAlerts(sync);
    if (readMyAlerts() === undefined) void refreshMyAlerts();
    else sync();
    return off;
  }, []);
  return alerts;
}
