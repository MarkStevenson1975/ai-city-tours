// POST /api/feedback/chat
// Body: { messages: [{ role: 'user' | 'assistant', content: string }] }
// Runs a short, warm feedback conversation in the StorieD voice using Claude.
// The widget asks operators how they are getting on and gently probes for
// issues. Returns { reply }. Uses CLAUDE_API_KEY (server only, same key as
// the tour drafting routes).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceAiLimit, AI_UNAVAILABLE_MESSAGE } from '@/lib/ai-rate-limit';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const MAX_TURNS = 16; // hard cap so a session cannot run forever

function systemPrompt(operatorName: string, citySlug: string | null) {
  const who = operatorName ? operatorName.split(' ')[0] : 'there';
  const place = citySlug ? ` They are working on the ${citySlug} tour.` : '';
  return `You are the StorieD feedback assistant, speaking on behalf of The SetUp Crew team. You are talking to ${who}, an operator using the StorieD dashboard to build a walking tour.${place}

Your job is to actively guide them through giving feedback. Do not sit back and wait for a blank answer. You have three things to find out, and you should lead them through each one with a clear, specific question:

1. What is working well for them at the moment, what do they like or find easy.
2. Whether they are having any issues, anything confusing, slow, or broken.
3. What developments or new features they would like to see.

How to run the conversation:
- Always ask about ONE of the three areas at a time, with a concrete question. For example: "First off, what is working well for you so far?", then later "Are you running into any issues or anything that feels fiddly?", then "Is there anything you would love to see us add or change?"
- Acknowledge what they say in a sentence, then move them on to the next area. Work through all three unless they clearly have nothing for one, in which case move on.
- If they raise a problem or a request, ask one gentle follow-up to understand it properly, then continue.

Voice and rules:
- Warm, conversational, peer to peer. Dry British understatement is welcome. You are a person, not a survey form.
- Short replies. One question at a time. Never a wall of text.
- British English. Do NOT use em dashes anywhere. Use full stops, commas, or parentheses.
- Do not use hollow superlatives (amazing, incredible, stunning, game-changing).
- Do not invent features or make promises about fixes or timelines. If they ask for something, say you will pass it to the team.
- Once you have covered the three areas, or whenever they seem done, warmly let them know they can press "Send to the team" whenever they are ready, and that you will pass it all on. Do not nag.
- Keep it feeling like a quick, guided chat, not an interrogation.`;
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
      { error: 'Feedback chat is not configured (CLAUDE_API_KEY).' },
      { status: 503 }
    );
  }

  const limit = await enforceAiLimit(supabase, 'feedback_chat');
  if (!limit.ok) {
    return NextResponse.json({ error: limit.message }, { status: limit.status });
  }

  const body = await req.json().catch(() => ({}));
  const rawMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const citySlug = body.citySlug ? String(body.citySlug) : null;

  // Pull a friendly name for the operator from their profile.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const operatorName = profile?.display_name ?? '';

  // Sanitise + cap the conversation we forward to the model.
  const messages = rawMessages
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

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
        max_tokens: 400,
        system: systemPrompt(operatorName, citySlug),
        messages:
          messages.length > 0
            ? messages
            : [{ role: 'user', content: '(The operator just opened the feedback chat.)' }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('feedback/chat AI failure:', r.status, detail.slice(0, 300));
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 502 });
    }

    const j = await r.json();
    const reply: string = (j?.content?.[0]?.text ?? '').trim();
    return NextResponse.json({ reply });
  } catch (e) {
    console.error('feedback/chat error:', e);
    return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 502 });
  }
}
