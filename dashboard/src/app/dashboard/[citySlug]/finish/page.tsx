import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PreviewExperience, type PreviewStop } from '../preview/preview-experience';
import { Confetti } from '../../confetti';
import { FirstRunRail } from '../../first-run-rail';

// The moment their stops save. This used to ask for a hero image and an
// operator logo, which sent people hunting for files at the exact moment they
// should be enjoying what they just made. The hero image is now inherited from
// their first stop, and operator branding lives in Settings.
//
// So this page has one job: show them the thing they built, on a phone, right
// now. No clicking through to find it.
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
    .select(
      'id, slug, name, guide_name, color_primary, splash_image_url, previewed_at, published_at'
    )
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

  const { data: stops } = await supabase
    .from('stops')
    .select(
      'position, name, short_description, narration, facts, hero_image_url, hero_image_override_url'
    )
    .eq('city_id', city.id)
    .order('position');

  const previewStops: PreviewStop[] = (stops ?? []).map((s) => ({
    position: s.position,
    name: s.name,
    shortDescription: s.short_description,
    narration: s.narration,
    facts: Array.isArray(s.facts) ? (s.facts as string[]) : [],
    image: s.hero_image_override_url || s.hero_image_url || null,
  }));

  const stopCount = previewStops.length;

  return (
    <>
      <Confetti />

      <div className="max-w-5xl">
        <div className="flex flex-col lg:flex-row gap-10 items-start">
          {/* The reward */}
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
              Nicely done
            </p>
            <h1 className="font-display text-5xl mb-3">Your tour exists.</h1>
            <p className="text-base text-gray-600 mb-6">
              {stopCount} stop{stopCount === 1 ? '' : 's'}, written and ready.
              That was the hard part. Have a look at it below, exactly as a
              visitor will see it.
            </p>

            <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
              <h2 className="text-lg font-semibold mb-1">What we did for you</h2>
              <ul className="text-sm text-gray-600 space-y-1.5">
                <li>· Drafted the narration for every stop</li>
                <li>· Put your stops in a walking order</li>
                {city.splash_image_url && (
                  <li>
                    · Used your first stop&apos;s photo as the welcome image
                  </li>
                )}
              </ul>
              <p className="text-xs text-gray-500 mt-3">
                Everything is editable. Change any of it in your tour, or add
                your logo and colours in Settings.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/dashboard/${city.slug}/preview`}
                className="px-6 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
              >
                Walk it on your phone →
              </Link>
              <Link
                href={`/dashboard/${city.slug}`}
                className="px-6 py-3 rounded-full border border-primary text-primary font-bold hover:bg-cream transition"
              >
                Go to my tour
              </Link>
            </div>

            <p className="text-xs text-gray-500 mt-5">
              Not published yet, so only you can see this. When you&apos;re
              happy, publish it: your first month is free.
            </p>

            {/* The tour itself, straight under the button that offers it. */}
            <div className="mt-8">
              <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-3">
                Draft preview
              </p>
              <PreviewExperience
                cityName={city.name}
                guideName={city.guide_name ?? 'Harriet'}
                accent={city.color_primary || '#1B4332'}
                stops={previewStops}
              />
            </div>
          </div>

          {/* Progress rail stays exactly where it is on every other screen. */}
          <FirstRunRail
            state={{
              hasCity: true,
              stopCount,
              previewed: Boolean(city.previewed_at),
              published: Boolean(city.published_at),
              citySlug: city.slug,
            }}
          />
        </div>
      </div>
    </>
  );
}
