"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  className?: string;
}

export default function SplitText({ text, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
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

  const words = text.split(" ");

  return (
    <div ref={ref} className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={i}
          className="inline-block"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 60}ms`,
            display: "inline-block",
            marginLeft: "0.25em",
          }}
        >
          {word}
        </span>
      ))}
    </div>
  );
}
