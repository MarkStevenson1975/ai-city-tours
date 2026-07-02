// ElevenLabs credit-usage check for the daily Make alert.
//
// GET /api/voice-usage?key=TOKEN                -> JSON usage summary
// GET /api/voice-usage?key=TOKEN&threshold=80   -> custom alert threshold (%)
//
// Calls the ElevenLabs subscription API server-side using the same key the
// TTS proxy already has in Vercel. Returns { alert: true/false } plus a
// ready-to-send HTML block, so the Make scenario can filter on `alert` and
// email only when credits are running low. The token is read from the
// STATS_TOKEN env var (same one as /api/stats and /api/signups).

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key, threshold } = req.query;
  const STATS_TOKEN = process.env.STATS_TOKEN;
  if (!STATS_TOKEN) {
    return res.status(503).json({ error: 'Stats not configured' });
  }
  if (!key || key !== STATS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey =
    process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY_HEREFORD;
  if (!apiKey) {
    return res.status(503).json({ error: 'Voice key not configured' });
  }

  const alertPct = Math.min(Math.max(parseInt(threshold, 10) || 80, 1), 100);

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
    });
    if (!r.ok) {
      return res
        .status(502)
        .json({ error: 'ElevenLabs upstream error', upstream: r.status });
    }
    const sub = await r.json();

    const used = sub.character_count || 0;
    const limit = sub.character_limit || 0;
    const pct = limit ? Math.round((used / limit) * 100) : 0;
    const remaining = Math.max(limit - used, 0);
    const resetDate = sub.next_character_count_reset_unix
      ? new Date(sub.next_character_count_reset_unix * 1000)
          .toISOString()
          .slice(0, 10)
      : null;

    const alert = pct >= alertPct;

    const html =
      '<div style="font-family:Arial,sans-serif;max-width:520px">' +
      '<h2 style="color:#1B4332">StorieD voice credits ' +
      (alert ? 'are running low' : 'update') +
      '</h2>' +
      `<p><strong>${pct}% used</strong> — ${used.toLocaleString()} of ${limit.toLocaleString()} credits this cycle.</p>` +
      `<p>${remaining.toLocaleString()} credits remaining` +
      (resetDate ? `, quota resets on ${resetDate}.` : '.') +
      '</p>' +
      (alert
        ? '<p>When credits run out, tour narration falls back to the browser voice. ' +
          'Consider topping up or upgrading the ElevenLabs plan before the reset date.</p>'
        : '') +
      `<p style="color:#888;font-size:12px">Plan: ${sub.tier || 'unknown'} · alert threshold ${alertPct}%</p>` +
      '</div>';

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      alert,
      pct,
      used,
      limit,
      remaining,
      resetDate,
      tier: sub.tier || null,
      html,
    });
  } catch (e) {
    console.error('voice-usage fetch failed', e);
    return res.status(502).json({ error: 'Fetch failed', message: e.message });
  }
}
