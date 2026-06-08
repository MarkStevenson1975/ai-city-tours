import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/server';
import { PromoteClient } from './promote-client';

// Promote tab: gives the operator a print-ready, branded A4 poster (PDF + PNG)
// and three lift-and-drop social posts for their live tour. Everything is
// generated from data the area already holds (brand colours, operator name and
// attribution, logo, live URL). Available once the tour is published.
const TOUR_BASE = process.env.PUBLIC_TOUR_URL ?? 'https://storied-tours.vercel.app';

// Fetch a remote image (the operator logo) and inline it as a data URI so the
// poster can be rasterised to PNG in the browser without tainting the canvas.
async function toDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 4_000_000) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function PromotePage({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}) {
  const { citySlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: city } = await supabase
    .from('cities')
    .select(
      'id, slug, name, operator_name, operator_attribution_text, operator_logo_url, color_primary, color_accent, color_background, published_version, published_config'
    )
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

  const isLive =
    (city.published_version ?? 0) > 0 && city.published_config != null;
  const liveUrl = `${TOUR_BASE}/${city.slug}`;

  if (!isLive) {
    return (
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          Promote
        </p>
        <h1 className="text-4xl font-semibold mb-3">Tell the world</h1>
        <p className="text-gray-600 mb-6">
          Your poster and social posts appear here the moment your tour is live.
          Publish {city.name} first, then come back to download your poster and
          copy your posts.
        </p>
        <Link
          href={`/dashboard/${city.slug}`}
          className="px-6 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
        >
          Back to my tour
        </Link>
      </div>
    );
  }

  const [qrDataUrl, logoDataUrl] = await Promise.all([
    QRCode.toDataURL(liveUrl, { margin: 1, width: 800 }).catch(() => ''),
    toDataUri(city.operator_logo_url),
  ]);

  return (
    <PromoteClient
      citySlug={city.slug}
      cityName={city.name}
      operatorName={city.operator_name ?? ''}
      attribution={city.operator_attribution_text || city.operator_name || ''}
      logoDataUrl={logoDataUrl}
      qrDataUrl={qrDataUrl}
      liveUrl={liveUrl}
      colorPrimary={city.color_primary ?? '#1B4332'}
      colorAccent={city.color_accent ?? '#C9A84C'}
      colorBackground={city.color_background ?? '#F5F0E8'}
    />
  );
}
