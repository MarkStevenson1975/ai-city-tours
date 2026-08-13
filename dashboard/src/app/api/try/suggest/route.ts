// POST /api/try/suggest  (PUBLIC, no auth)
// Body: { area: string }
// Lists a handful of genuine local landmarks for the demo "try it" flow, so a
// cold-email prospect can pick one to build. No account required.
import { NextRequest, NextResponse } from 'next/server';
import { discoverLandmarks, geocodeCandidates, coordsForPlaceId } from '@/lib/places';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Search is not configured.' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const area = String(body.area ?? '').trim();
  const placeId = body.placeId ? String(body.placeId) : '';
  if (!area || area.length > 80) {
    return NextResponse.json({ error: 'Enter your town or city.' }, { status: 400 });
  }

  try {
    // Resolve the town centre. If the name matches more than one GB town, hand
    // the choices back so the user can pick the right one. Once they have picked
    // (placeId supplied), or the name is unambiguous, we search that exact town.
    let coords: { lat: number; lng: number } | null = null;
    if (placeId) {
      coords = await coordsForPlaceId(placeId, apiKey);
    } else {
      const candidates = await geocodeCandidates(area, apiKey);
      if (candidates.length > 1) {
        return NextResponse.json({ candidates });
      }
      if (candidates.length === 1) coords = await coordsForPlaceId(candidates[0].placeId, apiKey);
    }

    // Same discovery the dashboard uses: relevance-led, central, town-bounded.
    const { center, results } = await discoverLandmarks(area, apiKey, coords ?? undefined);
    if (center.lat === null || center.lng === null) {
      return NextResponse.json(
        { error: 'We could not find that place. Check the spelling and try again.' },
        { status: 404 }
      );
    }
    if (results.length === 0) {
      return NextResponse.json(
        { error: 'We could not find well-known landmarks there just yet. Try a nearby town.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ landmarks: results.slice(0, 6) });
  } catch (e) {
    console.error('try/suggest error:', e);
    return NextResponse.json(
      { error: 'Search is having a quiet moment. Please try again shortly.' },
      { status: 502 }
    );
  }
}
