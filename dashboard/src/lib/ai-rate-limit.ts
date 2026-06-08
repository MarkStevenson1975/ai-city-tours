// Per-user AI rate limiting. Every AI endpoint calls enforceAiLimit before it
// spends a model call. Backed by the check_and_record_ai_usage Postgres
// function (see db/migrations/0012), so the limit holds across serverless
// instances. Defaults: 12 actions per minute, 200 per day, per signed-in user.
//
// Fails open: if the limiter itself errors (database hiccup, function missing),
// the AI call is allowed through rather than breaking the feature. The function
// enforces the real cap.
import type { SupabaseClient } from '@supabase/supabase-js';

// Calm, on-brand wording. No em dashes. They can always keep working by hand.
const MESSAGES: Record<string, string> = {
  day: 'You have reached today’s writing limit. You can carry on editing and shaping everything by hand, and your AI drafting will be ready again tomorrow.',
  minute:
    'That is a lot of drafting in a short space of time. Give it a moment, then carry on. You can keep editing by hand in the meantime.',
  unauthenticated: 'Please sign in to use AI drafting.',
};

type LimitResult = { ok: true } | { ok: false; status: number; message: string };

export async function enforceAiLimit(
  supabase: SupabaseClient,
  action: string
): Promise<LimitResult> {
  try {
    const { data, error } = await supabase.rpc('check_and_record_ai_usage', {
      p_action: action,
    });
    if (error) {
      // Limiter fault: do not block the operator's work.
      return { ok: true };
    }
    if (data && typeof data === 'object' && data.allowed === false) {
      const reason = String(data.reason ?? 'day');
      if (reason === 'unauthenticated') {
        return { ok: false, status: 401, message: MESSAGES.unauthenticated };
      }
      return { ok: false, status: 429, message: MESSAGES[reason] ?? MESSAGES.day };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
