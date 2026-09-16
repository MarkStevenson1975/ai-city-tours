'use client';

// Route guidance (optional, collapsed by default).
//
// The operator DRAWS the walk from THIS stop (A) to the NEXT one (B) by tapping
// along the path on a satellite map. Each tap adds a numbered point and one
// gold line joins A, the points and B exactly where they were placed. There is
// no routing engine involved: what the operator draws is what the walker sees
// on the tour's "Take me there" map, with their live position on it.
// Nothing here is spoken.
import { useEffect, useRef, useState, useCallback } from 'react';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
export const MAX_VIA_POINTS = 30;

export type ViaPoint = { lat: number; lng: number };

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

function distM(a: ViaPoint, b: ViaPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function lineLengthM(chain: ViaPoint[]): number {
  let m = 0;
  for (let i = 1; i < chain.length; i++) m += distM(chain[i - 1], chain[i]);
  return m;
}

interface Props {
  /** This stop's position (start of the leg). Null until the operator has set it. */
  from: ViaPoint | null;
  /** The next stop in the tour, if any. Null on the final stop. */
  next: { name: string; position: number; lat: number; lng: number } | null;
  travelMode: string;
  value: ViaPoint[];
  onChange: (pts: ViaPoint[]) => void;
}

export function RouteGuidanceMap({ from, next, value, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObj = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const line = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Draw the one gold line: A, the operator's points in order, then B.
  const drawLine = useCallback((pts: ViaPoint[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    const map = mapObj.current;
    if (!g || !map) return;
    if (line.current) line.current.setMap(null);
    line.current = null;
    if (!from || !next || pts.length === 0) return;
    line.current = new g.maps.Polyline({
      path: [from, ...pts, { lat: next.lat, lng: next.lng }],
      map,
      strokeColor: '#C9A84C',
      strokeOpacity: 0.95,
      strokeWeight: 5,
      zIndex: 1,
    });
  }, [from, next]);

  const syncMarkers = useCallback((pts: ViaPoint[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    const map = mapObj.current;
    if (!g || !map) return;
    markers.current.forEach((m) => m.setMap(null));
    markers.current = pts.map((p, i) => {
      const m = new g.maps.Marker({
        position: p,
        map,
        draggable: true,
        label: { text: String(i + 1), color: '#1B4332', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#C9A84C',
          fillOpacity: 1,
          strokeColor: '#1B4332',
          strokeWeight: 2,
        },
        zIndex: 3,
        title: `Point ${i + 1}. Drag to move, tap to remove.`,
      });
      m.addListener('drag', () => {
        // Live redraw while dragging so the line follows the finger.
        const pos = m.getPosition();
        if (!pos) return;
        drawLine(valueRef.current.map((q, j) => (j === i ? { lat: pos.lat(), lng: pos.lng() } : q)));
      });
      m.addListener('dragend', () => {
        const pos = m.getPosition();
        if (!pos) return;
        onChange(valueRef.current.map((q, j) => (j === i ? { lat: pos.lat(), lng: pos.lng() } : q)));
      });
      m.addListener('click', () => {
        onChange(valueRef.current.filter((_, j) => j !== i));
      });
      return m;
    });
  }, [onChange, drawLine]);

  // Initialise the map once.
  useEffect(() => {
    if (!MAPS_KEY || !from || !next || mapObj.current) return;
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
          fullscreenControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          draggableCursor: 'crosshair',
        });
        mapObj.current = map;

        new g.maps.Marker({
          position: from,
          map,
          label: { text: 'A', color: '#ffffff', fontWeight: '700' },
          title: 'This stop',
          zIndex: 4,
        });
        new g.maps.Marker({
          position: { lat: next.lat, lng: next.lng },
          map,
          label: { text: 'B', color: '#ffffff', fontWeight: '700' },
          title: `Next stop: ${next.name}`,
          zIndex: 4,
        });

        const bounds = new g.maps.LatLngBounds();
        bounds.extend(from);
        bounds.extend({ lat: next.lat, lng: next.lng });
        valueRef.current.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 70);

        map.addListener('click', (e: { latLng: { lat: () => number; lng: () => number } }) => {
          if (valueRef.current.length >= MAX_VIA_POINTS) return;
          onChange([...valueRef.current, { lat: e.latLng.lat(), lng: e.latLng.lng() }]);
        });

        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.lat, from?.lng, next?.lat, next?.lng]);

  // Whenever the points change (add, drag, remove), redraw.
  useEffect(() => {
    if (!ready) return;
    syncMarkers(value);
    drawLine(value);
  }, [ready, value, syncMarkers, drawLine]);

  if (!MAPS_KEY) return null;
  if (!from) {
    return (
      <p className="text-sm text-gray-600 bg-cream border border-gray-200 rounded-lg p-3">
        Set this stop&apos;s latitude and longitude first, then come back to draw the route.
      </p>
    );
  }
  if (!next) {
    return (
      <p className="text-sm text-gray-600 bg-cream border border-gray-200 rounded-lg p-3">
        This is the last stop in the walk, so there is no onward route to draw.
      </p>
    );
  }
  if (failed) {
    return (
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        The map could not load just now. Try again in a moment.
      </p>
    );
  }

  const lengthM = value.length ? lineLengthM([from, ...value, { lat: next.lat, lng: next.lng }]) : 0;

  return (
    <div>
      <div ref={mapRef} className="w-full h-96 rounded-xl border border-gray-200 bg-gray-100" />
      {!ready && <p className="text-xs text-gray-500 mt-2">Loading map…</p>}
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-600">
          {value.length === 0
            ? 'Tap the map along the path you want walkers to take, in order from A to B.'
            : `Your route: about ${lengthM >= 950 ? (lengthM / 1000).toFixed(1) + ' km' : Math.round(lengthM / 10) * 10 + ' m'}. Drag a point to move it, tap it to remove it.`}
        </p>
        <span className="text-xs font-bold text-gray-500">
          {value.length} of {MAX_VIA_POINTS} points
        </span>
      </div>
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mt-2 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 rounded"
        >
          Clear all points
        </button>
      )}
    </div>
  );
}
