'use client';

// Route guidance (optional, collapsed by default).
//
// Lets an operator shape the walking route from THIS stop to the NEXT one by
// dropping up to five via-points on a satellite map. The tour player feeds
// these into the routing call, so "Take me there" follows the published path
// (a towpath, a coast path, a field gate) instead of the shortest line.
// Nothing here is spoken; it only changes the map and the on-screen turns.
//
// The preview line is fetched from the same OSRM foot/bike/car instance the
// player uses, so what the operator sees is what the walker gets.
import { useEffect, useRef, useState, useCallback } from 'react';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
export const MAX_VIA_POINTS = 5;

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

function osrmProfile(travelMode: string): string {
  return travelMode === 'cycling' ? 'bike' : travelMode === 'driving' ? 'car' : 'foot';
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

export function RouteGuidanceMap({ from, next, travelMode, value, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObj = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeLine = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [routeInfo, setRouteInfo] = useState<string>('');
  const valueRef = useRef(value);
  valueRef.current = value;
  // Each route request gets a sequence number; only the latest may draw. This
  // stops a slow earlier answer landing after a faster later one and leaving
  // a second, stale line on the map.
  const routeSeq = useRef(0);

  function clearRouteLine() {
    if (routeLine.current) routeLine.current.setMap(null);
    routeLine.current = null;
  }

  // Draw the route through the current via-points, exactly as the player would.
  const drawRoute = useCallback(async (pts: ViaPoint[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    const map = mapObj.current;
    if (!g || !map || !from || !next) return;
    const chain = [from, ...pts, { lat: next.lat, lng: next.lng }];
    const coords = chain.map((p) => `${p.lng},${p.lat}`).join(';');
    const profile = osrmProfile(travelMode);
    const seq = ++routeSeq.current;
    // Clear the previous line straight away so there is never a moment with
    // two lines on the map, whatever order the answers arrive in.
    clearRouteLine();
    try {
      setRouteInfo('Drawing route…');
      const res = await fetch(
        `https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile}/${coords}?overview=full&geometries=geojson`
      );
      const data = await res.json();
      if (seq !== routeSeq.current) return; // a newer request has superseded this one
      if (!data.routes || !data.routes.length) throw new Error('no route');
      const path = data.routes[0].geometry.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] }));
      clearRouteLine();
      routeLine.current = new g.maps.Polyline({
        path,
        map,
        strokeColor: '#C9A84C',
        strokeOpacity: 0.95,
        strokeWeight: 5,
      });
      const km = data.routes[0].distance / 1000;
      setRouteInfo(`Route as the walker will see it: ${km.toFixed(1)} km`);
    } catch {
      if (seq !== routeSeq.current) return;
      clearRouteLine();
      setRouteInfo('Could not draw the route just now. Your points are still saved when you save the stop.');
    }
  }, [from, next, travelMode]);

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
        label: { text: String(i + 1), color: '#1B4332', fontWeight: '700' },
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: '#C9A84C',
          fillOpacity: 1,
          strokeColor: '#1B4332',
          strokeWeight: 2,
        },
        title: `Via-point ${i + 1}. Drag to move, click to remove.`,
      });
      m.addListener('dragend', () => {
        const pos = m.getPosition();
        if (!pos) return;
        const nextPts = valueRef.current.map((q, j) => (j === i ? { lat: pos.lat(), lng: pos.lng() } : q));
        onChange(nextPts);
      });
      m.addListener('click', () => {
        const nextPts = valueRef.current.filter((_, j) => j !== i);
        onChange(nextPts);
      });
      return m;
    });
  }, [onChange]);

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
        });
        mapObj.current = map;

        // Fixed markers for this stop and the next one.
        new g.maps.Marker({
          position: from,
          map,
          label: { text: 'A', color: '#ffffff', fontWeight: '700' },
          title: 'This stop',
        });
        new g.maps.Marker({
          position: { lat: next.lat, lng: next.lng },
          map,
          label: { text: 'B', color: '#ffffff', fontWeight: '700' },
          title: `Next stop: ${next.name}`,
        });

        const bounds = new g.maps.LatLngBounds();
        bounds.extend(from);
        bounds.extend({ lat: next.lat, lng: next.lng });
        valueRef.current.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 70);

        map.addListener('click', (e: { latLng: { lat: () => number; lng: () => number } }) => {
          if (valueRef.current.length >= MAX_VIA_POINTS) return;
          const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          onChange([...valueRef.current, p]);
        });

        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.lat, from?.lng, next?.lat, next?.lng]);

  // Whenever the points change (add, drag, remove), redraw markers and route.
  useEffect(() => {
    if (!ready) return;
    syncMarkers(value);
    drawRoute(value);
  }, [ready, value, syncMarkers, drawRoute]);

  if (!MAPS_KEY) return null;
  if (!from) {
    return (
      <p className="text-sm text-gray-600 bg-cream border border-gray-200 rounded-lg p-3">
        Set this stop&apos;s latitude and longitude first, then come back to shape the route.
      </p>
    );
  }
  if (!next) {
    return (
      <p className="text-sm text-gray-600 bg-cream border border-gray-200 rounded-lg p-3">
        This is the last stop in the walk, so there is no onward route to shape.
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

  return (
    <div>
      <div ref={mapRef} className="w-full h-96 rounded-xl border border-gray-200 bg-gray-100" />
      {!ready && <p className="text-xs text-gray-500 mt-2">Loading map…</p>}
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-600">
          {routeInfo || 'Tap the map to add a point. Drag a point to move it, tap it to remove.'}{' '}
          {value.length > 0 && 'If the line doubles back on itself, drag that point a little closer to the path you mean.'}
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
