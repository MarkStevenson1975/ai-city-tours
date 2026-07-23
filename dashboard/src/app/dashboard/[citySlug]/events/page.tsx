import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const MONTHS = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default async function EventsListPage({
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

  const { data: events } = await supabase
    .from('events')
    .select('id, name, emoji, month, day_from, day_to, year_cycle')
    .eq('city_id', city.id)
    .order('month')
    .order('day_from');

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
          <h1 className="text-4xl font-semibold">Events</h1>
          <p className="text-gray-600 mt-2">
            Seasonal mentions on the splash screen. The guide announces
            upcoming, current, and recent events automatically based on
            today&apos;s date.
          </p>
        </div>
        <Link
          href={`/dashboard/${citySlug}/events/new`}
          className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition whitespace-nowrap"
        >
          + Add event
        </Link>
      </header>

      <div className="bg-white rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full min-w-[640px]">
          <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-3 w-10"></th>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3 w-32">When</th>
              <th className="px-6 py-3 w-24">Cycle</th>
              <th className="px-6 py-3 w-20" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream">
            {(events ?? []).map((e) => (
              <tr key={e.id} className="hover:bg-cream/50 transition">
                <td className="px-6 py-4 text-2xl">{e.emoji || ''}</td>
                <td className="px-6 py-4 font-display text-lg">{e.name}</td>
                <td className="px-6 py-4 text-sm">
                  {MONTHS[e.month]} {e.day_from}
                  {e.day_to !== e.day_from ? ` to ${e.day_to}` : ''}
                </td>
                <td className="px-6 py-4 text-sm">
                  {e.year_cycle ? (
                    `every ${e.year_cycle} years`
                  ) : (
                    <span className="italic text-gray-400">annual</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/dashboard/${citySlug}/events/${e.id}`}
                    className="text-sm font-bold text-primary hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {(!events || events.length === 0) && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-sm text-gray-500"
                >
                  <p className="italic mb-3">No events yet.</p>
                  <Link
                    href={`/dashboard/${citySlug}/events/new`}
                    className="text-primary font-bold hover:underline"
                  >
                    Add your first event →
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
