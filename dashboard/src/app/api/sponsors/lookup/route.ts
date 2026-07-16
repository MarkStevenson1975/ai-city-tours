// POST /api/sponsors/lookup
// Body: { query: string, area?: string }
// query = a Google Maps/Business link OR a business name.
//
// Resolves the business via Google, then hands back everything needed to fill
// the Add Sponsor form: name, category, a suggested emoji, latitude/longitude
// (so the operator never types coordinates), the Google listing URL, the
// business's own website (for the "Visit website" button), and an AI-drafted
// tagline + spoken line.
//
// ETHICS: the drafted copy is grounded ONLY in the factual inputs. The prompt
// forbids invented claims ("award-winning", "best", "famous"), made-up offers,
// prices, or ratings. Everything is editable, and the sponsor has the final say.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceAiLimit } from '@/lib/ai-rate-limit';
import { DRAFT_MODEL } from '@/lib/narration';

function nameFromMapsUrl(u: string): string | null {
  const m = u.match(/\/place\/([^/@]+)/) || u.match(/\/search\/([^/@]+)/);
  if (m) {
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim(); } catch { return m[1]; }
  }
  try {
    const url = new URL(u);
    const q = url.searchParams.get('q') || url.searchParams.get('query');
    if (q && !/^[-\d.,]+$/.test(q)) return q.trim();
  } catch { /* ignore */ }
  return null;
}

// Google place types → a friendly, human category.
const CATEGORY_MAP: Record<string, string> = {
  cafe: 'Café', coffee_shop: 'Café', bakery: 'Bakery',
  restaurant: 'Restaurant', meal_takeaway: 'Takeaway', meal_delivery: 'Takeaway',
  bar: 'Bar', pub: 'Pub', night_club: 'Bar',
  book_store: 'Bookshop', clothing_store: 'Shop', gift_shop: 'Gift shop',
  home_goods_store: 'Shop', furniture_store: 'Shop', jewelry_store: 'Jeweller',
  florist: 'Florist', store: 'Shop', grocery_or_supermarket: 'Shop',
  art_gallery: 'Gallery', museum: 'Museum', park: 'Park',
  tourist_attraction: 'Attraction', lodging: 'Place to stay', spa: 'Wellbeing',
};
const EMOJI_MAP: Record<string, string> = {
  cafe: '☕', coffee_shop: '☕', bakery: '🥐',
  restaurant: '🍽️', meal_takeaway: '🥡', meal_delivery: '🥡',
  bar: '🍺', pub: '🍺', night_club: '🍸',
  book_store: '📚', clothing_store: '🛍️', gift_shop: '🎁',
  home_goods_store: '🛍️', furniture_store: '🛋️', jewelry_store: '💍',
  florist: '💐', store: '🛍️', grocery_or_supermarket: '🛒',
  art_gallery: '🎨', museum: '🏛️', park: '🌳', lodging: '🛏️', spa: '💆',
};

function categoryFor(types: string[]): string {
  for (const t of types) if (CATEGORY_MAP[t]) return CATEGORY_MAP[t];
  return 'Local business';
}
function emojiFor(types: string[]): string {
  for (const t of types) if (EMOJI_MAP[t]) return EMOJI_MAP[t];
  return '✨';
}

