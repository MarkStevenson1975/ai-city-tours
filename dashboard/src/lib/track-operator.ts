import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Operator funnel events. Written server-side so nothing is lost to ad blockers,
// and so every event joins back to a real operator.
//
// The steps of the first-run journey, in order. Keep this list and the admin
// funnel page in step: they are the only two places that know the sequence.
export const OPERATOR_FUNNEL = [
  { event: 'first_run_viewed', label: 'Saw "where is your tour?"' },
  { event: 'place_submitted', label: 'Told us where' },
  { event: 'landmarks_shown', label: 'Saw their landmarks' },
  { event: 'stops_saved', label: 'Tour built (stops saved)' },
  { event: 'previewed', label: 'Walked their tour' },
  { event: 'publish_started', label: 'Started checkout' },
  { event: 'published', label: 'Went live' },
] as const;

export type OperatorEvent = (typeof OPERATOR_FUNNEL)[number]['event'];

/**
 * Record one operator event. Fire-and-forget: tracking must NEVER break the
 * thing it is measuring, so every failure is swallowed.
 */
export async function trackOperator(
  userId: string,
  event: OperatorEvent,
  opts?: { cityId?: string | null; meta?: Record<string, unknown> }
): Promise<void> {
  try {
    await createAdminClient()
      .from('operator_events')
      .insert({
        user_id: userId,
        city_id: opts?.cityId ?? null,
        event,
        meta: opts?.meta ?? null,
      });
  } catch {
    // deliberately silent
  }
}
