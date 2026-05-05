'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface EventInput {
  name: string;
  emoji: string;
  month: number;
  day_from: number;
  day_to: number;
  year_cycle: number | null;
  next_year: number | null;
  upcoming_text: string;
  during_text: string;
  recent_text: string;
}

function sanitize(input: EventInput) {
  return {
    name: input.name.trim(),
    emoji: input.emoji.trim() || null,
    month: Math.max(1, Math.min(12, input.month)),
    day_from: Math.max(1, Math.min(31, input.day_from)),
    day_to: Math.max(1, Math.min(31, input.day_to)),
    year_cycle: input.year_cycle && input.year_cycle > 0 ? input.year_cycle : null,
    next_year: input.next_year && input.next_year > 1900 ? input.next_year : null,
    upcoming_text: input.upcoming_text.trim() || null,
    during_text: input.during_text.trim() || null,
    recent_text: input.recent_text.trim() || null,
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

export async function createEvent(
  cityId: string,
  citySlug: string,
  input: EventInput
) {
  const supabase = await createClient();
  const sanitized = sanitize(input);

  if (!sanitized.name) {
    return { ok: false as const, error: 'Event name is required.' };
  }
  if (sanitized.day_to < sanitized.day_from) {
    return { ok: false as const, error: 'End day must be on or after start day.' };
  }

  const { data, error } = await supabase
    .from('events')
    .insert({ city_id: cityId, ...sanitized })
    .select('id')
    .single();

  if (error) return { ok: false as const, error: error.message };

  await bumpCityDraft(supabase, cityId);
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/events`);

  return { ok: true as const, id: data.id };
}

export async function createEventAndReturn(
  cityId: string,
  citySlug: string,
  input: EventInput
) {
  const r = await createEvent(cityId, citySlug, input);
  if (r.ok) redirect(`/dashboard/${citySlug}/events`);
  return r;
}

export async function updateEvent(
  eventId: string,
  citySlug: string,
  input: EventInput
) {
  const supabase = await createClient();
  const sanitized = sanitize(input);

  if (!sanitized.name) {
    return { ok: false as const, error: 'Event name is required.' };
  }

  const { data: existing } = await supabase
    .from('events')
    .select('city_id')
    .eq('id', eventId)
    .single();

  const { error } = await supabase.from('events').update(sanitized).eq('id', eventId);
  if (error) return { ok: false as const, error: error.message };

  if (existing?.city_id) await bumpCityDraft(supabase, existing.city_id);
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/events`);
  revalidatePath(`/dashboard/${citySlug}/events/${eventId}`);

  return { ok: true as const };
}

export async function deleteEvent(eventId: string, citySlug: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('events')
    .select('city_id')
    .eq('id', eventId)
    .single();

  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) return { ok: false as const, error: error.message };

  if (existing?.city_id) await bumpCityDraft(supabase, existing.city_id);
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/events`);

  return { ok: true as const };
}
