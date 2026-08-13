// Shared Google Places discovery for StorieD. Both the operator route
// (/api/places/suggest) and the public demo (/api/try/suggest) call
// discoverLandmarks, so the dashboard and the demo can never drift apart again.
//
// The lead search is a Places TEXT search ("places of interest in <town>"),
// which is relevance ranked to the town the way a person's own Google search is,
// so it surfaces the central things (a fountain, a heritage centre, a garden)
// rather than whatever a type-and-popularity nearby search happens to rank. A
// nearby-by-type search is merged in for coverage of quieter sites (a memorial,
// a small church) that the text search might miss. Results are then kept to the
// town by distance from its centre, ranked central first, and capped so no one
// category (churches, say) can fill the list.
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

// Visitor types we ask the nearby search for, and trust without a reviews gate.
// CORE is the proven, always-valid set; EXTRA widens it to smaller points of
// interest so a stop does not have to be a building.
const REQUEST_PRIMARY_TYPES_CORE = [
  'tourist_attraction', 'historical_landmark', 'museum', 'art_gallery',
  'park', 'national_park', 'church', 'hindu_temple', 'mosque', 'synagogue',
  'zoo', 'aquarium', 'amusement_park',
];
const REQUEST_PRIMARY_TYPES_EXTRA = [
  'monument', 'sculpture', 'cultural_landmark', 'historical_place',
  'plaza', 'war_memorial', 'visitor_center',
];
const REQUEST_PRIMARY_TYPES = [
  ...REQUEST_PRIMARY_TYPES_CORE,
  ...REQUEST_PRIMARY_TYPES_EXTRA,
];

// Types we count as a genuine visitor site. Anything of these types is kept even
// with no reviews (a sculpture or a memorial legitimately has none).
const VISITOR_TYPES = new Set<string>([
  ...REQUEST_PRIMARY_TYPES,
  'place_of_worship', 'cultural_center', 'garden', 'botanical_garden',
  'observation_deck', 'performing_arts_theater', 'planetarium',
  'wildlife_park', 'wildlife_refuge', 'hiking_area', 'marina',
  'historic_site',
]);

// Types that are clearly not a tour stop. Used to throw out shops, food and
// services that a text search for "places of interest" can still return.
const NON_VISITOR_TYPES = new Set<string>([
  'restaurant', 'cafe', 'coffee_shop', 'bar', 'pub', 'meal_takeaway',
  'meal_delivery', 'food', 'bakery', 'store', 'supermarket', 'grocery_store',
  'convenience_store', 'shopping_mall', 'clothing_store', 'home_goods_store',
  'furniture_store', 'hardware_store', 'department_store', 'book_store',
  'lodging', 'hotel', 'motel', 'bed_and_breakfast', 'guest_house', 'hostel',
  'campground', 'rv_park', 'bank', 'atm', 'finance', 'real_estate_agency',
  'insurance_agency', 'lawyer', 'accounting', 'doctor', 'dentist', 'hospital',
  'pharmacy', 'drugstore', 'veterinary_care', 'gym', 'fitness_center',
  'hair_care', 'hair_salon', 'beauty_salon', 'spa', 'nail_salon', 'night_club',
  'liquor_store', 'gas_station', 'car_repair', 'car_dealer', 'car_wash',
  'car_rental', 'parking', 'general_contractor', 'plumber', 'electrician',
  'roofing_contractor', 'painter', 'moving_company', 'storage', 'travel_agency',
  'post_office', 'school', 'primary_school', 'secondary_school', 'university',
]);

const MIN_REVIEWS = 5;

const BUSINESS_NAME_RE =
  /\b(ltd|limited|plc|llp|inc|clinic|osteopath|chiropract|physio|dental|dentist|solicitor|accountant|estate agent|lettings|garage|motors|engineering|plumb|electrical|roofing|scaffold|joinery|takeaway|salon|barber|nails|tattoo|vets?|veterinary|pharmacy|opticians)\b/i;

const LABEL_FOR_PRIMARY: Record<string, string> = {
  tourist_attraction: 'Landmark', historical_landmark: 'Historic site',
  historical_place: 'Historic site', historic_site: 'Historic site',
  monument: 'Monument', museum: 'Museum', art_gallery: 'Gallery',
  church: 'Church', place_of_worship: 'Place of worship', hindu_temple: 'Temple',
  mosque: 'Mosque', synagogue: 'Synagogue', park: 'Park', national_park: 'Park',
  garden: 'Garden', botanical_garden: 'Garden', zoo: 'Zoo', aquarium: 'Aquarium',
  amusement_park: 'Attraction', sculpture: 'Sculpture', cultural_landmark: 'Landmark',
  plaza: 'Square', war_memorial: 'Memorial', visitor_center: 'Visitor centre',
  cultural_center: 'Cultural centre',
};

