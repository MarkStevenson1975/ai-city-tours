import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardHome({
  searchParams,
}: {
  // ?src=louise-outreach — carried through from an outreach link so we can see
  // who came back because somebody emailed them.
  searchParams: Promise<{ src?: string }>;
}) {
  const supabase = await createClient();
  const { src } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';

  // RLS scopes this to: admin sees all; operators see only assigned cities.
  const { data: cities, error } = await supabase
    .from('cities')
    .select(
      'id, slug, name, operator_name, subscription_status, published_version, published_at'
    )
    .is('deleted_at', null)
    .order('name');

  if (error) {
    return (
      <div>
        <h1 className="text-3xl font-semibold mb-4">Areas</h1>
        <p className="bg-red-50 border border-red-200 text-red-800 rounded p-4 text-sm">
          Error loading areas: {error.message}
        </p>
      </div>
    );
  }

  // First run: an operator with no tour has exactly one thing to do, so take
  // them straight to it rather than parking them on an empty list. (Admins
  // legitimately have no tours of their own, so they keep the Areas view.)
  if (!isAdmin && (!cities || cities.length === 0)) {
    // Carry the source through, so a click from Louise's email is still
    // attributable once they land on the build question.
    redirect(src ? `/dashboard/new?src=${encodeURIComponent(src)}` : '/dashboard/new');
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Mission Control
      </p>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-semibold">Areas</h1>
        <Link
          href={isAdmin ? '/dashboard/admin/cities/new' : '/dashboard/new'}
          className="px-5 py-2.5 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition"
        >
          {isAdmin ? '+ Add area' : '+ New tour'}
        </Link>
      </div>

      {!cities || cities.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center">
          <p className="font-display text-xl mb-2">
            Let&apos;s build your first tour.
          </p>
          <p className="text-sm text-gray-600 mb-5">
            Start your first tour. We&apos;ll find your local landmarks and the
            AI will draft each stop for you. It&apos;s free to build and preview.
          </p>
          <Link
            href="/dashboard/new"
            className="inline-block px-6 py-3 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition"
          >
            Create your tour
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {cities.map((city) => (
            <Link
              key={city.id}
              href={`/dashboard/${city.slug}`}
              className="block bg-white rounded-xl p-6 shadow-sm hover:shadow-md hover:border-accent border border-transparent transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold mb-1">{city.name}</h2>
                  <p className="text-sm text-gray-600 truncate">
                    {city.operator_name || (
                      <span className="italic text-gray-400">
                        No operator set
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 font-mono">
                    /{city.slug}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <SubscriptionBadge status={city.subscription_status} />
                  <p className="text-xs text-gray-500 mt-2">
                    Published v{city.published_version || 0}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SubscriptionBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    trial: 'bg-amber-100 text-amber-800',
    past_due: 'bg-orange-100 text-orange-800',
    cancelled: 'bg-gray-100 text-gray-700',
  };
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
        styles[status ?? ''] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {status || 'unknown'}
    </span>
  );
}
