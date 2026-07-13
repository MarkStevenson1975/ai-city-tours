'use client';

import { useEffect, useState } from 'react';

// Drafting a stop takes a few seconds each, so this is what the operator looks
// at while they wait. On-brand, calm, and honest: it says what is actually
// happening rather than spinning a meaningless wheel.
//
// A little walker makes their way along a dashed route, and the footprints fill
// in behind. It loops until the work is done.
const REASSURANCE = [
  'Reading up on each stop…',
  'Finding the stories worth telling…',
  'Writing it the way Harriet would say it…',
  'Checking the walking order…',
  'Almost there. Good things, and all that…',
];

export function BuildingAnimation({
  label,
  subtle = false,
}: {
  /** What is actually happening, e.g. "Drafting 2 of 6: Hereford Cathedral". */
  label?: string;
  /** Smaller version used while saving. */
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

  return (
    <div className="bg-primary rounded-xl p-5 text-cream overflow-hidden">
      <style>{`
        @keyframes storiedWalk {
          0%   { transform: translateX(0); }
          100% { transform: translateX(240px); }
        }
        @keyframes storiedBob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        @keyframes storiedTrail {
          0%   { stroke-dashoffset: 260; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes storiedPulse {
          0%, 100% { opacity: .35; }
          50%      { opacity: 1; }
        }
      `}</style>

      <div className="relative" style={{ height: subtle ? 40 : 56 }}>
        {/* the route */}
        <svg
          viewBox="0 0 280 24"
          className="absolute inset-x-0 bottom-0 w-full"
          style={{ height: 24 }}
          aria-hidden
        >
          <path
            d="M4 18 C 60 6, 100 26, 150 14 S 240 8, 276 16"
            fill="none"
            stroke="#C9A84C"
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeDasharray="5 6"
            strokeLinecap="round"
          />
          <path
            d="M4 18 C 60 6, 100 26, 150 14 S 240 8, 276 16"
            fill="none"
            stroke="#C9A84C"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="260"
            style={{
              animation: 'storiedTrail 3.6s ease-in-out infinite',
            }}
          />
        </svg>

        {/* the walker */}
        <div
          className="absolute"
          style={{
            bottom: 12,
            left: 8,
            animation: 'storiedWalk 3.6s ease-in-out infinite',
          }}
          aria-hidden
        >
          <span
            style={{
              display: 'inline-block',
              fontSize: subtle ? 16 : 20,
              animation: 'storiedBob .5s ease-in-out infinite',
            }}
          >
            🚶
          </span>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-sm font-bold text-cream">
          {label ?? 'Building your tour…'}
        </p>
        <p
          className="text-xs text-cream/70 mt-0.5"
          style={{ animation: 'storiedPulse 3.2s ease-in-out infinite' }}
        >
          {REASSURANCE[line]}
        </p>
      </div>
    </div>
  );
}
