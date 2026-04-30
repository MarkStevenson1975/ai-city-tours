// "Curious about where you're standing?" endpoint.
//
// POST /api/whereami/<city>
// Body: { lat: number, lng: number, playedFactIds?: string[] }
// Response (200): { content: string, source: string, factId?: string }
//
// Tiered free-source lookup. No AI cost in the common case.
//
//   1. Cached narration for this grid square (Supabase cached_narrations)
//   2. Wikipedia geosearch within 30 m → article extract
//   3. Open Plaques within 30 m
//   4. Stitch (1)+(2) with a template; cache forever
//   5. Nearest unplayed curated fact with coords (within ~150 m)
//   6. First unplayed ambient (dialect/colour) fact
//   7. Template fallback referencing the nearest stop
//
// Tiers 1–4 are cached by city + grid square (4 dp ≈ 11 m).
// Tiers 5–7 are user-specific (depend on what they've already heard)
// and so are NOT cached server-side; the client tracks played IDs.

const SEARCH_RADIUS_M = 30;
const NEAR_FACT_RADIUS_M = 150;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city slug' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: 'Whereami service not configured' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { lat, lng, playedFactIds } = body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'lat/lng out of range' });
  }
  const played = Array.isArray(playedFactIds) ? playedFactIds : [];

  try {
    // ── Resolve the city row ───────────────────────────────
    const cityRow = await sbFetch(
      `${SUPABASE_URL}/rest/v1/cities?slug=eq.${encodeURIComponent(city)}` +
        `&select=id,name,published_config`,
      SUPABASE_KEY
    );
    if (!Array.isArray(cityRow) || cityRow.length === 0) {
      return res.status(404).json({ error: 'City not found' });
    }
    const cityId = cityRow[0].id;
    const cityName = cityRow[0].name;
    const publishedStops =
      (cityRow[0].published_config && cityRow[0].published_config.stops) || [];

    const gridLat = round4(lat);
    const gridLng = round4(lng);

    // ── Tier 1: cache lookup ───────────────────────────────
    const cached = await sbFetch(
      `${SUPABASE_URL}/rest/v1/cached_narrations` +
        `?city_id=eq.${cityId}` +
        `&grid_lat=eq.${gridLat}` +
        `&grid_lng=eq.${gridLng}` +
        `&select=content,source&limit=1`,
      SUPABASE_KEY
    );
    if (Array.isArray(cached) && cached.length > 0) {
      return res.status(200).json({
        content: cached[0].content,
        source: cached[0].source,
        cached: true,
      });
    }

    // ── Tier 2 + 3: structured public sources ──────────────
    const [wiki, plaques] = await Promise.all([
      fetchWikipediaNearby(lat, lng, SEARCH_RADIUS_M),
      fetchOpenPlaquesNearby(lat, lng, SEARCH_RADIUS_M),
    ]);

    // ── Tier 4: template stitch ────────────────────────────
    const stitched = stitchTemplate(wiki, plaques, cityName);
    if (stitched) {
      // Cache the structured narration forever for this grid square.
      // Failures here are non-fatal — we still return the content.
      await cacheNarration(SUPABASE_URL, SUPABASE_KEY, {
        cityId,
        gridLat,
        gridLng,
        content: stitched.content,
        source: stitched.source,
      }).catch(() => {});
      return res.status(200).json(stitched);
    }

    // ── Tier 5 + 6: curated facts (user-specific, not cached) ──
    const facts = await sbFetch(
      `${SUPABASE_URL}/rest/v1/location_facts` +
        `?city_id=eq.${cityId}` +
        `&select=id,text,lat,lng,priority,fact_type&order=priority.asc`,
      SUPABASE_KEY
    );

    if (Array.isArray(facts) && facts.length > 0) {
      const playedSet = new Set(played);
      const unplayed = facts.filter((f) => !playedSet.has(f.id));

      // Tier 5: nearest unplayed fact with coordinates within 150 m
      let nearest = null;
      let nearestDist = Infinity;
      for (const f of unplayed) {
        if (f.lat == null || f.lng == null) continue;
        const d = haversine(lat, lng, f.lat, f.lng);
        if (d < NEAR_FACT_RADIUS_M && d < nearestDist) {
          nearest = f;
          nearestDist = d;
        }
      }
      if (nearest) {
        return res.status(200).json({
          content: nearest.text,
          source: 'curated',
          factId: nearest.id,
        });
      }

      // Tier 6: first unplayed ambient (no-coords) fact
      const ambient = unplayed.find((f) => f.lat == null && f.lng == null);
      if (ambient) {
        return res.status(200).json({
          content: ambient.text,
          source: 'ambient',
          factId: ambient.id,
        });
      }
    }

    // ── Tier 7: nearest-stop template ──────────────────────
    const fallback = nearestStopFallback(lat, lng, publishedStops, cityName);
    return res.status(200).json(fallback);
  } catch (e) {
    console.error('whereami failed', e);
    return res.status(500).json({
      error: 'Whereami failed',
      message: e.message,
    });
  }
}

// ── Helpers ────────────────────────────────────────────────

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

async function sbFetch(url, key) {
  const r = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`Supabase ${r.status}: ${detail.slice(0, 200)}`);
  }
  return r.json();
}

