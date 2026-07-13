import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// The moment their stops save. This used to ask for a hero image and an
// operator logo, which sent people off hunting for files at the exact moment
// they should be enjoying what they just made. The hero image is now inherited
// from their first stop automatically, and operator branding lives in Settings.
// So this page has one job: tell them it worked, and get them walking it.
export default async function FinishPage({
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
    .select('id, slug, name, splash_image_url')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

  const { count } = await supabase
    .from('stops')
    .select('id', { count: 'exact', head: true })
    .eq('city_id', city.id);

  const stopCount = count ?? 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-primary text-cream rounded-xl p-8 shadow-sm text-center mb-6">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-3">
          Nicely done
        </p>
        <h1 className="font-display text-4xl mb-2">Your tour exists.</h1>
        <p className="text-sm text-cream/80 mb-6">
          {stopCount} stop{stopCount === 1 ? '' : 's'}, written and ready. That
          was the hard part.
        </p>

        {city.splash_image_url && (
          <div className="mx-auto mb-6 max-w-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={city.splash_image_url}
              alt=""
              className="w-full rounded-lg shadow-lg"
              style={{ aspectRatio: '16/9', objectFit: 'cover' }}
            />
            <p className="text-[11px] text-cream/60 mt-2">
              We&apos;ve used your first stop&apos;s photo as the welcome image.
              Change it any time in Settings.
            </p>
          </div>
        )}

        <Link
          href={`/dashboard/${city.slug}/preview`}
          className="inline-block px-7 py-3 rounded-full bg-accent text-primary font-bold hover:bg-accent-light transition"
        >
          Walk it on your phone →
        </Link>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-xl font-semibold mb-1">What happens next</h2>
        <p className="text-sm text-gray-600">
          Walk your tour to check it reads well on the street. When you&apos;re
          happy, publish it: your first month is free. After that, the Promote
          tab gives you a print-ready poster with your QR code and ready-made
          social posts.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/${city.slug}`}
          className="px-6 py-3 rounded-full border border-primary text-primary font-bold hover:bg-cream transition"
        >
          Go to my tour
        </Link>
        <Link
          href={`/dashboard/${city.slug}/settings`}
          className="text-sm font-bold text-gray-500 hover:text-gray-800"
        >
          Add your logo and branding
        </Link>
      </div>
    </div>
  );
}
