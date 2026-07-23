'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnKey, OperatorCard, JourneyStep } from './columns';
import { addKanbanNote, hideOperator, restoreOperator } from './actions';

// ---------------------------------------------------------------- Board

export type DemoCard = {
  key: string;
  town: string;
  org: string | null;
  built: boolean;
  opens: number;
  when: string | null;
  previewUrl: string | null;
};

export function KanbanBoard({
  columns,
  board,
  demo,
}: {
  columns: { key: ColumnKey; title: string; hint: string }[];
  board: Record<ColumnKey, OperatorCard[]>;
  demo?: { title: string; hint: string; cards: DemoCard[] };
}) {
  const [selected, setSelected] = useState<OperatorCard | null>(null);

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-6 -mr-10 pr-10">
        {demo && (
          <div className="w-64 flex-shrink-0 bg-white rounded-xl shadow-sm flex flex-col max-h-[70vh] border-t-4 border-accent">
            <div className="px-4 pt-4 pb-3 border-b border-cream">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-primary uppercase tracking-wide">
                  {demo.title}
                </h2>
                <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-accent/20 text-primary text-xs font-bold">
                  {demo.cards.length}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1 leading-snug">{demo.hint}</p>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto flex-1">
              {demo.cards.length === 0 ? (
                <p className="text-xs text-gray-300 italic text-center py-8 border border-dashed border-gray-200 rounded-lg">
                  No demos yet
                </p>
              ) : (
                demo.cards.map((c) => <DemoTile key={c.key} card={c} />)
              )}
            </div>
          </div>
        )}
        {columns.map((col) => {
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
                    <Tile key={card.id} card={card} onClick={() => setSelected(card)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <OperatorModal card={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

// -------------------------------------------------------------- Demo tile

function DemoTile({ card }: { card: DemoCard }) {
  return (
    <div className="w-full text-left bg-cream rounded-lg p-3 text-xs border-l-4 border-accent shadow-sm">
      <p className="font-semibold text-gray-800 text-sm leading-tight">{card.town}</p>
      {card.org && (
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#8a6a1c] mt-0.5 leading-snug">
          {card.org}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2">
        <span
          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            card.built ? 'bg-visited/20 text-visited' : 'bg-gray-200 text-gray-500'
          }`}
        >
          {card.built ? 'Built a demo' : 'Opened link'}
        </span>
        {card.opens > 1 && (
          <span className="text-[10px] text-gray-400">{card.opens} opens</span>
        )}
      </div>
      {card.when && <p className="text-[10px] text-gray-400 mt-1.5">{card.when}</p>}
      {card.previewUrl && (
        <a
          href={card.previewUrl}
          target="_blank"
          rel="noopener"
          className="text-[11px] text-primary underline mt-1.5 inline-block"
        >
          Preview →
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Tile

function Tile({ card, onClick }: { card: OperatorCard; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-primary hover:bg-primary/90 rounded-lg p-3 text-xs space-y-1 transition cursor-pointer shadow-sm"
    >
      <p className="font-mono text-cream truncate" title={card.email}>
        {card.email}
      </p>
      {card.displayName && <p className="text-cream/90">{card.displayName}</p>}
      {card.organisation && (
        <p className="text-accent font-bold uppercase tracking-wide text-[10px]">
          {card.organisation}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {card.badge && (
          <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
            {card.badge}
          </span>
        )}
        {card.areaNames.map((a) => (
          <span
            key={a}
            className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-cream/15 text-cream"
          >
            {a}
          </span>
        ))}
      </div>
      {card.note && <p className="text-cream/70">{card.note}</p>}
      {card.stageSince && (
        <p className="text-[10px] text-cream/60">Entered {card.stageSince}</p>
      )}
      {card.notes.length > 0 && (
        <p className="text-[10px] text-cream/60">
          {card.notes.length} note{card.notes.length === 1 ? '' : 's'} · last{' '}
          {new Date(card.notes[0].createdAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          })}
        </p>
      )}
    </button>
  );
}

// ---------------------------------------------------------------- Modal

function OperatorModal({
  card,
  onClose,
}: {
  card: OperatorCard;
  onClose: () => void;
}) {
  const router = useRouter();
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingHide, setConfirmingHide] = useState(false);
  const [pending, startTransition] = useTransition();

  const submitNote = () => {
    if (!noteText.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addKanbanNote(card.id, noteText);
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      setNoteText('');
      router.refresh();
      onClose();
    });
  };

  const hide = () => {
    setError(null);
    startTransition(async () => {
      const res = await hideOperator(card.id);
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-cream">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-sm text-gray-700 truncate" title={card.email}>
                {card.email}
              </p>
              {card.displayName && (
                <p className="text-sm text-gray-600 mt-0.5">{card.displayName}</p>
              )}
              {card.organisation && (
                <p className="text-xs text-primary font-bold uppercase tracking-wide mt-0.5">
                  {card.organisation}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-accent/15 text-primary">
              {card.columnTitle}
            </span>
            {card.badge && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {card.badge}
              </span>
            )}
            {card.areaNames.map((a) => (
              <span
                key={a}
                className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary"
              >
                {a}
              </span>
            ))}
            {card.source && (
              <span
                className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-100 text-blue-800"
                title="Arrived on a tagged link"
              >
                ↩ {card.source}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {card.signedUpAt ? `Signed up ${card.signedUpAt}` : ''}
            {card.stageSince ? ` · In this stage since ${card.stageSince}` : ''}
            {card.note ? ` · ${card.note}` : ''}
          </p>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
          <JourneyTrail journey={card.journey} />

          <p className="text-[11px] uppercase tracking-widest text-gray-400 font-bold pt-2">
            Notes
          </p>
          {card.notes.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No notes yet.</p>
          ) : (
            card.notes.map((n) => (
              <div key={n.id} className="bg-cream/60 rounded-lg p-3">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.note}</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {n.authorName} ·{' '}
                  {new Date(n.createdAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-cream space-y-3">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note, e.g. Emailed 11 Jul, no reply yet"
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            {confirmingHide ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Remove from board?</span>
                <button
                  type="button"
                  onClick={hide}
                  disabled={pending}
                  className="text-xs font-bold text-red-700 underline disabled:opacity-50"
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingHide(false)}
                  className="text-xs text-gray-500 underline"
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingHide(true)}
                className="text-xs text-gray-400 hover:text-red-700 underline transition"
              >
                Remove from board
              </button>
            )}
            <button
              type="button"
              onClick={submitNote}
              disabled={pending || !noteText.trim()}
              className="bg-primary text-cream text-sm font-bold px-5 py-2 rounded-lg disabled:opacity-40 hover:opacity-90 transition"
            >
              {pending ? 'Saving…' : 'Add note'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            Removing only hides the tile from the board. The operator account
            and their notes are kept, and you can restore them from the Hidden
            view.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Hidden

// ---------------------------------------------------------- Journey trail
// Exactly how far this operator got when building, and where they stopped.
// The first step they never reached is the one worth ringing them about.
function JourneyTrail({ journey }: { journey: JourneyStep[] }) {
  if (!journey?.length) return null;

  const reachedCount = journey.filter((s) => s.at).length;
  const stalledAt = journey.find((s) => !s.at);
  const lastReached = [...journey].reverse().find((s) => s.at);

  return (
    <div className="bg-cream/60 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[11px] uppercase tracking-widest text-gray-500 font-bold">
          Build journey
        </p>
        <p className="text-[11px] font-bold text-primary">
          {reachedCount} of {journey.length}
        </p>
      </div>

      {reachedCount === 0 ? (
        <p className="text-xs text-gray-500 italic">
          Never started building. Nothing recorded yet.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {journey.map((s) => {
            const done = Boolean(s.at);
            const isStall = !done && s.event === stalledAt?.event;
            return (
              <li key={s.event} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold ${
                    done
                      ? 'bg-primary text-cream'
                      : isStall
                        ? 'bg-red-100 text-red-700 border border-red-300'
                        : 'border border-gray-300 text-transparent'
                  }`}
                >
                  {done ? '✓' : isStall ? '!' : '·'}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs ${
                      done
                        ? 'text-gray-800 font-medium'
                        : isStall
                          ? 'text-red-700 font-bold'
                          : 'text-gray-400'
                    }`}
                  >
                    {s.label}
                    {isStall && ' — stopped here'}
                  </p>
                  {s.at && (
                    <p className="text-[10px] text-gray-400">
                      {new Date(s.at).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {lastReached && stalledAt && (
        <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-cream">
          Got as far as <strong>{lastReached.label.toLowerCase()}</strong>, then
          stopped.
        </p>
      )}
    </div>
  );
}

export function HiddenList({ cards }: { cards: OperatorCard[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-10 text-center text-sm text-gray-400 italic">
        No hidden operators. Tiles removed from the board will appear here.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-gray-600 font-bold">
          <tr>
            <th className="px-6 py-3">Email</th>
            <th className="px-6 py-3">Name</th>
            <th className="px-6 py-3">Stage</th>
            <th className="px-6 py-3">Notes</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cream">
          {cards.map((card) => (
            <tr key={card.id} className="hover:bg-cream/40 transition">
              <td className="px-6 py-4 font-mono text-xs text-gray-700">{card.email}</td>
              <td className="px-6 py-4 text-gray-700">
                {card.displayName || <span className="text-gray-400 italic">Not set</span>}
              </td>
              <td className="px-6 py-4">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-accent/15 text-primary">
                  {card.columnTitle}
                </span>
              </td>
              <td className="px-6 py-4 text-xs text-gray-500">
                {card.notes.length === 0
                  ? '—'
                  : `${card.notes.length} · last ${new Date(
                      card.notes[0].createdAt
                    ).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
              </td>
              <td className="px-6 py-4 text-right">
                <button
                  type="button"
                  disabled={pendingId === card.id}
                  onClick={async () => {
                    setPendingId(card.id);
                    await restoreOperator(card.id);
                    setPendingId(null);
                    router.refresh();
                  }}
                  className="text-xs font-bold text-primary underline disabled:opacity-50"
                >
                  {pendingId === card.id ? 'Restoring…' : 'Restore to board'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
