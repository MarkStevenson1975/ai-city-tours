import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Admin-only view of AI usage per operator. Powered by the admin_ai_usage RPC
// (role-gated, SECURITY DEFINER). Lets us spot anyone repeatedly hitting the
// per-user limits (12 per minute, 200 per day).
const PER_MINUTE = 12;
const PER_DAY = 200;

type UsageRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  used_last_minute: number;
  used_today: number;
  used_7d: number;
  used_total: number;
  last_used: string | null;
};

export default async function AdminAiUsagePage() {
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

  const { data: rows, error } = await supabase.rpc('admin_ai_usage');
  const usage: UsageRow[] = rows ?? [];

  const atDayCap = usage.filter((r) => r.used_today >= PER_DAY).length;
  const busyToday = usage.filter((r) => r.used_today > 0).length;

  return (
    <div className="max-w-6xl">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">Admin</p>
      <h1 className="text-4xl font-semibold mb-2">AI usage</h1>
      <p className="text-sm text-gray-500 mb-8">
        AI actions per operator across all features (post drafting, feedback
        chat, tour drafting). Limits are {PER_MINUTE} per minute and {PER_DAY} per
        day, per operator.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 text-sm mb-6">
          Could not load AI usage: {error.message}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-10">
        <KpiCard label="Operators active today" value={busyToday} />
        <KpiCard label="At the daily cap" value={atDayCap} />
        <KpiCard label="Operators tracked" value={usage.length} />
      </div>

      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-3">Operator</th>
              <th className="px-6 py-3">Last minute</th>
              <th className="px-6 py-3">Today</th>
              <th className="px-6 py-3">Last 7 days</th>
              <th className="px-6 py-3">All time</th>
              <th className="px-6 py-3">Last used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream">
            {usage.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-400 italic">
                  No AI usage recorded yet.
                </td>
              </tr>
            ) : (
              usage.map((r) => {
                const atDay = r.used_today >= PER_DAY;
                const nearDay = !atDay && r.used_today >= PER_DAY * 0.8;
                const atMinute = r.used_last_minute >= PER_MINUTE;
                return (
                  <tr key={r.user_id} className="hover:bg-cream/40 transition">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-800">
                        {r.display_name || 'Unnamed'}
                      </p>
                      <p className="font-mono text-xs text-gray-500">{r.email ?? r.user_id}</p>
                      {r.role && r.role !== 'operator' && (
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-accent">
                          {r.role}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={atMinute ? 'font-bold text-red-700' : 'text-gray-700'}>
                        {r.used_last_minute} / {PER_MINUTE}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={
                          atDay
                            ? 'font-bold text-red-700'
                            : nearDay
                              ? 'font-bold text-amber-700'
                              : 'text-gray-700'
                        }
                      >
                        {r.used_today} / {PER_DAY}
                      </span>
                      {atDay && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                          At cap
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{r.used_7d}</td>
                    <td className="px-6 py-4 text-gray-600">{r.used_total}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {r.last_used ? formatWhen(r.last_used) : 'Never'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Live from Supabase. Refresh to update. Rolling windows: last minute, last
        24 hours, last 7 days.
      </p>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <p className="text-4xl font-display font-semibold text-primary">{value}</p>
      <p className="text-xs uppercase tracking-wider text-gray-600 mt-1 font-bold">{label}</p>
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
