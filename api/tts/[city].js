// Serverless TTS proxy for AI City Tours.
// Accepts GET requests: /api/tts/[city]?text=...&voiceId=...
//
// Two layers of caching keep ElevenLabs spend down:
//   1. A permanent Supabase Storage cache. Every unique voice+text is
//      synthesised ONCE, ever, then stored as an MP3 and served from storage on
//      all future plays (free). This survives edge-cache eviction and is shared
//      across all regions and all visitors, so a given narration only ever bills
//      ElevenLabs a single time.
//   2. Vercel's CDN edge cache (GET, 30 days) sits in front of both, so repeat
//      plays within the window never even reach this function.
// The ElevenLabs API key never reaches the browser (stored in Vercel env vars).

import { checkGuestRateLimit, sendRateLimited } from '../_lib/ratelimit.js';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TTS_BUCKET = 'tts-cache';

// Where a given voice+text lives permanently in storage.
function cachePath(voiceId, text) {
  const hash = createHash('sha1').update(`${voiceId}|${text}`).digest('hex');
  return `${voiceId}/${hash}.mp3`;
}
function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${TTS_BUCKET}/${path}`;
}

// Fetch a previously-stored clip. Returns the MP3 bytes or null if not stored.
// We proxy the bytes back through this function (rather than redirecting the
// browser to the storage URL) so playback stays same-origin and never trips on
// cross-origin fetch rules — the fallback for a failed fetch is the robot voice,
// which we must avoid.
async function storageGet(path) {
  if (!SUPABASE_URL) return null;
  try {
    const r = await fetch(publicUrl(path));
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

// Persist a freshly-synthesised clip so it never bills ElevenLabs again.
async function storagePut(path, buf) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/${TTS_BUCKET}/${encodeURI(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'audio/mpeg',
          'x-upsert': 'true',
          'cache-control': '2592000',
        },
        body: buf,
      }
    );
  } catch (e) {
    // Non-blocking: if the save fails we still serve the audio this time.
    console.warn('TTS storage save failed', e && e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  const { text } = req.query;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text' });
  }
  if (text.length > 5000) {
    return res.status(400).json({ error: 'Text too long (max 5000 chars)' });
  }

  // Default to the Harriet voice when a tour has no custom voice set.
  const DEFAULT_VOICE_ID = process.env.DEFAULT_VOICE_ID || 'NTqGiNK8P02i66yY2GOH';
  let voiceId = (req.query.voiceId || '').toString();
  if (
    !voiceId ||
    voiceId === 'null' ||
    voiceId === 'undefined' ||
    !/^[A-Za-z0-9_-]{4,40}$/.test(voiceId)
  ) {
    voiceId = DEFAULT_VOICE_ID;
  }

  // 1. Permanent storage cache. If we've made this exact clip before, serve the
  //    stored MP3 and never touch ElevenLabs. This runs before the rate limiter
  //    so cached plays are never throttled.
  const path = cachePath(voiceId, text);
  const cached = await storageGet(path);
  if (cached) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=2592000, stale-while-revalidate=86400'
    );
    res.setHeader('Content-Length', cached.length);
    return res.status(200).send(cached);
  }

  // Per-IP rate limit only applies to genuinely new synthesis (cache misses).
  const rl = await checkGuestRateLimit(req, 'tts');
  if (!rl.allowed) return sendRateLimited(res, rl.reason);

  // Per-city key first (ELEVENLABS_KEY_HEREFORD etc.), then shared fallbacks.
  const envKey = `ELEVENLABS_KEY_${city.toUpperCase().replace(/-/g, '_')}`;
  const apiKey =
    process.env[envKey] ||
    process.env.ELEVENLABS_API_KEY ||
    process.env.ELEVENLABS_KEY_HEREFORD;
  if (!apiKey) {
    console.warn(`No env var ${envKey} and no ELEVENLABS_API_KEY fallback`);
    return res
      .status(503)
      .json({ error: 'Voice not configured for this city', env: envKey });
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
      const detail = await upstream.text().catch(() => '');
      console.warn('ElevenLabs upstream error', upstream.status, '| voiceId:', voiceId, '| body:', detail);
      return res.status(upstream.status).json({
        error: 'Voice service error',
        upstream: upstream.status,
      });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());

    // Save to permanent storage so this clip never bills again, then serve it.
    await storagePut(path, buf);

    res.setHeader('Content-Type', 'audio/mpeg');
    // Cache at Vercel's CDN edge for 30 days too. Identical text+voice =
    // identical audio, so this is safe. Cache busts automatically when text
    // changes (the hash changes).
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=2592000, stale-while-revalidate=86400'
    );
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  } catch (e) {
    console.error('Proxy fetch failed', e);
    return res.status(502).json({ error: 'Proxy fetch failed', message: e.message });
  }
}
