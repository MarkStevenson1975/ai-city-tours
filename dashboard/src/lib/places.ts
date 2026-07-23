// Shared Google Places helpers for the public "try it" demo flow. Mirrors the
// filtering used by the authenticated /api/places/suggest route, kept here so
// the no-auth demo endpoints can reuse it without touching the operator route.
export type Landmark = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  lat: number;
  lng: number;
  category: string;
  photoRef: string | null;
};

const REQUEST_PRIMARY_TYPES = [
  'tourist_attraction', 'historical_landmark', 'museum', 'art_gallery',
  'park', 'national_park', 'church', 'hindu_temple', 'mosque', 'synagogue',
  'zoo', 'aquarium', 'amusement_park',
];

const ALLOW_PRIMARY = new Set<string>([
  ...REQUEST_PRIMARY_TYPES,
  'place_of_worship', 'monument', 'historical_place', 'cultural_landmark',
  'cultural_center', 'sculpture', 'garden', 'botanical_garden', 'plaza',
  'observation_deck', 'performing_arts_theater', 'planetarium',
  'wildlife_park', 'wildlife_refuge', 'hiking_area', 'marina',
]);

const EXEMPT_REVIEW_GATE = new Set<string>([
  'church', 'place_of_worship', 'hindu_temple', 'mosque', 'synagogue',
  'historical_landmark', 'monument', 'historical_place',
]);
const MIN_REVIEWS = 5;

const BUSINESS_NAME_RE =
  /\b(ltd|limited|plc|llp|inc|clinic|osteopath|chiropract|physio|dental|dentist|solicitor|accountant|estate agent|lettings|garage|motors|engineering|plumb|electrical|roofing|scaffold|joinery|takeaway|salon|barber|nails|tattoo|vets?|veterinary|pharmacy|opticians)\b/i;

const LABEL_FOR_PRIMARY: Record<string, string> = {
  tourist_attraction: 'Landmark', historical_landmark: 'Historic site',
  historical_place: 'Historic site', monument: 'Monument', museum: 'Museum',
  art_gallery: 'Gallery', church: 'Church', place_of_worship: 'Place of worship',
  hindu_temple: 'Temple', mosque: 'Mosque', synagogue: 'Synagogue', park: 'Park',
  national_park: 'Park', garden: 'Garden', botanical_garden: 'Garden', zoo: 'Zoo',
  aquarium: 'Aquarium', amusement_park: 'Attraction',
};

// Resolve a town/area/postcode to coordinates.
export async function geocode(query: string, apiKey: string) {
  const params = new URLSearchParams({ query: `${query}, UK`, region: 'gb', key: apiKey });
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
  const j = await r.json();
  const loc = j?.results?.[0]?.geometry?.location;
  if (loc) return { lat: loc.lat as number, lng: loc.lng as number, status: 'OK' as const };
  return { lat: null, lng: null, status: (j?.status as string) || 'UNKNOWN' };
}

// Genuine visitor landmarks near a point, filtered on authoritative primary type.
export async function nearbyLandmarks(
  lat: number,
  lng: number,
  radiusMetres: number,
  apiKey: string
): Promise<Landmark[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.rating,places.userRatingCount,places.photos,places.businessStatus',
    },
    body: JSON.stringify({
      includedPrimaryTypes: REQUEST_PRIMARY_TYPES,
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusMetres, 50000) },
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`places-new ${res.status} ${detail.slice(0, 160)}`);
  }
  const j = await res.json();
  const places: unknown[] = Array.isArray(j.places) ? j.places : [];
  const out: Landmark[] = [];
  for (const raw of places) {
    const p = raw as Record<string, unknown>;
    if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
    const primary = String(p.primaryType ?? '');
    if (!ALLOW_PRIMARY.has(primary)) continue;
    const dn = p.displayName as { text?: string } | undefined;
    const name = dn?.text ?? '';
    if (!name || BUSINESS_NAME_RE.test(name)) continue;
    const reviews = typeof p.userRatingCount === 'number' ? p.userRatingCount : 0;
    if (!EXEMPT_REVIEW_GATE.has(primary) && reviews < MIN_REVIEWS) continue;
    const loc = p.location as { latitude?: number; longitude?: number } | undefined;
    if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') continue;
    const photos = p.photos as Array<{ name?: string }> | undefined;
    out.push({
      placeId: String(p.id ?? ''),
      name,
      address: String(p.formattedAddress ?? ''),
      rating: typeof p.rating === 'number' ? p.rating : null,
      lat: loc.latitude,
      lng: loc.longitude,
      category: LABEL_FOR_PRIMARY[primary] ?? 'Place',
      photoRef: photos?.[0]?.name ?? null,
    });
  }
  out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return out.slice(0, 8);
}

// Fetch a place photo's bytes. Handles both the New API photo name
// (places/<id>/photos/<res>) and a legacy photo_reference.
export async function fetchPlacePhoto(
  photoRef: string,
  apiKey: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const url = photoRef.includes('/photos/')
      ? `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=1200&key=${apiKey}`
      : `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 6_000_000) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}
