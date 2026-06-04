import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PreviewExperience, type PreviewStop } from './preview-experience';

// Full draft preview, stepped through one stop at a time like the real
// mobile tour. Reads the draft tables directly.
export default async function PreviewPage({
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
    .select('id, name, slug, guide_name, color_primary')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

  const { data: stops } = await supabase
    .from('stops')
    .select('position, name, short_description, narration, facts, hero_image_url, hero_image_override_url')
    .eq('city_id', city.id)
    .order('position');

  const previewStops: PreviewStop[] = (stops ?? []).map((s) => ({
    position: s.position,
    name: s.name,
    shortDescription: s.short_description,
    narration: s.narration,
    facts: Array.isArray(s.facts) ? (s.facts as string[]) : [],
    image: s.hero_image_override_url || s.hero_image_url || null,
  }));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link href={`/dashboard/${citySlug}`} className="text-sm text-gray-500 hover:text-primary">
          ← Back to dashboard
        </Link>
        <span className="text-xs text-gray-500">Draft preview · not published</span>
      </div>

      <PreviewExperience
        cityName={city.name}
        guideName={city.guide_name ?? 'Harriet'}
        accent={city.color_primary || '#3B6D11'}
        stops={previewStops}
      />
    </div>
  );
}
