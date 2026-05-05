import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EventForm } from '../event-form';

export default async function EventEditPage({
  params,
}: {
  params: Promise<{ citySlug: string; eventId: string }>;
}) {
  const { citySlug, eventId } = await params;
  const supabase = await createClient();

  const [{ data: event }, { data: city }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('cities').select('id, slug, name').eq('slug', citySlug).single(),
  ]);
  if (!event || !city) notFound();
  if (event.city_id !== city.id) notFound();

  return (
    <div className="max-w-3xl">
      <Link
        href={`/dashboard/${citySlug}/events`}
        className="text-sm text-gray-500 hover:text-primary transition"
      >
        ← Back to events
      </Link>

      <header className="mt-4 mb-8">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          {city.name} · Event
        </p>
        <h1 className="text-4xl font-semibold">{event.name}</h1>
      </header>

      <EventForm citySlug={citySlug} cityId={city.id} event={event} />
    </div>
  );
}
