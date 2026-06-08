'use client';

// Unpublish (take offline) and Delete (archive) a tour, each behind an
// "Are you sure?" confirmation. Delete is a soft-delete: the tour is hidden and
// taken offline but retained for 7 years.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unpublishCity, deleteCity } from './actions';

export function TourActions({
  cityId,
  citySlug,
  cityName,
  isLive,
}: {
  cityId: string;
  citySlug: string;
  cityName: string;
  isLive: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<null | 'unpublish' | 'delete'>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      if (confirm === 'unpublish') {
        const r = await unpublishCity(cityId, citySlug);
        if (r.ok) {
          setConfirm(null);
          router.refresh();
        } else setError(r.error);
      } else if (confirm === 'delete') {
        const r = await deleteCity(cityId, citySlug);
        if (r.ok) {
          router.push('/dashboard');
          router.refresh();
        } else setError(r.error);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-4 flex-wrap">
        {isLive && (
          <button
            type="button"
            onClick={() => setConfirm('unpublish')}
            className="text-sm font-bold text-amber-800 hover:underline"
          >
            Unpublish tour
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirm('delete')}
          className="text-sm font-bold text-red-700 hover:underline"
        >
          Delete tour
        </button>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !isPending && setConfirm(null)}
        >
          <div
            className="bg-white rounded-2xl p-7 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold mb-2">
              {confirm === 'unpublish'
                ? `Unpublish ${cityName}?`
                : `Delete ${cityName}?`}
            </h2>
            <p className="text-sm text-gray-600 mb-5">
              {confirm === 'unpublish'
                ? 'This takes the tour offline. Anyone scanning the QR or opening the link will see a holding message. Your draft is kept and you can publish it again at any time.'
                : 'This removes the tour from your dashboard and takes it offline. It is archived and kept for 7 years, not permanently erased. You will not be able to edit it from here once deleted.'}
            </p>
            {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={isPending}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                disabled={isPending}
                className={`px-5 py-2 rounded-full text-sm font-bold text-cream transition disabled:opacity-50 ${
                  confirm === 'delete'
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-primary hover:bg-primary-light'
                }`}
              >
                {isPending
                  ? 'Working…'
                  : confirm === 'unpublish'
                    ? 'Yes, unpublish'
                    : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
