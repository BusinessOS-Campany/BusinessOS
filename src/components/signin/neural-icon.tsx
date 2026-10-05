"use client";

import { useEffect, useState } from "react";

export default function NeuralIcon() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative mx-auto mb-8 flex h-20 w-20 items-center justify-center" aria-hidden="true">
      {/* Outer ring - slow rotation */}
      <div
        className="absolute inset-0 rounded-full border border-primary/20"
        style={{
          animation: mounted ? "spin 20s linear infinite" : "none",
        }}
      />

      {/* Middle ring - counter rotation */}
      <div
        className="absolute inset-2 rounded-full border border-primary/15"
        style={{
          animation: mounted ? "spin 14s linear infinite reverse" : "none",
        }}
      />

      {/* Inner ring */}
      <div
        className="absolute inset-4 rounded-full border border-primary/10"
        style={{
          animation: mounted ? "spin 24s linear infinite" : "none",
        }}
      />

      {/* Glow background */}
      <div className="absolute inset-3 rounded-full bg-primary/5 blur-sm" />

      {/* Core glow pulse */}
      <div
        className="absolute inset-6 rounded-full bg-primary/10"
        style={{
          animation: mounted
            ? "pulse 3s ease-in-out infinite"
            : "none",
        }}
      />

      {/* Center icon */}
      <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 shadow-lg shadow-primary/20">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-primary"
        >
          <path d="M12 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4z" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <circle cx="12" cy="9" r="1" fill="currentColor" />
        </svg>
      </div>

      {/* Orbiting dot 1 */}
      {mounted && (
        <div
          className="absolute inset-0"
          style={{ animation: "spin 8s linear infinite" }}
        >
          <div className="absolute -top-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary/40" />
        </div>
      )}

      {/* Orbiting dot 2 */}
      {mounted && (
        <div
          className="absolute inset-1"
          style={{ animation: "spin 12s linear infinite reverse" }}
        >
          <div className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary/30" />
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
