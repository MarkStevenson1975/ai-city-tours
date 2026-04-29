// Serverless TTS proxy for AI City Tours.
// Receives a city slug + text + voiceId, looks up the per-city ElevenLabs key
// from Vercel env vars (ELEVENLABS_KEY_<CITY>), proxies the request, returns
// the audio bytes back to the browser.
//
// Why a proxy: the ElevenLabs API key never reaches the user's browser, so
// it can't leak via screenshots / dev tools / browser extensions / etc.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  // Look up the per-city key. Each operator has their own ElevenLabs key
  // stored as ELEVENLABS_KEY_HEREFORD / ELEVENLABS_KEY_GLOUCESTER / etc.
  const envKey = `ELEVENLABS_KEY_${city.toUpperCase().replace(/-/g, '_')}`;
  const apiKey = process.env[envKey];
  if (!apiKey) {
    console.warn(`No env var ${envKey}`);
    return res.status(503).json({
      error: 'Voice not configured for this city',
      env: envKey,
    });
  }

  // Body is JSON: { text, voiceId }
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  const { text, voiceId } = body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text' });
  }
  if (!voiceId || !/^[A-Za-z0-9_-]{4,40}$/.test(voiceId)) {
    return res.status(400).json({ error: 'Missing or invalid voiceId' });
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
      console.warn('ElevenLabs upstream error', upstream.status, detail.slice(0, 200));
      return res.status(upstream.status).json({
        error: 'Voice service error',
        upstream: upstream.status,
      });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  } catch (e) {
    console.error('Proxy fetch failed', e);
    return res.status(502).json({ error: 'Proxy fetch failed', message: e.message });
  }
}
