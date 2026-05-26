// Guest-usage extract endpoint. Token-protected, read-only.
//
// GET /api/stats/<city>?key=TOKEN
//      -> JSON summary (totals, last 7/30 day unique devices, daily breakdown)
// GET /api/stats/<city>?key=TOKEN&format=csv
//      -> CSV of the daily breakdown (easy to open in Excel / Sheets)
// GET /api/stats/<city>?key=TOKEN&detail=raw&limit=1000
//      -> JSON array of raw events (newest first)
// GET /api/stats/<city>?key=TOKEN&detail=raw&format=csv
//      -> CSV of raw events
//
// Use city = "all" to aggregate across every city.
// The token is read from the STATS_TOKEN env var (set in Vercel).

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city, key, format, detail, limit } = req.query;

  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  const STATS_TOKEN = process.env.STATS_TOKEN;
  if (!STATS_TOKEN) {
    return res.status(503).json({ error: 'Stats endpoint not configured' });
  }
  if (!key || key !== STATS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Stats service not configured' });
  }

  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json',
  };

  try {
    // ---- Raw event export ------------------------------------------------
    if (detail === 'raw') {
      const cap = Math.min(parseInt(limit, 10) || 1000, 10000);
      let url =
        `${SUPABASE_URL}/rest/v1/guest_events` +
        `?select=created_at,city_slug,event,device_id,stop_id,user_agent` +
        `&order=created_at.desc&limit=${cap}`;
      if (city !== 'all') {
        url += `&city_slug=eq.${encodeURIComponent(city)}`;
      }
      const r = await fetch(url, { headers: sbHeaders });
      if (!r.ok) {
        return res.status(502).json({ error: 'Upstream error', upstream: r.status });
      }
      const rows = await r.json();

      if (format === 'csv') {
        const cols = ['created_at', 'city_slug', 'event', 'device_id', 'stop_id', 'user_agent'];
        const csv = toCsv(cols, rows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="guest-events-${city}.csv"`);
        return res.status(200).send(csv);
      }
      return res.status(200).json({ city, count: rows.length, events: rows });
    }

    // ---- Aggregated summary (via guest_stats RPC) ------------------------
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/guest_stats`;
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { ...sbHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_city: city === 'all' ? null : city }),
    });
    if (!r.ok) {
      const d = await r.text().catch(() => '');
      return res.status(502).json({ error: 'Upstream error', upstream: r.status, detail: d.slice(0, 200) });
    }
    const stats = await r.json();

    if (format === 'csv') {
      const daily = Array.isArray(stats.daily) ? stats.daily : [];
      const cols = ['day', 'unique_devices', 'opens', 'walks_started', 'stops_logged', 'completed'];
      const csv = toCsv(cols, daily);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="guest-stats-${city}.csv"`);
      return res.status(200).send(csv);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(stats);
  } catch (e) {
    console.warn('stats endpoint error', e && e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// Minimal, safe CSV serialiser.
function toCsv(cols, rows) {
  const esc = (v) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = cols.join(',');
  const body = (rows || []).map((row) => cols.map((c) => esc(row[c])).join(',')).join('\n');
  return head + '\n' + body + '\n';
}
