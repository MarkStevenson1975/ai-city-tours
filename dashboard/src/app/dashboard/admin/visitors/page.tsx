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

type GuestRow = {
  device_id: string;
  first_seen: string;
  last_active: string;
  cities_visited: string[];
  stops_logged: number;
  stops_by_city: Record<string, string[]> | null;
};

// One shape for the merged table
type TableRow = {
  key: string;
  kind: 'registered' | 'guest';
  label: string; // email, or short device reference for guests
  firstSeen: string;
  lastActive: string | null;
  cities: string[];
  stopsByCity: Record<string, string[]> | null; // registered only
  stopsCount: number;
  userId: string | null; // registered only, for delete
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
  const { data: guests, error: guestError } = await supabase.rpc(
    'admin_guest_visitor_list'
  );

  const registeredRows: TableRow[] = (visitors ?? []).map((v: VisitorRow) => ({
    key: `u-${v.user_id}`,
    kind: 'registered' as const,
    label: v.email,
    firstSeen: v.signed_up_at,
    lastActive: v.last_active_at,
    cities: v.cities_visited,
    stopsByCity: v.stops_by_city,
    stopsCount: v.total_stops,
    userId: v.user_id,
  }));

  const guestRows: TableRow[] = (guests ?? []).map((g: GuestRow) => ({
    key: `g-${g.device_id}`,
    kind: 'guest' as const,
    label: g.device_id.slice(0, 8),
    firstSeen: g.first_seen,
    lastActive: g.last_active,
    cities: g.cities_visited,
    stopsByCity: g.stops_by_city ?? null,
    stopsCount: g.stops_logged,
    userId: null,
  }));

  // Only visitors seen in the last 14 days, most recently active first
  const WINDOW_DAYS = 14;
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const rows = [...registeredRows, ...guestRows]
    .filter(
      (r) => new Date(r.lastActive ?? r.firstSeen).getTime() >= cutoff
    )
    .sort((a, b) => {
      const aT = new Date(a.lastActive ?? a.firstSeen).getTime();
      const bT = new Date(b.lastActive ?? b.firstSeen).getTime();
      return bT - aT;
    });

  const allCities = new Set(rows.flatMap((r) => r.cities));

  return (
    <div className="max-w-6xl">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Admin
      </p>
      <h1 className="text-4xl font-semibold mb-2">Visitors</h1>
      <p className="text-sm text-gray-500 mb-2">
        Every tourist across all areas — registered accounts and anonymous
        guests. Not shared with operators — they receive anonymised KPIs only.
      </p>
      <p className="text-sm font-bold text-primary mb-8">
        Showing the last {WINDOW_DAYS} days of activity only.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 text-sm mb-6">
          Could not load visitor data: {error.message}
        </div>
      )}
      {guestError && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 text-sm mb-6">
          Could not load guest data: {guestError.message}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-10">
        <KpiCard
          label="Registered visitors"
          value={rows.filter((r) => r.kind === 'registered').length}
        />
        <KpiCard
          label="Guest visitors"
          value={rows.filter((r) => r.kind === 'guest').length}
        />
        <KpiCard
          label="Multi-city visitors"
          value={rows.filter((r) => r.cities.length > 1).length}
        />
        <KpiCard label="Areas with activity" value={allCities.size} />
      </div>

      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-3">Visitor</th>
              <th className="px-6 py-3">First seen</th>
              <th className="px-6 py-3">Last active</th>
              <th className="px-6 py-3">Areas visited</th>
              <th className="px-6 py-3">Stops visited</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-gray-400 italic"
                >
                  No visitor activity in the last {WINDOW_DAYS} days.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key} className="hover:bg-cream/40 transition">
                  <td className="px-6 py-4">
                    {r.kind === 'guest' ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block bg-gray-200 text-gray-600 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
                          Guest
                        </span>
                        <span
                          className="font-mono text-[10px] text-gray-400"
                          title="Anonymous device reference"
                        >
                          {r.label}
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-gray-700">
                        {r.label}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(r.firstSeen)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {r.lastActive ? formatDate(r.lastActive) : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    {r.cities.length === 0 ? (
                      <span className="text-gray-400 italic">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.cities.map((slug) => (
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
                    {r.stopsByCity && Object.keys(r.stopsByCity).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(r.stopsByCity).map(
                          ([citySlug, stops]) => (
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
                          )
                        )}
                      </div>
                    ) : r.stopsCount > 0 ? (
                      <span className="text-gray-700">
                        {r.stopsCount} stop{r.stopsCount === 1 ? '' : 's'} reached
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">None yet</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {r.kind === 'registered' && r.userId && (
                      <DeleteVisitorButton userId={r.userId} email={r.label} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Data is live from Supabase, limited to visitors active in the last{' '}
        {WINDOW_DAYS} days. Refresh the page to update. Guests are anonymous
        devices using a tour without an account; our own test devices are
        excluded.
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
