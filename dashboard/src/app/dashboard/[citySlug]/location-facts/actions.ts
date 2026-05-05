'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface FactInput {
  text: string;
  // Both lat/lng null = ambient fact (used as where-am-I fallback only).
  // Both set = spot fact (proximity-triggered during the walk).
  lat: number | null;
  lng: number | null;
  radius_metres: number | null;
  priority: number;
  fact_type: string;
}

function sanitize(input: FactInput) {
  const isAmbient = input.lat === null && input.lng === null;
  return {
    text: input.text.trim(),
    lat: input.lat,
    lng: input.lng,
    // Ambient facts have no radius — the schema accepts null.
    radius_metres: isAmbient
      ? null
      : Math.max(5, Math.min(200, input.radius_metres || 30)),
    priority: Math.max(1, Math.min(999, input.priority || 100)),
    fact_type: input.fact_type.trim() || 'fact',
  };
}

async function bumpCityDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cityId: string
) {
  await supabase
    .from('cities')
    .update({ draft_updated_at: new Date().toISOString() })
    .eq('id', cityId);
}

export async function createFact(
  cityId: string,
  citySlug: string,
  input: FactInput
) {
  const supabase = await createClient();
  const sanitized = sanitize(input);

  if (!sanitized.text) {
    return { ok: false as const, error: 'Fact text is required.' };
  }
  // Either both coords are set (spot fact) or both are null (ambient fact).
  // Half-set is rejected by the DB constraint, but checking here gives a
  // friendlier error message.
  const latSet = sanitized.lat !== null;
  const lngSet = sanitized.lng !== null;
  if (latSet !== lngSet) {
    return {
      ok: false as const,
      error: 'Either provide both latitude and longitude, or leave both blank for an ambient fact.',
    };
  }

  const { data, error } = await supabase
    .from('location_facts')
    .insert({ city_id: cityId, ...sanitized })
    .select('id')
    .single();

  if (error) return { ok: false as const, error: error.message };

  await bumpCityDraft(supabase, cityId);
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/location-facts`);

  return { ok: true as const, id: data.id };
}

export async function createFactAndReturn(
  cityId: string,
  citySlug: string,
  input: FactInput
) {
  const r = await createFact(cityId, citySlug, input);
  if (r.ok) redirect(`/dashboard/${citySlug}/location-facts`);
  return r;
}

export async function updateFact(
  factId: string,
  citySlug: string,
  input: FactInput
) {
  const supabase = await createClient();
  const sanitized = sanitize(input);

  if (!sanitized.text) {
    return { ok: false as const, error: 'Fact text is required.' };
  }

  const { data: existing } = await supabase
    .from('location_facts')
    .select('city_id')
    .eq('id', factId)
    .single();

  const { error } = await supabase
    .from('location_facts')
    .update(sanitized)
    .eq('id', factId);

  if (error) return { ok: false as const, error: error.message };

  if (existing?.city_id) await bumpCityDraft(supabase, existing.city_id);
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/location-facts`);
  revalidatePath(`/dashboard/${citySlug}/location-facts/${factId}`);

  return { ok: true as const };
}

export async function deleteFact(factId: string, citySlug: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('location_facts')
    .select('city_id')
    .eq('id', factId)
    .single();

  const { error } = await supabase.from('location_facts').delete().eq('id', factId);
  if (error) return { ok: false as const, error: error.message };

  if (existing?.city_id) await bumpCityDraft(supabase, existing.city_id);
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/location-facts`);

  return { ok: true as const };
}
