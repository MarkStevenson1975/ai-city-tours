// POST /api/places/suggest
// Body: { postcode: string, radiusMiles?: number }  (or { area } as fallback)
//
// Finds genuine visitor sites for a town's first draft. Delegates to the shared
// discoverLandmarks (lib/places), which leads with a relevance text search
// ("places of interest in <town>"), adds a nearby-by-type search for coverage,
// keeps results within the town by distance, ranks them central first, and caps
// any one category. The demo endpoint (/api/try/suggest) uses the very same
// function, so the operator flow and the demo can never drift apart.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackOperator } from '@/lib/track-operator';
import { discoverLandmarks, geocodeCandidates, coordsForPlaceId } from '@/lib/places';

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
  const placeId = body.placeId ? String(body.placeId) : '';
  const radiusMiles = Number(body.radiusMiles) > 0 ? Number(body.radiusMiles) : 3;
  const radiusMetres = Math.min(Math.round(radiusMiles * 1609), 50000);

  const where = postcode || area;
  if (!where) {
    return NextResponse.json({ error: 'Enter a postcode or area first.' }, { status: 400 });
  }

  try {
    // Disambiguate a town NAME the same way the demo does (a postcode is already
    // specific, so it skips this). If more than one GB town matches, hand back
    // the choices; once picked (placeId), or unambiguous, search that town.
    let coords: { lat: number; lng: number } | null = null;
    if (placeId) {
      coords = await coordsForPlaceId(placeId, apiKey);
    } else if (!postcode && area) {
      const candidates = await geocodeCandidates(area, apiKey);
      if (candidates.length > 1) {
        return NextResponse.json({ candidates });
      }
      if (candidates.length === 1) coords = await coordsForPlaceId(candidates[0].placeId, apiKey);
    }

    const { center, results } = await discoverLandmarks(where, apiKey, {
      radiusMetres,
      ...(coords ?? {}),
    });

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

    // Map to the shape the build wizard expects (place_id, not placeId).
    const mapped = results.map((r) => ({
      place_id: r.placeId,
      name: r.name,
      address: r.address,
      rating: r.rating,
      lat: r.lat,
      lng: r.lng,
      category: r.category,
      photoRef: r.photoRef,
    }));

    if (mapped.length) {
      await trackOperator(user.id, 'landmarks_shown', {
        meta: { where, radiusMiles, found: mapped.length },
      });
    }

    return NextResponse.json({ results: mapped, center: { lat: center.lat, lng: center.lng, status: center.status } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'upstream failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
