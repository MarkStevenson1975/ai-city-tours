'use client';

import { useEffect, useRef, useState } from 'react';

// "Speakers on?" prompt plus Harriet explaining THE STEP THEY ARE ON — not the
// whole journey in one go. The audio is fetched from /api/onboarding-audio,
// which keys it off a hash of that step's script, so it is always in step with
// what the screen actually says.
//
// Play / pause / resume: pausing keeps her place, so people can stop to do the
// thing she just told them to do, then carry on.
//
// If no ElevenLabs key is configured the endpoint returns 503 and we hide the
// player entirely, rather than leaving a button that does nothing.
type State = 'idle' | 'loading' | 'playing' | 'paused' | 'hidden';

export function HarrietGuide({ step }: { step: number }) {
  const [state, setState] = useState<State>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // If they move to another step, drop the old audio so the button plays the
  // narration for the screen they are actually on.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [step]);

  async function toggle() {
    // Pause, keeping her place.
    if (state === 'playing' && audioRef.current) {
      audioRef.current.pause();
      setState('paused');
      return;
    }

    // Resume from where she left off.
    if (state === 'paused' && audioRef.current) {
      await audioRef.current.play().catch(() => setState('idle'));
      setState('playing');
      return;
    }

    setState('loading');
    try {
      const res = await fetch(`/api/onboarding-audio?step=${step}`);
      if (res.status === 503) {
        setState('hidden'); // not configured — say nothing
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.url) {
        setState('idle');
        return;
      }

      const audio = new Audio(data.url);
      audioRef.current = audio;
      audio.onended = () => setState('idle');
      audio.onerror = () => setState('idle');
      await audio.play();
      setState('playing');
    } catch {
      setState('idle');
    }
  }

  function restart() {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => setState('idle'));
    setState('playing');
  }

  if (state === 'hidden') return null;

  const started = state === 'playing' || state === 'paused';

  return (
    <div className="bg-primary rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span aria-hidden className="text-accent text-base">
          🔊
        </span>
        <span className="text-cream text-[11px] font-bold">Speakers on?</span>
      </div>
      <p className="text-cream/70 text-[10.5px] leading-snug mb-2.5">
        Harriet will explain what to do on this screen.
      </p>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={toggle}
          disabled={state === 'loading'}
          className="flex-1 rounded-full bg-accent text-primary text-[11px] font-bold py-1.5 hover:bg-accent-light transition disabled:opacity-60"
        >
          {state === 'loading'
            ? 'Just a moment…'
            : state === 'playing'
              ? '❚❚ Pause'
              : state === 'paused'
                ? '▶ Resume'
                : '▶ What do I do here?'}
        </button>

        {started && (
          <button
            type="button"
            onClick={restart}
            aria-label="Start again"
            title="Start again"
            className="px-2.5 rounded-full border border-cream/30 text-cream/80 text-[11px] font-bold hover:bg-cream/10 transition"
          >
            ↺
          </button>
        )}
      </div>
    </div>
  );
}
