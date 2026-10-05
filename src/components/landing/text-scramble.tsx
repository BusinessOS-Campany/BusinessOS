"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  className?: string;
  tag?: "h1" | "h2" | "h3" | "p" | "span";
  speed?: number;
  triggerOnScroll?: boolean;
}

const ARABIC_CHARS = "ابتثجحخدذرزسشصضطظعغفقكلمنهويءآأؤإئًٌَُِّْ٠١٢٣٤٥٦٧٨٩";
const LATIN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ALL_CHARS = ARABIC_CHARS + LATIN_CHARS;

export default function TextScramble({
  text,
  className = "",
  tag: Tag = "span",
  speed = 30,
  triggerOnScroll = true,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [display, setDisplay] = useState(triggerOnScroll ? "" : text);
  const hasAnimated = useRef(false);

  const animate = () => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const chars = text.split("");
    const maxSteps = 20;
    let step = 0;

    const interval = setInterval(() => {
      const progress = step / maxSteps;
      const revealed = Math.floor(progress * chars.length);

      const result = chars
        .map((char, i) => {
          if (i < revealed) return char;
          if (char === " ") return " ";
          return ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)];
        })
        .join("");

      setDisplay(result);
      step++;

      if (step > maxSteps) {
        clearInterval(interval);
        setDisplay(text);
      }
    }, speed);
  };

  useEffect(() => {
    if (!triggerOnScroll) {
      animate();
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animate();
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [text, triggerOnScroll, speed]);

  // @ts-expect-error dynamic tag
  return <Tag ref={ref} className={className}>{display}</Tag>;
}
