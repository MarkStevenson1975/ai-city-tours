'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type DraftStop = {
  name: string;
  lat: number;
  lng: number;
  shortDescription?: string;
  narration?: string;
  facts?: string[];
};

/**
 * Save AI-drafted stops to a city. Stops are appended after any existing
 * ones, in the order given. RLS ensures the caller can only write to a city
 * they operate.
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

  // Find the current highest position so we append rather than clash.
  const { data: existing } = await supabase
    .from('stops')
    .select('position')
    .eq('city_id', city.id)
    .order('position', { ascending: false })
    .limit(1);

  let nextPosition = (existing?.[0]?.position ?? 0) + 1;

  const rows = stops.map((s) => ({
    city_id: city.id,
    position: nextPosition++,
    name: s.name,
    short_description: s.shortDescription ?? null,
    narration: s.narration ?? null,
    facts: s.facts ?? [],
    lat: s.lat,
    lng: s.lng,
  }));

  const { error } = await supabase.from('stops').insert(rows);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/dashboard/${citySlug}`);
  return { ok: true as const, count: rows.length };
}