// How many of any one category we keep, so no single kind fills the list.
const MAX_PER_CATEGORY = 2;
// Default keep-radius around the town centre (metres). Tight on purpose so a
// first draft stays in the town rather than spilling into rural villages.
const DEFAULT_RADIUS_M = 2400;

const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.rating,places.userRatingCount,places.photos,places.businessStatus';

type Raw = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  reviews: number;
  lat: number;
  lng: number;
  primary: string;
  types: string[];
  photoRef: string | null;
};

function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Resolve a town/area/postcode to coordinates.
export async function geocode(query: string, apiKey: string) {
  const params = new URLSearchParams({ query: `${query}, UK`, region: 'gb', key: apiKey });
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
  const j = await r.json();
  const loc = j?.results?.[0]?.geometry?.location;
  if (loc) return { lat: loc.lat as number, lng: loc.lng as number, status: 'OK' as const };
  return { lat: null as number | null, lng: null as number | null, status: (j?.status as string) || 'UNKNOWN' };
}

function parseNewPlace(raw: unknown): Raw | null {
  const p = raw as Record<string, unknown>;
  if (p.businessStatus === 'CLOSED_PERMANENTLY') return null;
  const loc = p.location as { latitude?: number; longitude?: number } | undefined;
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return null;
  const dn = p.displayName as { text?: string } | undefined;
  const name = dn?.text ?? '';
  if (!name) return null;
  const photos = p.photos as Array<{ name?: string }> | undefined;
  return {
    id: String(p.id ?? ''),
    name,
    address: String(p.formattedAddress ?? ''),
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviews: typeof p.userRatingCount === 'number' ? (p.userRatingCount as number) : 0,
    lat: loc.latitude,
    lng: loc.longitude,
    primary: String(p.primaryType ?? ''),
    types: Array.isArray(p.types) ? (p.types as string[]) : [],
    photoRef: photos?.[0]?.name ?? null,
  };
}

// Relevance-ranked text search, biased to the town centre. This is the lead
// discovery: it mirrors what a person gets typing "places of interest in <town>".
async function textSearch(
  query: string,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string
): Promise<Raw[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 20,
      regionCode: 'GB',
      languageCode: 'en',
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radius, 50000) } },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`places-text ${res.status} ${detail.slice(0, 160)}`);
  }
  const j = await res.json();
  const places: unknown[] = Array.isArray(j.places) ? j.places : [];
  return places.map(parseNewPlace).filter((r): r is Raw => r !== null);
}

// Nearby-by-type search, for coverage of quieter sites the text search misses.
async function nearbySearch(
  lat: number,
  lng: number,
  radius: number,
  apiKey: string,
  types: string[]
): Promise<Raw[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedPrimaryTypes: types,
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radius, 50000) } },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`places-nearby ${res.status} ${detail.slice(0, 160)}`);
  }
  const j = await res.json();
  const places: unknown[] = Array.isArray(j.places) ? j.places : [];
  return places.map(parseNewPlace).filter((r): r is Raw => r !== null);
}

// Legacy text search fallback, only if the New API is unavailable on the key.
async function legacyText(query: string, apiKey: string): Promise<Raw[]> {
  const params = new URLSearchParams({ query: `${query}, UK`, region: 'gb', key: apiKey });
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
  const j = await r.json();
  const results: unknown[] = Array.isArray(j.results) ? j.results : [];
  const out: Raw[] = [];
  for (const raw of results) {
    const p = raw as Record<string, any>;
    const loc = p.geometry?.location;
    if (!loc || p.business_status === 'CLOSED_PERMANENTLY') continue;
    const types: string[] = Array.isArray(p.types) ? p.types : [];
    out.push({
      id: String(p.place_id ?? ''),
      name: String(p.name ?? ''),
      address: String(p.formatted_address ?? p.vicinity ?? ''),
      rating: typeof p.rating === 'number' ? p.rating : null,
      reviews: typeof p.user_ratings_total === 'number' ? p.user_ratings_total : 0,
      lat: loc.lat,
      lng: loc.lng,
      primary: types[0] ?? '',
      types,
      photoRef: p.photos?.[0]?.photo_reference ?? null,
    });
  }
  return out;
}

