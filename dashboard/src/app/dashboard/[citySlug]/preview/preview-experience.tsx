'use client';

// Interactive draft preview mirroring the real mobile tour. Opens on the
// "Your Walk" stop list (the tour hub), and tapping a stop opens its detail
// with a back-to-Tour button, just like the live experience. Visual and text
// only for now (audio is added separately).
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
  // 'walk' = the Your Walk stop list; a number = that stop's detail screen.
  const [view, setView] = useState<'walk' | number>('walk');
  const total = stops.length;
  const stop = typeof view === 'number' ? stops[view] : null;

  return (
    <div className="mx-auto" style={{ maxWidth: 360 }}>
      <div className="rounded-[36px] border-[10px] border-gray-900 bg-white overflow-hidden shadow-2xl">
        <div style={{ height: 620, display: 'flex', flexDirection: 'column' }}>

          {/* ---- Your Walk (stop list) ---- */}
          {view === 'walk' && (
            <>
              <div className="px-4 pt-5 pb-3 text-white" style={{ background: accent }}>
                <p className="text-[11px] uppercase tracking-widest opacity-80">A walking tour of {cityName}</p>
                <h1 className="text-2xl font-semibold">Your Walk</h1>
                <p className="text-xs opacity-90 mt-1">
                  {total} stop{total === 1 ? '' : 's'} · narrated by {guideName}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {stops.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setView(i)}
                    className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-gray-50"
                  >
                    <span
                      className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                      style={{ background: accent }}
                    >
                      {i + 1}
                    </span>
                    {s.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <span className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium text-sm truncate">{s.name}</span>
                      {s.shortDescription && (
                        <span className="block text-xs text-gray-500 truncate">{s.shortDescription}</span>
                      )}
                    </span>
                    <span className="ml-auto text-gray-300">›</span>
                  </button>
                ))}
                {total === 0 && (
                  <p className="p-6 text-center text-sm text-gray-500 italic">No stops yet.</p>
                )}
              </div>
            </>
          )}

          {/* ---- Stop detail ---- */}
          {stop && typeof view === 'number' && (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setView('walk')}
                  className="text-sm font-bold"
                  style={{ color: accent }}
                >
                  ← Tour
                </button>
                <span className="text-sm font-medium truncate px-2">{stop.name}</span>
                <span className="text-xs text-gray-400">{view + 1}/{total}</span>
              </div>

              {stop.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stop.image} alt={stop.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                  No image yet
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-xl border border-gray-100 p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-500">🎙️ {guideName} says</span>
                    <span
                      className="text-[10px] text-white rounded-full px-2 py-0.5"
                      style={{ background: accent }}
                    >
                      Stop {view + 1}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-bold rounded-full px-4 py-1.5 mb-2"
                    style={{ background: accent, color: '#fff' }}
                  >
                    ▶ Play narration
                  </button>
                  {stop.narration && (
                    <p className="text-sm text-gray-800 whitespace-pre-line">{stop.narration}</p>
                  )}
                </div>

                {stop.facts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-1">Interesting facts</h3>
                    <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                      {stop.facts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setView(view > 0 ? view - 1 : 'walk')}
                  className="text-sm font-bold text-gray-500 px-3 py-2"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => setView(view < total - 1 ? view + 1 : 'walk')}
                  className="text-sm font-bold text-white rounded-full px-6 py-2"
                  style={{ background: accent }}
                >
                  {view < total - 1 ? 'Next stop →' : 'Back to Your Walk'}
                </button>
              </div>
            </>
          )}

        </div>
      </div>

      <p className="text-center text-xs text-gray-500 mt-4">
        This is your draft, shown the way visitors walk it. Start your free month
        to publish it and play the narration aloud.
      </p>
    </div>
  );
}
