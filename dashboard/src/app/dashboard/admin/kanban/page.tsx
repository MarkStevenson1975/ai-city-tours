import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  COLUMNS,
  COLUMN_TITLES,
  type ColumnKey,
  type KanbanNote,
  type OperatorCard,
} from './columns';
import { KanbanBoard, HiddenList } from './board';

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function AdminKanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
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

  const { view } = await searchParams;
  const showHidden = view === 'hidden';

  const admin = createAdminClient();

  // Operator profiles (admins never appear on the board)
  const { data: profiles } = await admin
    .from('user_profiles')
    .select(
      'id, role, display_name, subscription_status, plan_tier, pause_resume_at, subscription_current_period_end, checkout_started_at, kanban_hidden_at'
    )
    .eq('role', 'operator');

  const operatorIds = (profiles ?? []).map((p) => p.id);

  // Emails + verification state from auth
  const {
    data: { users: authUsers },
  } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authMap = new Map(authUsers.map((u) => [u.id, u]));

  // Tour areas: union of self-serve (cities.created_by) and admin-invite
  // (city_operators) — reading only one misses operators. Archived tours
  // still count as "created a tour".
  const { data: ownedCities } = await admin
    .from('cities')
    .select('created_by, name')
    .in('created_by', operatorIds.length ? operatorIds : ['00000000-0000-0000-0000-000000000000']);

  const { data: assignments } = await admin
    .from('city_operators')
    .select('user_id, cities(name)')
    .in('user_id', operatorIds.length ? operatorIds : ['00000000-0000-0000-0000-000000000000']);

  const areasByUser = new Map<string, Set<string>>();
  (ownedCities ?? []).forEach((c) => {
    if (!c.created_by) return;
    if (!areasByUser.has(c.created_by)) areasByUser.set(c.created_by, new Set());
    areasByUser.get(c.created_by)!.add(c.name);
  });
  (assignments ?? []).forEach((a) => {
    const raw = a.cities;
    const city = (Array.isArray(raw) ? raw[0] : raw) as { name: string } | null;
    if (!city) return;
    if (!areasByUser.has(a.user_id)) areasByUser.set(a.user_id, new Set());
    areasByUser.get(a.user_id)!.add(city.name);
  });

  // Engagement notes, newest first
  const { data: noteRows } = await admin
    .from('operator_kanban_notes')
    .select('id, operator_id, author_name, note, created_at')
    .in('operator_id', operatorIds.length ? operatorIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false });

  const notesByUser = new Map<string, KanbanNote[]>();
  (noteRows ?? []).forEach((n) => {
    if (!notesByUser.has(n.operator_id)) notesByUser.set(n.operator_id, []);
    notesByUser.get(n.operator_id)!.push({
      id: n.id,
      authorName: n.author_name ?? 'Admin',
      note: n.note,
      createdAt: n.created_at,
    });
  });

  // Classify each operator into exactly one column — furthest stage wins.
  const cards: OperatorCard[] = (profiles ?? []).map((p) => {
    const auth = authMap.get(p.id);
    const areas = Array.from(areasByUser.get(p.id) ?? []);
    const hasTour = areas.length > 0;
    const verified = Boolean(auth?.email_confirmed_at);
    const status = p.subscription_status as string | null;

    let column: ColumnKey;
    let note: string | null = null;
    let badge: string | null = null;

    if (status === 'paused' || status === 'past_due') {
      column = 'at_risk';
      badge = status === 'paused' ? 'Paused' : 'Payment failed';
      note =
        status === 'paused' && p.pause_resume_at
          ? `Restarts ${fmtDate(p.pause_resume_at)}`
          : null;
    } else if (status === 'active') {
      column = 'paying';
      note = p.plan_tier ? `Plan: ${p.plan_tier}` : null;
    } else if (status === 'trialing') {
      column = 'in_trial';
      note = p.subscription_current_period_end
        ? `Trial ends ${fmtDate(p.subscription_current_period_end)}`
        : null;
    } else if (status === 'canceled') {
      column = 'cancelled_trial';
      note = p.plan_tier ? `Was on: ${p.plan_tier}` : null;
    } else if (p.checkout_started_at) {
      column = 'stripe_abandoned';
      note = `Started checkout ${fmtDate(p.checkout_started_at)}`;
    } else if (hasTour) {
      column = 'tour_created';
    } else if (verified) {
      column = 'no_tour';
    } else {
      column = 'registered';
    }

    return {
      id: p.id,
      email: auth?.email ?? 'unknown',
      displayName: p.display_name,
      signedUpAt: auth?.created_at ? fmtDate(auth.created_at) : null,
      areaNames: areas,
      note,
      badge,
      column,
      columnTitle: COLUMN_TITLES[column],
      hidden: Boolean(p.kanban_hidden_at),
      notes: notesByUser.get(p.id) ?? [],
    };
  });

  const visible = cards.filter((c) => !c.hidden);
  const hidden = cards.filter((c) => c.hidden);

  const board: Record<ColumnKey, OperatorCard[]> = {
    registered: [],
    no_tour: [],
    tour_created: [],
    stripe_abandoned: [],
    in_trial: [],
    cancelled_trial: [],
    paying: [],
    at_risk: [],
  };
  visible.forEach((c) => board[c.column].push(c));

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Admin
      </p>
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-semibold mb-2">Operator Kanban</h1>
          <p className="text-sm text-gray-500">
            Every operator at a glance, from first sign-up through to paying
            customer. Click a tile to log engagement notes.
          </p>
        </div>
        <Link
          href={showHidden ? '/dashboard/admin/kanban' : '/dashboard/admin/kanban?view=hidden'}
          className="text-sm underline text-primary hover:text-accent transition"
        >
          {showHidden ? 'Back to board' : `Hidden (${hidden.length})`}
        </Link>
      </div>

      {showHidden ? (
        <HiddenList cards={hidden} />
      ) : (
        <KanbanBoard columns={COLUMNS} board={board} />
      )}

      <p className="text-xs text-gray-400 mt-2">
        Visible to admin accounts only. Operators never see this page.
      </p>
    </div>
  );
}
