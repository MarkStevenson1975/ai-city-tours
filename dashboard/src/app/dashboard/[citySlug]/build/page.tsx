import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BuildWizard } from './build-wizard';
import { FirstRunRail } from '../../first-run-rail';
import { TourActions } from '../tour-actions';

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
    .select('id, name, slug, guide_name, tour_kind, previewed_at, published_at')
    .eq('slug', citySlug)
    .single();

  if (!city) redirect('/dashboard');

  // Event tours pin their own stops (stalls, stages) and never want the Google
  // landmark search. Venue tours also use the map. Derive from the stored kind
  // so it holds however the operator arrives (URL, resume link, or a re-visit).
  const isEvent = city.tour_kind === 'event';
  const usesMap = venue === '1' || isEvent || city.tour_kind === 'venue';

  const { count: stopCount } = await supabase
    .from('stops')
    .select('id', { count: 'exact', head: true })
    .eq('city_id', city.id);

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-5xl">
      <div className="flex-1 min-w-0 max-w-2xl">
        {/* Escape hatch: this page used to be a dead end. Leave to Mission
            Control (progress is kept), or delete the tour outright here — with
            an "Are you sure?" confirm — without needing another page to load. */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-primary transition"
          >
            ← Back to Mission Control
          </Link>
          <TourActions
            cityId={city.id}
            citySlug={city.slug}
            cityName={city.name}
            isLive={false}
          />
        </div>
        {/* The heading lives inside the wizard, because it has to change once
            the stops are drafted. Leaving "Let's build your tour" sitting above
            a finished draft made the page look like a step you had already done. */}
        <BuildWizard
          citySlug={city.slug}
          defaultArea={city.name}
          guideName={city.guide_name ?? 'Harriet'}
          autoSearch={auto === '1' && !usesMap}
          venueMode={usesMap}
          eventMode={isEvent}
        />
      </div>

      <FirstRunRail
        state={{
          hasCity: true,
          stopCount: stopCount ?? 0,
          previewed: Boolean(city.previewed_at),
          published: Boolean(city.published_at),
          citySlug: city.slug,
          currentStep: 2, // this page IS "choose your stops"
        }}
      />
    </div>
  );
}
