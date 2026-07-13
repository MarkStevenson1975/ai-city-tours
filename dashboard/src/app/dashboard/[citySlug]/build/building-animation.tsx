'use client';

import { useEffect, useState } from 'react';

// What the operator looks at while their stops are written and saved.
// On-brand, calm, and honest: it says what is actually happening.
//
// Footprints walk their way across a dashed route, one after another, then the
// trail resets and they set off again. Deliberately small and quiet — it is a
// waiting state, not a fairground.
const REASSURANCE = [
  'Reading up on each stop…',
  'Finding the stories worth telling…',
  'Writing it the way Harriet would say it…',
  'Checking the walking order…',
  'Almost there. Good things, and all that…',
];

// x positions along the route, with the feet alternating either side of it.
const STEPS = [14, 42, 70, 98, 126, 154, 182, 210, 238, 264];

export function BuildingAnimation({
  label,
  subtle = false,
}: {
  /** What is actually happening, e.g. "Drafting 2 of 6: Hereford Cathedral". */
  label?: string;
  /** Smaller still, used while saving. */
  subtle?: boolean;
}) {
  const [line, setLine] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setLine((n) => (n + 1) % REASSURANCE.length),
      3200
    );
    return () => clearInterval(id);
  }, []);

  const cycle = 3.4; // seconds for a full walk across

  return (
    <div className="bg-primary rounded-xl p-4 text-cream overflow-hidden">
      <style>{`
        @keyframes storiedFootstep {
          0%   { opacity: 0; }
          8%   { opacity: 1; }
          68%  { opacity: 1; }
          88%  { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes storiedFade {
          0%, 100% { opacity: .45; }
          50%      { opacity: 1; }
        }
      `}</style>

      <svg
        viewBox="0 0 280 20"
        className="w-full"
        style={{ height: subtle ? 14 : 20 }}
        aria-hidden
      >
        {/* the route */}
        <path
          d="M6 13 C 60 5, 100 17, 150 10 S 240 6, 274 12"
          fill="none"
          stroke="#C9A84C"
          strokeOpacity="0.25"
          strokeWidth="1.2"
          strokeDasharray="4 5"
          strokeLinecap="round"
        />

        {/* the footprints */}
        {STEPS.map((x, i) => {
          // follow the curve roughly, and alternate left/right of the line
          const base = 13 - Math.sin((x / 280) * Math.PI * 1.6) * 4;
          const y = base + (i % 2 === 0 ? -2.4 : 2.4);
          return (
            <ellipse
              key={x}
              cx={x}
              cy={y}
              rx="1.9"
              ry="3"
              fill="#C9A84C"
              transform={`rotate(${i % 2 === 0 ? -18 : -8} ${x} ${y})`}
              style={{
                opacity: 0,
                animation: `storiedFootstep ${cycle}s linear infinite`,
                animationDelay: `${(i * cycle) / STEPS.length}s`,
              }}
            />
          );
        })}
      </svg>

      <div className="mt-2.5">
        <p className="text-sm font-bold text-cream">
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