// Is this a genuine visitor site (not a shop, food or service)?
function isVisitorSite(r: Raw): boolean {
  if (!r.name || BUSINESS_NAME_RE.test(r.name)) return false;
  if (NON_VISITOR_TYPES.has(r.primary)) return false;
  if (r.types.some((t) => NON_VISITOR_TYPES.has(t))) return false;
  const known = VISITOR_TYPES.has(r.primary) || r.types.some((t) => VISITOR_TYPES.has(t));
  // Known visitor types are kept even with no reviews (a memorial, a sculpture).
  // Anything else the text search returned needs a little social proof so a
  // stray business without an obvious type does not slip through.
  if (known) return true;
  return r.reviews >= MIN_REVIEWS;
}

function categoryOf(r: Raw): string {
  if (LABEL_FOR_PRIMARY[r.primary]) return LABEL_FOR_PRIMARY[r.primary];
  for (const t of r.types) if (LABEL_FOR_PRIMARY[t]) return LABEL_FOR_PRIMARY[t];
  return 'Place of interest';
}

// The one discovery both endpoints use. Returns the town centre plus a varied,
// central, town-bounded list of visitor sites.
export async function discoverLandmarks(
  area: string,
  apiKey: string,
  opts?: { radiusMetres?: number; max?: number }
): Promise<{ center: { lat: number | null; lng: number | null; status: string }; results: Landmark[] }> {
  const center = await geocode(area, apiKey);
  if (center.lat === null || center.lng === null) return { center, results: [] };
  const lat = center.lat;
  const lng = center.lng;
  const radius = opts?.radiusMetres ?? DEFAULT_RADIUS_M;
  const max = opts?.max ?? 12;

  const candidates: Raw[] = [];
  // Lead with the relevance text search, then add nearby-by-type for coverage.
  const [textRes, nearbyRes] = await Promise.allSettled([
    textSearch(`places of interest and things to do in ${area}`, lat, lng, radius, apiKey),
    nearbySearch(lat, lng, radius, apiKey, REQUEST_PRIMARY_TYPES),
  ]);
  if (textRes.status === 'fulfilled') candidates.push(...textRes.value);
  if (nearbyRes.status === 'fulfilled') candidates.push(...nearbyRes.value);

  // If the widened nearby types were rejected, retry nearby with the core set.
  if (nearbyRes.status === 'rejected') {
    try {
      candidates.push(...(await nearbySearch(lat, lng, radius, apiKey, REQUEST_PRIMARY_TYPES_CORE)));
    } catch {
      /* ignore, text results may still carry us */
    }
  }
  // Nothing from the New API at all: fall back to the legacy text search.
  if (candidates.length === 0) {
    try {
      candidates.push(...(await legacyText(`places of interest in ${area}`, apiKey)));
    } catch {
      /* give up gracefully below */
    }
  }

  // Dedupe by place id, keeping the first (text-search, higher-relevance) copy.
  const byId = new Map<string, Raw>();
  for (const r of candidates) {
    if (!r.id || byId.has(r.id)) continue;
    byId.set(r.id, r);
  }

  // Filter to genuine visitor sites within the keep-radius of the town centre.
  const kept = Array.from(byId.values())
    .filter(isVisitorSite)
    .map((r) => ({ r, dist: metresBetween(lat, lng, r.lat, r.lng) }))
    .filter((x) => x.dist <= radius);

  // Rank central first, but band the distance (250m) so that among near-equals
  // the better-rated site wins. Keeps the draft opening on the town's heart.
  kept.sort((a, b) => {
    const bandA = Math.round(a.dist / 250);
    const bandB = Math.round(b.dist / 250);
    if (bandA !== bandB) return bandA - bandB;
    return (b.r.rating ?? 0) - (a.r.rating ?? 0);
  });

  // Diversity cap so no one category fills the list.
  const perCategory: Record<string, number> = {};
  const results: Landmark[] = [];
  for (const { r } of kept) {
    const category = categoryOf(r);
    const n = perCategory[category] ?? 0;
    if (n >= MAX_PER_CATEGORY) continue;
    perCategory[category] = n + 1;
    results.push({
      placeId: r.id,
      name: r.name,
      address: r.address,
      rating: r.rating,
      lat: r.lat,
      lng: r.lng,
      category,
      photoRef: r.photoRef,
    });
    if (results.length >= max) break;
  }

  return { center, results };
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
