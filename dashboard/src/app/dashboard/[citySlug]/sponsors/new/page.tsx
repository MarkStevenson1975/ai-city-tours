import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SponsorForm } from '../sponsor-form';

export default async function NewSponsorPage({
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
        href={`/dashboard/${citySlug}/sponsors`}
        className="text-sm text-gray-500 hover:text-primary transition"
      >
        ← Back to sponsors
      </Link>

      <header className="mt-4 mb-8">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          {city.name} · New
        </p>
        <h1 className="text-4xl font-semibold">Add sponsor</h1>
        <p className="text-gray-600 mt-2">
          Once active, this business appears in the proximity callout when
          walkers pass within the radius you set.
        </p>
      </header>

      <SponsorForm citySlug={citySlug} cityId={city.id} cityName={city.name} />
    </div>
  );
}
