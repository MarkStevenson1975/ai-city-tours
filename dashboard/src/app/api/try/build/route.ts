// POST /api/try/build  (PUBLIC, no auth)
// Body: { area, org?, place: { placeId, name, lat, lng, photoRef?, category? } }
// Builds a one-stop EXAMPLE tour for a demo prospect: creates an isolated
// example city (is_example, no owner, example-<town>-<rand> slug), generates the
// chosen stop for real (narration, photo, facts), and publishes it so it can be
// previewed. Rate limited per IP. The stop is genuine; the rest of the "tour" is
// presented as a preview on the result page.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchPlacePhoto } from '@/lib/places';

const TOUR_BASE = process.env.PUBLIC_TOUR_URL ?? 'https://storied-tours.vercel.app';
const PER_IP_PER_DAY = 6;

const BANNED = [
  'nestled', 'bustling', 'hidden gem', 'rich history', 'boasts',
  'stands as a testament', 'in the heart of', 'whether you', 'no visit is complete',
];

function tidyPlace(v: string): string {
  return v.trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}
function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'town';
}
function rand(): string {
  return Math.random().toString(36).slice(2, 7);
}
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function narrationPrompt(name: string, area: string): string {
  return `You are Harriet, the warm, vivid walking-tour guide for StorieD.
Write a tour stop for "${name}" in ${area}.
Rules: second person, spoken aloud as if standing in front of it; warm and human, never flowery or salesy; British English; do NOT use em dashes; do NOT use any of these words: ${BANNED.join(', ')}; if unsure of a fact, keep it general.
Return ONLY valid JSON, no markdown, in exactly this shape:
{"shortDescription":"one sentence under 30 words","narration":"180 to 320 words of spoken narration","facts":["fact one","fact two","fact three"]}`;
}

export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;

  const body = await req.json().catch(() => ({}));
  const area = String(body.area ?? '').trim();
  const org = body.org ? String(body.org).slice(0, 120) : null;
  const place = body.place ?? {};
  const placeName = String(place.name ?? '').trim();
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  const photoRef = place.photoRef ? String(place.photoRef) : null;
  const placeId = place.placeId ? String(place.placeId) : null;

  if (!area || !placeName || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Missing town or landmark.' }, { status: 400 });
  }

  // Rate limit: cap example builds per IP per day.
  const ip = clientIp(req);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('cities')
    .select('id', { count: 'exact', head: true })
    .eq('is_example', true)
    .eq('example_ip', ip)
    .gte('created_at', since);
  if ((count ?? 0) >= PER_IP_PER_DAY) {
    return NextResponse.json(
      { error: 'You have built a few demos today. Please come back tomorrow, or claim one to keep going.' },
      { status: 429 }
    );
  }

  const townName = tidyPlace(area);
  const slug = `example-${slugify(area)}-${rand()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Create the isolated example city (no owner).
  const { data: city, error: cityErr } = await admin
    .from('cities')
    .insert({
      slug,
      name: townName,
      guide_name: 'Harriet',
      is_example: true,
      example_org: org,
      example_ip: ip,
      expires_at: expiresAt,
      subscription_status: 'trial',
    })
    .select('id')
    .single();
  if (cityErr || !city) {
    console.error('try/build city insert failed:', cityErr);
    return NextResponse.json({ error: 'Could not start your demo. Please try again.' }, { status: 502 });
  }

  // Generate the stop for real.
  let shortDescription = '';
  let narration = '';
  let facts: string[] = [];
  if (claudeKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          messages: [{ role: 'user', content: narrationPrompt(placeName, townName) }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const text: string = j?.content?.[0]?.text ?? '';
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
          const parsed = JSON.parse(text.slice(s, e + 1));
          shortDescription = String(parsed.shortDescription ?? '').trim();
          narration = String(parsed.narration ?? '').trim();
          facts = Array.isArray(parsed.facts) ? parsed.facts.slice(0, 3).map((f: unknown) => String(f).trim()) : [];
        }
      }
    } catch (e) {
      console.error('try/build narration failed:', e);
    }
  }

  // Insert the stop.
  const { data: stop, error: stopErr } = await admin
    .from('stops')
    .insert({
      city_id: city.id,
      position: 1,
      name: placeName,
      short_description: shortDescription || null,
      narration: narration || null,
      facts,
      lat,
      lng,
      google_business_url: placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null,
    })
    .select('id')
    .single();
  if (stopErr || !stop) {
    console.error('try/build stop insert failed:', stopErr);
    return NextResponse.json({ error: 'Could not build your stop. Please try again.' }, { status: 502 });
  }

  // Store the photo (best effort).
  if (photoRef && mapsKey) {
    try {
      const photo = await fetchPlacePhoto(photoRef, mapsKey);
      if (photo) {
        const ext = photo.contentType.includes('png') ? 'png' : 'jpg';
        const path = `${slug}/stop-1.${ext}`;
        const { error: upErr } = await admin.storage
          .from('stop-images')
          .upload(path, photo.bytes, { contentType: photo.contentType, upsert: true, cacheControl: '3600' });
        if (!upErr) {
          const publicUrl = admin.storage.from('stop-images').getPublicUrl(path).data.publicUrl;
          await admin.from('stops').update({ hero_image_url: publicUrl }).eq('id', stop.id);
        }
      }
    } catch (e) {
      console.error('try/build photo failed (non-fatal):', e);
    }
  }

  // Publish so the demo can be previewed.
  try {
    const { data: config } = await admin.rpc('build_city_config', { p_city_id: city.id });
    await admin
      .from('cities')
      .update({ published_config: config, published_version: 1, published_at: new Date().toISOString() })
      .eq('id', city.id);
  } catch (e) {
    console.error('try/build publish failed:', e);
  }

  return NextResponse.json({
    slug,
    town: townName,
    stopName: placeName,
    tourUrl: `${TOUR_BASE}/${slug}`,
  });
}
