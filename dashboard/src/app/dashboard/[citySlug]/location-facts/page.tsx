import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function FactsListPage({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}) {
  const { citySlug } = await params;
  const supabase = await createClient();

  const { data: city } = await supabase
    .from('cities')
    .select('id, name, slug')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

  const { data: facts } = await supabase
    .from('location_facts')
    .select('id, text, priority, radius_metres, fact_type')
    .eq('city_id', city.id)
    .order('priority', { ascending: true });

  return (
    <div className="max-w-5xl">
      <Link
        href={`/dashboard/${citySlug}`}
        className="text-sm text-gray-500 hover:text-primary transition"
      >
        ← Back to {city.name}
      </Link>

      <header className="mt-4 mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
            {city.name}
          </p>
          <h1 className="text-4xl font-semibold">Location facts</h1>
          <p className="text-gray-600 mt-2">
            Short proximity-triggered facts the guide speaks as the walker
            moves between stops.
          </p>
        </div>
        <Link
          href={`/dashboard/${citySlug}/location-facts/new`}
          className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition whitespace-nowrap"
        >
          + Add fact
        </Link>
      </header>

      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-3 w-20">Priority</th>
              <th className="px-6 py-3">Fact</th>
              <th className="px-6 py-3 w-20">Radius</th>
              <th className="px-6 py-3 w-20" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream">
            {(facts ?? []).map((f) => (
              <tr key={f.id} className="hover:bg-cream/50 transition">
                <td className="px-6 py-4 font-mono text-sm font-bold">
                  {f.priority}
                </td>
                <td className="px-6 py-4 text-sm">
                  <p className="line-clamp-2">{f.text}</p>
                </td>
                <td className="px-6 py-4 text-sm font-mono">
                  {f.radius_metres ? (
                    `${f.radius_metres}m`
                  ) : (
                    <span className="text-xs uppercase tracking-wider text-accent font-bold">
                      Ambient
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/dashboard/${citySlug}/location-facts/${f.id}`}
                    className="text-sm font-bold text-primary hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {(!facts || facts.length === 0) && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-12 text-center text-sm text-gray-500"
                >
                  <p className="italic mb-3">No location facts yet.</p>
                  <Link
                    href={`/dashboard/${citySlug}/location-facts/new`}
                    className="text-primary font-bold hover:underline"
                  >
                    Add your first fact →
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
