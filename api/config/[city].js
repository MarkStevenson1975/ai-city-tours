// Serves the published config JSON for a given city, reading from Supabase.
//
// GET /api/config/hereford  →  the JSON snapshot last published for Hereford
//
// Reads from cities.published_config in Supabase via the PostgREST endpoint.
// Uses the service-role key server-side only — never exposed to the browser.
// Vanilla fetch, no npm dependencies, so this function deploys without any
// build step or package.json at the repo root.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Supabase env vars not set');
    return res
      .status(503)
      .json({ error: 'Config service not configured' });
  }

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/cities` +
      `?slug=eq.${encodeURIComponent(city)}` +
      `&select=published_config,published_version,published_at`;

    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.warn('Supabase upstream error', r.status, detail.slice(0, 200));
      return res
        .status(502)
        .json({ error: 'Upstream error', upstream: r.status });
    }

    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'City not found' });
    }

    const row = rows[0];
    if (!row.published_config) {
      return res
        .status(404)
        .json({ error: 'City has no published config yet' });
    }

    // Cache for 60s at the edge — busted on publish via cache-control
    // (when the dashboard publishes a new version, that flow can call a
    // revalidation endpoint to bust this cache early).
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
    );
    res.setHeader('X-Published-Version', String(row.published_version || 0));
    if (row.published_at) {
      res.setHeader('X-Published-At', row.published_at);
    }
    return res.status(200).send(JSON.stringify(row.published_config));
  } catch (e) {
    console.error('Config fetch failed', e);
    return res
      .status(500)
      .json({ error: 'Internal error', message: e.message });
  }
}
