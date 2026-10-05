"use client";

import { useEffect, useRef } from "react";

const REVEAL_SELECTOR = "[data-reveal]";

/** Viewport fraction an element must reach before it counts as "already on screen". */
const ON_SCREEN_RATIO = 0.9;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scroll reveal for a whole subtree, driven by ONE IntersectionObserver.
 *
 * Why not the landing page's `<ScrollReveal>`: that component mounts an
 * observer and three inline styles per instance, and the /demo catalog renders
 * 173 cards. Here a single observer watches every `[data-reveal]` descendant, so
 * the cost is one observer no matter how long the list is.
 *
 * Behaviour that keeps it robust:
 *  - Nothing is hidden at first paint. The hidden class is only added to
 *    elements that START below the fold (measured synchronously), so anything
 *    already on screen — and every element when JS or motion is unavailable —
 *    renders immediately with no flash and no invisible content.
 *  - The pass re-runs on every render and is self-healing: an element that is
 *    in view is always revealed, so an observer disconnect (or a filter change
 *    that remounts cards) can never strand a card at `opacity: 0`.
 *  - `prefers-reduced-motion` skips the whole mechanism.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion()) return;

    const belowFold: HTMLElement[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)) {
      if (el.classList.contains("is-revealed")) continue;
      if (el.getBoundingClientRect().top < window.innerHeight * ON_SCREEN_RATIO) {
        el.classList.remove("reveal-item");
        el.classList.add("is-revealed");
        continue;
      }
      el.classList.add("reveal-item");
      belowFold.push(el);
    }
    if (belowFold.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.add("is-revealed");
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 },
    );

    for (const el of belowFold) observer.observe(el);
    return () => observer.disconnect();
  });

  return ref;
}

/**
 * Writes the pointer position of a hovered `[data-spotlight]` element as
 * `--mx`/`--my` custom properties. One delegated listener per grid instead of
 * per-card handlers.
 */
export function spotlightFromEvent(event: React.PointerEvent<HTMLElement>): void {
  if (event.pointerType !== "mouse") return;
  const card = (event.target as HTMLElement).closest<HTMLElement>("[data-spotlight]");
  if (!card) return;
  const rect = card.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  card.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  card.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

/** Stagger step (ms) for a grid item, capped so long rows never crawl. */
export function revealDelay(index: number, step = 60, cap = 6): string {
  return `${Math.min(index, cap) * step}ms`;
}
