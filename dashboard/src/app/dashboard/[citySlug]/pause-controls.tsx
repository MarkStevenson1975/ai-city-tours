'use client';

// Pause a subscription with a chosen restart date, and manage an existing
// pause. Pausing takes all of the operator's tours offline (drafts kept) and
// stops billing until the restart date. On resume the operator is prompted to
// republish; tours do not come back automatically.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmt(dateISO: string | null): string {
  if (!dateISO) return '';
  return new Date(dateISO).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function DateModal({
  title,
  intro,
  confirmLabel,
  initialDate,
  onClose,
  onSubmit,
}: {
  title: string;
  intro: string;
  confirmLabel: string;
  initialDate?: string;
  onClose: () => void;
  onSubmit: (date: string) => Promise<string | null>;
}) {
  const [date, setDate] = useState(initialDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!date) {
      setError('Please choose a restart date.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onSubmit(date);
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div className="bg-white rounded-2xl p-7 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-sm text-gray-600 mb-4">{intro}</p>
        <label className="block text-sm font-bold mb-2">Restart date</label>
        <input
          type="date"
          value={date}
          min={tomorrowISO()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
        />
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className="px-5 py-2 rounded-full text-sm font-bold text-cream bg-primary hover:bg-primary-light transition disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

async function postPause(resumeDate: string): Promise<string | null> {
  const res = await fetch('/api/stripe/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeDate }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return data.error || 'Could not pause the subscription.';
  return null;
}

// Shown when the subscription is active: lets the operator start a pause.
export function PauseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-bold text-amber-800 hover:underline"
      >
        Pause subscription
      </button>
      {open && (
        <DateModal
          title="Pause your subscription"
          intro="Choose the date you want to start again. Until then your billing pauses and all your tours go offline (visitors see a short holding message). Nothing is deleted. On your restart date we will ask you to republish your tours to bring them back online."
          confirmLabel="Pause subscription"
          onClose={() => setOpen(false)}
          onSubmit={async (date) => {
            const err = await postPause(date);
            if (!err) {
              setOpen(false);
              router.refresh();
            }
            return err;
          }}
        />
      )}
    </>
  );
}

// Shown when the subscription is paused: restart date, change date, resume now.
export function PausedPanel({ resumeAt }: { resumeAt: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resumeNow() {
    setResuming(true);
    setError(null);
    const res = await fetch('/api/stripe/resume', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      router.refresh();
    } else {
      setError(data.error || 'Could not resume.');
      setResuming(false);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
      <p className="text-xs uppercase tracking-widest text-amber-800 font-bold mb-1">
        Subscription paused
      </p>
      <p className="text-sm text-gray-700 mb-1">
        Your billing is paused and your tours are offline.
      </p>
      <p className="text-sm text-gray-700 mb-4">
        {resumeAt ? (
          <>Set to restart on <span className="font-bold">{fmt(resumeAt)}</span>. We will ask you to republish your tours then.</>
        ) : (
          <>No restart date set.</>
        )}
      </p>
      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm font-bold text-primary hover:underline"
        >
          Change restart date
        </button>
        <button
          type="button"
          onClick={resumeNow}
          disabled={resuming}
          className="px-4 py-2 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition disabled:opacity-50"
        >
          {resuming ? 'Resuming…' : 'Resume now'}
        </button>
      </div>

      {editing && (
        <DateModal
          title="Change your restart date"
          intro="Pick the new date you want your subscription to restart. Your tours stay offline until then."
          confirmLabel="Save restart date"
          initialDate={resumeAt ? new Date(resumeAt).toISOString().slice(0, 10) : ''}
          onClose={() => setEditing(false)}
          onSubmit={async (date) => {
            const err = await postPause(date);
            if (!err) {
              setEditing(false);
              router.refresh();
            }
            return err;
          }}
        />
      )}
    </div>
  );
}
