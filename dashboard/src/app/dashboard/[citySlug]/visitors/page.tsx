import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

type StopStat = { stop_name: string; visit_count: number };

type FeedbackComment = {
  rating: string | null;
  comment: string;
  created_at: string;
};

type FeedbackResult = {
  great_count: number;
  ok_count: number;
  sad_count: number;
  total_ratings: number;
  create_own_clicks: number;
  comments: FeedbackComment[] | null;
};

type KpiResult = {
  total_visitors: number;
  guest_visitors: number;
  combined_visitors: number;
  returning_visitors: number;
  avg_stops_completed: number;
  most_visited_stops: StopStat[] | null;
  first_visit_at: string | null;
  last_visit_at: string | null;
  visits_last_7_days: number;
  visits_last_30_days: number;
};

export default async function CityVisitorsPage({
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
    .select('id, name, slug, operator_name')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();

  const { data: kpiRows, error } = await supabase.rpc('city_visitor_kpis', {
    p_city_slug: citySlug,
  });

  const kpi: KpiResult | null =
    kpiRows && kpiRows.length > 0 ? kpiRows[0] : null;

  const hasData = kpi && (kpi.total_visitors > 0 || kpi.guest_visitors > 0);

  const { data: feedbackRows } = await supabase.rpc('city_visitor_feedback', {
    p_city_slug: citySlug,
  });
  const feedback: FeedbackResult | null =
    feedbackRows && feedbackRows.length > 0 ? feedbackRows[0] : null;
  const comments = feedback?.comments ?? [];
  const hasFeedback =
    !!feedback &&
    (feedback.total_ratings > 0 ||
      feedback.create_own_clicks > 0 ||
      comments.length > 0);

  return (
    <div className="max-w-4xl">
      <Link
        href={`/dashboard/${citySlug}`}
        className="text-sm text-gray-500 hover:text-primary transition"
      >
        ← {city.name}
      </Link>

      <header className="mt-4 mb-10">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          {city.operator_name || 'Operator unset'}
        </p>
        <h1 className="text-4xl font-semibold mb-1">Visitor KPIs</h1>
        <p className="text-sm text-gray-500">
          Anonymised visitor activity for {city.name}. No personal data is
          shown here.
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 text-sm mb-6">
          Could not load KPI data: {error.message}
        </div>
      )}

      {!hasData && !error && (
        <div className="bg-white rounded-xl p-10 text-center shadow-sm mb-8">
          <p className="font-display text-2xl text-gray-400 mb-2">
            No visitor data yet
          </p>
          <p className="text-sm text-gray-500">
            KPIs will appear here once tourists start signing up and logging
            stops on the {city.name} tour.
          </p>
        </div>
      )}

      {hasData && kpi && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <KpiCard
              label="Total visitors"
              value={kpi.combined_visitors}
              hint="Registered + guests"
            />
            <KpiCard
              label="Registered visitors"
              value={kpi.total_visitors}
              hint="Signed in with an account"
            />
            <KpiCard
              label="Guest visitors"
              value={kpi.guest_visitors}
              hint="Used the tour without signing in"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-10">
            <KpiCard
              label="Visitors last 7 days"
              value={kpi.visits_last_7_days}
              hint="Registered + guests active"
            />
            <KpiCard
              label="Visitors last 30 days"
              value={kpi.visits_last_30_days}
              hint="Registered + guests active"
            />
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-4">
                Engagement
              </h2>
              <div className="space-y-4">
                <Metric
                  label="Avg stops logged per active visitor"
                  value={String(kpi.avg_stops_completed)}
                />
                <Metric
                  label="Return visitor rate"
                  value={
                    kpi.combined_visitors > 0
                      ? `${Math.round((kpi.returning_visitors / kpi.combined_visitors) * 100)}%`
                      : '0%'
                  }
                />
                <Metric
                  label="First ever visit"
                  value={kpi.first_visit_at ? formatDate(kpi.first_visit_at) : 'N/A'}
                />
                <Metric
                  label="Most recent visit"
                  value={kpi.last_visit_at ? formatDate(kpi.last_visit_at) : 'N/A'}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1">
                Most visited stops · last 30 days
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                Top 5 stops by logged visits over the past 30 days, guests
                included.
              </p>
              {!kpi.most_visited_stops || kpi.most_visited_stops.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No stop visits recorded yet.
                </p>
              ) : (
                <ol className="space-y-3">
                  {kpi.most_visited_stops.map((s, i) => (
                    <li key={s.stop_name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-5 text-right">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-700">
                        {s.stop_name}
                      </span>
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {s.visit_count} {s.visit_count === 1 ? 'visit' : 'visits'}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>Privacy note:</strong> These KPIs are aggregated and
            anonymised. No email addresses or personal details are stored or
            displayed here. Individual visitor records are accessible to the
            StorieD admin team only.
          </div>
        </>
      )}

      {hasFeedback && feedback && (
        <div className="mt-10 bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1">
            Tour feedback
          </h2>
          <p className="text-xs text-gray-400 mb-5">
            How walkers rated the {city.name} tour at the finish screen, and any
            comments they left. Anonymous.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <RatingTile label="Loved it" value={feedback.great_count} tone="good" />
            <RatingTile label="It was OK" value={feedback.ok_count} tone="mid" />
            <RatingTile label="Not great" value={feedback.sad_count} tone="poor" />
            <RatingTile
              label="Create-your-own clicks"
              value={feedback.create_own_clicks}
              tone="neutral"
            />
          </div>

          <h3 className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-3">
            Comments
          </h3>
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No written comments yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c, i) => (
                <li
                  key={i}
                  className="border border-cream rounded-lg p-3 flex gap-3 items-start"
                >
                  <span
                    className={`text-[0.65rem] font-bold uppercase tracking-wide px-2 py-1 rounded-full whitespace-nowrap ${ratingChip(
                      c.rating
                    )}`}
                  >
                    {ratingLabel(c.rating)}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">{c.comment}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(c.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RatingTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'mid' | 'poor' | 'neutral';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-primary'
      : tone === 'poor'
        ? 'text-red-600'
        : tone === 'mid'
          ? 'text-amber-600'
          : 'text-gray-700';
  return (
    <div className="bg-cream/40 rounded-xl p-5">
      <p className={`text-4xl font-display font-semibold ${toneClass}`}>
        {value}
      </p>
      <p className="text-xs uppercase tracking-wider text-gray-600 mt-1 font-bold">
        {label}
      </p>
    </div>
  );
}

function ratingLabel(rating: string | null): string {
  if (rating === 'great') return 'Loved it';
  if (rating === 'ok') return 'OK';
  if (rating === 'sad') return 'Not great';
  return 'Rated';
}

function ratingChip(rating: string | null): string {
  if (rating === 'great') return 'bg-primary/10 text-primary';
  if (rating === 'sad') return 'bg-red-100 text-red-700';
  if (rating === 'ok') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <p className="text-4xl font-display font-semibold text-primary">{value}</p>
      <p className="text-xs uppercase tracking-wider text-gray-600 mt-1 font-bold">
        {label}
      </p>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-cream pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-bold text-primary whitespace-nowrap">
        {value}
      </span>
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
