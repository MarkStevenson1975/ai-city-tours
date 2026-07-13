// SINGLE SOURCE OF TRUTH for the operator's first-run journey.
//
// The checklist rail RENDERS from this file, and Harriet READS from this file.
// They cannot drift apart, because there is only one copy of the words.
//
// Harriet speaks ONE STEP AT A TIME, about the screen the operator is actually
// looking at — not a monologue from top to bottom.
//
// The audio for each step is cached against a hash of that step's text. Change
// any wording below and the hash changes, so Harriet re-records that step the
// next time somebody presses play. Nobody has to remember to regenerate it.

export const HARRIET_VOICE_ID = 'NTqGiNK8P02i66yY2GOH';

export type OnboardingStep = {
  n: number;
  /** Shown on the checklist rail. */
  title: string;
  /** Shown under the title on the rail. */
  hint: string;
  /** What Harriet says when the operator is ON this step. */
  spoken: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    n: 1,
    title: 'Tell us where',
    hint: 'A town, or your venue',
    spoken:
      'Right then. Tell me where your tour is. A town or a city if you are covering a high street or a trail, or the name of your venue if it is a single place, like a hotel or a stately home. Type it into the box, and I will take it from there.',
  },
  {
    n: 2,
    title: 'Choose your stops',
    hint: 'We write them for you',
    spoken:
      'Now choose your stops. If you gave me a town, I have already gone and found the local landmarks, so simply pick the ones you want. If it is your own venue, drop a pin on the map for each place on your route, because only you know what is worth stopping for. Either way, I write the narration for every stop you choose, so you are never left staring at a blank page.',
  },
  {
    n: 3,
    title: 'Walk it yourself',
    hint: 'Free preview on your phone',
    spoken:
      'Your tour is built, so now go and walk it. Open the preview on your phone and take the route exactly as a visitor would. It costs you nothing, and it is far and away the quickest way to spot anything you would like to change.',
  },
  {
    n: 4,
    title: 'Publish',
    hint: 'Your first month is free',
    spoken:
      'You are ready to publish. Your first month is free, and you can cancel any time before it ends. Once you are live, the Promote tab will hand you a printable poster with your own QR code on it, ready for the wall. And if you get stuck at any point, email us and a real person will reply.',
  },
];

export const HELP_EMAIL = 'team@thesetupcrew.co.uk';

/** Valid step numbers, for validating the audio request. */
export function isStepNumber(n: number): boolean {
  return ONBOARDING_STEPS.some((s) => s.n === n);
}

/**
 * What Harriet says on a given step. She introduces herself on step one only.
 * This exact string is hashed to key the cached audio, so any edit above
 * automatically produces a fresh recording for that step.
 */
export function spokenForStep(n: number): string {
  const step = ONBOARDING_STEPS.find((s) => s.n === n);
  if (!step) return '';

  const parts: string[] = [];
  if (n === 1) {
    parts.push(
      'Hello, I am Harriet, and I will be the voice of your tour. There are only four steps to this, and I will talk you through each one as you come to it.'
    );
  }
  parts.push(step.spoken);
  return parts.join(' ');
}
