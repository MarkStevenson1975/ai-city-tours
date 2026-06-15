'use client';

// Visual stop picker. Loads the Google Maps JavaScript API (Places library) and
// lets the operator search or tap points of interest on the map, choosing up to
// five. On confirm it hands the chosen place_ids back to the wizard, which
// enriches and drafts them through the same pipeline as the list.
//
// Requires NEXT_PUBLIC_GOOGLE_MAPS_KEY (a browser-restricted Maps key with the
// Maps JavaScript API + Places API enabled). If it is not set, the picker
// hides itself and the postcode/list option below still works.
import { useEffect, useRef, useState } from 'react';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const MAX = 5;

export type MapPick = { place_id: string; name: string; lat: number; lng: number };

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

export function MapPicker({
  area,
  onConfirm,
  disabled,
}: {
  area: string;
  onConfirm: (picks: MapPick[]) => void;
  disabled?: boolean;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState<MapPick[]>([]);

  // Keep the latest picks in a ref so the map click handler (bound once) can
  // read the current selection without being re-bound.
  const picksRef = useRef<MapPick[]>([]);
  picksRef.current = picks;

  function addPick(p: MapPick) {
    setPicks((prev) => {
      if (prev.some((x) => x.place_id === p.place_id)) return prev;
      if (prev.length >= MAX) return prev;
      return [...prev, p];
    });
  }

  function removePick(placeId: string) {
    setPicks((prev) => prev.filter((p) => p.place_id !== placeId));
  }

  useEffect(() => {
    if (!MAPS_KEY) return;
    let cancelled = false;

    loadMaps(MAPS_KEY)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (window as any).google;

        const map = new g.maps.Map(mapRef.current, {
          center: { lat: 54.5, lng: -3 },
          zoom: 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        serviceRef.current = new g.maps.places.PlacesService(map);

        // Centre on the operator's area if we can geocode it.
        if (area) {
          new g.maps.Geocoder().geocode(
            { address: `${area}, UK` },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: any, status: string) => {
              if (status === 'OK' && res?.[0]?.geometry?.location) {
                map.setCenter(res[0].geometry.location);
                map.setZoom(15);
              }
            }
          );
        }

        // Tap a point of interest on the map to add it.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addListener('click', (e: any) => {
          if (!e.placeId) return;
          e.stop(); // suppress the default info window
          serviceRef.current.getDetails(
            { placeId: e.placeId, fields: ['name', 'geometry', 'place_id'] },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (place: any, status: string) => {
              if (status === 'OK' && place?.geometry?.location) {
                addPick({
                  place_id: place.place_id,
                  name: place.name,
                  lat: place.geometry.location.lat(),
                  lng: place.geometry.location.lng(),
                });
              }
            }
          );
        });

        // Search box (Places Autocomplete) to jump to and add a place.
        if (inputRef.current) {
          const ac = new g.maps.places.Autocomplete(inputRef.current, {
            fields: ['place_id', 'name', 'geometry'],
            componentRestrictions: { country: 'gb' },
          });
          ac.addListener('place_changed', () => {
            const p = ac.getPlace();
            if (p?.place_id && p?.geometry?.location) {
              map.setCenter(p.geometry.location);
              map.setZoom(16);
              addPick({
                place_id: p.place_id,
                name: p.name,
                lat: p.geometry.location.lat(),
                lng: p.geometry.location.lng(),
              });
              if (inputRef.current) inputRef.current.value = '';
            }
          });
        }

        setReady(true);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [area]);

  // Not configured: hide the picker entirely so the list option still shows.
  if (!MAPS_KEY) return null;

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
        Option 1 · Pick on the map
      </p>
      <p className="text-sm text-gray-600 mb-3">
        Search for your town, then tap up to {MAX} places on the map to add them as
        stops. You can add more later.
      </p>

      {failed ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          The map could not load just now. You can still use the postcode search below.
        </p>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search for a place to add"
            className="w-full px-4 py-3 mb-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div
            ref={mapRef}
            className="w-full h-80 rounded-xl border border-gray-200 bg-gray-100"
          />
          {!ready && <p className="text-xs text-gray-500 mt-2">Loading map…</p>}

          {picks.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-bold mb-2">
                Selected on map ({picks.length}/{MAX})
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {picks.map((p) => (
                  <span
                    key={p.place_id}
                    className="inline-flex items-center gap-2 bg-cream border border-gray-200 rounded-full pl-3 pr-2 py-1 text-sm"
                  >
                    {p.name}
                    <button
                      type="button"
                      onClick={() => removePick(p.place_id)}
                      className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 text-xs"
                      aria-label={`Remove ${p.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onConfirm(picks);
                  setPicks([]);
                }}
                className="px-5 py-2.5 rounded-full bg-accent text-primary font-bold text-sm hover:bg-accent-light transition disabled:opacity-50"
              >
                Add {picks.length} stop{picks.length === 1 ? '' : 's'} to my tour
              </button>
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-3 my-6">
        <span className="h-px bg-gray-200 flex-1" />
        <span className="text-xs uppercase tracking-widest text-gray-400 font-bold">
          or search by postcode
        </span>
        <span className="h-px bg-gray-200 flex-1" />
      </div>
    </div>
  );
}
