'use client';

// Venue pin map: shows every stop of a venue tour as a numbered, draggable pin
// on the satellite (hybrid) view, so the operator can nudge each one to the
// exact spot inside their building. Dragging a pin saves that stop's new
// position automatically (to the draft). Publishing pushes it to the live tour.
import { useEffect, useRef, useState } from 'react';
import { updateStopPosition } from './stop-position-actions';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

export type PinStop = { id: string; position: number; name: string; lat: number; lng: number };

// Load the Maps JS script once per page.
let mapsPromise: Promise<void> | null = null;
function loadMaps(key: string): Promise<void> {
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise<void>((resolve, reject) => {
    const w = window as unknown as { google?: { maps?: unknown } };
    if (w.google?.maps) return resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

export function VenuePinMap({ citySlug, stops }: { citySlug: string; stops: PinStop[] }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!MAPS_KEY || stops.length === 0) return;
    let cancelled = false;

    loadMaps(MAPS_KEY)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (window as any).google;

        const map = new g.maps.Map(mapRef.current, {
          mapTypeId: 'hybrid',
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });

        const bounds = new g.maps.LatLngBounds();
        stops.forEach((s) => {
          const marker = new g.maps.Marker({
            position: { lat: s.lat, lng: s.lng },
            map,
            draggable: true,
            label: { text: String(s.position), color: '#ffffff', fontWeight: '700' },
            title: `${s.position}. ${s.name} — drag to reposition`,
          });
          bounds.extend(marker.getPosition());
          marker.addListener('dragend', async () => {
            const pos = marker.getPosition();
            if (!pos) return;
            setError(null);
            setSavedId(null);
            setSavingId(s.id);
            const res = await updateStopPosition(s.id, citySlug, pos.lat(), pos.lng());
            setSavingId(null);
            if (!res.ok) {
              setError(`Could not save ${s.name}: ${res.error}`);
            } else {
              setSavedId(s.id);
              setTimeout(() => setSavedId((cur) => (cur === s.id ? null : cur)), 2500);
            }
          });
        });

        if (stops.length === 1) {
          map.setCenter(bounds.getCenter());
          map.setZoom(18);
        } else {
          map.fitBounds(bounds, 60);
          g.maps.event.addListenerOnce(map, 'idle', () => {
            if (map.getZoom() > 19) map.setZoom(19);
          });
        }

        setReady(true);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [citySlug, stops]);

  if (!MAPS_KEY || stops.length === 0) return null;

  return (
    <div>
      {failed ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          The map could not load just now. You can still set positions from each stop&apos;s editor.
        </p>
      ) : (
        <>
          <div
            ref={mapRef}
            className="w-full h-96 rounded-xl border border-gray-200 bg-gray-100"
          />
          {!ready && <p className="text-xs text-gray-500 mt-2">Loading map…</p>}
          {error && (
            <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {stops.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-2 bg-cream border border-gray-200 rounded-full pl-2 pr-3 py-1 text-sm"
              >
                <span className="w-5 h-5 rounded-full bg-accent text-primary text-xs font-bold flex items-center justify-center">
                  {s.position}
                </span>
                {s.name}
                {savingId === s.id && <span className="text-xs text-gray-500 italic">Saving…</span>}
                {savedId === s.id && <span className="text-xs text-green-700 font-bold">Saved</span>}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
