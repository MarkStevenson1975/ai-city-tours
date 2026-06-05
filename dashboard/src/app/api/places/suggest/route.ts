// POST /api/places/suggest
// Body: { postcode: string, radiusMiles?: number }  (or { area } as fallback)
// Geocodes the postcode, then finds tourist sites within the given radius
// using Google Places Nearby Search. Returns selectable sites with a photo
// reference so the save step can pull an image. Uses GOOGLE_MAPS_API_KEY.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

const TYPES = ['tourist_attraction', 'museum', 'art_gallery', 'church', 'place_of_worship', 'park'];

// Drop anything that is really a business rather than a visitor site, even if
// Google tagged it with a tourist type as well.
const EXCLUDE_TYPES = new Set([
  'restaurant', 'cafe', 'bar', 'meal_takeaway', 'meal_delivery', 'food',
  'bakery', 'store', 'supermarket', 'grocery_or_supermarket', 'shopping_mall',
  'clothing_store', 'home_goods_store', 'furniture_store', 'hardware_store',
  'funeral_home', 'cemetery', 'lodging', 'bank', 'finance', 'atm',
  'real_estate_agency', 'insurance_agency', 'lawyer', 'accounting',
  'doctor', 'dentist', 'hospital', 'pharmacy', 'veterinary_care',
  'car_dealer', 'car_repair', 'car_rental', 'gas_station',
  'gym', 'hair_care', 'beauty_salon', 'spa', 'night_club', 'liquor_store',
]);

const CATEGORY_LABEL: Record<string, string> = {
  tourist_attraction: 'Landmark',
  museum: 'Museum',
  church: 'Church',
  place_of_worship: 'Church',
  park: 'Park',
  art_gallery: 'Gallery',
  point_of_interest: 'Place',
};

function categoryFor(types: string[]): string {
  for (const t of types) if (CATEGORY_LABEL[t]) return CATEGORY_LABEL[t];
  return 'Place';
}

// Resolve a postcode/area to coordinates. Uses the Places Text Search API
// (the same API the tour app already relies on) rather than the separate
// Geocoding API, which may not be enabled on the key. Returns coordinates or
// a status string for diagnostics.
async function geocode(query: string, apiKey: string) {
  const params = new URLSearchParams({
    query: `${query}, UK`,
    region: 'gb',
    key: apiKey,
  });
  const r = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
  );
  const j = await r.json();
  const loc = j?.results?.[0]?.geometry?.location;
  if (loc) return { lat: loc.lat as number, lng: loc.lng as number, status: 'OK' };
  return { lat: null, lng: null, status: (j?.status as string) || 'UNKNOWN' };
}

async function nearby(lat: number, lng: number, radius: number, type: string, apiKey: string) {
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
        {
          error: `Could not find that postcode or area${detail}. Check it and try again.`,
        },
        { status: 404 }
      );
    }

    const lists = await Promise.all(TYPES.map((t) => nearby(center.lat!, center.lng!, radius, t, apiKey)));

    const seen = new Map<string, Suggestion>();
    for (const list of lists) {
      for (const p of list) {
        if (!p.geometry?.location || p.business_status === 'CLOSED_PERMANENTLY') continue;
        if (seen.has(p.place_id)) continue;
        // Skip businesses (cafes, funeral directors, shops, etc.).
        const ptypes: string[] = p.types ?? [];
        if (ptypes.some((t) => EXCLUDE_TYPES.has(t))) continue;
        seen.set(p.place_id, {
          place_id: p.place_id,
          name: p.name,
          address: p.vicinity ?? '',
          rating: typeof p.rating === 'number' ? p.rating : null,
          lat: p.geometry.location.lat,
          lng: p.geometry.location.lng,
          category: categoryFor(p.types ?? []),
          photoRef: p.photos?.[0]?.photo_reference ?? null,
        });
      }
    }

    const results = Array.from(seen.values())
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 15);

    return NextResponse.json({ results, center });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'upstream failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
