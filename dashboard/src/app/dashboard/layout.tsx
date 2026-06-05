import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SidebarPreview } from './sidebar-preview';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-primary text-cream p-6 flex flex-col flex-shrink-0">
        <h1 className="text-2xl font-semibold leading-tight mb-8 mt-2">
          StorieD
        </h1>

        <nav className="space-y-1 flex-1 text-sm">
          <Link
            href="/dashboard"
            className="block px-3 py-2 rounded hover:bg-white/10 transition"
          >
            Areas
          </Link>
          {profile?.role !== 'admin' && (
            <Link
              href="/dashboard/new"
              className="block px-3 py-2 rounded hover:bg-white/10 transition"
            >
              + New tour
            </Link>
          )}
          {profile?.role === 'admin' && (
            <>
              <Link
                href="/dashboard/admin/cities/new"
                className="block px-3 py-2 rounded hover:bg-white/10 transition"
              >
                + Add area
              </Link>
              <Link
                href="/dashboard/admin/visitors"
                className="block px-3 py-2 rounded hover:bg-white/10 transition"
              >
                All Visitors
              </Link>
              <Link
                href="/dashboard/admin/operators"
                className="block px-3 py-2 rounded hover:bg-white/10 transition"
              >
                Operators
              </Link>
            </>
          )}
          <SidebarPreview />
        </nav>

        <div className="text-xs border-t border-white/10 pt-4 space-y-2">
          <p className="text-cream/70 truncate" title={user.email ?? ''}>
            {user.email}
          </p>
          <p className="text-[10px] text-accent uppercase tracking-widest font-bold">
            {profile?.role ?? 'operator'}
          </p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-cream/60 hover:text-cream underline transition"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">{children}</main>
    </div>
  );
}
