import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Full draft preview of a tour, framed like a phone, so the operator can see
// what visitors will get before they publish. Reads the draft tables directly.
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
    .select('id, position, name, short_description, narration, facts, hero_image_url, hero_image_override_url')
    .eq('city_id', city.id)
    .order('position');

  const accent = city.color_primary || '#3B6D11';

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link href={`/dashboard/${citySlug}`} className="text-sm text-gray-500 hover:text-primary">
          ← Back to dashboard
        </Link>
        <span className="text-xs text-gray-500">Draft preview · not published</span>
      </div>

      <div className="mx-auto" style={{ maxWidth: 380 }}>
        <div className="rounded-[36px] border-[10px] border-gray-900 bg-white overflow-hidden shadow-2xl">
          {/* Splash */}
          <div className="px-6 py-10 text-white text-center" style={{ background: accent }}>
            <p className="text-xs uppercase tracking-widest opacity-80 mb-2">A walking tour of</p>
            <h1 className="text-3xl font-semibold">{city.name}</h1>
            <p className="text-sm opacity-90 mt-3">
              Narrated by {city.guide_name}. {stops?.length ?? 0} stops.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {(stops ?? []).map((s) => {
              const img = s.hero_image_override_url || s.hero_image_url;
              const facts = Array.isArray(s.facts) ? (s.facts as string[]) : [];
              return (
                <div key={s.id}>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={s.name} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                      No image yet
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                        style={{ background: accent }}
                      >
                        {s.position}
                      </span>
                      <h2 className="font-semibold text-lg">{s.name}</h2>
                    </div>
                    {s.short_description && (
                      <p className="text-sm text-gray-600 mb-2">{s.short_description}</p>
                    )}
                    {s.narration && (
                      <p className="text-sm text-gray-800 whitespace-pre-line">{s.narration}</p>
                    )}
                    {facts.length > 0 && (
                      <ul className="text-sm text-gray-600 mt-2 list-disc pl-5 space-y-1">
                        {facts.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
            {(!stops || stops.length === 0) && (
              <p className="p-6 text-center text-sm text-gray-500 italic">No stops yet.</p>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-gray-500 mt-4">
          This is your draft. Start your free trial to publish it and walk it for real with audio.
        </p>
      </div>
    </div>
  );
}
