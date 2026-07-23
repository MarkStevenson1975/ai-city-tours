import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DeleteOperatorButton } from './delete-operator-button';

type AssignedArea = { city_name: string; city_slug: string; archived: boolean };

type OperatorProfile = {
  id: string;
  role: string;
  display_name: string | null;
  city_assignments: AssignedArea[];
};

export default async function AdminOperatorsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') redirect('/dashboard');

  // Get all operator/admin profiles with their city assignments
  const { data: profiles } = await admin
    .from('user_profiles')
    .select('id, role, display_name')
    .in('role', ['operator', 'admin'])
    .order('role');

  const profileIds = (profiles ?? []).map((p) => p.id);

  // An operator's areas come from two places:
  //  1) city_operators — the admin-invite assignment table (legacy / admin flow)
  //  2) cities.created_by — self-serve operators who built their own tour
  // Self-serve sign-ups only populate (2), so we must union both or their tours
  // never appear here.
  const { data: assignments } = await admin
    .from('city_operators')
    .select('user_id, cities(name, slug, deleted_at)')
    .in('user_id', profileIds);

  const { data: ownedCities } = await admin
    .from('cities')
    .select('created_by, name, slug, deleted_at')
    .in('created_by', profileIds);

  // Get emails from auth (paginated — up to 1000 users)
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map(authUsers.map((u) => [u.id, u.email ?? '']));

  // Build combined operator list, de-duplicating areas by slug.
  const operators: OperatorProfile[] = (profiles ?? []).map((p) => {
    const bySlug = new Map<string, AssignedArea>();

    (assignments ?? [])
      .filter((a) => a.user_id === p.id)
      .forEach((a) => {
        const raw = a.cities;
        const city = (Array.isArray(raw) ? raw[0] : raw) as
          | { name: string; slug: string; deleted_at: string | null }
          | null;
        if (city) {
          bySlug.set(city.slug, {
            city_name: city.name,
            city_slug: city.slug,
            archived: Boolean(city.deleted_at),
          });
        }
      });

    (ownedCities ?? [])
      .filter((c) => c.created_by === p.id)
      .forEach((c) => {
        bySlug.set(c.slug, {
          city_name: c.name,
          city_slug: c.slug,
          archived: Boolean(c.deleted_at),
        });
      });

    // Active areas first, then archived.
    const cityAssignments = Array.from(bySlug.values()).sort(
      (a, b) => Number(a.archived) - Number(b.archived) || a.city_name.localeCompare(b.city_name)
    );

    return {
      id: p.id,
      role: p.role,
      display_name: p.display_name,
      city_assignments: cityAssignments,
    };
  });

  const adminCount = operators.filter((o) => o.role === 'admin').length;

  return (
    <div className="max-w-5xl">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Admin
      </p>
      <h1 className="text-4xl font-semibold mb-2">Operators</h1>
      <p className="text-sm text-gray-500 mb-8">
        All dashboard accounts — admins and operators. Use this page to remove
        access when an operator no longer needs it.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
        <KpiCard label="Total accounts" value={operators.length} />
        <KpiCard label="Admins" value={adminCount} />
        <KpiCard label="Operators" value={operators.length - adminCount} />
      </div>

      <div className="bg-white rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Assigned areas</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream">
            {operators.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400 italic">
                  No operator accounts found.
                </td>
              </tr>
            ) : (
              operators.map((op) => {
                const email = emailMap.get(op.id) ?? '—';
                const isSelf = op.id === user.id;
                return (
                  <tr key={op.id} className="hover:bg-cream/40 transition">
                    <td className="px-6 py-4 font-mono text-xs text-gray-700">
                      {email}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {op.display_name || <span className="text-gray-400 italic">Not set</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        op.role === 'admin'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-accent/15 text-primary'
                      }`}>
                        {op.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {op.city_assignments.length === 0 ? (
                        <span className="text-gray-400 italic">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {op.city_assignments.map((a) => (
                            <span
                              key={a.city_slug}
                              className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                a.archived
                                  ? 'bg-gray-100 text-gray-400 line-through'
                                  : 'bg-primary/10 text-primary'
                              }`}
                              title={a.archived ? 'Archived (deleted) tour' : undefined}
                            >
                              {a.city_name}
                              {a.archived ? ' · archived' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isSelf ? (
                        <span className="text-[10px] text-gray-400 italic">You</span>
                      ) : (
                        <DeleteOperatorButton operatorId={op.id} email={email} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Deleting an account removes dashboard access and all city assignments immediately.
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
