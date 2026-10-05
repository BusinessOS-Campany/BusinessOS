"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
}

interface ParticleCanvasProps {
  /**
   * Desktop particle count; viewports under 768px get 40% of it. Defaults to the
   * density signin/signup were built with. Lower it on long pages — the
   * connection-line pass below is O(n²) per frame, so cost grows with the
   * square of this number.
   */
  count?: number;
  /**
   * Scales particle and connector-line opacity (clamped to 1). 1 is the
   * signin/signup look; raise it for a page that should read as a wallpaper
   * behind dense content.
   */
  intensity?: number;
  className?: string;
}

export default function ParticleCanvas({
  count = 150,
  intensity = 1,
  className = "",
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const animRef = useRef<number>(0);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const isMobile = w < 768;
    const total = Math.max(10, Math.round(isMobile ? count * 0.4 : count));

    const particles: Particle[] = [];
    for (let i = 0; i < total; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.01 + 0.005,
      });
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x * w;
      const my = mouseRef.current.y * h;

      for (const p of particles) {
        if (!prefersReduced) {
          p.x += p.vx;
          p.y += p.vy;
          p.pulse += p.pulseSpeed;

          const dx = mx - p.x;
          const dy = my - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200) {
            const force = (200 - dist) / 200;
            p.vx -= (dx / dist) * force * 0.02;
            p.vy -= (dy / dist) * force * 0.02;
          }

          p.vx *= 0.99;
          p.vy *= 0.99;

          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        }

        const pulseFactor = prefersReduced
          ? 1
          : 0.7 + Math.sin(p.pulse) * 0.3;

        const alpha = Math.min(1, p.opacity * pulseFactor * intensity);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * pulseFactor, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(3, 234, 188, ${alpha})`;
        ctx.fill();
      }

      if (!prefersReduced) {
        ctx.strokeStyle = `rgba(3, 234, 188, ${Math.min(1, 0.03 * intensity)})`;
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = dx * dx + dy * dy;
            if (dist < 12000) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.stroke();
            }
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    function onResize() {
      if (!canvas || !ctx) return;
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      canvas.width = nw * dpr;
      canvas.height = nh * dpr;
      canvas.style.width = `${nw}px`;
      canvas.style.height = `${nh}px`;
      ctx.scale(dpr, dpr);
    }

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animRef.current);
    };
  }, [count, intensity]);

  useEffect(() => {
    const cleanup = init();

    function onMouse(e: MouseEvent) {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    }
    window.addEventListener("mousemove", onMouse);

    return () => {
      cleanup?.();
      window.removeEventListener("mousemove", onMouse);
      cancelAnimationFrame(animRef.current);
    };
  }, [init]);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 -z-10 ${className}`}
      aria-hidden="true"
    />
  );
}
