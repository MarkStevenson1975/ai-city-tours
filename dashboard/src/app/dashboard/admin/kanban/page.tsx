import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { COLUMNS, type ColumnKey, type OperatorCard } from './columns';

export default async function AdminKanbanPage() {
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

  // Stage 1: empty board. Stage 2 will fill this map from live operator data.
  const board: Record<ColumnKey, OperatorCard[]> = {
    registered: [],
    email_verified: [],
    no_tour: [],
    tour_created: [],
    stripe_abandoned: [],
    in_trial: [],
    cancelled_trial: [],
    paying: [],
  };

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Admin
      </p>
      <h1 className="text-4xl font-semibold mb-2">Operator Kanban</h1>
      <p className="text-sm text-gray-500 mb-8">
        Every operator account at a glance, from first sign-up through to
        paying customer. Operator data will flow into these columns next.
      </p>

      <div className="flex gap-4 overflow-x-auto pb-6 -mr-10 pr-10">
        {COLUMNS.map((col) => {
          const cards = board[col.key];
          return (
            <div
              key={col.key}
              className="w-64 flex-shrink-0 bg-white rounded-xl shadow-sm flex flex-col max-h-[70vh]"
            >
              <div className="px-4 pt-4 pb-3 border-b border-cream">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-primary uppercase tracking-wide">
                    {col.title}
                  </h2>
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {cards.length}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                  {col.hint}
                </p>
              </div>

              <div className="p-3 space-y-2 overflow-y-auto flex-1">
                {cards.length === 0 ? (
                  <p className="text-xs text-gray-300 italic text-center py-8 border border-dashed border-gray-200 rounded-lg">
                    No operators yet
                  </p>
                ) : (
                  cards.map((card) => (
                    <div
                      key={card.id}
                      className="bg-cream/60 rounded-lg p-3 text-xs space-y-1"
                    >
                      <p className="font-mono text-gray-700 truncate" title={card.email}>
                        {card.email}
                      </p>
                      {card.displayName && (
                        <p className="text-gray-600">{card.displayName}</p>
                      )}
                      {card.areaName && (
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {card.areaName}
                        </span>
                      )}
                      {card.note && (
                        <p className="text-gray-400">{card.note}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-2">
        Visible to admin accounts only. Operators never see this page.
      </p>
    </div>
  );
}
