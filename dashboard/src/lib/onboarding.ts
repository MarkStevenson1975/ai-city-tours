// SINGLE SOURCE OF TRUTH for the operator's first-run journey.
//
// The checklist rail RENDERS from this file, and Harriet READS from this file.
// They cannot drift apart, because there is only one copy of the words.
//
// The audio is cached against a hash of `spokenScript()`. Change any wording
// below and the hash changes, so Harriet re-records herself the next time
// somebody presses play. Nobody has to remember to regenerate anything.

export const HARRIET_VOICE_ID = 'NTqGiNK8P02i66yY2GOH';

export type OnboardingStep = {
  n: number;
  /** Shown on the checklist rail. */
  title: string;
  /** Shown under the title on the rail. */
  hint: string;
  /** What Harriet says about this step. */
  spoken: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    n: 1,
    title: 'Tell us where',
    hint: 'A town, or your venue',
    spoken:
      'First, tell me where your tour is. A town or city if you are covering a high street or a trail, or the name of your venue if it is a single place like a hotel or a stately home. That is all I need to get started.',
  },
  {
    n: 2,
    title: 'Choose your stops',
    hint: 'We write them for you',
    spoken:
      'Next, choose your stops. If it is a town, I will go and find the local landmarks for you. If it is your own venue, drop a pin on the map for each place on your route. Either way, I write the narration for every stop, so you are never staring at a blank page.',
  },
  {
    n: 3,
    title: 'Walk it yourself',
    hint: 'Free preview on your phone',
    spoken:
      'Then walk it yourself. Open the preview on your phone and take the route, just as a visitor would. It costs nothing, and it is the quickest way to spot anything you want to change.',
  },
  {
    n: 4,
    title: 'Publish',
    hint: 'Your first month is free',
    spoken:
      'Finally, publish it. Your first month is free, and you can cancel any time before it ends. Once you are live, the Promote tab hands you a printable poster with your own QR code, ready for the wall.',
  },
];

export const HELP_EMAIL = 'team@thesetupcrew.co.uk';

/**
 * The full spoken walkthrough. This exact string is hashed to key the cached
 * audio file, so any edit here (or to any `spoken` line above) automatically
 * produces a new recording.
 */
export function spokenScript(): string {
  const intro =
    'Hello, I am Harriet, and I will be the voice of your tour. Building it takes about fifteen minutes, and there are only four steps. Let me walk you through them.';
  const outro = `And that is genuinely it. If you get stuck at any point, email us at ${HELP_EMAIL} and a real person will reply. Right then. Let us build your tour.`;

  return [intro, ...ONBOARDING_STEPS.map((s) => s.spoken), outro].join(' ');
}
