// POST /api/build/lookup
// Body: { query: string, citySlug: string, area?: string }
// query = a Google Maps link OR a place name. Resolves it via Google Places,
// then drafts the stop with Claude. Returns everything needed to autofill the
// add/edit stop form: name, lat, lng, google listing URL, hero image, short
// description, narration and facts.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceAiLimit } from '@/lib/ai-rate-limit';

const BANNED = [
  'nestled', 'bustling', 'hidden gem', 'rich history', 'boasts',
  'stands as a testament', 'in the heart of', 'whether you', 'no visit is complete',
];

function nameFromMapsUrl(u: string): string | null {
  const m = u.match(/\/place\/([^/@]+)/) || u.match(/\/search\/([^/@]+)/);
  if (m) {
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim(); } catch { return m[1]; }
  }
  return null;
}

async function draftStop(name: string, area: string, apiKey: string) {
  const prompt = `You are Harriet, the warm, vivid walking-tour guide for StorieD.
Write a tour stop for "${name}"${area ? ` in ${area}` : ''}.
Rules: second person, spoken aloud as if standing in front of it; warm and human, never flowery; British English; no em dashes; do not use any of these words: ${BANNED.join(', ')}; if unsure of a fact, keep it general.
Return ONLY valid JSON: {"shortDescription":"one sentence under 30 words","narration":"180 to 320 words","facts":["fact one","fact two","fact three"]}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text: string = j?.content?.[0]?.text ?? '';
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    const parsed = JSON.parse(text.slice(s, e + 1));
    return {
      shortDescription: String(parsed.shortDescription ?? '').trim(),
      narration: String(parsed.narration ?? '').trim(),
      facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 5).map((f: unknown) => String(f).trim()) : [],
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;
  if (!mapsKey) return NextResponse.json({ error: 'Place lookup is not configured.' }, { status: 503 });

  const limit = await enforceAiLimit(supabase, 'build_lookup');
  if (!limit.ok) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const body = await req.json().catch(() => ({}));
  let query = String(body.query ?? '').trim();
  const citySlug = String(body.citySlug ?? '').trim();
  const area = String(body.area ?? '').trim();
  if (!query) return NextResponse.json({ error: 'Paste a Google Maps link or type the place name.' }, { status: 400 });

  // Resolve a short Google link to its full URL so we can read the place name.
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/.test(query)) {
    try {
      const r = await fetch(query, { redirect: 'follow' });
      if (r.url) query = r.url;
    } catch { /* ignore */ }
  }
  const searchText = (query.startsWith('http') ? nameFromMapsUrl(query) : query) || query;

  try {
    const params = new URLSearchParams({
      query: area ? `${searchText} ${area}` : searchText,
      region: 'gb',
      key: mapsKey,
    });
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
    const j = await r.json();
    const place = j?.results?.[0];
    if (!place?.geometry?.location) {
      return NextResponse.json({ error: 'Could not find that place. Try the exact name or a different link.' }, { status: 404 });
    }

    const lat = place.geometry.location.lat as number;
    const lng = place.geometry.location.lng as number;
    const name = String(place.name ?? searchText);
    const placeId = place.place_id as string | undefined;
    const googleBusinessUrl = placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : '';

    // Pull a photo into storage so the form can prefill the image URL.
    let heroImageUrl = '';
    const photoRef = place.photos?.[0]?.photo_reference as string | undefined;
    if (photoRef && citySlug) {
      try {
        const admin = createAdminClient();
        const purl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(photoRef)}&key=${mapsKey}`;
        const presp = await fetch(purl);
        if (presp.ok) {
          const ct = presp.headers.get('content-type') || 'image/jpeg';
          const ext = ct.includes('png') ? 'png' : 'jpg';
          const bytes = new Uint8Array(await presp.arrayBuffer());
          const path = `${citySlug}/autofill-${Date.now()}.${ext}`;
          const { error: upErr } = await admin.storage.from('stop-images').upload(path, bytes, { contentType: ct, upsert: true, cacheControl: '3600' });
          if (!upErr) heroImageUrl = admin.storage.from('stop-images').getPublicUrl(path).data.publicUrl;
        }
      } catch { /* image is best-effort */ }
    }

    const draft = claudeKey ? await draftStop(name, area, claudeKey) : null;

    return NextResponse.json({
      name,
      lat,
      lng,
      googleBusinessUrl,
      heroImageUrl,
      shortDescription: draft?.shortDescription ?? '',
      narration: draft?.narration ?? '',
      facts: draft?.facts ?? [],
    });
  } catch (e) {
    console.error('build/lookup error:', e);
    return NextResponse.json(
      {
        error:
          'We could not look that place up just now. Please try again in a moment, or add the stop details by hand.',
      },
      { status: 502 }
    );
  }
}
