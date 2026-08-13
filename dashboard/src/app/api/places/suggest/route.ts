// POST /api/places/suggest
// Body: { postcode: string, radiusMiles?: number }  (or { area } as fallback)
//
// Finds genuine visitor sites near a place. It uses Google's Places API (New)
// and filters on each place's AUTHORITATIVE primary type, so a welding firm
// (primary type general_contractor) or an osteopath (physiotherapist) can never
// appear as a heritage stop, however they are otherwise tagged. A reviews gate
// and a name check catch the rare stragglers.
//
// If the new API is unavailable (e.g. not yet enabled on the key), it falls
// back to the old blocklist search so operators are never left stuck.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackOperator } from '@/lib/track-operator';

type Suggestion = {
  place_id: string;
  name: string;
  address: string;
  rating: number | null;
  lat: number;
  lng: number;
  category: string;
  photoRef: string | null;
};

// ---- Tight filter (Places API New) -------------------------------------

// Primary types we ASK Google for. The CORE set is the proven, always-valid
// list. The EXTRA set widens it to smaller points of interest (a sculpture, a
// monument, a war memorial, a general cultural landmark) so a stop does not have
// to be a building. If any EXTRA type is ever rejected by Google the whole
// request 400s, so nearbyNew is called with CORE as a fallback before we drop to
// the legacy search. That keeps the widening safe.
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

// Primary types we KEEP once results come back (a superset of the above, so
// extra genuine kinds pass; unknown strings here are simply never matched).
const ALLOW_PRIMARY = new Set<string>([
  ...REQUEST_PRIMARY_TYPES,
  'place_of_worship', 'monument', 'historical_place', 'cultural_landmark',
  'cultural_center', 'sculpture', 'garden', 'botanical_garden', 'plaza',
  'observation_deck', 'performing_arts_theater', 'planetarium',
  'wildlife_park', 'wildlife_refuge', 'hiking_area', 'marina',
  'war_memorial', 'visitor_center',
]);

// Places of worship and monuments may legitimately have very few reviews, so
// they skip the reviews gate; everything else must clear MIN_REVIEWS.
// Low-footprint sites legitimately have few or no reviews: a sculpture, a war
// memorial, a market cross, a blue-plaque spot. They skip the reviews gate so
// they are never dropped just for being small. Everything else must clear it.
const EXEMPT_REVIEW_GATE = new Set<string>([
  'church', 'place_of_worship', 'hindu_temple', 'mosque', 'synagogue',
  'historical_landmark', 'monument', 'historical_place',
  'sculpture', 'cultural_landmark', 'plaza', 'war_memorial',
]);
const MIN_REVIEWS = 5;

// Last-ditch name check for oddities that slip through with a tourist primary
// type (e.g. a business that self-tagged as an attraction).
const BUSINESS_NAME_RE =
  /\b(ltd|limited|plc|llp|inc|clinic|osteopath|chiropract|physio|dental|dentist|solicitor|accountant|estate agent|lettings|garage|motors|engineering|plumb|electrical|roofing|scaffold|joinery|takeaway|salon|barber|nails|tattoo|vets?|veterinary|pharmacy|opticians)\b/i;

const LABEL_FOR_PRIMARY: Record<string, string> = {
  tourist_attraction: 'Landmark',
  historical_landmark: 'Historic site',
  historical_place: 'Historic site',
  monument: 'Monument',
  museum: 'Museum',
  art_gallery: 'Gallery',
  church: 'Church',
  place_of_worship: 'Place of worship',
  hindu_temple: 'Temple',
  mosque: 'Mosque',
  synagogue: 'Synagogue',
  park: 'Park',
  national_park: 'Park',
  garden: 'Garden',
  botanical_garden: 'Garden',
  zoo: 'Zoo',
  aquarium: 'Aquarium',
  amusement_park: 'Attraction',
  sculpture: 'Sculpture',
  cultural_landmark: 'Landmark',
  plaza: 'Square',
  war_memorial: 'Memorial',
  visitor_center: 'Visitor centre',
  cultural_center: 'Cultural centre',
  garden_botanical: 'Garden',
};

