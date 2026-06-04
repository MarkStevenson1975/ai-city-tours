// Serverless TTS proxy for AI City Tours.
// Accepts GET requests: /api/tts/[city]?text=...&voiceId=...
// GET allows Vercel's CDN to cache responses — identical text+voice is
// served from edge on repeat visits, saving ElevenLabs credits.
// The ElevenLabs API key never reaches the browser (stored in Vercel env vars).

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  // Look up the per-city key first (ELEVENLABS_KEY_HEREFORD etc.).
  // Falls back to ELEVENLABS_API_KEY (shared key), then to
  // ELEVENLABS_KEY_HEREFORD as a last resort so new cities work
  // automatically without needing a new env var per city.
  const envKey = `ELEVENLABS_KEY_${city.toUpperCase().replace(/-/g, '_')}`;
  const apiKey = process.env[envKey] || process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY_HEREFORD;
  if (!apiKey) {
    console.warn(`No env var ${envKey} and no ELEVENLABS_API_KEY fallback`);
    return res.status(503).json({
      error: 'Voice not configured for this city',
      env: envKey,
    });
  }

  const { text } = req.query;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text' });
  }
  // Default to the Harriet voice when a tour has no custom voice set, so new
  // self-serve tours never fall back to the browser's robotic voice.
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
  if (text.length > 5000) {
    return res.status(400).json({ error: 'Text too long (max 5000 chars)' });
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
    res.setHeader('Content-Type', 'audio/mpeg');
    // Cache at Vercel's CDN edge for 30 days. Identical text+voice = identical
    // audio, so this is safe. Cache busts automatically when text changes.
    res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  } catch (e) {
    console.error('Proxy fetch failed', e);
    return res.status(502).json({ error: 'Proxy fetch failed', message: e.message });
  }
}
