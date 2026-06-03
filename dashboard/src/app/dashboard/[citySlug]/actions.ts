'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Reorder a city's stops. orderedStopIds is the full list of stop ids in the
 * desired order; positions are reassigned 1..N. The caller's access is
 * verified via an RLS-scoped read before the trusted reorder runs.
 */
export async function reorderStops(citySlug: string, orderedStopIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not signed in' };

  const { data: city } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .single();
  if (!city) return { ok: false as const, error: 'Tour not found' };

  const admin = createAdminClient();
  const { error } = await admin.rpc('reorder_stops', {
    p_city_id: city.id,
    p_stop_ids: orderedStopIds,
  });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/dashboard/${citySlug}`);
  return { ok: true as const };
}

/**
 * Publish the current draft of a city as a new version.
 * Calls the publish_city Postgres function which:
 *   - Builds the JSON snapshot from the live tables
 *   - Inserts a row into config_versions
 *   - Updates cities.published_config + version + timestamp
 *   - Records the audit log entry
 *
 * RLS / function-level checks ensure only admins or the city's assigned
 * operators can publish.
 */
export async function publishCity(cityId: string, citySlug: string, notes?: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('publish_city', {
    p_city_id: cityId,
    p_notes: notes ?? null,
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  // Invalidate cached pages so the dashboard reflects the new state immediately
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath('/dashboard');

  return { ok: true as const, version: data as number };
}
