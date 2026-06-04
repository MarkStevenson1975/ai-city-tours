'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// Save the completion-screen sponsor text fields. The logo itself is handled
// by uploadTcSponsorLogo (in settings/actions).
export async function saveSponsorDetails(
  cityId: string,
  citySlug: string,
  data: { name: string; tagline: string; url: string }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('cities')
    .update({
      tc_sponsor_name: data.name.trim() || null,
      tc_sponsor_tagline: data.tagline.trim() || null,
      tc_sponsor_url: data.url.trim() || null,
      draft_updated_at: new Date().toISOString(),
    })
    .eq('id', cityId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/finish`);
  return { ok: true as const };
}

// Remove the sponsor element from the finish screen entirely: clears the name,
// tagline, link and logo so the completion screen shows no sponsor.
export async function removeSponsorElement(cityId: string, citySlug: string) {
  const supabase = await createClient();

  const { data: city } = await supabase
    .from('cities')
    .select('tc_sponsor_logo_url')
    .eq('id', cityId)
    .single();

  if (city?.tc_sponsor_logo_url) {
    const marker = '/storage/v1/object/public/operator-logos/';
    const idx = city.tc_sponsor_logo_url.indexOf(marker);
    if (idx >= 0) {
      const path = city.tc_sponsor_logo_url.substring(idx + marker.length).split('?')[0];
      await supabase.storage.from('operator-logos').remove([path]);
    }
  }

  const { error } = await supabase
    .from('cities')
    .update({
      tc_sponsor_name: null,
      tc_sponsor_tagline: null,
      tc_sponsor_url: null,
      tc_sponsor_logo_url: null,
      draft_updated_at: new Date().toISOString(),
    })
    .eq('id', cityId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/finish`);
  return { ok: true as const };
}
