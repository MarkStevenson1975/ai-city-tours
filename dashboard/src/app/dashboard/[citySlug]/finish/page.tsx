import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SplashImageUpload } from '../settings/splash-image-upload';
import { OperatorSection } from './operator-section';

// Onboarding "finishing touches" step: set the main hero (splash) image and
// the optional finish-screen sponsor. Reached after the build wizard saves
// stops, before the operator lands on the dashboard.
export default async function FinishPage({
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
    .select('id, slug, name, splash_image_url, operator_name, operator_logo_url')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Finishing touches
      </p>
      <h1 className="text-4xl font-semibold mb-2">Make {city.name} yours</h1>
      <p className="text-sm text-gray-600 mb-8">
        Add a main image for your tour&apos;s welcome screen, and the operator
        running the tour. You can change all of this later.
      </p>

      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-2xl font-semibold mb-1">Main hero image</h2>
        <p className="text-sm text-gray-600 mb-4">
          Shown on the welcome screen when a visitor opens your tour.
        </p>
        <SplashImageUpload
          cityId={city.id}
          citySlug={city.slug}
          currentImageUrl={city.splash_image_url}
        />
      </div>

      <OperatorSection
        cityId={city.id}
        citySlug={city.slug}
        operatorName={city.operator_name ?? ''}
        logoUrl={city.operator_logo_url}
      />

      <div className="flex items-center gap-4 mt-8">
        <Link
          href={`/dashboard/${city.slug}`}
          className="px-6 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
        >
          Continue to my tour
        </Link>
        <Link
          href={`/dashboard/${city.slug}`}
          className="text-sm font-bold text-gray-500 hover:text-gray-800"
        >
          Skip for now
        </Link>
      </div>
    </div>
  );
}
