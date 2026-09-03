'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Update just a stop's map coordinates. Used by the venue pin map, where the
 * operator drags a pin to the exact spot inside their building. Writes to the
 * draft and bumps draft_updated_at so the Publish button activates. The new
 * position reaches the live tour on the next Publish.
 */
export async function updateStopPosition(
  stopId: string,
  citySlug: string,
  lat: number,
  lng: number
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated.' };

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false as const, error: 'Invalid position.' };
  }

  const admin = createAdminClient();

  const { error } = await admin.from('stops').update({ lat, lng }).eq('id', stopId);
  if (error) return { ok: false as const, error: error.message };

  const { data: stop } = await admin
    .from('stops')
    .select('city_id')
    .eq('id', stopId)
    .single();
  if (stop?.city_id) {
    await admin
      .from('cities')
      .update({ draft_updated_at: new Date().toISOString() })
      .eq('id', stop.city_id);
  }

  revalidatePath(`/dashboard/${citySlug}`);
  return { ok: true as const };
}
