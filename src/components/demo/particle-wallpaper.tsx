"use client";

import dynamic from "next/dynamic";

const ParticleCanvas = dynamic(() => import("@/components/signin/particle-canvas"), {
  ssr: false,
});

/**
 * The /demo particle wallpaper, exported through a client boundary so a Server
 * Component can use it. `next/dynamic` refuses `ssr: false` inside a Server
 * Component, which is why this indirection exists rather than importing the
 * canvas directly.
 *
 * Counts are lower than the short signin/signup screens: this sits behind a
 * long, dense grid, and the canvas's connection-line pass is O(n²) per frame.
 */
export function ParticleWallpaper({
  count = 60,
  intensity = 0.6,
}: {
  count?: number;
  intensity?: number;
}) {
  return <ParticleCanvas count={count} intensity={intensity} />;
}