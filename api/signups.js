// Self-serve sign-up extract endpoint. Token-protected, read-only.
//
// Tracks adoption of the self-serve model: new operator accounts and new tours
// (areas) created, with each tour's publish + subscription status.
//
// GET /api/signups?key=TOKEN                 -> JSON summary
// GET /api/signups?key=TOKEN&format=email    -> ready-to-send HTML (daily email)
// GET /api/signups?key=TOKEN&format=html     -> same HTML, viewable in a browser
//
// The token is read from the STATS_TOKEN env var (same one as /api/stats).

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key, format } = req.query;

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
    const [cities, profiles] = await Promise.all([
      fetchAll(
        `${SUPABASE_URL}/rest/v1/cities` +
          `?select=name,slug,operator_name,operator_email,plan_tier,subscription_status,` +
          `published_version,published_at,unpublished_at,deleted_at,created_at,created_by` +
          `&order=created_at.desc`,
        sbHeaders
      ),
      fetchAll(
        `${SUPABASE_URL}/rest/v1/user_profiles` +
          `?select=id,role,display_name,plan_tier,subscription_status,created_at` +
          `&order=created_at.desc`,
        sbHeaders
      ),
    ]);

    const stats = summarise(cities, profiles);

    if (format === 'email' || format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(toEmailHtml(stats));
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(stats);
  } catch (e) {
    console.warn('signups endpoint error', e && e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function fetchAll(url, headers) {
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const d = await r.text().catch(() => '');
    throw new Error('Upstream ' + r.status + ' ' + d.slice(0, 120));
  }
  return r.json();
}

function summarise(cities, profiles) {
  const now = Date.now();
  const t24 = now - 24 * 60 * 60 * 1000;
  const t7 = now - 7 * 24 * 60 * 60 * 1000;
  const t14 = now - 14 * 24 * 60 * 60 * 1000;
  const ms = (d) => (d ? new Date(d).getTime() : 0);

  const profileById = {};
  (profiles || []).forEach((p) => {
    profileById[p.id] = p;
  });

  // Operators = self-serve accounts (exclude admin).
  const operators = (profiles || []).filter((p) => p.role !== 'admin');
  const newOperators24 = operators.filter((p) => ms(p.created_at) >= t24).length;
  const newOperators7 = operators.filter((p) => ms(p.created_at) >= t7).length;
  const onTrial = operators.filter((p) => p.subscription_status === 'trialing').length;
  const paying = operators.filter((p) => p.subscription_status === 'active').length;

  // Tours, excluding archived (deleted) for active counts.
  const liveStatus = (c) => {
    if (c.deleted_at) return 'Archived';
    if (c.published_at) return 'Live';
    if ((c.published_version || 0) > 0) return 'Offline';
    return 'Draft';
  };
  const active = (cities || []).filter((c) => !c.deleted_at);
  const newTours24 = active.filter((c) => ms(c.created_at) >= t24).length;
  const newTours7 = active.filter((c) => ms(c.created_at) >= t7).length;
  const liveTours = active.filter((c) => liveStatus(c) === 'Live').length;
  const draftTours = active.filter((c) => liveStatus(c) === 'Draft').length;

  const recentTours = (cities || [])
    .filter((c) => ms(c.created_at) >= t14)
    .map((c) => {
      const op = c.created_by ? profileById[c.created_by] : null;
      return {
        name: c.name,
        slug: c.slug,
        operator: c.operator_name || (op && op.display_name) || '—',
        created_at: c.created_at,
        status: liveStatus(c),
        plan: c.plan_tier || (op && op.plan_tier) || '—',
        subscription: (op && op.subscription_status) || c.subscription_status || 'none',
      };
    });

  const recentOperators = operators
    .filter((p) => ms(p.created_at) >= t14)
    .map((p) => ({
      name: p.display_name || 'Operator',
      created_at: p.created_at,
      plan: p.plan_tier || '—',
      subscription: p.subscription_status || 'none',
    }));

  return {
    generated_at: new Date().toISOString(),
    last_24h: { new_operators: newOperators24, new_tours: newTours24 },
    last_7d: { new_operators: newOperators7, new_tours: newTours7 },
    totals: {
      operators: operators.length,
      on_trial: onTrial,
      paying,
      tours: active.length,
      live_tours: liveTours,
      draft_tours: draftTours,
    },
    recent_tours: recentTours,
    recent_operators: recentOperators,
  };
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'Europe/London',
  });
}

