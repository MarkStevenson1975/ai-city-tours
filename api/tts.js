// Vercel serverless function that proxies ElevenLabs text-to-speech.
// The browser POSTs {text, voiceId, city} here. We read the matching
// ELEVENLABS_KEY_<CITY> env var, call ElevenLabs server-side, and return
// the MP3 bytes. The API key never reaches the client.

module.exports = async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Vercel auto-parses JSON when Content-Type: application/json, but defend anyway
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch (e) {
      res.status(400).json({ error: 'Invalid JSON in request body' });
      return;
    }
  }
  body = body || {};

  const text = body.text;
  const voiceId = body.voiceId;
  const city = body.city;

  if (!text || !voiceId || !city) {
    res.status(400).json({ error: 'Missing text, voiceId, or city' });
    return;
  }

  // Validate city slug — letters/digits/hyphens only — stops env-var injection
  if (!/^[a-z0-9-]+$/i.test(city)) {
    res.status(400).json({ error: 'Invalid city slug' });
    return;
  }

  // Soft cap on text length to protect against runaway costs
  if (text.length > 8000) {
    res.status(400).json({ error: 'Text too long (max 8000 chars)' });
    return;
  }

  // Look up the per-city API key
  const envVarName = 'ELEVENLABS_KEY_' + city.toUpperCase();
  const apiKey = process.env[envVarName];

  if (!apiKey) {
    console.error('No API key configured for city:', city, '(expected env var:', envVarName + ')');
    res.status(500).json({ error: 'No API key configured for city: ' + city });
    return;
  }

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId), {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!r.ok) {
      const errorBody = await r.text().catch(() => '');
      console.error('ElevenLabs API error', r.status, errorBody.slice(0, 500));
      res.status(r.status >= 400 && r.status < 600 ? r.status : 502)
        .json({ error: 'ElevenLabs API error', status: r.status });
      return;
    }

    const audioBuffer = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    // Edge-cache identical requests for an hour — same text+voice yields the same audio
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(200).send(audioBuffer);

  } catch (e) {
    console.error('TTS proxy error', e && e.message);
    res.status(502).json({ error: 'TTS proxy error: ' + (e && e.message) });
  }
};
