"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { serviceWorkerUrl } from "@/lib/app-url";

/**
 * Registers the service worker that backs PWA install + offline support.
 * When a waiting service worker takes control after an update, reload once
 * so the tab runs the new build instead of a mix of old/new chunks.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Friendly message for any write operation attempted offline that is not
    // covered by the outbox (sales / customer txns queue themselves).
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      if (!navigator.onLine) {
        e.preventDefault();
        toast.error("لا يوجد اتصال — هذه العملية تحتاج إنترنت وستتاح عند عودته");
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;

    const onControllerChange = () => {
      if (hadController && !reloaded) {
        reloaded = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    // Scoped to this app's mount point (`/grocery` standalone, `/gm/grocery`
    // inside the platform). Registering `/sw.js` would claim the whole origin
    // with the platform's worker and reload this tab whenever it took over.
    navigator.serviceWorker.register(serviceWorkerUrl(process.env.__NEXT_ROUTER_BASEPATH)).then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
