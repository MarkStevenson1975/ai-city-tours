import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SponsorForm } from '../sponsor-form';

export default async function SponsorEditPage({
  params,
}: {
  params: Promise<{ citySlug: string; sponsorId: string }>;
}) {
  const { citySlug, sponsorId } = await params;
  const supabase = await createClient();

  const [{ data: sponsor }, { data: city }] = await Promise.all([
    supabase.from('sponsors').select('*').eq('id', sponsorId).single(),
    supabase.from('cities').select('id, slug, name').eq('slug', citySlug).single(),
  ]);
  if (!sponsor || !city) notFound();
  if (sponsor.city_id !== city.id) notFound();

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
          {city.name} · Sponsor
        </p>
        <h1 className="text-4xl font-semibold">{sponsor.name}</h1>
      </header>

      <SponsorForm citySlug={citySlug} cityId={city.id} cityName={city.name} sponsor={sponsor} />
    </div>
  );
}
