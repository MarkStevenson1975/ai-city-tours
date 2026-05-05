import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FactForm } from '../fact-form';

export default async function NewFactPage({
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
        href={`/dashboard/${citySlug}/location-facts`}
        className="text-sm text-gray-500 hover:text-primary transition"
      >
        ← Back to location facts
      </Link>

      <header className="mt-4 mb-8">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          {city.name} · New
        </p>
        <h1 className="text-4xl font-semibold">Add location fact</h1>
        <p className="text-gray-600 mt-2">
          The guide speaks this aloud when the walker enters the radius. Useful
          for adding atmosphere on the legs between major stops.
        </p>
      </header>

      <FactForm citySlug={citySlug} cityId={city.id} />
    </div>
  );
}
