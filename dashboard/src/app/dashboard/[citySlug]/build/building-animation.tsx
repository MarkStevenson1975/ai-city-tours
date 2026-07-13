'use client';

import { useEffect, useState } from 'react';

// What the operator looks at while their stops are written and saved.
// On-brand, calm, and honest: it says what is actually happening.
//
// Footprints walk left to right across the panel — heel and tread, alternating
// left and right foot — then the trail clears and they set off again.
const REASSURANCE = [
  'Reading up on each stop…',
  'Finding the stories worth telling…',
  'Writing it the way Harriet would say it…',
  'Checking the walking order…',
  'Almost there. Good things, and all that…',
];

// Prints marching across, each one facing the way it is walking: broad tread in
// front, smaller heel behind. Left foot sits a little above the line of travel,
// right foot a little below, as a real pair of feet would.
const PRINTS = Array.from({ length: 7 }, (_, i) => ({
  x: 14 + i * 22,
  left: i % 2 === 0,
}));

const CYCLE = 3.2; // seconds for the full walk

export function BuildingAnimation({
  label,
}: {
  /** What is actually happening, e.g. "Drafting 2 of 6: Hereford Cathedral". */
  label?: string;
}) {
  const [line, setLine] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setLine((n) => (n + 1) % REASSURANCE.length),
      3200
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-primary rounded-xl p-4 text-cream w-full max-w-xs">
      <style>{`
        @keyframes storiedFootstep {
          0%   { opacity: 0; }
          6%   { opacity: 1; }
          70%  { opacity: 1; }
          92%  { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes storiedFade {
          0%, 100% { opacity: .45; }
          50%      { opacity: 1; }
        }
      `}</style>

      <svg viewBox="0 0 170 26" className="w-full" style={{ height: 20 }} aria-hidden>
        {PRINTS.map((p, i) => (
          <g
            key={p.x}
            transform={`translate(${p.x} ${p.left ? 9 : 18}) rotate(${p.left ? -6 : 6})`}
            style={{
              opacity: 0,
              animation: `storiedFootstep ${CYCLE}s linear infinite`,
              animationDelay: `${(i * CYCLE) / PRINTS.length}s`,
            }}
          >
            {/* tread (ball of the foot) — leading, towards the right */}
            <ellipse cx="2.8" cy="0" rx="3.2" ry="2.4" fill="#C9A84C" />
            {/* heel — trailing, behind and slightly inboard */}
            <ellipse
              cx="-3.2"
              cy={p.left ? 0.6 : -0.6}
              rx="2.1"
              ry="1.6"
              fill="#C9A84C"
            />
          </g>
        ))}
      </svg>

      <div className="mt-2.5">
        <p className="text-sm font-bold text-cream leading-snug">
          {label ?? 'Building your tour…'}
        </p>
        <p
          className="text-xs text-cream/70 mt-0.5"
          style={{ animation: 'storiedFade 3.2s ease-in-out infinite' }}
        >
          {REASSURANCE[line]}
        </p>
      </div>
    </div>
  );
}
