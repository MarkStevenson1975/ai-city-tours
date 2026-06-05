import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StopEditForm } from '../[stopId]/edit-form';

export default async function NewStopPage({
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

  // Fetch every existing position so we can offer the smallest unused
  // slot. Counting alone is wrong: if any stop has ever been deleted or
  // moved, the "count + 1" number collides with an existing position
  // (UNIQUE violation) or, worse, goes past 50 (check constraint).
  const { data: existingStops } = await supabase
    .from('stops')
    .select('position')
    .eq('city_id', city.id);

  const taken = new Set((existingStops ?? []).map((s) => s.position));
  let nextPosition: number | null = null;
  for (let i = 1; i <= 50; i++) {
    if (!taken.has(i)) {
      nextPosition = i;
      break;
    }
  }

  if (nextPosition === null) {
    return (
      <div className="max-w-3xl">
        <Link
          href={`/dashboard/${citySlug}`}
          className="text-sm text-gray-500 hover:text-primary transition"
        >
          ← Back to {city.name}
        </Link>
        <header className="mt-4 mb-8">
          <h1 className="text-4xl font-semibold">No room for another stop</h1>
          <p className="text-gray-600 mt-2">
            All 50 stop positions are in use. Delete or rearrange existing
            stops before adding another.
          </p>
        </header>
      </div>
    );
  }

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
          New stop · Suggested position {nextPosition}
        </p>
        <h1 className="text-4xl font-semibold">Add a stop</h1>
        <p className="text-gray-600 mt-2">
          Fill in the details below. The position is pre-filled with the next
          available slot — change it if you want this stop to appear earlier
          or later in the walk.
        </p>
      </header>

      <StopEditForm
        citySlug={citySlug}
        cityId={city.id}
        cityName={city.name}
        suggestedPosition={nextPosition}
      />
    </div>
  );
}
