'use client';

// Responsive dashboard shell. On desktop the forest sidebar is a static column,
// exactly as before. On phones it collapses into a slim top bar with a menu
// button that slides the same navigation in from the left over a dimmed
// backdrop, so the content is no longer squashed off the edge of the screen.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarPreview } from './sidebar-preview';
import { FeedbackWidget } from './feedback-widget';

type Props = {
  role: string | null;
  userEmail: string | null;
  children: React.ReactNode;
};

function Wordmark() {
  return (
    <Link
      href="/dashboard"
      title="Mission Control"
      className="block font-display text-3xl leading-none"
    >
      <span className="text-cream font-semibold">Storie</span>
      <span className="text-accent font-semibold">D</span>
    </Link>
  );
}

export function DashboardShell({ role, userEmail, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes (a nav link was tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const link =
    'block px-3 py-2 rounded hover:bg-white/10 transition';

  const nav = (
    <>
      <nav className="space-y-1 flex-1 text-sm">
        <Link href="/dashboard" className={link}>
          Mission Control
        </Link>
        {role !== 'admin' && (
          <Link href="/dashboard/new" className={link}>
            + New tour
          </Link>
        )}
        {role === 'admin' && (
          <>
            <Link href="/dashboard/admin/cities/new" className={link}>
              + Add area
            </Link>
            <Link href="/dashboard/admin/visitors" className={link}>
              All Visitors
            </Link>
            <Link href="/dashboard/admin/operators" className={link}>
              Operators
            </Link>
            <Link href="/dashboard/admin/kanban" className={link}>
              Kanban
            </Link>
            <Link href="/dashboard/admin/funnel" className={link}>
              Operator funnel
            </Link>
            <Link href="/dashboard/admin/ai-usage" className={link}>
              AI usage
            </Link>
          </>
        )}
        <SidebarPreview />
      </nav>

      <div className="text-xs border-t border-white/10 pt-4 space-y-2">
        <p className="text-cream/70 truncate" title={userEmail ?? ''}>
          {userEmail}
        </p>
        <p className="text-[10px] text-accent uppercase tracking-widest font-bold">
          {role ?? 'operator'}
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
    </>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-primary text-cream px-4 h-14">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2 text-cream"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Backdrop (mobile only, when open) */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: static column on desktop, slide-in drawer on mobile */}
      <aside
        className={`bg-primary text-cream p-6 flex flex-col
          fixed inset-y-0 left-0 z-50 w-64 max-w-[82%] overflow-y-auto
          transform transition-transform duration-200 ease-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:static md:translate-x-0 md:w-60 md:max-w-none md:flex-shrink-0 md:z-auto`}
      >
        <div className="flex items-center justify-between mb-8 mt-1">
          <Wordmark />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="md:hidden p-1 -mr-1 text-cream/70 hover:text-cream"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {nav}
      </aside>

      <main className="flex-1 min-w-0 p-5 md:p-10 overflow-y-auto">{children}</main>

      <FeedbackWidget />
    </div>
  );
}
