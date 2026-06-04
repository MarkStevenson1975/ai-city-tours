'use client';

// Interactive draft preview that mirrors the real mobile tour: a splash,
// then one stop at a time with next/back and a progress bar, ending on a
// tour-complete screen. Visual and text only (audio is added separately).
import { useState } from 'react';

export type PreviewStop = {
  position: number;
  name: string;
  shortDescription: string | null;
  narration: string | null;
  facts: string[];
  image: string | null;
};

export function PreviewExperience({
  cityName,
  guideName,
  accent,
  stops,
}: {
  cityName: string;
  guideName: string;
  accent: string;
  stops: PreviewStop[];
}) {
  // step: -1 = splash, 0..n-1 = stops, n = complete
  const [step, setStep] = useState(-1);
  const total = stops.length;
  const atSplash = step === -1;
  const atEnd = step >= total;
  const stop = !atSplash && !atEnd ? stops[step] : null;

  return (
    <div className="mx-auto" style={{ maxWidth: 360 }}>
      <div className="rounded-[36px] border-[10px] border-gray-900 bg-white overflow-hidden shadow-2xl">
        <div className="relative" style={{ height: 620, display: 'flex', flexDirection: 'column' }}>
          {/* Progress bar */}
          {!atSplash && (
            <div className="flex gap-1 px-3 pt-3">
              {stops.map((_, i) => (
                <span
                  key={i}
                  className="h-1 flex-1 rounded"
                  style={{ background: i <= step && step < total ? accent : '#e5e5e5' }}
                />
              ))}
            </div>
          )}

          {/* Splash */}
          {atSplash && (
            <div
              className="flex-1 flex flex-col items-center justify-center text-center text-white px-6"
              style={{ background: accent }}
            >
              <p className="text-xs uppercase tracking-widest opacity-80 mb-2">A walking tour of</p>
              <h1 className="text-3xl font-semibold mb-3">{cityName}</h1>
              <p className="text-sm opacity-90 mb-8">
                Narrated by {guideName}. {total} stop{total === 1 ? '' : 's'}.
              </p>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="bg-white text-gray-900 font-bold rounded-full px-8 py-3 text-sm"
                disabled={total === 0}
              >
                Start tour
              </button>
            </div>
          )}

          {/* A stop */}
          {stop && (
            <div className="flex-1 flex flex-col min-h-0">
              {stop.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stop.image} alt={stop.name} className="w-full h-44 object-cover" />
              ) : (
                <div className="w-full h-44 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                  No image yet
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>
                  Stop {step + 1} of {total}
                </p>
                <h2 className="text-xl font-semibold mb-1">{stop.name}</h2>
                {stop.shortDescription && (
                  <p className="text-sm text-gray-600 mb-3">{stop.shortDescription}</p>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-9 h-9 rounded-full text-white flex items-center justify-center"
                    style={{ background: accent }}
                  >
                    ▶
                  </span>
                  <span className="text-xs text-gray-500">Tap to play narration (on the live tour)</span>
                </div>
                {stop.narration && (
                  <p className="text-sm text-gray-800 whitespace-pre-line">{stop.narration}</p>
                )}
                {stop.facts.length > 0 && (
                  <div className="mt-3 bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-bold text-gray-500 mb-1">Did you know</p>
                    <ul className="text-sm text-gray-700 list-disc pl-4 space-y-1">
                      {stop.facts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Complete */}
          {atEnd && (
            <div
              className="flex-1 flex flex-col items-center justify-center text-center text-white px-6"
              style={{ background: accent }}
            >
              <span className="text-4xl mb-3">✓</span>
              <h2 className="text-2xl font-semibold mb-2">Tour complete</h2>
              <p className="text-sm opacity-90 mb-8">
                That is the {cityName} tour. Thanks for walking with {guideName}.
              </p>
              <button
                type="button"
                onClick={() => setStep(-1)}
                className="bg-white text-gray-900 font-bold rounded-full px-8 py-3 text-sm"
              >
                Start again
              </button>
            </div>
          )}

          {/* Nav controls (on stop screens) */}
          {stop && (
            <div className="flex items-center justify-between p-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="text-sm font-bold text-gray-500 px-3 py-2"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="text-sm font-bold text-white rounded-full px-6 py-2"
                style={{ background: accent }}
              >
                {step === total - 1 ? 'Finish' : 'Next stop →'}
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-gray-500 mt-4">
        This is your draft, shown the way visitors step through it. Start your free
        trial to publish it and play the narration aloud.
      </p>
    </div>
  );
}
