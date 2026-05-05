import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FactForm } from '../fact-form';

export default async function FactEditPage({
  params,
}: {
  params: Promise<{ citySlug: string; factId: string }>;
}) {
  const { citySlug, factId } = await params;
  const supabase = await createClient();

  const [{ data: fact }, { data: city }] = await Promise.all([
    supabase.from('location_facts').select('*').eq('id', factId).single(),
    supabase.from('cities').select('id, slug, name').eq('slug', citySlug).single(),
  ]);
  if (!fact || !city) notFound();
  if (fact.city_id !== city.id) notFound();

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
          {city.name} · Location fact
        </p>
        <h1 className="text-3xl font-semibold line-clamp-2">{fact.text}</h1>
      </header>

      <FactForm citySlug={citySlug} cityId={city.id} fact={fact} />
    </div>
  );
}
