import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EventForm } from '../event-form';

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}) {
  const { citySlug } = await params;
  const supabase = await createClient();

  const { data: city } = await supabase
    .from('cities')
    .select('id, slug, name')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

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
          {city.name} · New
        </p>
        <h1 className="text-4xl font-semibold">Add event</h1>
        <p className="text-gray-600 mt-2">
          The guide announces this on the splash screen during the date range
          you set, plus a window before and after for upcoming and recent
          messages.
        </p>
      </header>

      <EventForm citySlug={citySlug} cityId={city.id} />
    </div>
  );
}