async function cacheNarration(SUPABASE_URL, SUPABASE_KEY, row) {
  // Best-effort insert; caller catches errors.
  await fetch(`${SUPABASE_URL}/rest/v1/cached_narrations`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify({
      city_id: row.cityId,
      grid_lat: row.gridLat,
      grid_lng: row.gridLng,
      content: row.content,
      source: row.source,
    }),
  });
}

// Haversine distance in metres
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

// ── Wikipedia geosearch + extract ─────────────────────────
// Returns { title, extract, url } for the best nearby article, or null.
async function fetchWikipediaNearby(lat, lng, radius) {
  try {
    const geoUrl =
      `https://en.wikipedia.org/w/api.php?action=query&list=geosearch` +
      `&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=3&format=json&origin=*`;
    const r = await fetch(geoUrl, {
      headers: { 'User-Agent': 'AICityTours/1.0 (whereami)' },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const hits = j?.query?.geosearch || [];
    if (hits.length === 0) return null;

    // Closest hit (Wikipedia returns by distance ascending already)
    const best = hits[0];

    // Fetch a one-paragraph plain-text extract
    const extractUrl =
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts` +
      `&exintro=1&explaintext=1&exsentences=3` +
      `&titles=${encodeURIComponent(best.title)}&format=json&origin=*`;
    const er = await fetch(extractUrl, {
      headers: { 'User-Agent': 'AICityTours/1.0 (whereami)' },
    });
    if (!er.ok) return { title: best.title, extract: null };
    const ej = await er.json();
    const pages = ej?.query?.pages || {};
    const firstKey = Object.keys(pages)[0];
    const extract = pages[firstKey]?.extract || null;

    return {
      title: best.title,
      extract: extract ? cleanExtract(extract) : null,
      distance: Math.round(best.dist || 0),
    };
  } catch (e) {
    console.warn('Wikipedia lookup failed', e.message);
    return null;
  }
}

function cleanExtract(text) {
  // Trim, collapse whitespace, cap at ~300 chars on a sentence boundary.
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= 300) return t;
  const slice = t.slice(0, 300);
  const lastDot = slice.lastIndexOf('.');
  return lastDot > 100 ? slice.slice(0, lastDot + 1) : slice + '…';
}

// ── Open Plaques ──────────────────────────────────────────
// Returns { inscription, person?, title? } for the closest plaque, or null.
async function fetchOpenPlaquesNearby(lat, lng, radius) {
  try {
    // openplaques.org supports geo query via box parameters.
    // Convert radius to a small bounding box (~1 second of lat ≈ 31 m).
    const dLat = radius / 111000;
    const dLng = radius / (111000 * Math.cos((lat * Math.PI) / 180));
    const url =
      `https://openplaques.org/plaques.json` +
      `?box[]=${lat - dLat},${lng - dLng}` +
      `&box[]=${lat + dLat},${lng + dLng}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'AICityTours/1.0 (whereami)' },
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j) || j.length === 0) return null;

    // Pick the closest plaque inside the actual radius.
    let best = null;
    let bestDist = Infinity;
    for (const p of j) {
      if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number')
        continue;
      const d = haversine(lat, lng, p.latitude, p.longitude);
      if (d <= radius && d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    if (!best) return null;
    return {
      inscription: (best.inscription || '').trim() || null,
      title: best.title || null,
      distance: Math.round(bestDist),
    };
  } catch (e) {
    console.warn('Open Plaques lookup failed', e.message);
    return null;
  }
}

// ── Template stitch ───────────────────────────────────────
function stitchTemplate(wiki, plaques, cityName) {
  const parts = [];
  let source = '';

  if (wiki && wiki.title) {
    if (wiki.extract) {
      parts.push(`You're standing near ${wiki.title}. ${wiki.extract}`);
    } else {
      parts.push(`You're standing near ${wiki.title}.`);
    }
    source = 'wikipedia';
  }

  if (plaques && plaques.inscription) {
    if (parts.length > 0) {
      parts.push(
        `There's also a plaque close by which reads: ${plaques.inscription}`
      );
      source = 'mixed';
    } else {
      parts.push(`There's a plaque just here. It reads: ${plaques.inscription}`);
      source = 'plaques';
    }
  } else if (plaques && plaques.title && parts.length === 0) {
    parts.push(`There's a plaque just here marking ${plaques.title}.`);
    source = 'plaques';
  }

  if (parts.length === 0) return null;
  return { content: parts.join(' '), source };
}

// ── Nearest-stop fallback (no AI) ─────────────────────────
function nearestStopFallback(lat, lng, stops, cityName) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return {
      content:
        `You're somewhere in ${cityName}. I can't see anything specific from this exact spot — keep walking and I'll let you know when something interesting comes up.`,
      source: 'template',
    };
  }
  let nearest = stops[0];
  let nearestDist = Infinity;
  for (const s of stops) {
    if (!s.coordinates) continue;
    const d = haversine(lat, lng, s.coordinates.lat, s.coordinates.lng);
    if (d < nearestDist) {
      nearest = s;
      nearestDist = d;
    }
  }
  const distLabel =
    nearestDist < 1000
      ? `${Math.round(nearestDist)} metres`
      : `${(nearestDist / 1000).toFixed(1)} kilometres`;
  return {
    content:
      `I can't see anything specific from this exact spot, but you're about ${distLabel} from ${nearest.name}. Keep walking — there's good stuff coming up.`,
    source: 'template',
  };
}
