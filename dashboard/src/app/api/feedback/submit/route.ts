// POST /api/feedback/submit
// Body: { messages: [{ role, content }], citySlug? }
// Compiles the feedback conversation into a tidy summary via Claude, then
// posts the whole package to a Make webhook, which emails it to
// team@thesetupcrew.co.uk. Uses CLAUDE_API_KEY and MAKE_FEEDBACK_WEBHOOK_URL
// (both server only). Returns { ok: true }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function compilePrompt(transcript: string) {
  return `Below is a feedback conversation between the StorieD feedback assistant and an operator who uses the dashboard. Read it and produce a short, plain summary for the team inbox.

Rules:
- British English. No em dashes. No hollow superlatives.
- Be faithful to what the operator actually said. Do not invent issues or praise.
- If the operator did not raise anything in a section, write "Nothing raised".

Return ONLY valid JSON, no markdown, in exactly this shape:
{
  "headline": "one short line capturing the overall mood and main point",
  "sentiment": "Positive | Mixed | Negative | Unclear",
  "going_well": "what is working for them, or Nothing raised",
  "issues": "problems, bugs or confusion they mentioned, or Nothing raised",
  "requests": "features or changes they asked for, or Nothing raised",
  "suggested_follow_up": "one practical next step for the team, or None needed"
}

Conversation:
${transcript}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const webhookUrl = process.env.MAKE_FEEDBACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'Feedback delivery is not configured (MAKE_FEEDBACK_WEBHOOK_URL).' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const rawMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const citySlug = body.citySlug ? String(body.citySlug) : null;

  const messages = rawMessages.filter(
    (m) =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0
  );

  // Require at least one operator message so we never email an empty form.
  const hasOperatorInput = messages.some((m) => m.role === 'user');
  if (!hasOperatorInput) {
    return NextResponse.json(
      { error: 'Please share a little feedback before sending.' },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name, role')
    .eq('id', user.id)
    .single();

  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'Operator' : 'Assistant'}: ${m.content.trim()}`)
    .join('\n');

  // Compile a tidy summary. If the AI step fails, we still send the raw
  // transcript so feedback is never lost.
  let summary: Record<string, string> | null = null;
  const apiKey = process.env.CLAUDE_API_KEY;
  if (apiKey) {
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
          max_tokens: 700,
          messages: [{ role: 'user', content: compilePrompt(transcript.slice(0, 12000)) }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const text: string = j?.content?.[0]?.text ?? '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          summary = JSON.parse(text.slice(start, end + 1));
        }
      }
    } catch {
      // Non-fatal: fall back to the raw transcript below.
      summary = null;
    }
  }

  const payload = {
    source: 'storied-dashboard-feedback',
    submittedAt: new Date().toISOString(),
    operator: {
      name: profile?.display_name ?? '',
      email: user.email ?? '',
      role: profile?.role ?? 'operator',
    },
    citySlug,
    summary,
    transcript,
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Could not send feedback: ${res.status} ${detail.slice(0, 200)}` },
        { status: 502 }
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'send failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
