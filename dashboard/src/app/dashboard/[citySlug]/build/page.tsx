import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BuildWizard } from './build-wizard';

// Guided AI build journey for a city: location, suggested local sites, then
// AI-drafted stops. New operators land here straight after creating a tour.
export default async function BuildPage({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}) {
  const { citySlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: city } = await supabase
    .from('cities')
    .select('name, slug, guide_name')
    .eq('slug', citySlug)
    .single();

  if (!city) redirect('/dashboard');

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Build {city.name}
      </p>
      <h1 className="text-4xl font-semibold mb-2">Let&apos;s build your tour</h1>
      <p className="text-sm text-gray-600 mb-8">
        Tell us where you are and we will find your local landmarks. The AI
        drafts each stop for you. You can edit everything afterwards.
      </p>

      <BuildWizard
        citySlug={city.slug}
        defaultArea={city.name}
        guideName={city.guide_name ?? 'Harriet'}
      />
    </div>
  );
}
