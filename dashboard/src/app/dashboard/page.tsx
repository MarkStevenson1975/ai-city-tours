import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardHome() {
  const supabase = await createClient();

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

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Dashboard
      </p>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-semibold">Areas</h1>
        {isAdmin && (
          <Link
            href="/dashboard/admin/cities/new"
            className="px-5 py-2.5 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition"
          >
            + Add area
          </Link>
        )}
      </div>

      {!cities || cities.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center">
          <p className="font-display text-xl mb-2">
            No areas accessible to you yet.
          </p>
          <p className="text-sm text-gray-600">
            Ask the platform admin to assign you to an area, or if you
            <em> are</em> the admin make sure your user profile&apos;s role
            is set to <code className="bg-cream px-1.5 py-0.5 rounded">admin</code>.
          </p>
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