async function draftCopy(
  apiKey: string,
  name: string,
  category: string,
  area: string,
  editorial: string
): Promise<{ tagline: string; narration: string }> {
  const grounding = editorial
    ? `Google's own short description of the business is: "${editorial}". You may draw on this.`
    : 'You have no description beyond the name and category, so keep it general and honest.';

  const prompt = `You are writing two short pieces for a local walking-tour app, on behalf of a business that is sponsoring a stop. The business is "${name}", a ${category}${area ? ` in ${area}` : ''}. ${grounding}

Write, as JSON only:
{"tagline":"...","narration":"..."}

- "tagline": one short line (max 90 characters) that could sit on a card. Factual and inviting.
- "narration": one warm sentence (max 200 characters) that the tour guide speaks aloud as a walker passes, gently suggesting they visit.

STRICT RULES, follow them exactly:
- Use ONLY what you have been told. Do NOT invent facts, history, menu items, prices, opening hours, or specialities you were not given.
- Do NOT use superlatives or unverifiable claims: no "award-winning", "best", "famous", "renowned", "finest", "must-see", "world-class", star ratings, or "voted".
- No pressure or fake urgency ("don't miss", "hurry").
- British English. Warm, understated, genuine. No em dashes. No emoji.
- If you genuinely have little to say, keep it simple and honest rather than embellishing.

Return the JSON object and nothing else.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: DRAFT_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) return { tagline: '', narration: '' };
    const j = await r.json();
    const text: string = j?.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { tagline: '', narration: '' };
    const parsed = JSON.parse(match[0]);
    return {
      tagline: String(parsed.tagline ?? '').slice(0, 160),
      narration: String(parsed.narration ?? '').slice(0, 400),
    };
  } catch {
    return { tagline: '', narration: '' };
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;
  if (!mapsKey) return NextResponse.json({ error: 'Lookup is not configured.' }, { status: 503 });

  const limit = await enforceAiLimit(supabase, 'sponsor_lookup');
  if (!limit.ok) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const body = await req.json().catch(() => ({}));
  let query = String(body.query ?? '').trim();
  const area = String(body.area ?? '').trim();
  if (!query) return NextResponse.json({ error: 'Paste a Google link or type the business name.' }, { status: 400 });

  // Expand short links so we can read the business name.
  if (/maps\.app\.goo\.gl|goo\.gl\/maps|share\.google/.test(query)) {
    try {
      const r = await fetch(query, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StorieD/1.0)' } });
      if (r.url) query = r.url;
    } catch { /* ignore */ }
  }
  const searchText = (query.startsWith('http') ? nameFromMapsUrl(query) : query) || query;

  try {
    // 1) Find the business.
    const sp = new URLSearchParams({ query: area ? `${searchText} ${area}` : searchText, region: 'gb', key: mapsKey });
    const sr = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${sp}`);
    const sj = await sr.json();
    const hit = sj?.results?.[0];
    if (!hit?.geometry?.location || !hit.place_id) {
      return NextResponse.json({ error: 'Could not find that business. Try its exact name or the Google link.' }, { status: 404 });
    }

    const placeId = hit.place_id as string;
    const lat = hit.geometry.location.lat as number;
    const lng = hit.geometry.location.lng as number;

    // 2) Pull details: website, listing URL, types, editorial summary, address.
    const dp = new URLSearchParams({
      place_id: placeId,
      fields: 'name,types,website,url,editorial_summary,formatted_address',
      key: mapsKey,
    });
    const dr = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${dp}`);
    const dj = await dr.json();
    const det = dj?.result ?? {};

    const name = String(det.name ?? hit.name ?? searchText).slice(0, 60);
    const types: string[] = Array.isArray(det.types) ? det.types : (hit.types ?? []);
    const category = categoryFor(types);
    const emoji = emojiFor(types);
    const website = String(det.website ?? '');
    const googleBusinessUrl = String(det.url ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`);
    const address = String(det.formatted_address ?? '');
    const editorial = String(det.editorial_summary?.overview ?? '');

    // 3) Honest, grounded copy.
    const copy = claudeKey
      ? await draftCopy(claudeKey, name, category, area, editorial)
      : { tagline: '', narration: '' };

    return NextResponse.json({
      name,
      category,
      emoji,
      tagline: copy.tagline,
      narration: copy.narration,
      lat,
      lng,
      googlePlaceId: placeId,
      googleBusinessUrl,
      ctaUrl: website,
      ctaLabel: website ? 'Visit website' : '',
      address,
      // truthfully tell the UI whether AI copy came back
      aiDrafted: Boolean(copy.tagline || copy.narration),
    });
  } catch (e) {
    console.error('sponsors/lookup error:', e);
    return NextResponse.json(
      { error: 'We could not look that up just now. Please try again, or fill the form in by hand.' },
      { status: 502 }
    );
  }
}
