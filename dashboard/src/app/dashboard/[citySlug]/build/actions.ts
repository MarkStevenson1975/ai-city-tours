'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type DraftStop = {
  name: string;
  lat: number;
  lng: number;
  shortDescription?: string;
  narration?: string;
  facts?: string[];
  placeId?: string;
  photoRef?: string;
};

// Fetch a Google Places photo (server side, key stays hidden) and upload it to
// the stop-images bucket. Returns the public URL, or null on any failure.
async function fetchAndStorePhoto(
  admin: ReturnType<typeof createAdminClient>,
  citySlug: string,
  stopId: string,
  photoRef: string,
  apiKey: string
): Promise<string | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const path = `${citySlug}/${stopId}.${ext}`;
    const { error } = await admin.storage
      .from('stop-images')
      .upload(path, bytes, { contentType, upsert: true, cacheControl: '3600' });
    if (error) return null;
    return admin.storage.from('stop-images').getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

/**
 * Save AI-drafted stops to a city. Appends after any existing stops. Pulls a
 * Google photo and the Google listing URL for each. RLS access is verified
 * before the trusted writes run.
 */
export async function saveDraftStops(citySlug: string, stops: DraftStop[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not signed in' };
  if (!stops.length) return { ok: false as const, error: 'No stops to save' };

  const { data: city } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .single();
  if (!city) return { ok: false as const, error: 'Tour not found' };

  const admin = createAdminClient();
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const { data: existing } = await admin
    .from('stops')
    .select('position')
    .eq('city_id', city.id)
    .order('position', { ascending: false })
    .limit(1);

  let nextPosition = (existing?.[0]?.position ?? 0) + 1;
  let saved = 0;

  for (const s of stops) {
    const { data: row, error } = await admin
      .from('stops')
      .insert({
        city_id: city.id,
        position: nextPosition++,
        name: s.name,
        short_description: s.shortDescription ?? null,
        narration: s.narration ?? null,
        facts: s.facts ?? [],
        lat: s.lat,
        lng: s.lng,
        google_business_url: s.placeId
          ? `https://www.google.com/maps/place/?q=place_id:${s.placeId}`
          : null,
      })
      .select('id')
      .single();

    if (error || !row) continue;
    saved++;

    if (s.photoRef && apiKey) {
      const publicUrl = await fetchAndStorePhoto(admin, citySlug, row.id, s.photoRef, apiKey);
      if (publicUrl) {
        await admin.from('stops').update({ hero_image_url: publicUrl }).eq('id', row.id);
      }
    }
  }

  if (saved === 0) return { ok: false as const, error: 'Could not save the stops' };

  await admin
    .from('cities')
    .update({ draft_updated_at: new Date().toISOString() })
    .eq('id', city.id);

  revalidatePath(`/dashboard/${citySlug}`);
  return { ok: true as const, count: saved };
}
