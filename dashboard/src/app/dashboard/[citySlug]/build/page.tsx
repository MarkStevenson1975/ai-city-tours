import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BuildWizard } from './build-wizard';
import { FirstRunRail } from '../../first-run-rail';

// Guided AI build journey for a city: location, suggested local sites, then
// AI-drafted stops. New operators land here straight after creating a tour.
export default async function BuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ citySlug: string }>;
  searchParams: Promise<{ auto?: string; venue?: string }>;
}) {
  const { citySlug } = await params;
  const { auto, venue } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: city } = await supabase
    .from('cities')
    .select('id, name, slug, guide_name, previewed_at, published_at')
    .eq('slug', citySlug)
    .single();

  if (!city) redirect('/dashboard');

  const { count: stopCount } = await supabase
    .from('stops')
    .select('id', { count: 'exact', head: true })
    .eq('city_id', city.id);

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-5xl">
      <div className="flex-1 min-w-0 max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          Build {city.name}
        </p>
        <h1 className="text-4xl font-semibold mb-2">
          Let&apos;s build your tour
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          {venue === '1'
            ? 'Place each stop on the map and the AI will draft the narration for every one. You can edit everything afterwards.'
            : 'Tell us where you are and we will find your local landmarks. The AI drafts each stop for you. You can edit everything afterwards.'}
        </p>

        <BuildWizard
          citySlug={city.slug}
          defaultArea={city.name}
          guideName={city.guide_name ?? 'Harriet'}
          autoSearch={auto === '1'}
          venueMode={venue === '1'}
        />
      </div>

      <FirstRunRail
        state={{
          hasCity: true,
          stopCount: stopCount ?? 0,
          previewed: Boolean(city.previewed_at),
          published: Boolean(city.published_at),
          citySlug: city.slug,
        }}
      />
    </div>
  );
}
