// POST /api/build/draft
// Body: { citySlug, name, area, guideName? }
// Drafts a tour stop in the StorieD voice using Claude: a short description,
// a spoken narration, and three facts. Returns the draft for the operator to
// accept or edit. Uses CLAUDE_API_KEY (server only, same key as the public
// tour app). Add it to this Vercel project.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceAiLimit } from '@/lib/ai-rate-limit';

const BANNED = [
  'nestled', 'bustling', 'hidden gem', 'rich history', 'boasts',
  'stands as a testament', 'in the heart of', 'whether you', 'no visit is complete',
];

function buildPrompt(name: string, area: string, guideName: string) {
  return `You are ${guideName}, the warm, vivid walking-tour guide for StorieD.
Write a tour stop for "${name}" in ${area}.

Rules:
- Second person, spoken aloud, as if standing in front of it.
- Warm and human, never flowery or salesy.
- British English.
- Do NOT use em dashes anywhere. Use full stops or commas.
- Do NOT use any of these words or phrases: ${BANNED.join(', ')}.
- If you are unsure of a fact, keep it general rather than inventing specifics.

Return ONLY valid JSON, no markdown, in exactly this shape:
{
  "shortDescription": "one sentence, under 30 words",
  "narration": "180 to 320 words of spoken narration",
  "facts": ["fact one", "fact two", "fact three"]
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
      { error: 'AI drafting is not configured (CLAUDE_API_KEY).' },
      { status: 503 }
    );
  }

  const limit = await enforceAiLimit(supabase, 'build_draft');
  if (!limit.ok) {
    return NextResponse.json({ error: limit.message }, { status: limit.status });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const area = String(body.area ?? '').trim();
  const guideName = String(body.guideName ?? 'Harriet').trim() || 'Harriet';
  if (!name) {
    return NextResponse.json({ error: 'Missing place name' }, { status: 400 });
  }

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
        max_tokens: 1200,
        messages: [{ role: 'user', content: buildPrompt(name, area, guideName) }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return NextResponse.json(
        { error: `AI draft failed: ${r.status} ${detail.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const j = await r.json();
    const text: string = j?.content?.[0]?.text ?? '';

    // Pull the JSON object out of the response, tolerating any stray text.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'AI returned an unexpected format' }, { status: 502 });
    }
    const parsed = JSON.parse(text.slice(start, end + 1));

    return NextResponse.json({
      shortDescription: String(parsed.shortDescription ?? '').trim(),
      narration: String(parsed.narration ?? '').trim(),
      facts: Array.isArray(parsed.facts)
        ? parsed.facts.slice(0, 3).map((f: unknown) => String(f).trim())
        : [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'draft failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
