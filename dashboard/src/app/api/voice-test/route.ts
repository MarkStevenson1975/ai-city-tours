// POST /api/voice-test  { voiceId: string }
//
// Admin-only. Streams a short ElevenLabs sample for the given voice ID so an
// admin can check a custom voice works before publishing. Not cached: this is
// a one-off check, not tour audio.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SAMPLE_TEXT =
  'Hello, and welcome to the tour. I will be your guide today as we explore the town together.';

// ElevenLabs voice IDs are short alphanumeric strings.
const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  // Admin only — this spends ElevenLabs credits.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'admins_only' }, { status: 403 });
  }

  let voiceId = '';
  try {
    const body = await req.json();
    voiceId = String(body?.voiceId ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!VOICE_ID_RE.test(voiceId)) {
    return NextResponse.json({ error: 'bad_voice_id' }, { status: 400 });
  }

  const apiKey =
    process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY_HEREFORD;
  if (!apiKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: SAMPLE_TEXT,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('voice-test ElevenLabs failed', res.status, detail.slice(0, 200));
      // A 400/404/422 from ElevenLabs almost always means the voice ID is not
      // in this account. Surface that as a clear, user-facing reason.
      const notFound =
        res.status === 400 || res.status === 404 || res.status === 422;
      return NextResponse.json(
        { error: notFound ? 'voice_not_found' : 'tts_failed' },
        { status: notFound ? 400 : 502 }
      );
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    console.warn('voice-test error', message);
    return NextResponse.json({ error: 'tts_failed' }, { status: 502 });
  }
}
