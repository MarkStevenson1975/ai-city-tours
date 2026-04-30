// "Find me something nearby" — Google Places Nearby Search proxy.
//
// POST /api/findnearby/<city>
// Body: { lat: number, lng: number, query: string }
//   query is one of: 'eat' | 'drink' | 'coffee' | 'explore' | 'sit' | 'photo'
//                   | a free-text search term
//
// Response (200): { results: [{ name, address, distance, rating, lat, lng,
//                                place_id, open_now }] }
//
// Calls the Google Places Nearby Search API server-side using
// GOOGLE_MAPS_API_KEY (set in Vercel env vars). The key never
// reaches the browser — same security pattern as the other proxies.
//
// Cost note: Google gives $200 free credit per month, equating to
// ~6,000 Nearby Search calls. Realistic usage for one city sits
// comfortably inside that.

const SEARCH_RADIUS_M = 800;
const MAX_RESULTS = 5;

// Map our chip names to Google place types + optional keyword.
// Each entry can produce one or more searches that we merge.
const CHIP_QUERIES = {
  eat:     [{ type: 'restaurant' }],
  drink:   [{ type: 'bar' }, { type: 'cafe' }],
  coffee:  [{ type: 'cafe', keyword: 'coffee' }],
  explore: [{ type: 'tourist_attraction' }, { type: 'museum' }],
  sit:     [{ type: 'park' }, { type: 'cafe' }],
  // No "photo spot" type in Google — we combine photogenic categories
  // with viewpoint-leaning keywords.
  photo:   [
    { type: 'tourist_attraction', keyword: 'viewpoint' },
    { type: 'park' },
  ],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res
      .status(503)
      .json({ error: 'Find-nearby service not configured' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { lat, lng, query } = body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }
  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  const queryKey = query.trim().toLowerCase();
  const searches = CHIP_QUERIES[queryKey] || [{ keyword: query.trim() }];

  try {
    // Run all sub-searches in parallel and merge the results, deduping by place_id.
    const responses = await Promise.all(
      searches.map((s) =>
        fetchGooglePlaces({ apiKey, lat, lng, radius: SEARCH_RADIUS_M, ...s })
      )
    );

    // Dedupe by place_id, then sort by distance, take top N.
    const seen = new Map();
    for (const list of responses) {
      for (const r of list) {
        if (!seen.has(r.place_id)) seen.set(r.place_id, r);
      }
    }
    const merged = Array.from(seen.values())
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_RESULTS);

    return res.status(200).json({ results: merged });
  } catch (e) {
    console.error('findnearby failed', e);
    return res.status(502).json({
      error: 'Find-nearby upstream failed',
      message: e.message,
    });
  }
}

// ── Helpers ────────────────────────────────────────────────

async function fetchGooglePlaces({ apiKey, lat, lng, radius, type, keyword }) {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radius),
    key: apiKey,
  });
  if (type) params.set('type', type);
  if (keyword) params.set('keyword', keyword);

  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`Places HTTP ${r.status}: ${detail.slice(0, 200)}`);
  }
  const j = await r.json();
  if (j.status && j.status !== 'OK' && j.status !== 'ZERO_RESULTS') {
    throw new Error(`Places status ${j.status}: ${j.error_message || ''}`);
  }
  const list = Array.isArray(j.results) ? j.results : [];

  // Map Google's verbose response to a small client-friendly shape.
  return list
    .filter((p) => p.geometry && p.geometry.location && p.business_status !== 'CLOSED_PERMANENTLY')
    .map((p) => {
      const placeLat = p.geometry.location.lat;
      const placeLng = p.geometry.location.lng;
      return {
        place_id:  p.place_id,
        name:      p.name,
        address:   p.vicinity || '',
        rating:    typeof p.rating === 'number' ? p.rating : null,
        distance:  Math.round(haversine(lat, lng, placeLat, placeLng)),
        lat:       placeLat,
        lng:       placeLng,
        open_now:  p.opening_hours ? !!p.opening_hours.open_now : null,
        types:     p.types || [],
      };
    });
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
