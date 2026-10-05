"use client";

import { type ReactNode, useRef, useEffect, useState } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export default function TextReveal({ children, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      className={className}
      style={{
        display: "inline-block",
        clipPath: visible ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
        transition: "clip-path 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "clip-path",
      }}
    >
      {children}
    </span>
  );
}
