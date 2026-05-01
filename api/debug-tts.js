// Temporary diagnostic endpoint — checks the ElevenLabs key without generating audio.
// DELETE THIS FILE once the narration issue is resolved.
export default async function handler(req, res) {
  const apiKey = process.env.ELEVENLABS_KEY_HEREFORD || '';
  const keyPreview = apiKey
    ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)} (${apiKey.length} chars)`
    : 'NOT SET';

  // Hit the ElevenLabs /v1/user endpoint — cheapest authenticated call.
  let elStatus = null;
  let elBody = null;
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey },
    });
    elStatus = r.status;
    elBody = await r.text().catch(() => '');
  } catch (e) {
    elBody = e.message;
  }

  res.status(200).json({
    keyPreview,
    elevenLabsStatus: elStatus,
    elevenLabsResponse: elBody.slice(0, 300),
  });
}
