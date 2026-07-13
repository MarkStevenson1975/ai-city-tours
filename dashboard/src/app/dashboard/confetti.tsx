'use client';

import { useEffect, useRef, useState } from 'react';

// Brand-coloured confetti. Self-contained canvas, no library, no dependency.
// Fires once on mount, cleans itself up, and respects reduced-motion.
const COLOURS = [
  '#1B4332', // forest
  '#C9A84C', // gold
  '#F5F0E8', // cream
  '#8AA899', // sage
];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  colour: string;
};

export function Confetti({ pieces = 160 }: { pieces?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Never animate at people who have asked us not to.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setDone(true);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Two bursts from the upper corners, arcing inwards. Reads as celebration
    // rather than "it is snowing in the dashboard".
    const parts: Piece[] = Array.from({ length: pieces }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? w * 0.12 : w * 0.88,
        y: h * 0.18 + Math.random() * 40,
        vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 5),
        vy: -3 - Math.random() * 6,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      };
    });

    const GRAVITY = 0.16;
    const DRAG = 0.995;
    const start = performance.now();
    const LIFE = 3600; // ms
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const fade = elapsed > LIFE - 900 ? Math.max(0, (LIFE - elapsed) / 900) : 1;
      ctx.clearRect(0, 0, w, h);

      for (const p of parts) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
        ctx.restore();
      }

      if (elapsed < LIFE) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
        setDone(true);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pieces]);

  if (done) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}