// Categories that make a good lead: the town's principal heritage anchor. We
// float the best-rated one of these to the front so a first draft opens on
// something central and significant rather than a lone side-street church.
const ANCHOR_CATEGORIES = new Set<string>([
  'Historic site', 'Landmark', 'Monument', 'Museum', 'Memorial', 'Church',
]);
// How many of any one category we allow in a first draft, so four churches (or
// four of anything) can never fill the list. Variety is the point.
const MAX_PER_CATEGORY = 2;

async function nearbyNew(
  lat: number,
  lng: number,
  radius: number,
  apiKey: string,
  types: string[]
): Promise<Suggestion[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.rating,places.userRatingCount,places.photos,places.businessStatus',
    },
    body: JSON.stringify({
      includedPrimaryTypes: types,
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: Math.min(radius, 50000),
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`places-new ${res.status} ${detail.slice(0, 180)}`);
  }

  const j = await res.json();
  const places: unknown[] = Array.isArray(j.places) ? j.places : [];
  const out: Suggestion[] = [];

  for (const raw of places) {
    const p = raw as Record<string, any>;
    if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;

    const primary: string = p.primaryType ?? '';
    if (!ALLOW_PRIMARY.has(primary)) continue; // authoritative — the tight bit

    const name: string = p.displayName?.text ?? '';
    if (!name || BUSINESS_NAME_RE.test(name)) continue;

    const reviews: number =
      typeof p.userRatingCount === 'number' ? p.userRatingCount : 0;
    if (!EXEMPT_REVIEW_GATE.has(primary) && reviews < MIN_REVIEWS) continue;

    const loc = p.location;
    if (!loc || typeof loc.latitude !== 'number') continue;

    out.push({
      place_id: p.id,
      name,
      address: p.formattedAddress ?? '',
      rating: typeof p.rating === 'number' ? p.rating : null,
      lat: loc.latitude,
      lng: loc.longitude,
      category: LABEL_FOR_PRIMARY[primary] ?? 'Place',
      photoRef: p.photos?.[0]?.name ?? null, // New format: places/<id>/photos/<res>
    });
  }

  out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  // Float the principal anchor to the lead: the highest-rated significant,
  // central site. Because the list is already rating-sorted, the first anchor is
  // the best-rated one, so moving it to the front makes the draft open well
  // instead of on whatever happened to rank first.
  const anchorIdx = out.findIndex((s) => ANCHOR_CATEGORIES.has(s.category));
  if (anchorIdx > 0) {
    const [anchor] = out.splice(anchorIdx, 1);
    out.unshift(anchor);
  }

  // Diversity cap: keep at most MAX_PER_CATEGORY of any one category, so the
  // draft is varied by construction and churches cannot crowd everything else
  // out. Order is preserved, so the anchor and the best of each kind survive.
  const perCategory: Record<string, number> = {};
  const varied: Suggestion[] = [];
  for (const s of out) {
    const n = perCategory[s.category] ?? 0;
    if (n >= MAX_PER_CATEGORY) continue;
    perCategory[s.category] = n + 1;
    varied.push(s);
  }

  return varied.slice(0, 12);
}

// ---- Legacy fallback (blocklist) — only if the new API is unavailable ----

const LEGACY_TYPES = ['tourist_attraction', 'museum', 'art_gallery', 'church', 'place_of_worship', 'park'];
const LEGACY_EXCLUDE = new Set([
  'restaurant', 'cafe', 'bar', 'meal_takeaway', 'meal_delivery', 'food',
  'bakery', 'store', 'supermarket', 'grocery_or_supermarket', 'shopping_mall',
  'clothing_store', 'home_goods_store', 'furniture_store', 'hardware_store',
  'funeral_home', 'cemetery', 'lodging', 'bank', 'finance', 'atm',
  'real_estate_agency', 'insurance_agency', 'lawyer', 'accounting',
  'doctor', 'dentist', 'hospital', 'pharmacy', 'veterinary_care', 'health',
  'physiotherapist', 'general_contractor', 'plumber', 'electrician',
  'car_dealer', 'car_repair', 'car_rental', 'gas_station',
  'gym', 'hair_care', 'beauty_salon', 'spa', 'night_club', 'liquor_store',
]);

