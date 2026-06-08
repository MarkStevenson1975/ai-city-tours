// Flags (or unflags) a browser as an internal team device so its activity is
// excluded from guest reporting.
//
// POST /api/internal-device
//   body: { deviceId: string, label?: string, action?: "add" | "remove" }
//
// "add"    -> upserts the device_id into public.guest_internal_devices
// "remove" -> deletes it again (undo)
//
// This only ever affects whether a single browser's own events are counted; it
// exposes no data, so it needs no token. Service-role key is server-side only.
// Fire-and-forget from the tour's point of view: never throws back to the page.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(204).end();
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const deviceId = String(body.deviceId || '').slice(0, 64);
  if (!deviceId) {
    return res.status(400).json({ error: 'Missing deviceId' });
  }
  const action = body.action === 'remove' ? 'remove' : 'add';
  const label = body.label != null ? String(body.label).slice(0, 120) : null;

  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (action === 'remove') {
      const url =
        `${SUPABASE_URL}/rest/v1/guest_internal_devices` +
        `?device_id=eq.${encodeURIComponent(deviceId)}`;
      const r = await fetch(url, { method: 'DELETE', headers: sbHeaders });
      if (!r.ok) {
        const d = await r.text().catch(() => '');
        console.warn('internal-device delete failed', r.status, d.slice(0, 200));
        return res.status(502).json({ error: 'Upstream error' });
      }
      return res.status(200).json({ ok: true, action: 'remove', deviceId });
    }

    // add (upsert): resolve conflicts on the primary key, keep it idempotent.
    const url = `${SUPABASE_URL}/rest/v1/guest_internal_devices?on_conflict=device_id`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ device_id: deviceId, label }),
    });
    if (!r.ok) {
      const d = await r.text().catch(() => '');
      console.warn('internal-device upsert failed', r.status, d.slice(0, 200));
      return res.status(502).json({ error: 'Upstream error' });
    }
    return res.status(200).json({ ok: true, action: 'add', deviceId });
  } catch (e) {
    console.warn('internal-device threw', e && e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
