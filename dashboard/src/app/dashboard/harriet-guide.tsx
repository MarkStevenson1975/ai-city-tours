'use client';

import { useRef, useState } from 'react';

// "Speakers on?" prompt plus Harriet's spoken walkthrough. The audio is fetched
// from /api/onboarding-audio, which keys it off a hash of the script, so it is
// always in step with what the screen actually says.
//
// If no ElevenLabs key is configured the endpoint returns 503 and we hide the
// player entirely, rather than leaving a button that does nothing.
export function HarrietGuide() {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'hidden'>(
    'idle'
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function play() {
    // Second press stops her.
    if (state === 'playing' && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState('idle');
      return;
    }

    setState('loading');
    try {
      const res = await fetch('/api/onboarding-audio');
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

  if (state === 'hidden') return null;

  return (
    <div className="bg-primary rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span aria-hidden className="text-accent text-base">
          🔊
        </span>
        <span className="text-cream text-[11px] font-bold">Speakers on?</span>
      </div>
      <p className="text-cream/70 text-[10.5px] leading-snug mb-2.5">
        Harriet can talk you through each step.
      </p>
      <button
        type="button"
        onClick={play}
        disabled={state === 'loading'}
        className="w-full rounded-full bg-accent text-primary text-[11px] font-bold py-1.5 hover:bg-accent-light transition disabled:opacity-60"
      >
        {state === 'loading'
          ? 'Just a moment…'
          : state === 'playing'
            ? '■ Stop'
            : "▶ Play Harriet's guide"}
      </button>
    </div>
  );
}
