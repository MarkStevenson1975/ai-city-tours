// Pause restart reminders. Token-protected, read-only.
//
// GET /api/pause-reminders?key=TOKEN
//   -> JSON array of operators whose paused subscription is due to restart in
//      exactly 7 days, each with a ready-to-send email: { to, name, restart_date,
//      subject, html }. Returns [] when none are due.
//
// A daily Make scenario calls this and sends one email per item. Because it
// reads live data each day, if an operator changes their restart date the
// reminder simply fires 7 days before the NEW date. No stale dates.
//
// The token is read from STATS_TOKEN (same as the other extract endpoints).

const DAYS_BEFORE = 7;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key } = req.query;
  const STATS_TOKEN = process.env.STATS_TOKEN;
  if (!STATS_TOKEN) return res.status(503).json({ error: 'Endpoint not configured' });
  if (!key || key !== STATS_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service not configured' });
  }

  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json',
  };

  // Target calendar date = today + 7 days (UTC). pause_resume_at is stored at
  // midday UTC of the chosen date, so a date-only comparison is reliable.
  const now = new Date();
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + DAYS_BEFORE)
  );
  const targetStr = target.toISOString().slice(0, 10);

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles` +
        `?select=id,display_name,pause_resume_at` +
        `&subscription_status=eq.paused&pause_resume_at=not.is.null`,
      { headers: sbHeaders }
    );
    if (!r.ok) {
      const d = await r.text().catch(() => '');
      return res.status(502).json({ error: 'Upstream error', upstream: r.status, detail: d.slice(0, 200) });
    }
    const profiles = await r.json();

    const due = (Array.isArray(profiles) ? profiles : []).filter(
      (p) => p.pause_resume_at && new Date(p.pause_resume_at).toISOString().slice(0, 10) === targetStr
    );

    const items = [];
    for (const p of due) {
      const email = await fetchEmail(SUPABASE_URL, sbHeaders, p.id);
      if (!email) continue;
      const restartLabel = new Date(p.pause_resume_at).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
      });
      const name = (p.display_name && String(p.display_name).trim()) || 'there';
      items.push({
        to: email,
        name,
        restart_date: restartLabel,
        subject: 'Your StorieD subscription restarts in 7 days',
        html: emailHtml(name, restartLabel),
      });
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(items);
  } catch (e) {
    console.warn('pause-reminders error', e && e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// Look up an operator's login email via the GoTrue admin API (service role).
async function fetchEmail(SUPABASE_URL, sbHeaders, id) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      headers: sbHeaders,
    });
    if (!r.ok) return null;
    const u = await r.json();
    return (u && u.email) || null;
  } catch (e) {
    return null;
  }
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function emailHtml(name, restartLabel) {
  const green = '#1B4332';
  const gold = '#C9A84C';
  const dashUrl = process.env.DASHBOARD_URL || '';
  const manageLine = dashUrl
    ? `<p style="margin:0 0 16px;font-size:15px;color:#1A1A1A;">If your plans have changed you can move the date or resume early any time. <a href="${esc(dashUrl)}" style="color:${green};font-weight:bold;">Log in to your dashboard</a>.</p>`
    : `<p style="margin:0 0 16px;font-size:15px;color:#1A1A1A;">If your plans have changed you can move the date or resume early any time from your dashboard.</p>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#F5F0E8;">
  <div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
      <div style="background:${green};padding:20px 24px;">
        <div style="font-size:18px;font-weight:bold;"><span style="color:#F5F0E8;">Storie</span><span style="color:${gold};">D</span></div>
        <div style="color:#ffffff;font-size:20px;font-weight:bold;margin-top:6px;">Your subscription restarts soon</div>
      </div>
      <div style="padding:20px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1A1A1A;">Hi ${esc(name)},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#1A1A1A;">Just a heads up that your paused StorieD subscription is set to restart on <strong>${esc(restartLabel)}</strong>, which is 7 days away.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#1A1A1A;">On that date your billing starts again. To bring your tours back online you will just need to republish them from your dashboard, so they go live exactly when you are ready.</p>
        ${manageLine}
        <p style="margin:0;font-size:13px;color:#888;">Thanks,<br>The StorieD team</p>
      </div>
    </div>
    <p style="text-align:center;color:#999;font-size:11px;margin:16px 0 0;">StorieD &middot; automated reminder</p>
  </div>
</body></html>`;
}
