'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { publishCity } from './actions';
import { SubscribeModal } from './subscribe-modal';

export function PublishButton({
  cityId,
  citySlug,
  hasChanges,
  canPublish,
}: {
  cityId: string;
  citySlug: string;
  hasChanges: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<
    { ok: true; version: number } | { ok: false; error: string } | null
  >(null);

  function startPublish() {
    // No active or trial subscription: send them to start one before publishing.
    if (!canPublish) {
      setSubscribeOpen(true);
      return;
    }
    setConfirming(true);
    setResult(null);
  }

  function handlePublish() {
    startTransition(async () => {
      const r = await publishCity(cityId, citySlug, notes || undefined);
      setResult(r);
      if (r.ok) {
        setConfirming(false);
        setNotes('');
        router.refresh();
      }
    });
  }

  if (confirming) {
    return (
      <div className="bg-white border border-amber-300 rounded-lg p-4 text-left shadow-md">
        <p className="text-sm font-bold mb-2">Publish current draft?</p>
        <p className="text-xs text-gray-600 mb-3">
          This snapshots the current draft as a new version and makes it live
          on the public tour. The previous version is kept for rollback.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note: what changed?"
          rows={2}
          className="w-full text-xs px-2 py-1 rounded border border-gray-300 mb-3 focus:border-primary focus:outline-none"
        />
        {result && !result.ok && (
          <p className="text-xs text-red-700 mb-2">{result.error}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPending}
            className="px-4 py-1.5 text-xs font-bold rounded-full bg-primary text-cream hover:bg-primary-light disabled:opacity-50"
          >
            {isPending ? 'Publishing…' : 'Confirm publish'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={startPublish}
        disabled={!hasChanges || isPending}
        className={`px-5 py-2 rounded-full font-bold text-sm transition ${
          hasChanges
            ? 'bg-accent text-primary hover:bg-accent-light shadow-md'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        {hasChanges ? 'Publish changes' : 'Up to date'}
      </button>
      {result?.ok && (
        <p className="text-xs text-green-700 mt-2 font-bold">
          Published version {result.version} · live now
        </p>
      )}
      <SubscribeModal
        citySlug={citySlug}
        open={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        title="Review your tour live"
        intro="To publish and walk your tour for real, start your 7-day free trial. Pick a plan, then continue. Cancel any time in the first week at no charge."
        ctaLabel="Review my tour →"
      />
    </>
  );
}
