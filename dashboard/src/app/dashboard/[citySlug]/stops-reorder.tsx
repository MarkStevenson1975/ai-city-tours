'use client';

// Drag-and-drop (and up/down) reordering of a city's stops. Renders the
// stops list, lets the operator rearrange the route, and saves the new
// order via the reorderStops action.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { reorderStops } from './actions';

export type StopRow = {
  id: string;
  position: number;
  name: string;
  short_description: string | null;
  hero_image_url: string | null;
  hero_image_override_url: string | null;
};

export function StopsReorder({
  citySlug,
  initialStops,
  stopLimit,
}: {
  citySlug: string;
  initialStops: StopRow[];
  stopLimit: number | null;
}) {
  const router = useRouter();
  const [stops, setStops] = useState<StopRow[]>(initialStops);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function move(from: number, to: number) {
    if (to < 0 || to >= stops.length || from === to) return;
    setStops((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
    setSaved(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await reorderStops(citySlug, stops.map((s) => s.id));
      if (r.ok) {
        setDirty(false);
        setSaved(true);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  if (stops.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 text-center text-sm text-gray-500 italic shadow-sm">
        No stops yet.
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-xl overflow-hidden shadow-sm divide-y divide-cream">
        {stops.map((stop, i) => (
          <div
            key={stop.id}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, i);
              setDragIndex(null);
            }}
            className={`flex items-center gap-3 px-4 py-3 transition ${
              dragIndex === i ? 'bg-cream' : 'hover:bg-cream/50'
            } ${stopLimit !== null && i >= stopLimit ? 'opacity-60' : ''}`}
          >
            <span className="cursor-grab text-gray-400 select-none" aria-hidden>
              ⠿
            </span>
            <span className="w-7 h-7 rounded-full bg-primary text-cream text-sm font-bold flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg truncate">{stop.name}</p>
              {stopLimit !== null && i >= stopLimit && (
                <span className="inline-block text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full mt-0.5">
                  Upgrade to include this stop
                </span>
              )}
              {stop.short_description && (
                <p className="text-sm text-gray-500 truncate">
                  {stop.short_description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label="Move up"
                className="px-2 py-1 rounded text-gray-500 hover:bg-cream disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === stops.length - 1}
                aria-label="Move down"
                className="px-2 py-1 rounded text-gray-500 hover:bg-cream disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            <Link
              href={`/dashboard/${citySlug}/stops/${stop.id}`}
              className="text-sm font-bold text-primary hover:underline ml-2"
            >
              Edit
            </Link>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending}
          className={`px-5 py-2 rounded-full font-bold text-sm transition ${
            dirty
              ? 'bg-primary text-cream hover:bg-primary-light'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isPending ? 'Saving…' : 'Save order'}
        </button>
        {saved && <span className="text-sm text-green-700 font-bold">Order saved</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
        <span className="text-xs text-gray-500">
          Drag a stop, or use the arrows, then save.
        </span>
      </div>
    </div>
  );
}
