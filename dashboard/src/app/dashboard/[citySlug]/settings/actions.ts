'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

interface SaveSettingsInput {
  cityId: string;
  citySlug: string;
  // Operator
  operator_name: string;
  operator_type: string;
  operator_email: string;
  operator_attribution_text: string;
  // City branding
  city_name: string;
  postcode_area: string;
  splash_intro: string;
  color_primary: string;
  color_accent: string;
  color_background: string;
  // Guide
  guide_name: string;
  guide_voice_id: string;
  // Tour completion
  tour_complete_message: string;
  tour_complete_suggestion: string;
}

const VALID_TYPES = ['bid', 'tourist_board', 'council', 'dmo', 'other'];

/** Allow only #RRGGBB or empty string. Returns null if invalid. */
function sanitizeHex(input: string, fallback: string | null = null): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return fallback;
}

export async function saveSettings(input: SaveSettingsInput) {
  const supabase = await createClient();

  const operatorType = VALID_TYPES.includes(input.operator_type)
    ? input.operator_type
    : 'other';

  // Validate hex colours — fall back silently if a value is malformed
  const colorPrimary = sanitizeHex(input.color_primary, '#1B4332');
  const colorAccent = sanitizeHex(input.color_accent, '#C9A84C');
  const colorBackground = sanitizeHex(input.color_background, '#F5F0E8');

  // City name is required (we already require it via NOT NULL on the column)
  const cityName = input.city_name.trim();
  if (!cityName) {
    return { ok: false as const, error: 'City name is required.' };
  }

  const { error } = await supabase
    .from('cities')
    .update({
      // Operator
      operator_name: input.operator_name.trim() || null,
      operator_type: operatorType,
      operator_email: input.operator_email.trim() || null,
      operator_attribution_text: input.operator_attribution_text.trim() || null,
      // City branding
      name: cityName,
      postcode_area: input.postcode_area.trim() || null,
      splash_intro: input.splash_intro.trim() || null,
      color_primary: colorPrimary,
      color_accent: colorAccent,
      color_background: colorBackground,
      // Guide
      guide_name: input.guide_name.trim() || 'Guide',
      guide_voice_id: input.guide_voice_id.trim() || null,
      // Tour completion
      tour_complete_message: input.tour_complete_message.trim() || null,
      tour_complete_suggestion: input.tour_complete_suggestion.trim() || null,
      draft_updated_at: new Date().toISOString(),
    })
    .eq('id', input.cityId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  revalidatePath(`/dashboard/${input.citySlug}`);
  revalidatePath(`/dashboard/${input.citySlug}/settings`);
  revalidatePath('/dashboard');

  return { ok: true as const };
}

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
];

export async function uploadOperatorLogo(formData: FormData) {
  const file = formData.get('file') as File | null;
  const cityId = String(formData.get('cityId') ?? '');
  const citySlug = String(formData.get('citySlug') ?? '');

  if (!file || file.size === 0) {
    return { ok: false as const, error: 'No file selected.' };
  }
  if (!cityId || !citySlug) {
    return { ok: false as const, error: 'Missing city identifier.' };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return {
      ok: false as const,
      error: `File too large. Max 5 MB (yours is ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    };
  }
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return {
      ok: false as const,
      error: 'Use JPEG, PNG, WebP, or SVG.',
    };
  }

  const supabase = await createClient();

  const ext =
    file.type === 'image/svg+xml'
      ? 'svg'
      : file.name.split('.').pop()?.toLowerCase() || 'png';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'png';
  const path = `${citySlug}/logo-${Date.now()}.${safeExt}`;

  const { data: existingCity } = await supabase
    .from('cities')
    .select('operator_logo_url')
    .eq('id', cityId)
    .single();

  const { error: uploadErr } = await supabase.storage
    .from('operator-logos')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadErr) {
    return {
      ok: false as const,
      error: `Upload failed: ${uploadErr.message}`,
    };
  }

  const { data: pub } = supabase.storage
    .from('operator-logos')
    .getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { error: updateErr } = await supabase
    .from('cities')
    .update({
      operator_logo_url: publicUrl,
      draft_updated_at: new Date().toISOString(),
    })
    .eq('id', cityId);

  if (updateErr) {
    await supabase.storage.from('operator-logos').remove([path]);
    return {
      ok: false as const,
      error: `DB write failed: ${updateErr.message}`,
    };
  }

  // Best-effort: delete the previous logo file
  if (existingCity?.operator_logo_url) {
    const oldPath = extractOperatorLogoPath(existingCity.operator_logo_url);
    if (oldPath && oldPath !== path) {
      await supabase.storage.from('operator-logos').remove([oldPath]);
    }
  }

  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/settings`);

  return { ok: true as const, url: publicUrl };
}

export async function removeOperatorLogo(cityId: string, citySlug: string) {
  const supabase = await createClient();

  const { data: city } = await supabase
    .from('cities')
    .select('operator_logo_url')
    .eq('id', cityId)
    .single();

  if (city?.operator_logo_url) {
    const path = extractOperatorLogoPath(city.operator_logo_url);
    if (path) {
      await supabase.storage.from('operator-logos').remove([path]);
    }
  }

  const { error } = await supabase
    .from('cities')
    .update({
      operator_logo_url: null,
      draft_updated_at: new Date().toISOString(),
    })
    .eq('id', cityId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  revalidatePath(`/dashboard/${citySlug}`);
  revalidatePath(`/dashboard/${citySlug}/settings`);

  return { ok: true as const };
}

function extractOperatorLogoPath(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/operator-logos/';
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return publicUrl.substring(idx + marker.length).split('?')[0];
}
