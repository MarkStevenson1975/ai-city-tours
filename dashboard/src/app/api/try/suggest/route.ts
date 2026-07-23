// POST /api/try/suggest  (PUBLIC, no auth)
// Body: { area: string }
// Lists a handful of genuine local landmarks for the demo "try it" flow, so a
// cold-email prospect can pick one to build. No account required.
import { NextRequest, NextResponse } from 'next/server';
import { geocode, nearbyLandmarks } from '@/lib/places';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Search is not configured.' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const area = String(body.area ?? '').trim();
  if (!area || area.length > 80) {
    return NextResponse.json({ error: 'Enter your town or city.' }, { status: 400 });
  }

  try {
    const center = await geocode(area, apiKey);
    if (center.lat === null || center.lng === null) {
      return NextResponse.json(
        { error: 'We could not find that place. Check the spelling and try again.' },
        { status: 404 }
      );
    }
    const landmarks = await nearbyLandmarks(center.lat, center.lng, 4800, apiKey);
    if (landmarks.length === 0) {
      return NextResponse.json(
        { error: 'We could not find well-known landmarks there just yet. Try a nearby town.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ landmarks: landmarks.slice(0, 6) });
  } catch (e) {
    console.error('try/suggest error:', e);
    return NextResponse.json(
      { error: 'Search is having a quiet moment. Please try again shortly.' },
      { status: 502 }
    );
  }
}
