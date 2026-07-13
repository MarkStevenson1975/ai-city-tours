import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OPERATOR_FUNNEL } from '@/lib/track-operator';

// Where operators fall off, step by step. This is the operator-side twin of the
// guest funnel, and it exists because "12 of 14 verified operators never created
// a tour" was invisible until we measured it.
export default async function OperatorFunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
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

  const { days: daysParam } = await searchParams;
  const days = [7, 30, 90, 3650].includes(Number(daysParam))
    ? Number(daysParam)
    : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const admin = createAdminClient();

  // Operators only: admins testing the flow would flatter the numbers.
  const { data: operators } = await admin
    .from('user_profiles')
    .select('id')
    .neq('role', 'admin');
  const operatorIds = new Set((operators ?? []).map((o) => o.id));

  const { data: events } = await admin
    .from('operator_events')
    .select('user_id, event, created_at')
    .gte('created_at', since);

  // Distinct operators who reached each step.
  const reached = new Map<string, Set<string>>();
  for (const e of events ?? []) {
    if (!operatorIds.has(e.user_id)) continue;
    if (!reached.has(e.event)) reached.set(e.event, new Set());
    reached.get(e.event)!.add(e.user_id);
  }

  const rows = OPERATOR_FUNNEL.map((s) => ({
    ...s,
    count: reached.get(s.event)?.size ?? 0,
  }));

  const top = rows[0]?.count ?? 0;
  const worst = rows.reduce(
    (acc, r, i) => {
      if (i === 0) return acc;
      const lost = (rows[i - 1].count ?? 0) - r.count;
      return lost > acc.lost ? { lost, from: rows[i - 1].label, to: r.label } : acc;
    },
    { lost: 0, from: '', to: '' }
  );

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard"
        className="text-sm text-gray-500 hover:text-primary transition"
      >
        ← Mission Control
      </Link>

      <header className="mt-4 mb-8">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          Admin
        </p>
        <h1 className="text-4xl font-semibold mb-1">Operator funnel</h1>
        <p className="text-sm text-gray-500">
          How far operators get when building their first tour, and exactly where
          they give up. Admin accounts excluded.
        </p>
      </header>

      <div className="flex gap-2 mb-6">
        {[
          { d: 7, l: '7 days' },
          { d: 30, l: '30 days' },
          { d: 90, l: '90 days' },
          { d: 3650, l: 'All time' },
        ].map(({ d, l }) => (
          <Link
            key={d}
            href={`/dashboard/admin/funnel?days=${d}`}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${
              days === d
                ? 'bg-primary text-cream'
                : 'bg-white text-gray-600 hover:bg-cream'
            }`}
          >
            {l}
          </Link>
        ))}
      </div>

      {top === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center shadow-sm">
          <p className="font-display text-2xl text-gray-400 mb-2">
            No operator activity yet
          </p>
          <p className="text-sm text-gray-500">
            Steps appear here as operators move through the build journey.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
            {rows.map((r, i) => {
              const pctOfTop = top ? Math.round((r.count / top) * 100) : 0;
              const prev = i === 0 ? null : rows[i - 1].count;
              const lost = prev === null ? 0 : prev - r.count;
              const dropPct =
                prev && prev > 0 ? Math.round((lost / prev) * 100) : 0;

              return (
                <div key={r.event} className="mb-4 last:mb-0">
                  <div className="flex items-baseline justify-between gap-4 mb-1">
                    <p className="text-sm font-bold text-gray-900">{r.label}</p>
                    <p className="text-sm font-bold text-primary whitespace-nowrap">
                      {r.count}
                      <span className="text-gray-400 font-normal">
                        {' '}
                        · {pctOfTop}%
                      </span>
                    </p>
                  </div>
                  <div className="h-2 bg-cream rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${pctOfTop}%` }}
                    />
                  </div>
                  {prev !== null && lost > 0 && (
                    <p className="text-xs text-red-700 mt-1">
                      ↓ lost {lost} here ({dropPct}% of the previous step)
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {worst.lost > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <strong>Biggest leak:</strong> {worst.lost} operator
              {worst.lost === 1 ? '' : 's'} dropped between &ldquo;{worst.from}
              &rdquo; and &ldquo;{worst.to}&rdquo;. That is the screen worth
              fixing next.
            </div>
          )}
        </>
      )}
    </div>
  );
}
