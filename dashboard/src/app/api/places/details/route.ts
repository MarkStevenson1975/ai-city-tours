// POST /api/places/details
// Body: { placeIds: string[] }
// Enriches Google place_ids (from the map picker) into the same Suggestion
// shape the postcode list produces, so map picks flow through the identical
// draft + save pipeline, including the photo. Uses GOOGLE_MAPS_API_KEY (server).
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

async function details(placeId: string, apiKey: string): Promise<Suggestion | null> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'name,geometry,photos,types,formatted_address,rating',
    key: apiKey,
  });
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  const j = await r.json();
  const res = j?.result;
  if (!res?.geometry?.location) return null;
  return {
    place_id: placeId,
    name: String(res.name ?? ''),
    address: String(res.formatted_address ?? ''),
    rating: typeof res.rating === 'number' ? res.rating : null,
    lat: res.geometry.location.lat as number,
    lng: res.geometry.location.lng as number,
    category: categoryFor(res.types ?? []),
    photoRef: res.photos?.[0]?.photo_reference ?? null,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Place lookup is not configured.' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const placeIds: string[] = Array.isArray(body.placeIds)
    ? body.placeIds.map((x: unknown) => String(x)).filter(Boolean).slice(0, 5)
    : [];
  if (!placeIds.length) {
    return NextResponse.json({ error: 'No places selected.' }, { status: 400 });
  }

  try {
    const results = await Promise.all(placeIds.map((id) => details(id, apiKey)));
    return NextResponse.json({ results: results.filter(Boolean) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'upstream failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
