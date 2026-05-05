'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface SponsorInput {
  name: string;
  category: string;
  tagline: string;
  // The full sentence the guide reads aloud at arrival, e.g. "Why not pop
  // in for a coffee and a cake from the award-winning café at Castle Green?"
  // Distinct from tagline (which is the visual strapline). When blank, the
  // tour falls back to a generic "And why not visit X? [tagline]" template.
  narration_text: string;
  emoji: string;
  lat: number | null;
  lng: number | null;
  proximity_radius_metres: number;
  google_place_id: string;
  google_business_url: string;
  cta_label: string;
  cta_url: string;
  tier: 'featured' | 'standard';
  subscription_status: 'pending' | 'active' | 'past_due' | 'cancelled';
  monthly_price_pence: number | null;
  contact_email: string;
}

const VALID_TIERS = ['featured', 'standard'] as const;
const VALID_STATUSES = ['pending', 'active', 'past_due', 'cancelled'] as const;

function sanitize(input: SponsorInput) {
  return {
    name: input.name.trim(),
    category: input.category.trim() || null,
    tagline: input.tagline.trim() || null,
    narration_text: input.narration_text.trim() || null,
    emoji: input.emoji.trim() || null,
    lat: input.lat,
    lng: input.lng,
    proximity_radius_metres: Math.max(
      10,
      Math.min(500, input.proximity_radius_metres || 50)
    ),
    google_place_id: input.google_place_id.trim() || null,
    google_business_url: input.google_business_url.trim() || null,
    cta_label: input.cta_label.trim() || null,
    cta_url: input.cta_url.trim() || null,
    tier: VALID_TIERS.includes(input.tier) ? input.tier : 'standard',
    subscription_status: VALID_STATUSES.includes(input.subscription_status)
      ? input.subscription_status
      : 'pending',
    monthly_price_pence: input.monthly_price_pence,
    contact_email: input.contact_email.trim() || null,
  };
}

async function bumpCityDraft(supabase: Awaited<ReturnType<typeof createClient>>, cityId: string) {
  await supabase
    .from('cities')
    .update({ draft_updated_at: new Date().toISOString() })
    .eq('id', cityId);
}

export async function createSponsor(
  cityId: string,
  citySlug: string,
  input: SponsorInput
) {
  const supabase = await createClient();
  const sanitized = sanitize(input);

  if (!sanitized.name) {
    return { ok: false as const, error: 'Sponsor name is required.' };
  }

  const { data, error } = await supabase
    .from('sponsors')
    .insert({ city_id: cityId, ...sanitized })
    .select('id')
    .single();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  await bumpCityDraft(supabase, cityId);
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/sponsors`);

  return { ok: true as const, id: data.id };
}

export async function createSponsorAndReturn(
  cityId: string,
  citySlug: string,
  input: SponsorInput
) {
  const result = await createSponsor(cityId, citySlug, input);
  if (result.ok) {
    redirect(`/dashboard/${citySlug}/sponsors`);
  }
  return result;
}

export async function updateSponsor(
  sponsorId: string,
  citySlug: string,
  input: SponsorInput
) {
  const supabase = await createClient();
  const sanitized = sanitize(input);

  if (!sanitized.name) {
    return { ok: false as const, error: 'Sponsor name is required.' };
  }

  const { data: existing } = await supabase
    .from('sponsors')
    .select('city_id')
    .eq('id', sponsorId)
    .single();

  const { error } = await supabase
    .from('sponsors')
    .update(sanitized)
    .eq('id', sponsorId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  if (existing?.city_id) {
    await bumpCityDraft(supabase, existing.city_id);
  }
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/sponsors`);
  revalidatePath(`/dashboard/${citySlug}/sponsors/${sponsorId}`);

  return { ok: true as const };
}

export async function deleteSponsor(sponsorId: string, citySlug: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('sponsors')
    .select('city_id')
    .eq('id', sponsorId)
    .single();

  const { error } = await supabase.from('sponsors').delete().eq('id', sponsorId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  if (existing?.city_id) {
    await bumpCityDraft(supabase, existing.city_id);
  }
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/sponsors`);

  return { ok: true as const };
}
