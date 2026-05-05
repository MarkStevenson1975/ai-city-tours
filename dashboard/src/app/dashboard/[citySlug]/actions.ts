'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
