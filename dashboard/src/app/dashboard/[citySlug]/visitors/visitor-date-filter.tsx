'use client';

// Date-range filter for the visitor KPIs. It writes the chosen range into the
// URL (?from=YYYY-MM-DD&to=YYYY-MM-DD); the server page reads that and passes it
// to the city_visitor_kpis RPC. Default (no params) is the all-time view.
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function VisitorDateFilter({
  from,
  to,
}: {
  from: string | null;
  to: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [fromVal, setFromVal] = useState(from ?? '');
  const [toVal, setToVal] = useState(to ?? '');

  const active = Boolean(from && to);

  function apply(f: string, t: string) {
    if (!f || !t) return;
    // Guard against a backwards range by swapping if needed.
    const [lo, hi] = f <= t ? [f, t] : [t, f];
    router.push(`${pathname}?from=${lo}&to=${hi}`);
  }

  function preset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    apply(iso(start), iso(end));
  }

  function thisMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    apply(iso(start), iso(now));
  }

  function clear() {
    setFromVal('');
    setToVal('');
    router.push(pathname);
  }

  const chip =
    'text-xs font-bold px-3 py-1.5 rounded-full border border-gray-200 hover:border-primary hover:text-primary transition whitespace-nowrap';

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={fromVal}
            max={toVal || undefined}
            onChange={(e) => setFromVal(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={toVal}
            min={fromVal || undefined}
            onChange={(e) => setToVal(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => apply(fromVal, toVal)}
          disabled={!fromVal || !toVal}
          className="px-4 py-2 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition disabled:opacity-40"
        >
          Apply
        </button>

        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button type="button" onClick={() => preset(7)} className={chip}>
            Last 7 days
          </button>
          <button type="button" onClick={() => preset(30)} className={chip}>
            Last 30 days
          </button>
          <button type="button" onClick={thisMonth} className={chip}>
            This month
          </button>
          {active && (
            <button
              type="button"
              onClick={clear}
              className="text-xs font-bold px-3 py-1.5 rounded-full border border-primary text-primary hover:bg-primary/5 transition whitespace-nowrap"
            >
              Clear (all time)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
