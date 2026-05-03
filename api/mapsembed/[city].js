// Google Maps Embed proxy.
//
// GET /api/mapsembed/<city>?dest=LAT,LNG
//
// Returns a 302 redirect to the Google Maps Embed API "place" URL,
// keeping the API key server-side (never exposed in page HTML).
// The iframe follows the redirect and renders an interactive Google Map
// centred on the destination stop.
//
// Requires GOOGLE_MAPS_API_KEY in Vercel env vars.
// The key must have the "Maps Embed API" enabled in Google Cloud Console
// (the same key used for Places Nearby Search may need this added).

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.query;
  if (!city || !/^[a-z0-9-]{1,40}$/.test(city)) {
    return res.status(400).send('Invalid city slug');
  }

  const { dest } = req.query;
  // dest must be LAT,LNG — two decimal numbers separated by a comma
  if (!dest || !/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(dest)) {
    return res.status(400).send('Invalid destination — expected lat,lng');
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).send('Maps Embed service not configured');
  }

  // Place mode: pins the destination on an interactive Google Map.
  // zoom=17 gives a good street-level view for a walking tour.
  const embedUrl =
    `https://www.google.com/maps/embed/v1/place` +
    `?key=${apiKey}` +
    `&q=${encodeURIComponent(dest)}` +
    `&zoom=17`;

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, embedUrl);
}
