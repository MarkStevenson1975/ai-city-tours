import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StopEditForm } from './edit-form';

export default async function StopEditPage({
  params,
}: {
  params: Promise<{ citySlug: string; stopId: string }>;
}) {
  const { citySlug, stopId } = await params;
  const supabase = await createClient();

  // Fetch the stop and its parent city in parallel
  const [{ data: stop }, { data: city }] = await Promise.all([
    supabase.from('stops').select('*').eq('id', stopId).single(),
    supabase.from('cities').select('id, slug, name, tour_kind, travel_mode').eq('slug', citySlug).single(),
  ]);

  if (!stop || !city) notFound();
  // Guard: this stop belongs to this city
  if (stop.city_id !== city.id) notFound();

  // The stop that follows this one, so Route guidance can shape the leg between
  // the two. Null on the final stop.
  const { data: nextRow } = await supabase
    .from('stops')
    .select('name, position, lat, lng')
    .eq('city_id', city.id)
    .gt('position', stop.position)
    .order('position')
    .limit(1)
    .maybeSingle();
  const nextStop =
    nextRow && typeof nextRow.lat === 'number' && typeof nextRow.lng === 'number'
      ? { name: nextRow.name, position: nextRow.position, lat: nextRow.lat, lng: nextRow.lng }
      : null;

  return (
    <div className="max-w-3xl">
      <Link
        href={`/dashboard/${citySlug}`}
        className="text-sm text-gray-500 hover:text-primary transition"
      >
        ← Back to {city.name}
      </Link>

      <header className="mt-4 mb-8">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          Stop {stop.position}
        </p>
        <h1 className="text-4xl font-semibold">{stop.name}</h1>
      </header>

      <StopEditForm
        stop={stop}
        citySlug={citySlug}
        cityId={city.id}
        cityName={city.name}
        isEventTour={city.tour_kind === 'event'}
        showNextDirections={city.tour_kind === 'venue' || city.tour_kind === 'event'}
        nextStop={nextStop}
        travelMode={city.travel_mode ?? 'walking'}
      />
    </div>
  );
}
