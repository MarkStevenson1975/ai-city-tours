// POST /api/build/draft
// Body: { citySlug, name, area, guideName? }
// Drafts a tour stop in the StorieD voice using Claude: a short description,
// a spoken narration, and three facts. Returns the draft for the operator to
// accept or edit. Uses CLAUDE_API_KEY (server only, same key as the public
// tour app). Add it to this Vercel project.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceAiLimit, AI_UNAVAILABLE_MESSAGE } from '@/lib/ai-rate-limit';
import { generateNarration } from '@/lib/narration';

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

  const draft = await generateNarration(apiKey, name, area, guideName);
  if (!draft) {
    return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 502 });
  }
  return NextResponse.json(draft);
}
