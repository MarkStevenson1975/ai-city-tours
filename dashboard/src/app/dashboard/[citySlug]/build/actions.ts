'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceAiLimit } from '@/lib/ai-rate-limit';
import { trackOperator } from '@/lib/track-operator';

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

// Generate ~20 standalone "Interesting <town> fact" entries with Claude,
// avoiding anything already said on the stops, and store them as ambient
// location facts (no coordinates) so they power the city-fact button only.
async function generateTownFacts(
  admin: ReturnType<typeof createAdminClient>,
  cityId: string,
  area: string,
  existingFacts: string[],
  apiKey: string | undefined
) {
  if (!apiKey) return;
  // Don't duplicate if this tour already has ambient facts.
  const { count } = await admin
    .from('location_facts')
    .select('id', { count: 'exact', head: true })
    .eq('city_id', cityId);
  if ((count ?? 0) > 0) return;

  const avoid = existingFacts.slice(0, 80).map((f) => `- ${f}`).join('\n');
  const prompt = `You are writing standalone "did you know" facts for a walking tour of ${area}.
Produce exactly 20 short, accurate, interesting facts about ${area}: history, geography, culture, notable people, architecture, industry, quirks.
British English. No em dashes. Each fact is one self-contained sentence under 30 words.
Do NOT repeat or paraphrase any of these facts already used on the tour stops:
${avoid || '(none)'}
Return ONLY a JSON array of 20 strings, nothing else.`;

  let parsed: unknown = [];
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) return;
    const j = await r.json();
    const text: string = j?.content?.[0]?.text ?? '';
    const s = text.indexOf('[');
    const e = text.lastIndexOf(']');
    if (s === -1 || e === -1) return;
    parsed = JSON.parse(text.slice(s, e + 1));
  } catch {
    return;
  }

  const rows = (Array.isArray(parsed) ? parsed : [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((t) => ({
      city_id: cityId,
      text: t,
      lat: null,
      lng: null,
      radius_metres: null,
      fact_type: 'fact',
      priority: 100,
    }));
  if (rows.length) {
    try { await admin.from('location_facts').insert(rows); } catch { /* non-blocking */ }
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
    .select('id, name, splash_image_url')
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

  // Pre-populate ~20 standalone town facts, deduped against the stop facts.
  // Skip silently if the operator is over their AI limit; stops are already
  // saved, and the facts are a nice-to-have they can generate later.
  try {
    const factsLimit = await enforceAiLimit(supabase, 'build_town_facts');
    if (factsLimit.ok) {
      const existingFacts = stops.flatMap((s) => s.facts ?? []);
      await generateTownFacts(admin, city.id, city.name ?? citySlug, existingFacts, process.env.CLAUDE_API_KEY);
    }
  } catch { /* non-blocking */ }

  // Give the tour a welcome image for free: take the first stop's photo rather
  // than asking the operator to go and find one. They can swap it in Settings.
  // (The public tour and the poster already fall back to stop 1 anyway, so this
  // just makes the choice explicit and editable.)
  const cityUpdate: Record<string, string> = {
    draft_updated_at: new Date().toISOString(),
  };
  if (!city.splash_image_url) {
    const { data: firstStop } = await admin
      .from('stops')
      .select('hero_image_url, hero_image_override_url')
      .eq('city_id', city.id)
      .not('hero_image_url', 'is', null)
      .order('position')
      .limit(1)
      .maybeSingle();

    const inherited =
      firstStop?.hero_image_override_url || firstStop?.hero_image_url || null;
    if (inherited) cityUpdate.splash_image_url = inherited;
  }

  await admin.from('cities').update(cityUpdate).eq('id', city.id);

  await trackOperator(user.id, 'stops_saved', {
    cityId: city.id,
    meta: { stops: saved },
  });

  revalidatePath(`/dashboard/${citySlug}`);
  return { ok: true as const, count: saved };
}
