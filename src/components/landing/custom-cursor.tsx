"use client";

import { type ReactNode, useEffect, useRef } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * Custom cursor overlay.
 *
 * This wraps the entire application tree, so it must never re-render
 * `children`. The previous implementation stored the pointer position in React
 * state and updated it on every `mousemove`, which re-rendered the whole
 * subtree — including the tenant shell and the active page — on every single
 * mouse event.
 *
 * Instead the two cursor elements are written imperatively: the pointer
 * position is coalesced into a single `requestAnimationFrame` callback and
 * applied straight to `style.transform`, so React renders this component
 * exactly once.
 */
export default function CustomCursor({ children, className = "" }: Props) {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);
  const pointer = useRef({ x: -100, y: -100 });
  const pressed = useRef(false);
  const hovering = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // The cursor is hidden on touch/small screens by CSS; skip the work there.
    if (!window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) {
      return;
    }

    const paint = () => {
      frame.current = null;
      const { x, y } = pointer.current;
      const dot = dotRef.current;
      const ring = ringRef.current;
      if (dot) {
        dot.style.transform = `translate3d(${x - 4}px, ${y - 4}px, 0) scale(${pressed.current ? 0.5 : 1})`;
      }
      if (ring) {
        const scale = hovering.current ? 1.8 : pressed.current ? 0.8 : 1;
        ring.style.transform = `translate3d(${x - 20}px, ${y - 20}px, 0) scale(${scale})`;
        ring.style.borderColor = hovering.current
          ? "rgba(3,234,188,0.6)"
          : "rgba(3,234,188,0.25)";
      }
    };

    const schedule = () => {
      if (frame.current === null) frame.current = requestAnimationFrame(paint);
    };

    const onMove = (e: globalThis.MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      schedule();
    };
    const onDown = () => {
      pressed.current = true;
      schedule();
    };
    const onUp = () => {
      pressed.current = false;
      schedule();
    };
    const onOver = (e: globalThis.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const next = !!target?.closest?.("a, button, [data-cursor-hover]");
      if (next !== hovering.current) {
        hovering.current = next;
        schedule();
      }
    };
    const onLeave = () => {
      pointer.current = { x: -100, y: -100 };
      hovering.current = false;
      pressed.current = false;
      schedule();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown, { passive: true });
    window.addEventListener("mouseup", onUp, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseleave", onLeave);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div className={className}>
      {children}
      <div
        ref={dotRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-[9999] hidden md:block will-change-transform"
        style={{ transform: "translate3d(-104px, -104px, 0)" }}
      >
        <div className="h-2 w-2 rounded-full bg-primary" />
      </div>
      <div
        ref={ringRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-[9998] hidden md:block will-change-transform"
        style={{
          transform: "translate3d(-120px, -120px, 0)",
          transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          borderRadius: "9999px",
        }}
      >
        <div
          className="h-10 w-10 rounded-full border-2"
          style={{ borderColor: "rgba(3,234,188,0.25)" }}
        />
      </div>
    </div>
  );
}
