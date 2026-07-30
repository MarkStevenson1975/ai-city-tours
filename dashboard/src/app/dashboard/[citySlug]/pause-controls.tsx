'use client';

// Pause a subscription onto the per-tier standby fee, and manage an existing
// pause. Pausing takes all of the operator's tours offline (drafts kept) and
// moves billing to the standby rate until they resume. A restart date is
// optional (reminder only). On resume the operator is prompted to republish;
// tours do not come back automatically.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function poundsFromPence(pence: number): string {
  const pounds = pence / 100;
  return `£${Number.isInteger(pounds) ? pounds : pounds.toFixed(2)}`;
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
  dateOptional,
  onClose,
  onSubmit,
}: {
  title: string;
  intro: string;
  confirmLabel: string;
  initialDate?: string;
  /** When true, the restart date can be left blank (reminder only). */
  dateOptional?: boolean;
  onClose: () => void;
  onSubmit: (date: string) => Promise<string | null>;
}) {
  const [date, setDate] = useState(initialDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!date && !dateOptional) {
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
        <label className="block text-sm font-bold mb-2">
          {dateOptional ? 'Restart date (optional)' : 'Restart date'}
        </label>
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
export function PauseButton({ feePence }: { feePence: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fee = poundsFromPence(feePence);

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
          intro={`While paused you'll pay ${fee} a month to keep your tour parked and ready. All your tours go offline (visitors see a short holding message) and nothing is deleted. Add a restart date below if you'd like a reminder, or leave it blank. When you resume we'll ask you to republish your tours to bring them back online.`}
          confirmLabel="Pause subscription"
          dateOptional
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

// Shown when the subscription is paused: standby fee, optional reminder, resume.
export function PausedPanel({ resumeAt, feePence }: { resumeAt: string | null; feePence: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fee = poundsFromPence(feePence);

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
        Your tours are offline. You&apos;re on standby at{' '}
        <span className="font-bold">{fee}/month</span> to keep them parked and
        ready, until you resume.
      </p>
      <p className="text-sm text-gray-700 mb-4">
        {resumeAt ? (
          <>You&apos;ve set a reminder for <span className="font-bold">{fmt(resumeAt)}</span>. When you resume we&apos;ll ask you to republish your tours.</>
        ) : (
          <>No reminder date set. Resume any time.</>
        )}
      </p>
      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm font-bold text-primary hover:underline"
        >
          {resumeAt ? 'Change reminder date' : 'Set a reminder date'}
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
          title="Reminder date"
          intro="Pick a date you'd like a reminder to resume. This is just a nudge, your tours stay offline and on standby until you resume, with no cap. Leave it blank to clear it."
          confirmLabel="Save reminder"
          dateOptional
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
