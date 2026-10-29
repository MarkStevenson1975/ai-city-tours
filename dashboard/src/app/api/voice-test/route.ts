// POST /api/voice-test  { voiceId: string }
//
// Plays a short sample of a voice so someone can hear it before choosing it.
// Synthesis is delegated to the live tour TTS endpoint (the same approach as
// /api/draft-tts), which holds the working ElevenLabs keys and the shared
// cache. Calling ElevenLabs directly from here would use a different key that
// does not own the catalogue voices.
//
// Admins can test any ID (to try one before adding it to the catalogue);
// operators can only test voices that are already in the catalogue, so this
// can't be used to burn ElevenLabs credit on arbitrary IDs.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const SAMPLE_TEXT =
  'Hello, and welcome to the tour. I will be your guide today as we explore the town together.';

// ElevenLabs voice IDs are short alphanumeric strings.
const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

// The live tour TTS service holds the working keys and cache. 'hereford' is
// only used to select the per-city ElevenLabs key that owns these voices.
const TOURS_BASE =
  process.env.TOURS_TTS_BASE || 'https://tours.storiedtours.co.uk';
const TTS_CITY = process.env.VOICE_TEST_CITY || 'hereford';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
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

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const isAdmin = profile?.role === 'admin';

  // Operators may only test voices that are in the catalogue.
  if (!isAdmin) {
    const { data: match } = await supabase
      .from('guide_voices')
      .select('voice_id')
      .eq('voice_id', voiceId)
      .eq('is_active', true)
      .maybeSingle();
    if (!match) {
      return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
    }
  }

  try {
    const u =
      `${TOURS_BASE}/api/tts/${TTS_CITY}` +
      `?text=${encodeURIComponent(SAMPLE_TEXT)}&voiceId=${encodeURIComponent(voiceId)}`;
    const up = await fetch(u);

    if (!up.ok) {
      const detail = await up.text().catch(() => '');
      console.warn('voice-test upstream error', up.status, detail.slice(0, 200));
      // The tours endpoint passes ElevenLabs' status through. A 400/404/422
      // almost always means the voice ID is not in the account.
      const notFound = up.status === 400 || up.status === 404 || up.status === 422;
      const notConfigured = up.status === 503;
      return NextResponse.json(
        {
          error: notConfigured
            ? 'not_configured'
            : notFound
            ? 'voice_not_found'
            : 'tts_failed',
        },
        { status: notConfigured ? 503 : notFound ? 400 : 502 }
      );
    }

    const audio = Buffer.from(await up.arrayBuffer());
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
