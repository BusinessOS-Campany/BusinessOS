"use client";

import { useEffect, useState } from "react";

/**
 * Shows a toast when a new service worker is installed and waiting to activate.
 * Clicking "Update" triggers skipWaiting + reload.
 */
export function SwUpdateToast() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) setWaiting(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(sw);
          }
        });
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] bg-neutral-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 text-sm md:bottom-4"
    >
      <span>تحديث متاح</span>
      <button
        onClick={() => {
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
        className="bg-white text-neutral-900 font-medium px-3 py-1 rounded text-xs min-h-[32px] min-w-[44px]"
      >
        Update
      </button>
    </div>
  );
}
