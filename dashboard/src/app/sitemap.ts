import type { MetadataRoute } from 'next';

// Served at https://app.storiedtours.co.uk/sitemap.xml
// Only the public-facing entry pages; the authenticated app is not indexed.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://app.storiedtours.co.uk';
  return [
    { url: `${base}/signup`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/login`, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
