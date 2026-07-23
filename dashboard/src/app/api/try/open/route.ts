// POST /api/try/open  (PUBLIC, no auth)
// Body: { area?, org?, ref? }
// Records that a prospect opened a personalised demo link, so the Kanban shows
// who clicked even if they never build a demo. Deduped per prospect.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { demoDedupeKey } from '@/lib/demo-lead';

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const area = body.area ? String(body.area).slice(0, 80).trim() : '';
  const org = body.org ? String(body.org).slice(0, 120).trim() : '';
  const ref = body.ref ? String(body.ref).slice(0, 80).trim() : '';

  // Only track links that carry a prospect tag (org or area). Organic opens
  // with no context are not useful to Louise, so we skip them.
  const key = demoDedupeKey(org || null, area || null);
  if (!key) return NextResponse.json({ ok: true });

  try {
    const admin = createAdminClient();
    await admin.rpc('record_demo_open', {
      p_dedupe_key: key,
      p_area: area || null,
      p_org: org || null,
      p_ref: ref || null,
      p_ip: clientIp(req),
    });
  } catch (e) {
    console.error('try/open error (non-fatal):', e);
  }
  return NextResponse.json({ ok: true });
}
