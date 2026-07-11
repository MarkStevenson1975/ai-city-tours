// POST /api/promote/social
// Body: { citySlug }
// Drafts three lift-and-drop social posts (Facebook, Instagram, LinkedIn) for
// an area's live tour, in the Storied brand voice. Uses CLAUDE_API_KEY (server
// only, same key as the tour builder). Returns { facebook, instagram, linkedin }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceAiLimit, AI_UNAVAILABLE_MESSAGE } from '@/lib/ai-rate-limit';

const TOUR_BASE = process.env.PUBLIC_TOUR_URL ?? 'https://storied-tours.vercel.app';

function buildPrompt(opts: {
  name: string;
  attribution: string;
  liveUrl: string;
  firstStops: string[];
}) {
  const { name, attribution, liveUrl, firstStops } = opts;
  const stopLine = firstStops.length
    ? `Some of the stops on the tour: ${firstStops.join(', ')}.`
    : '';
  return `You are writing social media posts for the operator of a new Storied walking tour, announcing that the tour is now live. The town is ${name}. The tour is brought to you by ${attribution || name}. ${stopLine}

Storied is a free, browser-based guided walking tour. Visitors scan a QR code or tap a link and the tour opens in their phone. No app to download, no account needed.

Write three posts, one each for Facebook, Instagram and LinkedIn. The operator will copy and paste them.

Voice and rules (follow exactly):
- Warm, specific, human. British English. Knowledgeable, never salesy.
- Do NOT use em dashes anywhere. Use full stops, commas, or parentheses.
- No exclamation marks. No hollow superlatives (amazing, incredible, stunning, must-see, hidden gem, vibrant, bustling).
- Earn warmth through specific detail, not adjectives.
- End each post with the attribution line "Brought to you by ${attribution || name}." on its own.
- Include the tour link ${liveUrl} where natural (for Instagram, say "link in our bio" instead, since Instagram does not allow links in captions).

Per channel:
- Facebook: 3 short paragraphs, community and visitor focused. Include the link.
- Instagram: punchy, a few short lines, then 5 to 8 relevant hashtags on the last line (include the town name). Say "link in our bio" rather than a URL.
- LinkedIn: professional, peer to peer. One stat is allowed: around a quarter of domestic overnight trips in the UK now go to small market towns. Frame the tour as good for the high street. Include the link.

Return ONLY valid JSON, no markdown, in exactly this shape:
{
  "facebook": "the full facebook post text",
  "instagram": "the full instagram caption including hashtags",
  "linkedin": "the full linkedin post text"
}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Social drafting is not configured (CLAUDE_API_KEY).' },
      { status: 503 }
    );
  }

  const limit = await enforceAiLimit(supabase, 'promote_social');
  if (!limit.ok) {
    return NextResponse.json({ error: limit.message }, { status: limit.status });
  }

  const body = await req.json().catch(() => ({}));
  const citySlug = String(body.citySlug ?? '').trim();
  if (!citySlug) {
    return NextResponse.json({ error: 'Missing area' }, { status: 400 });
  }

  const { data: city } = await supabase
    .from('cities')
    .select('id, name, slug, operator_name, operator_attribution_text')
    .eq('slug', citySlug)
    .single();
  if (!city) {
    return NextResponse.json({ error: 'Area not found' }, { status: 404 });
  }

  const { data: stops } = await supabase
    .from('stops')
    .select('name')
    .eq('city_id', city.id)
    .order('position')
    .limit(4);

  // Campaign-tagged link so Google Analytics attributes visits from these
  // posts to social rather than lumping them in with direct traffic.
  const liveUrl = `${TOUR_BASE}/${city.slug}?utm_source=social&utm_medium=organic_social&utm_campaign=${city.slug}`;
  const attribution = city.operator_attribution_text || city.operator_name || '';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1400,
        messages: [
          {
            role: 'user',
            content: buildPrompt({
              name: city.name,
              attribution,
              liveUrl,
              firstStops: (stops ?? []).map((s) => s.name).filter(Boolean),
            }),
          },
        ],
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('promote/social AI failure:', r.status, detail.slice(0, 300));
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 502 });
    }

    const j = await r.json();
    const text: string = j?.content?.[0]?.text ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      console.error('promote/social: unexpected AI format');
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 502 });
    }
    const parsed = JSON.parse(text.slice(start, end + 1));

    return NextResponse.json({
      facebook: String(parsed.facebook ?? '').trim(),
      instagram: String(parsed.instagram ?? '').trim(),
      linkedin: String(parsed.linkedin ?? '').trim(),
    });
  } catch (e) {
    console.error('promote/social error:', e);
    return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 502 });
  }
}
