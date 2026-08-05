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
  pinsOnly = false,
  aerial = false,
}: {
  area: string;
  onConfirm: (picks: MapPick[]) => void;
  disabled?: boolean;
  /** Event tours: the map is the only way to add stops, so drop the "Option 1"
   *  framing and lead purely with dropping named pins. */
  pinsOnly?: boolean;
  /** Venue AND event tours: open on the satellite (hybrid) view, zoomed in on
   *  the building, so the operator can pinpoint spots inside their own site.
   *  Kept separate from pinsOnly so venues get the aerial default while still
   *  showing the "Option 1" framing and nearby-POI search. */
  aerial?: boolean;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjRef = useRef<any>(null);
  // Visible markers on the map, keyed by pick id, so pins land where you tap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Record<string, any>>({});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState<MapPick[]>([]);
  // Venue and event tours are about placing pins on a specific building, so we
  // open on the aerial (hybrid) view — the operator sees the real roof, paths
  // and courtyard instead of a flat grey polygon. Town tours default to the map
  // view. Either way a Map / Satellite toggle lets them switch.
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>(
    aerial ? 'hybrid' : 'roadmap'
  );

  function switchMapType(next: 'roadmap' | 'hybrid') {
    setMapType(next);
    if (mapObjRef.current) mapObjRef.current.setMapTypeId(next);
  }

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

  // Precise placement for phones: instead of fat-fingering a tap, the operator
  // pans the building under the fixed centre crosshair, then presses this to
  // drop a named pin exactly on the crosshair. They can still drag it after.
  function dropPinAtCentre() {
    const map = mapObjRef.current;
    if (!map) return;
    if (picksRef.current.length >= MAX) return;
    const c = map.getCenter();
    if (!c) return;
    const raw =
      typeof window !== 'undefined'
        ? window.prompt('Name this stop (e.g. The Walled Garden)')
        : '';
    const name = (raw || '').trim();
    if (!name) return;
    addPick({
      place_id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      lat: c.lat(),
      lng: c.lng(),
    });
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
          mapTypeId: aerial ? 'hybrid' : 'roadmap',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });

        serviceRef.current = new g.maps.places.PlacesService(map);
        gRef.current = g;
        mapObjRef.current = map;

        // Centre on the operator's area if we can geocode it.
        if (area) {
          new g.maps.Geocoder().geocode(
            { address: `${area}, UK` },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: any, status: string) => {
              if (status === 'OK' && res?.[0]?.geometry?.location) {
                map.setCenter(res[0].geometry.location);
                // Venue tours open tight on the building so the operator can see
                // the doorway, courtyard and paths; town tours stay wider.
                map.setZoom(aerial ? 18 : 15);
              }
            }
          );
        }

        // Tap the map to add a stop. Tapping a labelled place (a Google POI)
        // pulls its real name; tapping ANY other point drops a custom pin the
        // operator names themselves — essential for places Google doesn't know,
        // like a walled garden, a long gallery, or a festival stall.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addListener('click', (e: any) => {
          if (picksRef.current.length >= MAX) return;
          if (e.placeId) {
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
            return;
          }
          // Bare point: ask what this stop is, then drop a pin there.
          if (!e.latLng) return;
          const raw =
            typeof window !== 'undefined'
              ? window.prompt('Name this stop (e.g. The Walled Garden)')
              : '';
          const name = (raw || '').trim();
          if (!name) return;
          addPick({
            place_id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
          });
        });

        // Search box: a NAVIGATION aid only. Restricted to geocode results
        // (towns, areas, postcodes) so it can never surface or add a business —
        // the operator adds stops by tapping the real places on the map. This
        // matches the instructions and keeps the whole screen free of the
        // "random business" problem.
        if (inputRef.current) {
          const ac = new g.maps.places.Autocomplete(inputRef.current, {
            fields: ['geometry'],
            types: ['geocode'],
            componentRestrictions: { country: 'gb' },
          });
          ac.addListener('place_changed', () => {
            const p = ac.getPlace();
            if (p?.geometry?.location) {
              map.setCenter(p.geometry.location);
              map.setZoom(15);
            }
          });
        }

        setReady(true);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [area, aerial]);

  // Keep the map markers in sync with the current picks: drop a numbered pin for
  // each new selection, remove it if the operator deletes the chip.
  useEffect(() => {
    const g = gRef.current;
    const map = mapObjRef.current;
    if (!g || !map) return;
    const have = markersRef.current;
    for (const id of Object.keys(have)) {
      if (!picks.some((p) => p.place_id === id)) {
        have[id].setMap(null);
        delete have[id];
      }
    }
    picks.forEach((p, i) => {
      const label = { text: String(i + 1), color: '#ffffff', fontWeight: '700' };
      if (have[p.place_id]) {
        have[p.place_id].setLabel(label);
        return;
      }
      // Pins are draggable so the operator can drop roughly then nudge to the
      // exact doorway, statue or courtyard spot. On drop we update that pick's
      // coordinates so the saved stop lands precisely where they placed it.
      const marker = new g.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        label,
        draggable: true,
        title: 'Drag to fine-tune this stop',
      });
      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        if (!pos) return;
        const lat = pos.lat();
        const lng = pos.lng();
        setPicks((prev) =>
          prev.map((x) => (x.place_id === p.place_id ? { ...x, lat, lng } : x))
        );
      });
      have[p.place_id] = marker;
    });
  }, [picks]);

  // Not configured: hide the picker entirely so the list option still shows.
  if (!MAPS_KEY) return null;

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
        {pinsOnly ? 'Pin your stops on the map' : 'Option 1 · Pick on the map'}
      </p>
      <p className="text-sm text-gray-600 mb-3">
        {pinsOnly
          ? `The map opens on the satellite view so you can see your actual building. Line the crosshair up on the exact spot, then press Drop pin here to add a stop (up to ${MAX}). Drag any pin to fine-tune it. Tap a labelled place to use its name.`
          : `Search a town or postcode to jump there, then tap the map to add up to ${MAX} stops. Tap a labelled place to use its name, or tap any other point to drop your own pin and name it. Switch to Satellite to pinpoint a building, and drag any pin to fine-tune it.`}
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
            placeholder="Search a town or postcode"
            className="w-full px-4 py-3 mb-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="relative w-full h-80">
            <div
              ref={mapRef}
              className="absolute inset-0 rounded-xl border border-gray-200 bg-gray-100"
            />

            {ready && (
              <>
                {/* Map / Satellite toggle */}
                <div className="absolute top-3 right-3 z-10 flex rounded-full overflow-hidden shadow-md border border-white/70 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => switchMapType('roadmap')}
                    className={`px-3 py-1.5 transition ${
                      mapType === 'roadmap'
                        ? 'bg-primary text-white'
                        : 'bg-white/95 text-gray-700 hover:bg-white'
                    }`}
                  >
                    Map
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMapType('hybrid')}
                    className={`px-3 py-1.5 transition ${
                      mapType === 'hybrid'
                        ? 'bg-primary text-white'
                        : 'bg-white/95 text-gray-700 hover:bg-white'
                    }`}
                  >
                    Satellite
                  </button>
                </div>

                {/* Fixed centre crosshair — pan the target under it, then Drop pin here */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                  <svg
                    width="46"
                    height="46"
                    viewBox="0 0 46 46"
                    className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                    aria-hidden="true"
                  >
                    <circle cx="23" cy="23" r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
                    <circle cx="23" cy="23" r="11" fill="none" stroke="#1f4d3f" strokeWidth="1.2" />
                    <line x1="23" y1="2" x2="23" y2="14" stroke="#ffffff" strokeWidth="2.5" />
                    <line x1="23" y1="32" x2="23" y2="44" stroke="#ffffff" strokeWidth="2.5" />
                    <line x1="2" y1="23" x2="14" y2="23" stroke="#ffffff" strokeWidth="2.5" />
                    <line x1="32" y1="23" x2="44" y2="23" stroke="#ffffff" strokeWidth="2.5" />
                    <circle cx="23" cy="23" r="2.5" fill="#ffffff" />
                  </svg>
                </div>

                {/* Drop pin here — places a named stop on the crosshair */}
                <button
                  type="button"
                  onClick={dropPinAtCentre}
                  disabled={picks.length >= MAX}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-5 py-2.5 rounded-full bg-accent text-primary font-bold text-sm shadow-md hover:bg-accent-light transition disabled:opacity-50"
                >
                  {picks.length >= MAX ? `Max ${MAX} stops` : 'Drop pin here'}
                </button>
              </>
            )}
          </div>
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
    </div>
  );
}
