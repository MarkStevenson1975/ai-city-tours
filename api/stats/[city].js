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
      // Exclude our own (internal) devices, matching the summary report.
      // Pass &include=internal to see everything including team devices.
      if (req.query.include !== 'internal') {
        const internalIds = await fetchInternalDeviceIds(SUPABASE_URL, sbHeaders);
        if (internalIds.length) {
          const list = internalIds
            .map((id) => `"${id.replace(/"/g, '')}"`)
            .join(',');
          url += `&device_id=not.in.(${encodeURIComponent(list)})`;
        }
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

    // Ready-to-send HTML summary, for the daily email (and viewable in a browser).
    if (format === 'email' || format === 'html') {
      const html = toEmailHtml(stats);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(html);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(stats);
  } catch (e) {
    console.warn('stats endpoint error', e && e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// Fetch the device_ids flagged as internal (team) devices. Best-effort:
// on any problem it returns an empty list so the export still works.
async function fetchInternalDeviceIds(SUPABASE_URL, sbHeaders) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/guest_internal_devices?select=device_id`,
      { headers: sbHeaders }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : [])
      .map((x) => x && x.device_id)
      .filter(Boolean);
  } catch (e) {
    return [];
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

// Friendly display names for the city slugs.
const CITY_NAMES = {
  hereford: 'Hereford',
  ledbury: 'Ledbury',
  leominster: 'Leominster',
  'hereford-hunt': 'Hereford Monster Hunt',
};
function cityName(slug) {
  if (CITY_NAMES[slug]) return CITY_NAMES[slug];
  return String(slug || '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Builds a self-contained, email-client-friendly HTML summary. Inline styles
// only (email clients strip <style>), simple table, no external assets.
function toEmailHtml(stats) {
  const t = (stats && stats.totals) || {};
  const areas = Array.isArray(stats && stats.by_area) ? stats.by_area : [];
  const gen = stats && stats.generated_at ? new Date(stats.generated_at) : new Date();
  const dateLabel = gen.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
  });

  const green = '#1B4332';
  const gold = '#C9A84C';
  const border = '#E8E0D0';

  const th = `style="text-align:left;padding:8px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#ffffff;background:${green};"`;
  const thN = th.replace('text-align:left', 'text-align:right');
  const td = `style="padding:8px 10px;border-bottom:1px solid ${border};font-size:14px;color:#1A1A1A;"`;
  const tdN = td.replace('padding:8px 10px', 'padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums');

  const l24 = (stats && stats.last_24h) || {};

  // Last-24-hours table: every area, so a quiet day reads clearly as zeros.
  let rows24 = areas
    .map(
      (a) => `<tr>
        <td ${td}>${esc(cityName(a.city))}</td>
        <td ${tdN}>${esc(a.unique_devices_24h || 0)}</td>
        <td ${tdN}>${esc(a.opens_24h || 0)}</td>
        <td ${tdN}>${esc(a.walks_started_24h || 0)}</td>
        <td ${tdN}>${esc(a.stops_logged_24h || 0)}</td>
        <td ${tdN}>${esc(a.tours_completed_24h || 0)}</td>
      </tr>`
    )
    .join('');
  if (!rows24) {
    rows24 = `<tr><td ${td} colspan="6" style="padding:16px;color:#777;font-size:14px;">No activity in the last 24 hours.</td></tr>`;
  }

  let rows = areas
    .map(
      (a) => `<tr>
        <td ${td}>${esc(cityName(a.city))}</td>
        <td ${tdN}>${esc(a.unique_devices)}</td>
        <td ${tdN}>${esc(a.opens)}</td>
        <td ${tdN}>${esc(a.walks_started)}</td>
        <td ${tdN}>${esc(a.stops_logged)}</td>
        <td ${tdN}>${esc(a.tours_completed)}</td>
        <td ${tdN}>${esc(a.unique_devices_7d)}</td>
      </tr>`
    )
    .join('');
  if (!rows) {
    rows = `<tr><td ${td} colspan="7" style="padding:16px;color:#777;font-size:14px;">No guest activity recorded yet.</td></tr>`;
  }

  const firstSeen = t.first_seen
    ? new Date(t.first_seen).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
    : 'n/a';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#F5F0E8;">
  <div style="max-width:640px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
      <div style="background:${green};padding:20px 24px;">
        <div style="color:${gold};font-size:13px;letter-spacing:.08em;text-transform:uppercase;">Storied Tours</div>
        <div style="color:#ffffff;font-size:20px;font-weight:bold;margin-top:4px;">Daily guest usage</div>
        <div style="color:#cfe0d6;font-size:13px;margin-top:4px;">${esc(dateLabel)}</div>
      </div>
      <div style="padding:20px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1A1A1A;">A summary of people using the tours without signing in, across every area.</p>

        <div style="display:block;margin-bottom:18px;">
          <span style="display:inline-block;background:#F5F0E8;border-radius:8px;padding:10px 14px;margin:0 8px 8px 0;font-size:14px;">
            <strong style="font-size:20px;color:${green};">${esc(l24.unique_devices || 0)}</strong><br>
            <span style="color:#555;font-size:12px;">visitors last 24h</span>
          </span>
          <span style="display:inline-block;background:#F5F0E8;border-radius:8px;padding:10px 14px;margin:0 8px 8px 0;font-size:14px;">
            <strong style="font-size:20px;color:${green};">${esc(stats.unique_devices_7d || 0)}</strong><br>
            <span style="color:#555;font-size:12px;">visitors last 7 days</span>
          </span>
          <span style="display:inline-block;background:#F5F0E8;border-radius:8px;padding:10px 14px;margin:0 8px 8px 0;font-size:14px;">
            <strong style="font-size:20px;color:${green};">${esc(t.unique_devices || 0)}</strong><br>
            <span style="color:#555;font-size:12px;">total visitors (all time)</span>
          </span>
        </div>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">Last 24 hours, by area</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid ${border};border-radius:8px;overflow:hidden;margin-bottom:22px;">
          <thead>
            <tr>
              <th ${th}>Area</th>
              <th ${thN}>Visitors</th>
              <th ${thN}>Opens</th>
              <th ${thN}>Walks</th>
              <th ${thN}>Stops</th>
              <th ${thN}>Completed</th>
            </tr>
          </thead>
          <tbody>${rows24}</tbody>
        </table>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">All time, by area</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid ${border};border-radius:8px;overflow:hidden;">
          <thead>
            <tr>
              <th ${th}>Area</th>
              <th ${thN}>Visitors</th>
              <th ${thN}>Opens</th>
              <th ${thN}>Walks</th>
              <th ${thN}>Stops</th>
              <th ${thN}>Completed</th>
              <th ${thN}>7&nbsp;days</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <p style="margin:16px 0 0;font-size:12px;color:#888;">
          Visitors are counted as unique anonymous devices, no personal data. Tracking began ${esc(firstSeen)}.
          "Last 24 hours" is a rolling window ending when this email was generated.
        </p>
      </div>
    </div>
    <p style="text-align:center;color:#999;font-size:11px;margin:16px 0 0;">Storied Tours &middot; automated daily summary</p>
  </div>
</body></html>`;
}
