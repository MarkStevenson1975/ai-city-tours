// Serverless proxy for Anthropic Claude streaming chat.
//
// Browser POSTs { prompt: string } to /api/chat/<city>. We call
// api.anthropic.com using CLAUDE_API_KEY (one shared key across all
// cities, stored in Vercel env vars), and pipe the SSE stream back
// to the browser unchanged.
//
// The API key never reaches the client — same security pattern as
// the TTS proxy.

const MAX_PROMPT_CHARS = 8000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.warn('CLAUDE_API_KEY not configured');
    return res.status(503).json({
      error: 'Chat service not configured',
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { prompt } = body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt' });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({
      error: `Prompt too long (max ${MAX_PROMPT_CHARS} chars)`,
    });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.warn('Anthropic upstream error', upstream.status, detail.slice(0, 300));
      return res.status(upstream.status).json({
        error: 'Chat upstream error',
        upstream: upstream.status,
      });
    }

    // Pipe the SSE stream straight through
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');

    const reader = upstream.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    console.error('Chat proxy fetch failed', e);
    return res.status(502).json({
      error: 'Chat proxy fetch failed',
      message: e.message,
    });
  }
}
