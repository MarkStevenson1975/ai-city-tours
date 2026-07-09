// Records an anonymous guest tour-usage event.
//
// POST /api/track/<city>
//   body: { deviceId: string, event: string, stopId?: string, meta?: object }
//
// Writes one row to public.guest_events in Supabase via PostgREST, using the
// service-role key (server-side only, never exposed to the browser). This is
// deliberately fire-and-forget and very forgiving: it must NEVER break the
// tour, so on any problem it just returns quietly. Vanilla fetch, no deps.

const ALLOWED_EVENTS = new Set([
  'tour_open',
  'walk_started',
  'stop_logged',
  'fact_played',
  'find_nearby',
  'sponsor_shown',
  'tour_complete',
  // end-of-tour feedback capture (rating on tap, comment on send) + upsell click
  'tour_feedback',
  'tour_feedback_comment',
  'create_own_click',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // Nothing we can do; don't surface an error to the tour.
    return res.status(204).end();
  }

  // Body may arrive parsed (Vercel) or as a raw string.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const deviceId = String(body.deviceId || '').slice(0, 64);
  const event = String(body.event || '');
  if (!deviceId || !ALLOWED_EVENTS.has(event)) {
    // Silently accept and ignore malformed pings.
    return res.status(204).end();
  }

  const stopId = body.stopId != null ? String(body.stopId).slice(0, 120) : null;
  const meta =
    body.meta && typeof body.meta === 'object' ? body.meta : null;
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 400);

  const row = {
    device_id: deviceId,
    city_slug: city,
    event,
    stop_id: stopId,
    meta,
    user_agent: userAgent,
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/guest_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.warn('guest_events insert failed', r.status, detail.slice(0, 200));
    }
  } catch (e) {
    console.warn('guest_events insert threw', e && e.message);
  }

  // Always succeed from the tour's point of view.
  return res.status(204).end();
}
