'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface EventInput {
  name: string;
  emoji: string;
  month: number;
  /** Optional end month for events that run into the following month. Null = single-month event. */
  month_to: number | null;
  day_from: number;
  day_to: number;
  year_cycle: number | null;
  next_year: number | null;
  // Optional time of day. Blank start_time = all-day event in the calendar file.
  start_time: string;
  end_time: string;
  // Optional venue and URL, used on the banner and the calendar entry.
  location: string;
  link: string;
  upcoming_text: string;
  during_text: string;
  recent_text: string;
}

/** Accept only "HH:MM" (24h). Returns null for anything else. */
function sanitizeTime(input: string): string | null {
  const t = (input || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
}

function sanitize(input: EventInput) {
  const month = Math.max(1, Math.min(12, input.month));
  let month_to =
    input.month_to && input.month_to >= 1 && input.month_to <= 12
      ? input.month_to
      : null;
  // An end month equal to the start month is just a single-month event.
  if (month_to === month) month_to = null;
  const start_time = sanitizeTime(input.start_time);
  // End time is only meaningful alongside a start time.
  const end_time = start_time ? sanitizeTime(input.end_time) : null;
  return {
    name: input.name.trim(),
    emoji: input.emoji.trim() || null,
    month,
    month_to,
    day_from: Math.max(1, Math.min(31, input.day_from)),
    day_to: Math.max(1, Math.min(31, input.day_to)),
    year_cycle: input.year_cycle && input.year_cycle > 0 ? input.year_cycle : null,
    next_year: input.next_year && input.next_year > 1900 ? input.next_year : null,
    start_time,
    end_time,
    location: input.location.trim() || null,
    link: input.link.trim() || null,
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
  // The day order only matters within a single month. A cross-month event
  // (e.g. 26th to 5th of the next month) legitimately has end day < start day.
  if (!sanitized.month_to && sanitized.day_to < sanitized.day_from) {
    return { ok: false as const, error: 'For a single month, the end day must be on or after the start day.' };
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
