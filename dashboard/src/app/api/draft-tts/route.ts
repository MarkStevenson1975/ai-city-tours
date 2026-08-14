// POST /api/draft-tts
// Plays one narration sample in the real voice inside the draft preview, before
// an operator has published. Body: { text, voiceId }.
//
// Cost is controlled three ways:
//   1. Shared permanent cache. Uses the same tts-cache bucket and the same
//      voice+text hash as the live tour, so a draft sample is synthesised once
//      and then reused free, including after the tour is published.
//   2. Only genuinely new synthesis (a cache miss) is rate limited, per account,
//      as a backstop against anyone farming free narration from drafts.
//   3. The preview UI only calls this for the single stop the operator chooses.
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { enforceAiLimit } from '@/lib/ai-rate-limit';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TTS_BUCKET = 'tts-cache';
const DEFAULT_VOICE_ID = process.env.DEFAULT_VOICE_ID || 'NTqGiNK8P02i66yY2GOH';

// Where a given voice+text lives permanently in storage. Identical to the live
// tour's scheme, so the two share the same cached audio.
function cachePath(voiceId: string, text: string) {
  const hash = createHash('sha1').update(`${voiceId}|${text}`).digest('hex');
  return `${voiceId}/${hash}.mp3`;
}

async function storageGet(path: string): Promise<Buffer | null> {
  if (!SUPABASE_URL) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/storage/v1/object/public/${TTS_BUCKET}/${path}`
    );
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function storagePut(path: string, buf: Buffer) {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/${TTS_BUCKET}/${encodeURI(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'audio/mpeg',
          'x-upsert': 'true',
          'cache-control': '2592000',
        },
        body: new Uint8Array(buf),
      }
    );
  } catch {
    // Non-blocking: if the save fails we still serve the audio this time.
  }
}

function audio(buf: Buffer) {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 });
  if (text.length > 5000) {
    return NextResponse.json({ error: 'Text too long' }, { status: 400 });
  }

  let voiceId = typeof body.voiceId === 'string' ? body.voiceId : '';
  if (!voiceId || !/^[A-Za-z0-9_-]{4,40}$/.test(voiceId)) {
    voiceId = DEFAULT_VOICE_ID;
  }

  // 1. Shared permanent cache. If we have made this exact clip before (here or
  //    on the live tour), serve it and never touch ElevenLabs. Runs before the
  //    limiter so replaying a sample is never throttled.
  const path = cachePath(voiceId, text);
  const cached = await storageGet(path);
  if (cached) return audio(cached);

  // 2. Cap genuinely new synthesis per account.
  const limit = await enforceAiLimit(supabase, 'draft_sample');
  if (!limit.ok) {
    return NextResponse.json({ error: limit.message }, { status: limit.status });
  }

  const apiKey =
    process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY_HEREFORD;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Voice is not configured.' },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'Voice service error' },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    await storagePut(path, buf); // never bills again, shared with the live tour
    return audio(buf);
  } catch {
    return NextResponse.json({ error: 'Voice service error' }, { status: 502 });
  }
}
