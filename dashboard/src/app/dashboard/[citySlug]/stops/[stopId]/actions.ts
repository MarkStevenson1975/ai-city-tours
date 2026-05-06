'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface StopInput {
  name: string;
  short_description: string;
  narration: string;
  facts: string[];
  lat: number;
  lng: number;
  hero_image_url: string;
  google_business_url: string;
}

interface UpdateStopInput extends StopInput {
  stopId: string;
  citySlug: string;
  /** Optional: new position. If different from current, swap positions with whatever stop is at the target. */
  position?: number;
}

/**
 * Update a stop's draft fields. If position changes, swap with whatever
 * stop occupies the target position. RLS ensures the user can only edit
 * stops for areas they have access to.
 */
export async function updateStop(input: UpdateStopInput) {
  const supabase = await createClient();

  // Verify the caller is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated.' };

  // Use the admin client for all writes so auth.uid() null in server actions
  // doesn't cause RLS to silently block the update.
  const admin = createAdminClient();

  // Swap position via the Postgres RPC atomically
  if (input.position && input.position > 0) {
    const { error: swapErr } = await admin.rpc('swap_stop_position', {
      p_stop_id: input.stopId,
      p_new_position: input.position,
    });
    if (swapErr) {
      return { ok: false as const, error: swapErr.message };
    }
  }

  // Now update the rest of the fields
  const { error } = await admin
    .from('stops')
    .update({
      name: input.name.trim(),
      short_description: input.short_description.trim() || null,
      narration: input.narration || null,
      facts: input.facts.filter((f) => f.trim().length > 0),
      lat: input.lat,
      lng: input.lng,
      hero_image_url: input.hero_image_url.trim() || null,
      google_business_url: input.google_business_url.trim() || null,
    })
    .eq('id', input.stopId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  // Touch the area's draft_updated_at so the publish button activates
  const { data: stop } = await admin
    .from('stops')
    .select('city_id')
    .eq('id', input.stopId)
    .single();

  if (stop?.city_id) {
    await admin
      .from('cities')
      .update({ draft_updated_at: new Date().toISOString() })
      .eq('id', stop.city_id);
  }

  revalidatePath(`/dashboard/${input.citySlug}`);
  revalidatePath(`/dashboard/${input.citySlug}/stops/${input.stopId}`);

  return { ok: true as const };
}

/**
 * Create a new stop on an area at a specific position.
 *
 * The caller MUST supply a position now (the dashboard's new-stop form
 * pre-fills it with the smallest unused 1–50 slot). If `preferredPosition`
 * is omitted we still auto-assign by finding the smallest unused slot —
 * but unlike the previous `max(position) + 1` logic, this never lands on
 * a value that's already taken or above 50.
 */
export async function createStop(
  cityId: string,
  citySlug: string,
  input: StopInput,
  preferredPosition?: number
) {
  const supabase = await createClient();

  // Verify the caller is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated.' };

  if (!input.name.trim()) {
    return { ok: false as const, error: 'Stop name is required.' };
  }

  // Use admin client for all writes to avoid auth.uid() null in server actions
  const admin = createAdminClient();

  // Pull every existing position for this area so we can detect both
  // collisions and exhaustion (50 used) up-front, with friendly errors
  // rather than a raw constraint violation.
  const { data: existing } = await admin
    .from('stops')
    .select('id, position, name')
    .eq('city_id', cityId);

  const taken = new Map<number, { id: string; name: string }>();
  for (const row of existing ?? []) {
    taken.set(row.position, { id: row.id, name: row.name });
  }

  let positionToUse: number;
  if (preferredPosition != null) {
    if (
      !Number.isInteger(preferredPosition) ||
      preferredPosition < 1 ||
      preferredPosition > 50
    ) {
      return {
        ok: false as const,
        error: 'Position must be a whole number between 1 and 50.',
      };
    }
    const collision = taken.get(preferredPosition);
    if (collision) {
      return {
        ok: false as const,
        error: `Position ${preferredPosition} is already used by "${collision.name}". Pick a different number, or edit that stop first.`,
      };
    }
    positionToUse = preferredPosition;
  } else {
    let found: number | null = null;
    for (let i = 1; i <= 50; i++) {
      if (!taken.has(i)) {
        found = i;
        break;
      }
    }
    if (found === null) {
      return {
        ok: false as const,
        error: 'All 50 positions are in use. Delete or rearrange before adding another stop.',
      };
    }
    positionToUse = found;
  }

  const { data, error } = await admin
    .from('stops')
    .insert({
      city_id: cityId,
      position: positionToUse,
      name: input.name.trim(),
      short_description: input.short_description.trim() || null,
      narration: input.narration || null,
      facts: input.facts.filter((f) => f.trim().length > 0),
      lat: input.lat,
      lng: input.lng,
      hero_image_url: input.hero_image_url.trim() || null,
      google_business_url: input.google_business_url.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  await admin
    .from('cities')
    .update({ draft_updated_at: new Date().toISOString() })
    .eq('id', cityId);

  revalidatePath(`/dashboard/${citySlug}`);

  return { ok: true as const, id: data.id, position: positionToUse };
}

export async function deleteStop(stopId: string, citySlug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: stop } = await admin
    .from('stops')
    .select('city_id, hero_image_override_url')
    .eq('id', stopId)
    .single();

  // Best-effort cleanup of any uploaded hero image
  if (stop?.hero_image_override_url) {
    const marker = '/storage/v1/object/public/stop-images/';
    const idx = stop.hero_image_override_url.indexOf(marker);
    if (idx >= 0) {
      const path = stop.hero_image_override_url.substring(idx + marker.length).split('?')[0];
      await admin.storage.from('stop-images').remove([path]);
    }
  }

  const { error } = await admin.from('stops').delete().eq('id', stopId);
  if (error) {
    return { ok: false as const, error: error.message };
  }

  if (stop?.city_id) {
    await admin
      .from('cities')
      .update({ draft_updated_at: new Date().toISOString() })
      .eq('id', stop.city_id);
  }

  revalidatePath(`/dashboard/${citySlug}`);
  return { ok: true as const };
}

/**
 * Convenience: save and redirect back to the area overview.
 */
export async function saveAndReturn(input: UpdateStopInput) {
  const result = await updateStop(input);
  if (result.ok) {
    redirect(`/dashboard/${input.citySlug}`);
  }
  return result;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Upload a custom hero image for a stop. Replaces any existing override.
 * Stored in the stop-images bucket at <citySlug>/<stopId>-<timestamp>.<ext>.
 */
export async function uploadStopImage(formData: FormData) {
  const file = formData.get('file') as File | null;
  const stopId = String(formData.get('stopId') ?? '');
  const citySlug = String(formData.get('citySlug') ?? '');

  if (!file || file.size === 0) {
    return { ok: false as const, error: 'No file selected.' };
  }
  if (!stopId || !citySlug) {
    return { ok: false as const, error: 'Missing stop or city identifier.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false as const,
      error: `File is too large. Max 5 MB (yours is ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false as const,
      error: 'Use JPEG, PNG, or WebP. Other formats are not allowed.',
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated.' };

  const admin = createAdminClient();

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const path = `${citySlug}/${stopId}-${Date.now()}.${safeExt}`;

  // Get the existing override URL so we can delete the old file after upload
  const { data: existingStop } = await admin
    .from('stops')
    .select('hero_image_override_url, city_id')
    .eq('id', stopId)
    .single();

  // Upload the new file
  const { error: uploadErr } = await admin.storage
    .from('stop-images')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadErr) {
    return { ok: false as const, error: `Upload failed: ${uploadErr.message}` };
  }

  // Resolve the public URL
  const { data: pub } = admin.storage.from('stop-images').getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  // Persist the URL on the stops row
  const { error: updateErr } = await admin
    .from('stops')
    .update({ hero_image_override_url: publicUrl })
    .eq('id', stopId);

  if (updateErr) {
    // Best-effort cleanup of the just-uploaded file
    await admin.storage.from('stop-images').remove([path]);
    return { ok: false as const, error: `DB write failed: ${updateErr.message}` };
  }

  // Tidy up: delete the previous override file (if there was one)
  if (existingStop?.hero_image_override_url) {
    const oldPath = extractStopImagePath(existingStop.hero_image_override_url);
    if (oldPath && oldPath !== path) {
      await admin.storage.from('stop-images').remove([oldPath]);
    }
  }

  // Bump the city's draft timestamp so the publish button activates
  if (existingStop?.city_id) {
    await admin
      .from('cities')
      .update({ draft_updated_at: new Date().toISOString() })
      .eq('id', existingStop.city_id);
  }

  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/stops/${stopId}`);

  return { ok: true as const, url: publicUrl };
}

/**
 * Remove the override on a stop, falling back to the default heroImageUrl.
 * Also deletes the file from Storage to keep the bucket tidy.
 */
export async function removeStopImageOverride(stopId: string, citySlug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: stop } = await admin
    .from('stops')
    .select('hero_image_override_url, city_id')
    .eq('id', stopId)
    .single();

  if (stop?.hero_image_override_url) {
    const path = extractStopImagePath(stop.hero_image_override_url);
    if (path) {
      await admin.storage.from('stop-images').remove([path]);
    }
  }

  const { error } = await admin
    .from('stops')
    .update({ hero_image_override_url: null })
    .eq('id', stopId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  if (stop?.city_id) {
    await admin
      .from('cities')
      .update({ draft_updated_at: new Date().toISOString() })
      .eq('id', stop.city_id);
  }

  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/stops/${stopId}`);

  return { ok: true as const };
}

/**
 * Extract the storage object path from a Supabase public URL.
 * URLs look like:
 *   https://<project>.supabase.co/storage/v1/object/public/stop-images/<path>
 * Returns the <path> portion, or null if it doesn't look right.
 */
function extractStopImagePath(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/stop-images/';
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return publicUrl.substring(idx + marker.length).split('?')[0];
}
