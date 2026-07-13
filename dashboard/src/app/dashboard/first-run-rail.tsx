import Link from 'next/link';
import { ONBOARDING_STEPS, HELP_EMAIL } from '@/lib/onboarding';
import { HarrietGuide } from './harriet-guide';

// First-run guide rail. Shown to operators until their first tour is live.
// The point is reassurance: it is only four steps, and it ticks itself off
// from real state (stops saved, previewed, published) rather than a cookie.
//
// The steps themselves come from src/lib/onboarding.ts — the same file Harriet
// reads aloud — so what is written here and what she says can never disagree.
export type RailState = {
  /** A tour exists (they answered "where is your tour?"). */
  hasCity: boolean;
  stopCount: number;
  previewed: boolean;
  published: boolean;
  citySlug?: string;
};

export function FirstRunRail({ state }: { state: RailState }) {
  const doneFor = (n: number): boolean => {
    switch (n) {
      case 1:
        return state.hasCity;
      case 2:
        return state.stopCount > 0;
      case 3:
        return state.previewed;
      case 4:
        return state.published;
      default:
        return false;
    }
  };

  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: doneFor(s.n) }));
  const currentIndex = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <aside className="w-full lg:w-64 lg:flex-shrink-0">
      <div className="lg:sticky lg:top-6 bg-white rounded-xl p-5 shadow-sm">
        <HarrietGuide />

        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
          Your tour, in {steps.length} steps
        </p>
        <p className="text-sm font-bold text-primary mb-4">
          {doneCount === 0
            ? 'About 15 minutes'
            : `${doneCount} of ${steps.length} done`}
        </p>

        <ol className="space-y-3 mb-4">
          {steps.map((s, i) => {
            const isCurrent = i === currentIndex;
            return (
              <li
                key={s.n}
                className={`flex gap-2.5 ${s.done || isCurrent ? '' : 'opacity-55'}`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
                    s.done
                      ? 'bg-primary text-cream'
                      : isCurrent
                        ? 'bg-accent text-primary'
                        : 'border border-gray-300 text-gray-400'
                  }`}
                >
                  {s.done ? '✓' : s.n}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-bold ${
                      s.done || isCurrent ? 'text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {s.title}
                  </p>
                  <p className="text-[10.5px] text-gray-500 leading-snug">
                    {isCurrent && !s.done ? "You're here now" : s.hint}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {state.citySlug && state.stopCount > 0 && !state.previewed && (
          <Link
            href={`/dashboard/${state.citySlug}/preview`}
            className="block text-center text-xs font-bold rounded-full border border-primary text-primary py-2 mb-4 hover:bg-cream transition"
          >
            Walk your tour →
          </Link>
        )}

        <div className="border-t border-cream pt-3">
          <p className="text-[10.5px] text-gray-500 leading-relaxed">
            Stuck? Email{' '}
            <a
              href={`mailto:${HELP_EMAIL}`}
              className="font-bold text-primary hover:underline"
            >
              {HELP_EMAIL}
            </a>{' '}
            and a human replies.
          </p>
        </div>
      </div>
    </aside>
  );
}
