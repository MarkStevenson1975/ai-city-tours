import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './settings-form';
import { LogoUpload } from './logo-upload';
import { SplashImageUpload } from './splash-image-upload';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}) {
  const { citySlug } = await params;
  const supabase = await createClient();

  const { data: city } = await supabase
    .from('cities')
    .select('*')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

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
          {city.name}
        </p>
        <h1 className="text-4xl font-semibold">Settings</h1>
        <p className="text-gray-600 mt-2">
          Operator and branding details that show on the public tour splash
          and inside admin views.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">Splash screen image</h2>
        <p className="text-sm text-gray-600 mb-4">
          The hero photograph shown on the tour&apos;s opening screen. Displayed
          as a 16:10 landscape crop — the centre of the image is always visible.
        </p>
        <div className="bg-white rounded-xl p-8 shadow-sm">
          <SplashImageUpload
            cityId={city.id}
            citySlug={city.slug}
            currentImageUrl={city.splash_image_url ?? null}
          />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">Operator logo</h2>
        <p className="text-sm text-gray-600 mb-4">
          Shown prominently on the public tour&apos;s splash screen. Wide
          rectangular shapes work best.
        </p>
        <div className="bg-white rounded-xl p-8 shadow-sm">
          <LogoUpload
            cityId={city.id}
            citySlug={city.slug}
            currentLogoUrl={city.operator_logo_url}
          />
        </div>
      </section>

      <section className="mb-12">
        <SettingsForm city={city} />
      </section>
    </div>
  );
}
