import type { MetadataRoute } from 'next';

// Served at https://app.storiedtours.co.uk/robots.txt
// Public entry pages (signup/login) are crawlable; the authenticated app,
// API and auth callbacks are kept out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/signup', '/login'],
        disallow: ['/dashboard', '/api', '/auth', '/reset-password', '/setup-password', '/forgot-password'],
      },
    ],
    sitemap: 'https://app.storiedtours.co.uk/sitemap.xml',
  };
}
