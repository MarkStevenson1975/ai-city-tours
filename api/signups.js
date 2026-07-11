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
    const [cities, profiles, guest, userTours] = await Promise.all([
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
      // Guest (anonymous) usage across all tours.
      fetchGuestStats(SUPABASE_URL, sbHeaders),
      // Logged-in tour visitors (accounts) with first/last visit per tour.
      fetchAll(
        `${SUPABASE_URL}/rest/v1/user_tours?select=user_id,city_slug,first_visited_at`,
        sbHeaders
      ).catch(() => []),
    ]);

    const stats = summarise(cities, profiles, guest, userTours);

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

// Aggregated guest usage via the guest_stats RPC (excludes internal devices).
// Best-effort: returns null on any problem so the rest of the report still sends.
async function fetchGuestStats(url, headers) {
  try {
    const r = await fetch(`${url}/rest/v1/rpc/guest_stats`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_city: null }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function summarise(cities, profiles, guest, userTours) {
  const now = Date.now();
  const t24 = now - 24 * 60 * 60 * 1000;
  const ms = (d) => (d ? new Date(d).getTime() : 0);

  // Operators = self-serve accounts (exclude admin).
  const operators = (profiles || []).filter((p) => p.role !== 'admin');
  const newOperators24 = operators.filter((p) => ms(p.created_at) >= t24).length;
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
  const liveTours = active.filter((c) => liveStatus(c) === 'Live').length;
  const draftTours = active.filter((c) => liveStatus(c) === 'Draft').length;

  const recentOperators = operators
    .filter((p) => ms(p.created_at) >= t24)
    .map((p) => ({
      name: p.display_name || 'Operator',
      created_at: p.created_at,
      plan: p.plan_tier || '—',
      subscription: p.subscription_status || 'none',
    }));

  // ---- Tour usage: guests (anonymous devices) vs accounts (signed-in) ----
  const g = guest || {};
  const gTot = g.totals || {};
  const guestUsage = {
    t24: (g.last_24h && g.last_24h.unique_devices) || 0,
    all: gTot.unique_devices || 0,
  };

  const uts = Array.isArray(userTours) ? userTours : [];
  const distinct = (rows) => new Set(rows.map((u) => u.user_id)).size;
  const accountUsage = {
    t24: distinct(uts.filter((u) => ms(u.first_visited_at) >= t24)),
    all: distinct(uts),
  };

  // Per-tour visitors in the last 24 hours (guests from guest_stats
  // by_area unique_devices_24h; signed-in from user_tours first_visited_at).
  const nameBySlug = {};
  (cities || []).forEach((c) => { nameBySlug[c.slug] = c.name; });
  const byArea = Array.isArray(g.by_area) ? g.by_area : [];
  const acct24BySlug = {};
  uts.filter((u) => ms(u.first_visited_at) >= t24).forEach((u) => {
    (acct24BySlug[u.city_slug] = acct24BySlug[u.city_slug] || new Set()).add(u.user_id);
  });
  const slugs24 = new Set([...byArea.map((a) => a.city), ...Object.keys(acct24BySlug)]);
  const accessed24 = [...slugs24]
    .map((slug) => {
      const area = byArea.find((a) => a.city === slug) || {};
      const guest24 = area.unique_devices_24h || 0;
      const acct24 = acct24BySlug[slug] ? acct24BySlug[slug].size : 0;
      return {
        slug,
        name: nameBySlug[slug] || slug,
        guest24,
        acct24,
        total24: guest24 + acct24,
      };
    })
    .filter((x) => x.total24 > 0)
    .sort((a, b) => b.total24 - a.total24);

  return {
    generated_at: new Date().toISOString(),
    last_24h: { new_operators: newOperators24, new_tours: newTours24 },
    totals: {
      operators: operators.length,
      on_trial: onTrial,
      paying,
      tours: active.length,
      live_tours: liveTours,
      draft_tours: draftTours,
    },
    recent_operators: recentOperators,
    usage: {
      guest: guestUsage,
      account: accountUsage,
      accessed24,
    },
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
    opRows = `<tr><td ${td} colspan="4" style="padding:16px;color:#777;font-size:14px;">No new operator accounts in the last 24 hours.</td></tr>`;
  }

  const tot = stats.totals || {};

  const u = stats.usage || {};
  const gu = u.guest || { t24: 0, all: 0 };
  const au = u.account || { t24: 0, all: 0 };

  let accessed24Rows = (u.accessed24 || [])
    .map(
      (a) => `<tr>
        <td ${td}>${esc(a.name)}<br><span style="color:#999;font-size:12px;">/${esc(a.slug)}</span></td>
        <td ${td}>${esc(a.guest24)}</td>
        <td ${td}>${esc(a.acct24)}</td>
        <td ${td}><strong>${esc(a.total24)}</strong></td>
      </tr>`
    )
    .join('');
  if (!accessed24Rows) {
    accessed24Rows = `<tr><td ${td} colspan="4" style="padding:16px;color:#777;font-size:14px;">No tours accessed by visitors in the last 24 hours.</td></tr>`;
  }

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

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">All time</div>
        <div style="margin-bottom:22px;">
          ${tile(tot.operators || 0, 'operators')}
          ${tile(tot.on_trial || 0, 'on trial')}
          ${tile(tot.paying || 0, 'paying')}
          ${tile(tot.tours || 0, 'tours')}
          ${tile(tot.live_tours || 0, 'live')}
          ${tile(tot.draft_tours || 0, 'drafts')}
        </div>

        <div style="height:1px;background:${border};margin:6px 0 20px;"></div>
        <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;font-weight:bold;">Tour usage</p>
        <p style="margin:0 0 14px;font-size:13px;color:#555;">How many people are using the live tours, split by guests and signed-in accounts.</p>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">Last 24 hours</div>
        <div style="margin-bottom:14px;">
          ${tile(gu.t24 || 0, 'guest visitors')}
          ${tile(au.t24 || 0, 'signed-in visitors')}
        </div>
        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">All time</div>
        <div style="margin-bottom:18px;">
          ${tile(gu.all || 0, 'guest visitors')}
          ${tile(au.all || 0, 'signed-in visitors')}
        </div>

        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">Tours accessed by visitors (last 24 hours)</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid ${border};border-radius:8px;overflow:hidden;margin-bottom:22px;">
          <thead><tr>
            <th ${th}>Tour</th>
            <th ${th}>Guests</th>
            <th ${th}>Signed in</th>
            <th ${th}>Total</th>
          </tr></thead>
          <tbody>${accessed24Rows}</tbody>
        </table>

        <div style="height:1px;background:${border};margin:0 0 20px;"></div>
        <div style="font-size:13px;font-weight:bold;color:${green};text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px;">New operator accounts (last 24 hours)</div>
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
          Operators are self-serve accounts (admins excluded).
        </p>
      </div>
    </div>
    <p style="text-align:center;color:#999;font-size:11px;margin:16px 0 0;">StorieD &middot; automated daily sign-up summary</p>
  </div>
</body></html>`;
}
