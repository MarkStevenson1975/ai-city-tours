import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// The guest side of the journey: where visitors fall out between scanning the
// QR code and finishing the tour. The visitor twin of the Operator funnel.
// Data comes from the admin_tour_funnel RPC (guests only, our own test devices
// excluded, one entry per real area with meaningful traffic).

export const dynamic = 'force-dynamic';

type StopReach = { position: number; name: string; reached: number };

type AreaFunnel = {
  slug: string;
  name: string;
  opened: number;
  started: number;
  reached: number;
  completed: number;
  first_day: string | null;
  last_day: string | null;
  median_started_s: number | null;
  median_reached_s: number | null;
  median_completed_s: number | null;
  sessions: number;
  single_event_sessions: number;
  stops: StopReach[];
};

export default async function TourDropOffPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
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

  const { data, error } = await supabase.rpc('admin_tour_funnel');
  const areas: AreaFunnel[] = Array.isArray(data) ? (data as AreaFunnel[]) : [];

  const { area: areaParam } = await searchParams;
  const area =
    areas.find((a) => a.slug === areaParam) ?? areas[0] ?? null;

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
          Admin · Visitors
        </p>
        <h1 className="text-4xl font-semibold mb-1">Tour Drop-off</h1>
        <p className="text-sm text-gray-500">
          Where visitors fall out of the journey, from scanning the QR code to
          finishing the tour. Guests only, our own test devices excluded.
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 text-sm mb-6">
          Could not load drop-off data: {error.message}
        </div>
      )}

      {!error && !area && (
        <div className="bg-white rounded-xl p-10 text-center shadow-sm">
          <p className="font-display text-2xl text-gray-400 mb-2">
            No areas with enough data yet
          </p>
          <p className="text-sm text-gray-500">
            Areas appear here once they pass a handful of QR scans.
          </p>
        </div>
      )}

      {area && (
        <>
          {/* Area pills */}
          <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto pb-1">
            {areas.map((a) => (
              <Link
                key={a.slug}
                href={`/dashboard/admin/tour-funnel?area=${a.slug}`}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition ${
                  a.slug === area.slug
                    ? 'bg-primary text-cream'
                    : 'bg-white text-gray-600 hover:bg-cream'
                }`}
              >
                {a.name}
              </Link>
            ))}
          </div>

          <AreaPanel area={area} />
        </>
      )}
    </div>
  );
}

function AreaPanel({ area }: { area: AreaFunnel }) {
  const pct = (n: number) =>
    area.opened > 0 ? Math.round((n / area.opened) * 100) : 0;
  const bouncePct =
    area.sessions > 0
      ? Math.round((area.single_event_sessions / area.sessions) * 100)
      : 0;

  const stages = [
    { key: 'opened', label: 'Opened the tour', value: area.opened },
    { key: 'started', label: 'Pressed start', value: area.started },
    { key: 'reached', label: 'Reached a stop', value: area.reached },
    { key: 'completed', label: 'Completed', value: area.completed },
  ];

  const stageColor: Record<string, string> = {
    opened: 'bg-primary',
    started: 'bg-primary-light',
    reached: 'bg-visited',
    completed: 'bg-accent',
  };

  const biggestDrop = biggestStageDrop(stages);
  const stopDrop = biggestStopDrop(area.stops);
  const maxReach = Math.max(...area.stops.map((s) => s.reached), 1);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Opened" value={area.opened} sub="scanned or landed" />
        <Kpi label="Started" value={area.started} sub={`${pct(area.started)}% of opens`} />
        <Kpi label="Reached a stop" value={area.reached} sub={`${pct(area.reached)}% of opens`} />
        <Kpi label="Completed" value={area.completed} sub={`${pct(area.completed)}% of opens`} />
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
          The journey
        </h2>
        <div className="space-y-4">
          {stages.map((s, i) => {
            const width = pct(s.value);
            const prev = i > 0 ? stages[i - 1].value : null;
            const dropPct =
              prev && prev > 0
                ? Math.round(((prev - s.value) / prev) * 100)
                : null;
            return (
              <div key={s.key}>
                <div className="flex items-baseline justify-between gap-3 mb-1 text-sm">
                  <span className="font-medium text-gray-700">{s.label}</span>
                  <span className="whitespace-nowrap text-gray-400">
                    <span className="font-bold text-primary">{s.value}</span> ·{' '}
                    {width}%
                    {dropPct !== null && dropPct > 0 && (
                      <span className="ml-2 text-xs font-bold text-red-600">
                        −{dropPct}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-3 bg-cream rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stageColor[s.key]}`}
                    style={{ width: `${Math.max(width, s.value > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {biggestDrop && (
          <p className="mt-4 rounded-lg bg-cream px-3 py-2 text-xs text-gray-600">
            Biggest leak:{' '}
            <span className="font-bold text-primary">
              {biggestDrop.from} → {biggestDrop.to}
            </span>{' '}
            loses <span className="font-bold text-red-600">{biggestDrop.pct}%</span>.
          </p>
        )}
      </div>

      {/* Time in tour */}
      <div className="bg-white rounded-xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
          Time in the tour (typical)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <TimeStat label="If they press start" value={fmt(area.median_started_s)} />
          <TimeStat label="If they reach a stop" value={fmt(area.median_reached_s)} />
          <TimeStat label="If they complete" value={fmt(area.median_completed_s)} />
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Median time, first tap to last. {bouncePct}% of visits are a single
          event, so they open and leave without starting.
        </p>
      </div>

      {/* Stop-by-stop */}
      <div className="bg-white rounded-xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">
          Where they reach on the route
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Distinct visitors reaching each stop, in walking order.
        </p>
        {area.stops.length === 0 ? (
          <p className="text-sm italic text-gray-400">
            No stop-level data recorded yet for this area.
          </p>
        ) : (
          <ol className="space-y-3">
            {area.stops.map((st) => {
              const width = (st.reached / maxReach) * 100;
              return (
                <li key={`${st.position}-${st.name}`} className="flex items-center gap-3">
                  <span className="w-5 flex-shrink-0 text-right text-xs font-bold text-gray-400">
                    {st.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="truncate text-sm font-medium text-gray-700">
                        {st.name}
                      </span>
                      <span className="flex-shrink-0 text-xs font-bold text-primary">
                        {st.reached}
                      </span>
                    </div>
                    <div className="h-2 bg-cream rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(width, st.reached > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {stopDrop && (
          <p className="mt-4 rounded-lg bg-cream px-3 py-2 text-xs text-gray-600">
            Sharpest fall:{' '}
            <span className="font-bold text-primary">
              stop {stopDrop.fromPos} → {stopDrop.toPos}
            </span>{' '}
            drops <span className="font-bold text-red-600">{stopDrop.pct}%</span>.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {area.first_day && area.last_day
          ? `Data ${fmtDate(area.first_day)} to ${fmtDate(area.last_day)}. `
          : ''}
        Stop tracking is passive and live since mid-July, so stop counts are a
        recent subset. Refresh the page to update.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm">
      <p className="text-3xl sm:text-4xl font-display font-semibold text-primary">
        {value}
      </p>
      <p className="text-[11px] uppercase tracking-wider text-gray-600 mt-1 font-bold">
        {label}
      </p>
      <p className="text-[11px] text-gray-400">{sub}</p>
    </div>
  );
}

function TimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-cream/60 p-3">
      <p className="text-lg font-bold text-primary">{value}</p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}

function fmt(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function biggestStageDrop(
  stages: { label: string; value: number }[]
): { from: string; to: string; pct: number } | null {
  let best: { from: string; to: string; pct: number } | null = null;
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1];
    const cur = stages[i];
    if (prev.value <= 0) continue;
    const pct = Math.round(((prev.value - cur.value) / prev.value) * 100);
    if (!best || pct > best.pct) best = { from: prev.label, to: cur.label, pct };
  }
  return best && best.pct > 0 ? best : null;
}

function biggestStopDrop(
  stops: StopReach[]
): { fromPos: number; toPos: number; pct: number } | null {
  let best: { fromPos: number; toPos: number; pct: number } | null = null;
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const cur = stops[i];
    if (prev.reached <= 0) continue;
    const pct = Math.round(((prev.reached - cur.reached) / prev.reached) * 100);
    if (!best || pct > best.pct) best = { fromPos: prev.position, toPos: cur.position, pct };
  }
  return best && best.pct > 0 ? best : null;
}
