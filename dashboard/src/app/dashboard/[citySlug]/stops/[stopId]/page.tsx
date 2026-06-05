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
    supabase.from('cities').select('id, slug, name').eq('slug', citySlug).single(),
  ]);

  if (!stop || !city) notFound();
  // Guard: this stop belongs to this city
  if (stop.city_id !== city.id) notFound();

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

      <StopEditForm stop={stop} citySlug={citySlug} cityId={city.id} cityName={city.name} />
    </div>
  );
}
