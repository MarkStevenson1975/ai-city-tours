// middleware.js
// Server-side SEO for published tours, without adding a serverless function
// (the project sits at the Vercel Hobby function cap). Runs on the Edge:
// fetches the tour's published config and injects title, description, canonical,
// Open Graph and JSON-LD, plus crawlable stop content, into the static shell
// before any JavaScript runs.
//
// FAIL-OPEN by design: any error, missing config, or unpublished tour returns
// nothing, so Vercel serves the normal client-rendered tour exactly as before.
// This middleware can never take a tour offline; the worst case is that a page
// simply keeps the old (invisible-to-search) behaviour.
import { injectSeo } from './lib/seo.js';

export const config = {
  // Run only on bare, single-segment paths (the tour slugs). Skip the API,
  // framework internals, the shell route itself (/tour) and anything with a dot
  // (assets, tour.html, robots.txt) so we never intercept our own shell fetch
  // and never recurse.
  matcher: ['/((?!api/|_next/|tour$|.*\\.).*)'],
};

const SLUG = /^[a-z0-9-]{1,60}$/;

export default async function middleware(request) {
  try {
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const slug = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!slug || !SLUG.test(slug)) return;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !KEY) return;

    // Published config is public tour data. Only render for live tours.
    const api =
      `${SUPABASE_URL}/rest/v1/cities` +
      `?slug=eq.${encodeURIComponent(slug)}` +
      `&select=published_config,published_at,unpublished_at,deleted_at`;
    const r = await fetch(api, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Accept: 'application/json',
      },
    });
    if (!r.ok) return;
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !row.published_config || row.deleted_at || row.unpublished_at) {
      return;
    }
    const cfg = row.published_config;
    if (!Array.isArray(cfg.stops) || cfg.stops.length === 0) return;

    // Fetch the static shell. The matcher excludes dotted paths and /tour, so
    // this request is not intercepted here (no recursion).
    const shell = await fetch(new URL('/tour.html', url.origin));
    if (!shell.ok) return;
    const html = await shell.text();

    const rendered = injectSeo(html, cfg, slug);

    return new Response(rendered, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400',
        'x-sd-seo': '1',
      },
    });
  } catch (e) {
    return; // fail-open: serve the normal tour
  }
}
