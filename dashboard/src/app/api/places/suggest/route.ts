// POST /api/places/suggest
// Body: { area: string }  e.g. "Hereford, Herefordshire"
// Returns the main tourist sites for that area using Google Places Text
// Search, ready for the operator to tick. Uses GOOGLE_MAPS_API_KEY (server
// only, same key as the public tour app). Add it to this Vercel project.
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
};

const CATEGORY_LABEL: Record<string, string> = {
  tourist_attraction: 'Landmark',
  museum: 'Museum',
  church: 'Church',
  place_of_worship: 'Church',
  park: 'Park',
  art_gallery: 'Gallery',
  city_hall: 'Landmark',
  point_of_interest: 'Place',
};

function categoryFor(types: string[]): string {
  for (const t of types) if (CATEGORY_LABEL[t]) return CATEGORY_LABEL[t];
  return 'Place';
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Place search is not configured (GOOGLE_MAPS_API_KEY).' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const area = String(body.area ?? '').trim();
  if (!area) {
    return NextResponse.json({ error: 'Tell us the town or area first.' }, { status: 400 });
  }

  const params = new URLSearchParams({
    query: `top tourist attractions and landmarks in ${area}`,
    key: apiKey,
  });
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;

  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j.status && j.status !== 'OK' && j.status !== 'ZERO_RESULTS') {
      return NextResponse.json(
        { error: `Place search failed: ${j.status}` },
        { status: 502 }
      );
    }

    const results: Suggestion[] = (Array.isArray(j.results) ? j.results : [])
      .filter((p: { geometry?: { location?: unknown }; business_status?: string }) =>
        p.geometry && p.geometry.location && p.business_status !== 'CLOSED_PERMANENTLY')
      .slice(0, 12)
      .map((p: {
        place_id: string;
        name: string;
        formatted_address?: string;
        rating?: number;
        geometry: { location: { lat: number; lng: number } };
        types?: string[];
      }) => ({
        place_id: p.place_id,
        name: p.name,
        address: p.formatted_address ?? '',
        rating: typeof p.rating === 'number' ? p.rating : null,
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
        category: categoryFor(p.types ?? []),
      }));

    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'upstream failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
