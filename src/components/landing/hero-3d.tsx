"use client";

/**
 * Official Sketchfab viewer for "Need some space?" by Loïc Norgeot,
 * driven with the Sketchfab Viewer API so we can animate the camera.
 *
 * Model: https://sketchfab.com/3d-models/need-some-space-d6521362b37b48e3a82bce4911409303
 */

import { useEffect, useRef, useState } from "react";

const MODEL_UID = "d6521362b37b48e3a82bce4911409303";
const API_SCRIPT =
  "https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js";
const LAND_DIST = 75; // absolute distance to the galaxy centre — mid view, slightly further out
const APPROACH_SECONDS = 2; // short glide to the resting frame

interface SketchfabApi {
  start(callback?: () => void): void;
  load(callback?: () => void): void;
  addEventListener(event: string, callback: () => void): void;
  getCameraLookAt(
    callback: (
      err: unknown,
      camera?: { position: number[]; target: number[] },
    ) => void,
  ): void;
  setCameraLookAt(
    position: number[],
    target: number[],
    duration?: number,
    callback?: (err: unknown) => void,
  ): void;
}

interface SketchfabClient {
  init(uid: string, options: Record<string, unknown>): void;
}

interface SketchfabConstructor {
  new (
    versionOrIframe?: string | HTMLIFrameElement,
    iframe?: HTMLIFrameElement,
  ): SketchfabClient;
}

declare global {
  interface Window {
    Sketchfab?: SketchfabConstructor;
  }
}

export default function Hero3D() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<SketchfabApi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let poll: number | undefined;
    const hideSpinner = () => {
      if (failSafe !== undefined) window.clearTimeout(failSafe);
      setLoading(false);
    };

    const failSafe = window.setTimeout(hideSpinner, 20000);

    const startPoller = (api: SketchfabApi, initDist: number) => {
      if (initDist <= 0 || disposed) return;
      poll = window.setInterval(() => {
        if (disposed) return;
        api.getCameraLookAt((err, camera) => {
          if (err || !camera || disposed) return;
          const [px, py, pz] = camera.position;
          const [tx, ty, tz] = camera.target;
          const dist = Math.sqrt(
            (px - tx) ** 2 + (py - ty) ** 2 + (pz - tz) ** 2,
          );
          window.dispatchEvent(
            new CustomEvent("herorbitclose", {
              detail: { fraction: dist / initDist, distance: dist },
            }),
          );
        });
      }, 150);
    };

    const run = () => {
      if (disposed || !window.Sketchfab || !iframeRef.current) return;
      const client = new window.Sketchfab(iframeRef.current);
      client.init(MODEL_UID, {
        autostart: 1,
        autospin: 0.2,
        ui_infos: 0,
        ui_controls: 0,
        ui_stop: 0,
        ui_watermark: 0,
        ui_help: 0,
        ui_settings: 0,
        scrollwheel: 1,
        success: (api: SketchfabApi) => {
          apiRef.current = api;
          api.start(() => {
            api.addEventListener("viewerready", () => {
              hideSpinner();
              window.setTimeout(() => {
                api.getCameraLookAt((err, camera) => {
                  if (err || !camera) return;
                  const t = camera.target;
                  const startDist = Math.sqrt(
                    camera.position.reduce(
                      (acc, p, i) => acc + (p - (t[i] ?? 0)) ** 2,
                      0,
                    ),
                  );
                  const dir = camera.position.map((p, i) => {
                    const diff = p - (t[i] ?? 0);
                    return startDist > 0 ? diff / startDist : 0;
                  });
                  const land = dir.map((d, i) => (t[i] ?? 0) + d * LAND_DIST);
                  api.setCameraLookAt(land, t, APPROACH_SECONDS);
                  startPoller(api, startDist);
                });
              }, 400);
            });
          });
        },
        error: () => hideSpinner(),
      });
    };

    const start = () => {
      if (disposed) return;
      if (!iframeRef.current) {
        window.setTimeout(start, 32);
        return;
      }
      run();
    };

    if (window.Sketchfab) {
      start();
    } else {
      const script = document.createElement("script");
      script.src = API_SCRIPT;
      script.async = true;
      script.onload = start;
      script.onerror = () => undefined;
      document.head.appendChild(script);
      return () => {
        disposed = true;
        if (poll !== undefined) window.clearInterval(poll);
        if (failSafe !== undefined) window.clearTimeout(failSafe);
        script.remove();
      };
    }

    return () => {
      disposed = true;
      if (poll !== undefined) window.clearInterval(poll);
      if (failSafe !== undefined) window.clearTimeout(failSafe);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <iframe
        ref={iframeRef}
        title="Need some space?"
        className="h-full w-full"
        allow="autoplay; fullscreen; xr-spatial-tracking; camera"
        allowFullScreen
        execution-while-out-of-viewport="true"
        execution-while-not-rendered="true"
      />
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-full border border-primary/20 bg-background/80 px-5 py-2.5 shadow-lg shadow-primary/10 backdrop-blur-md">
            <span className="relative flex h-8 w-8 items-center justify-center">
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
              <span className="absolute inset-1.5 animate-spin rounded-full border border-primary/50 border-b-primary [animation-direction:reverse]" />
              <span className="relative h-2 w-2 animate-pulse rounded-full bg-primary" />
            </span>
            <span className="whitespace-nowrap text-sm font-medium text-primary">
              جاري تحميل المجره
            </span>
          </div>
        </div>
      )}
    </div>
  );
}