function statusPill(status) {
  const map = {
    Live: ['#1B4332', '#E3EFE7'],
    Offline: ['#8a6d00', '#FBF3D6'],
    Draft: ['#555', '#ECECEC'],
    Archived: ['#8a2b2b', '#F6E2E2'],
  };
  const [fg, bg] = map[status] || ['#555', '#ECECEC'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;color:${fg};background:${bg};">${esc(status)}</span>`;
}

function subPill(sub) {
  const labels = { trialing: 'Trial', active: 'Paying', canceled: 'Cancelled', none: 'No plan' };
  const map = {
    trialing: ['#8a6d00', '#FBF3D6'],
    active: ['#1B4332', '#E3EFE7'],
    canceled: ['#8a2b2b', '#F6E2E2'],
  };
  const label = labels[sub] || sub || 'No plan';
  const [fg, bg] = map[sub] || ['#555', '#ECECEC'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;color:${fg};background:${bg};">${esc(label)}</span>`;
}

// Self-contained, email-client-friendly HTML. Inline styles only.
function toEmailHtml(stats) {
  const green = '#1B4332';
  const gold = '#C9A84C';
  const border = '#E8E0D0';
  const gen = stats.generated_at ? new Date(stats.generated_at) : new Date();
  const dateLabel = gen.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
  });

  const th = `style="text-align:left;padding:8px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#ffffff;background:${green};"`;
  const td = `style="padding:8px 10px;border-bottom:1px solid ${border};font-size:14px;color:#1A1A1A;"`;

  const tile = (num, label) =>
    `<span style="display:inline-block;background:#F5F0E8;border-radius:8px;padding:10px 14px;margin:0 8px 8px 0;font-size:14px;">
      <strong style="font-size:22px;color:${green};">${esc(num)}</strong><br>
      <span style="color:#555;font-size:12px;">${esc(label)}</span>
    </span>`;

  let tourRows = (stats.recent_tours || [])
    .map(
      (r) => `<tr>
        <td ${td}>${esc(r.name)}<br><span style="color:#999;font-size:12px;">/${esc(r.slug)}</span></td>
        <td ${td}>${esc(r.operator)}</td>
        <td ${td} style="padding:8px 10px;border-bottom:1px solid ${border};font-size:13px;color:#555;">${esc(fmtDate(r.created_at))}</td>
        <td ${td}>${statusPill(r.status)}</td>
        <td ${td}>${esc(r.plan === '—' ? '—' : r.plan.charAt(0).toUpperCase() + r.plan.slice(1))}</td>
        <td ${td}>${subPill(r.subscription)}</td>
      </tr>`
    )
    .join('');
  if (!tourRows) {
    tourRows = `<tr><td ${td} colspan="6" style="padding:16px;color:#777;font-size:14px;">No new tours created in the last 14 days.</td></tr>`;
  }

  let opRows = (stats.recent_operators || [])
    .map(
      (o) => `<tr>
        <td ${td}>${esc(o.name)}</td>
        <td ${td} style="padding:8px 10px;border-bottom:1px solid ${border};font-size:13px;color:#555;">${esc(fmtDate(o.created_at))}</td>
        <td ${td}>${esc(o.plan === '—' ? '—' : o.plan.charAt(0).toUpperCase() + o.plan.slice(1))}</td>
        <td ${td}>${subPill(o.subscription)}</td>
      </tr>`
    )
    .join('');
  if (!opRows) {
    opRows = `<tr><td ${td} colspan="4" style="padding:16px;color:#777;font-size:14px;">No new operator accounts in the last 14 days.</td></tr>`;
  }

  const tot = stats.totals || {};

  return `<!doctype html><html><body style="margin:0;padding:0;background:#F5F0E8;">
  <div style="max-width:660px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
      <div style="background:${green};padding:20px 24px;">
        <div style="font-size:18px;font-weight:bold;"><span style="color:#F5F0E8;">Storie</span><span style="color:${gold};">D</span></div>
        <div style="color:#ffffff;font-size:20px;font-weight:bold;margin-top:6px;">Sign-ups &amp; new tours</div>
        <div style="color:#cfe0d6;font-size:13px;margin-top:4px;">${esc(dateLabel)}</div>
      </div>
      <div style="padding:20px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1A1A1A;">Who is signing up and building tours on the self-serve platform.</p>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">Last 24 hours</div>
        <div style="margin-bottom:14px;">
          ${tile(stats.last_24h.new_operators || 0, 'new operators')}
          ${tile(stats.last_24h.new_tours || 0, 'new tours')}
        </div>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">Last 7 days</div>
        <div style="margin-bottom:14px;">
          ${tile(stats.last_7d.new_operators || 0, 'new operators')}
          ${tile(stats.last_7d.new_tours || 0, 'new tours')}
        </div>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">All time</div>
        <div style="margin-bottom:22px;">
          ${tile(tot.operators || 0, 'operators')}
          ${tile(tot.on_trial || 0, 'on trial')}
          ${tile(tot.paying || 0, 'paying')}
          ${tile(tot.tours || 0, 'tours')}
          ${tile(tot.live_tours || 0, 'live')}
          ${tile(tot.draft_tours || 0, 'drafts')}
        </div>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">New tours (last 14 days)</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid ${border};border-radius:8px;overflow:hidden;margin-bottom:22px;">
          <thead><tr>
            <th ${th}>Tour</th>
            <th ${th}>Operator</th>
            <th ${th}>Created</th>
            <th ${th}>Status</th>
            <th ${th}>Plan</th>
            <th ${th}>Subscription</th>
          </tr></thead>
          <tbody>${tourRows}</tbody>
        </table>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">New operator accounts (last 14 days)</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid ${border};border-radius:8px;overflow:hidden;">
          <thead><tr>
            <th ${th}>Operator</th>
            <th ${th}>Created</th>
            <th ${th}>Plan</th>
            <th ${th}>Subscription</th>
          </tr></thead>
          <tbody>${opRows}</tbody>
        </table>

        <p style="margin:16px 0 0;font-size:12px;color:#888;">
          Operators are self-serve accounts (admins excluded). "Live" means the tour is published and public; "Offline" was published then unpublished; "Draft" has never been published; "Archived" was deleted.
        </p>
      </div>
    </div>
    <p style="text-align:center;color:#999;font-size:11px;margin:16px 0 0;">StorieD &middot; automated daily sign-up summary</p>
  </div>
</body></html>`;
}
