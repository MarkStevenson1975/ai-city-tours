// GET /api/onboarding-audio?step=1
//
// Returns a public URL for Harriet talking about ONE step — the screen the
// operator is actually on. Not a monologue from top to bottom.
//
// Each step's file is cached in Supabase Storage under a hash of that step's
// text and the voice id. If anybody edits the wording in src/lib/onboarding.ts,
// the hash changes, the cache misses, and Harriet re-records that step on the
// next play. There is no manual regeneration step to forget.
import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { HARRIET_VOICE_ID, spokenForStep, isStepNumber } from '@/lib/onboarding';

const BUCKET = 'onboarding-audio';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const step = Number(req.nextUrl.searchParams.get('step') ?? '1');
  if (!Number.isInteger(step) || !isStepNumber(step)) {
    return NextResponse.json({ error: 'bad_step' }, { status: 400 });
  }

  const apiKey =
    process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY_HEREFORD;
  if (!apiKey) {
    // No key configured: tell the client politely so it can hide the player
    // rather than showing a broken button.
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const script = spokenForStep(step);
  const hash = createHash('sha256')
    .update(`${HARRIET_VOICE_ID}::${script}`)
    .digest('hex')
    .slice(0, 32);
  const path = `step-${step}-${hash}.mp3`;

  const admin = createAdminClient();
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // Already recorded this exact wording? Hand it straight back.
  const { data: existing } = await admin.storage
    .from(BUCKET)
    .list('', { search: path, limit: 1 });
  if (existing?.some((f) => f.name === path)) {
    return NextResponse.json({ url: publicUrl, cached: true });
  }

  // Wording is new (or this is the first ever play): record it once.
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${HARRIET_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: script,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('ElevenLabs failed', res.status, detail.slice(0, 200));
      return NextResponse.json({ error: 'tts_failed' }, { status: 502 });
    }

    const audio = Buffer.from(await res.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, audio, {
        contentType: 'audio/mpeg',
        upsert: true,
        cacheControl: '31536000',
      });

    if (upErr) {
      console.warn('onboarding audio upload failed', upErr.message);
      return NextResponse.json({ error: 'store_failed' }, { status: 502 });
    }

    return NextResponse.json({ url: publicUrl, cached: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    console.warn('onboarding audio error', message);
    return NextResponse.json({ error: 'tts_failed' }, { status: 502 });
  }
}
