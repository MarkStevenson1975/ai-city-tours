import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DeleteVisitorButton } from './delete-visitor-button';

type VisitorRow = {
  user_id: string;
  email: string;
  signed_up_at: string;
  last_active_at: string | null;
  cities_visited: string[];
  total_stops: number;
  stops_by_city: Record<string, string[]>;
};

export default async function AdminVisitorsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/dashboard');

  const { data: visitors, error } = await supabase.rpc('admin_visitor_list');

  return (
    <div className="max-w-6xl">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Admin
      </p>
      <h1 className="text-4xl font-semibold mb-2">Registered Visitors</h1>
      <p className="text-sm text-gray-500 mb-8">
        Every tourist account across all areas. Not shared with operators — they
        receive anonymised KPIs only.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 text-sm mb-6">
          Could not load visitor data: {error.message}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-10">
        <KpiCard label="Total registered visitors" value={visitors?.length ?? 0} />
        <KpiCard
          label="Multi-city visitors"
          value={
            visitors?.filter((v: VisitorRow) => v.cities_visited.length > 1).length ?? 0
          }
        />
        <KpiCard
          label="Areas with activity"
          value={
            new Set(visitors?.flatMap((v: VisitorRow) => v.cities_visited) ?? []).size
          }
        />
      </div>

      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Signed up</th>
              <th className="px-6 py-3">Last active</th>
              <th className="px-6 py-3">Areas visited</th>
              <th className="px-6 py-3">Stops visited</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream">
            {!visitors || visitors.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-gray-400 italic"
                >
                  No visitor sign-ups yet.
                </td>
              </tr>
            ) : (
              visitors.map((v: VisitorRow) => (
                <tr key={v.user_id} className="hover:bg-cream/40 transition">
                  <td className="px-6 py-4 font-mono text-xs text-gray-700">
                    {v.email}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(v.signed_up_at)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {v.last_active_at ? formatDate(v.last_active_at) : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    {v.cities_visited.length === 0 ? (
                      <span className="text-gray-400 italic">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {v.cities_visited.map((slug) => (
                          <span
                            key={slug}
                            className="inline-block bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                          >
                            {slug}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {!v.stops_by_city || Object.keys(v.stops_by_city).length === 0 ? (
                      <span className="text-gray-400 italic">None yet</span>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(v.stops_by_city).map(([citySlug, stops]) => (
                          <div key={citySlug}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1 capitalize">
                              {citySlug}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {stops.map((name) => (
                                <span
                                  key={name}
                                  className="inline-block bg-accent/15 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <DeleteVisitorButton userId={v.user_id} email={v.email} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Data is live from Supabase Auth. Refresh the page to update.
      </p>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <p className="text-4xl font-display font-semibold text-primary">{value}</p>
      <p className="text-xs uppercase tracking-wider text-gray-600 mt-1 font-bold">
        {label}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
