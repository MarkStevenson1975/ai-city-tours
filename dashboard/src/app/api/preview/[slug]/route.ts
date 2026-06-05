// GET /api/preview/<slug>
// Small payload powering the live preview pinned in the dashboard sidebar.
// Returns the tour name, stop count, subscription status, and the first stop.
import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/server';

// Public tour base URL (storied-tours). Override with PUBLIC_TOUR_URL if the
// tour moves to its own domain.
const TOUR_BASE = process.env.PUBLIC_TOUR_URL ?? 'https://storied-tours.vercel.app';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: city } = await supabase
    .from('cities')
    .select('id, name, published_version, published_config')
    .eq('slug', slug)
    .single();
  if (!city) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: stops } = await supabase
    .from('stops')
    .select('name, short_description, hero_image_url, hero_image_override_url')
    .eq('city_id', city.id)
    .order('position')
    .limit(1);

  const { count } = await supabase
    .from('stops')
    .select('id', { count: 'exact', head: true })
    .eq('city_id', city.id);

  const first = stops?.[0];

  // Once the tour is actually published (live), expose the public URL and a QR
  // code so the operator can open or scan it straight from the sidebar.
  const isLive = (city.published_version ?? 0) > 0 && city.published_config != null;
  const liveUrl = isLive ? `${TOUR_BASE}/${slug}` : null;
  let qrDataUrl: string | null = null;
  if (liveUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(liveUrl, { margin: 1, width: 240 });
    } catch {
      qrDataUrl = null;
    }
  }

  return NextResponse.json({
    name: city.name,
    published: isLive,
    totalStops: count ?? 0,
    liveUrl,
    qrDataUrl,
    firstStop: first
      ? {
          name: first.name,
          shortDescription: first.short_description,
          image: first.hero_image_override_url || first.hero_image_url || null,
        }
      : null,
  });
}
