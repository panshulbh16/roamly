"use client";

import { useEffect } from "react";

/** Registers the service worker so Roamly is installable. No-op where unsupported. */
export function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* ignore */ });
    }
  }, []);
  return null;
}