async function nearbyLegacyOne(lat: number, lng: number, radius: number, type: string, apiKey: string) {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radius),
    type,
    key: apiKey,
  });
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`);
  const j = await r.json();
  return Array.isArray(j.results) ? j.results : [];
}

async function nearbyLegacy(lat: number, lng: number, radius: number, apiKey: string): Promise<Suggestion[]> {
  const lists = await Promise.all(
    LEGACY_TYPES.map((t) => nearbyLegacyOne(lat, lng, radius, t, apiKey))
  );
  const seen = new Map<string, Suggestion>();
  for (const list of lists) {
    for (const p of list) {
      if (!p.geometry?.location || p.business_status === 'CLOSED_PERMANENTLY') continue;
      if (seen.has(p.place_id)) continue;
      const ptypes: string[] = p.types ?? [];
      if (ptypes.some((t) => LEGACY_EXCLUDE.has(t))) continue;
      if (p.name && BUSINESS_NAME_RE.test(p.name)) continue;
      seen.set(p.place_id, {
        place_id: p.place_id,
        name: p.name,
        address: p.vicinity ?? '',
        rating: typeof p.rating === 'number' ? p.rating : null,
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
        category: 'Place',
        photoRef: p.photos?.[0]?.photo_reference ?? null,
      });
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 10);
}

// Resolve a postcode/area to coordinates via legacy Text Search (cheap, and
// the key already supports it).
async function geocode(query: string, apiKey: string) {
  const params = new URLSearchParams({ query: `${query}, UK`, region: 'gb', key: apiKey });
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
  const j = await r.json();
  const loc = j?.results?.[0]?.geometry?.location;
  if (loc) return { lat: loc.lat as number, lng: loc.lng as number, status: 'OK' };
  return { lat: null, lng: null, status: (j?.status as string) || 'UNKNOWN' };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Place search is not configured (GOOGLE_MAPS_API_KEY).' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const postcode = String(body.postcode ?? '').trim();
  const area = String(body.area ?? '').trim();
  const radiusMiles = Number(body.radiusMiles) > 0 ? Number(body.radiusMiles) : 3;
  const radius = Math.min(Math.round(radiusMiles * 1609), 50000);

  const where = postcode || area;
  if (!where) {
    return NextResponse.json({ error: 'Enter a postcode or area first.' }, { status: 400 });
  }

  try {
    const center = await geocode(where, apiKey);
    if (center.lat === null || center.lng === null) {
      const detail =
        center.status === 'REQUEST_DENIED'
          ? ' (the place search API key may need attention)'
          : center.status === 'ZERO_RESULTS'
            ? ''
            : ` (${center.status})`;
      return NextResponse.json(
        { error: `Could not find that postcode or area${detail}. Check it and try again.` },
        { status: 404 }
      );
    }

    // Tight path first; fall back to the old search only if the new API errors
    // (e.g. not yet enabled). An empty tight result is trusted as-is — a couple
    // of genuine sites beats a list padded with businesses. We try the widened
    // type list first; if Google rejects any of the newer types the request
    // 400s, so we retry with the proven core set before dropping to legacy.
    let results: Suggestion[];
    try {
      results = await nearbyNew(center.lat, center.lng, radius, apiKey, REQUEST_PRIMARY_TYPES);
    } catch (e) {
      console.warn('Places (New) widened search failed, retrying core types:', e instanceof Error ? e.message : e);
      try {
        results = await nearbyNew(center.lat, center.lng, radius, apiKey, REQUEST_PRIMARY_TYPES_CORE);
      } catch (e2) {
        console.warn('Places API (New) unavailable, using legacy search:', e2 instanceof Error ? e2.message : e2);
        results = await nearbyLegacy(center.lat, center.lng, radius, apiKey);
      }
    }

    // Keep the draft in the tour's own town. If we know the town name, prefer
    // results whose address names it, so a neighbouring town (Axminster's draft
    // pulling in Bridport) drops out. We only apply this when it still leaves a
    // usable set, so a sparse town is never left with nothing.
    if (area) {
      const town = area.toLowerCase();
      const sameTown = results.filter((r) => r.address.toLowerCase().includes(town));
      if (sameTown.length >= 3) results = sameTown;
    }

    if (results.length) {
      await trackOperator(user.id, 'landmarks_shown', {
        meta: { where, radiusMiles, found: results.length },
      });
    }

    return NextResponse.json({ results, center });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'upstream failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
