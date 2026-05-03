// Google Maps Embed proxy.
//
// GET /api/mapsembed/<city>?origin=LAT,LNG&dest=LAT,LNG
//
// When both origin and dest are supplied, returns a 302 redirect to the
// Google Maps Embed API "directions" URL in walking mode — renders a full
// walking route inside the iframe with no further user interaction needed.
//
// If only dest is supplied (fallback), uses "place" mode instead.
//
// The API key stays server-side and is never exposed in page HTML.
// Requires GOOGLE_MAPS_API_KEY in Vercel env vars with both
// "Maps Embed API" and "Places API" enabled in Google Cloud Console.

const COORD_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city, origin, dest } = req.query;

  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).send('Invalid city slug');
  }
  if (!dest || !COORD_RE.test(dest)) {
    return res.status(400).send('Invalid destination — expected lat,lng');
  }
  if (origin && !COORD_RE.test(origin)) {
    return res.status(400).send('Invalid origin — expected lat,lng');
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).send('Maps Embed service not configured');
  }

  let embedUrl;
  if (origin) {
    // Directions mode: draws a walking route from origin to destination
    embedUrl =
      `https://www.google.com/maps/embed/v1/directions` +
      `?key=${apiKey}` +
      `&origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(dest)}` +
      `&mode=walking`;
  } else {
    // Fallback: place mode centred on destination
    embedUrl =
      `https://www.google.com/maps/embed/v1/place` +
      `?key=${apiKey}` +
      `&q=${encodeURIComponent(dest)}` +
      `&zoom=17`;
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, embedUrl);
}
