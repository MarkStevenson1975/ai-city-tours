import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { trackOperator } from '@/lib/track-operator';
import { PreviewExperience, type PreviewStop } from './preview-experience';
import { FirstRunRail } from '../../first-run-rail';

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
    .select('id, name, slug, guide_name, color_primary, previewed_at, published_at')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

  // Stamp the first time they walk their own tour. Drives the "Walk it
  // yourself" tick on the first-run checklist. Best effort: never block the
  // page if it fails.
  if (!city.previewed_at) {
    try {
      await createAdminClient()
        .from('cities')
        .update({ previewed_at: new Date().toISOString() })
        .eq('id', city.id)
        .is('previewed_at', null);
      await trackOperator(user.id, 'previewed', {
        cityId: city.id,
        meta: { where: 'preview_page' },
      });
    } catch {
      // ignore — previewing must never fail because of a stat
    }
  }

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
    <div className="flex flex-col lg:flex-row gap-8 max-w-4xl">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/dashboard/${citySlug}`}
            className="text-sm text-gray-500 hover:text-primary"
          >
            ← Back to dashboard
          </Link>
          <span className="text-xs text-gray-500">
            Draft preview · not published
          </span>
        </div>

        <PreviewExperience
          cityName={city.name}
          guideName={city.guide_name ?? 'Harriet'}
          accent={city.color_primary || '#3B6D11'}
          stops={previewStops}
        />
      </div>

      {/* Step 3 is this page, so the rail stays with them. Hidden once live. */}
      {!city.published_at && (
        <FirstRunRail
          state={{
            hasCity: true,
            stopCount: previewStops.length,
            previewed: true,
            published: Boolean(city.published_at),
            citySlug: city.slug,
            hideWalkShortcut: true, // they are already walking it
            currentStep: 3, // this page IS "walk it yourself"
          }}
        />
      )}
    </div>
  );
}
