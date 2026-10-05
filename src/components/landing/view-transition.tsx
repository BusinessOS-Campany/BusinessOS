"use client";

import { useEffect, useState, type ReactNode } from "react";

const EXIT_MS = 360;

interface Props {
  page: string;
  render: (page: string) => ReactNode;
}

export default function ViewTransition({ page, render }: Props) {
  const [display, setDisplay] = useState(page);
  const [anim, setAnim] = useState<"exit" | "enter">("enter");
  const [prevPage, setPrevPage] = useState(page);

  if (page !== prevPage) {
    setPrevPage(page);
    setAnim("exit");
  }

  useEffect(() => {
    if (anim !== "exit") return;
    const t = window.setTimeout(() => {
      setDisplay(page);
      setAnim("enter");
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [anim, page]);

  return (
    <div className="relative [perspective:1200px]">
      {anim === "exit" ? (
        <div className="animate-page-exit-3d">{render(display)}</div>
      ) : (
        <div key={display} className="animate-page-enter-3d">
          {render(display)}
        </div>
      )}
    </div>
  );
}