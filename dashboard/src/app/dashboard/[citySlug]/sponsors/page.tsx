import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function SponsorsListPage({
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

  const { data: sponsors } = await supabase
    .from('sponsors')
    .select(
      'id, name, category, tier, subscription_status, monthly_price_pence, updated_at'
    )
    .eq('city_id', city.id)
    .order('name');

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
          <h1 className="text-4xl font-semibold">Sponsors</h1>
          <p className="text-gray-600 mt-2">
            Local businesses featured in the tour. Active sponsors appear in
            the proximity callouts during the walk.
          </p>
        </div>
        <Link
          href={`/dashboard/${citySlug}/sponsors/new`}
          className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition whitespace-nowrap"
        >
          + Add sponsor
        </Link>
      </header>

      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Category</th>
              <th className="px-6 py-3 w-24">Tier</th>
              <th className="px-6 py-3 w-28">Status</th>
              <th className="px-6 py-3 w-24">Price</th>
              <th className="px-6 py-3 w-20" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream">
            {(sponsors ?? []).map((s) => (
              <tr key={s.id} className="hover:bg-cream/50 transition">
                <td className="px-6 py-4 font-display text-lg">{s.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {s.category || <span className="italic text-gray-400">-</span>}
                </td>
                <td className="px-6 py-4">
                  <TierBadge tier={s.tier} />
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={s.subscription_status} />
                </td>
                <td className="px-6 py-4 text-sm font-mono">
                  {s.monthly_price_pence ? (
                    `£${(s.monthly_price_pence / 100).toFixed(0)}/mo`
                  ) : (
                    <span className="italic text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/dashboard/${citySlug}/sponsors/${s.id}`}
                    className="text-sm font-bold text-primary hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {(!sponsors || sponsors.length === 0) && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-sm text-gray-500"
                >
                  <p className="italic mb-3">No sponsors yet.</p>
                  <Link
                    href={`/dashboard/${citySlug}/sponsors/new`}
                    className="text-primary font-bold hover:underline"
                  >
                    Add your first sponsor →
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

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    featured: 'bg-accent text-primary',
    standard: 'bg-muted text-gray-700',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
        styles[tier] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {tier}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-amber-100 text-amber-800',
    past_due: 'bg-orange-100 text-orange-800',
    cancelled: 'bg-gray-100 text-gray-700',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
        styles[status] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
