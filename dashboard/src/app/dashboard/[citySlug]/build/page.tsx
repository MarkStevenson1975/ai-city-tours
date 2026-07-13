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
        {/* The heading lives inside the wizard, because it has to change once
            the stops are drafted. Leaving "Let's build your tour" sitting above
            a finished draft made the page look like a step you had already done. */}
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
