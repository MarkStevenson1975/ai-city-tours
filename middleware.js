// middleware.js
// Server-side SEO for the tours site, on the Edge (no serverless function, so it
// does not touch the Vercel Hobby function cap). Three jobs:
//   1. /sitemap.xml  → a sitemap built from the live tours (self-updating)
//   2. /             → a tours index built from the live tours (self-updating)
//   3. /:slug        → inject title, meta, Open Graph, JSON-LD and crawlable
//                      stop content into the static tour shell
//
// FAIL-OPEN by design: any error or empty result returns nothing, so Vercel
// serves the normal static file (the static sitemap.xml, the static index.html,
// or the client-rendered tour) exactly as before. It cannot break a live tour.
import { injectSeo, buildSitemap, buildIndex } from './lib/seo.js';

export const config = {
  // Bare, single-segment paths (tour slugs) and the root, plus the sitemap.
  // Dotted paths (assets, tour.html), the API and framework internals are
  // excluded so we never intercept our own shell fetch.
  matcher: ['/((?!api/|_next/|tour$|.*\\.).*)', '/sitemap.xml'],
};

const SLUG = /^[a-z0-9-]{1,60}$/;

async function supa(path) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !KEY) return null;
  const r = await fetch(SUPABASE_URL + path, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
  });
  if (!r.ok) return null;
  return r.json();
}

// Live, non-example tours for the sitemap and index. Returns [] on any problem
// so callers fail open to the static files.
async function liveTours() {
  try {
    const rows = await supa(
      '/rest/v1/cities?published_at=not.is.null&unpublished_at=is.null&deleted_at=is.null' +
        '&select=slug,published_at,city:published_config->>city&order=published_at.desc'
    );
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r.slug && !/^example-/.test(r.slug))
      .map((r) => ({ slug: r.slug, name: r.city || r.slug, publishedAt: r.published_at }));
  } catch {
    return [];
  }
}

function send(body, type, sMaxAge, tag) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=86400`,
      'x-sd-seo': tag,
    },
  });
}

export default async function middleware(request) {
  try {
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Self-updating sitemap.
    if (path === '/sitemap.xml') {
      const tours = await liveTours();
      if (tours.length) return send(buildSitemap(tours), 'application/xml; charset=utf-8', 3600, 'sitemap');
      return; // fail open to the static sitemap.xml
    }

    // 2. Self-updating tours index.
    if (path === '/' || path === '') {
      const tours = await liveTours();
      if (tours.length) return send(buildIndex(tours), 'text/html; charset=utf-8', 600, 'index');
      return; // fail open to the static index.html
    }

    // 3. Individual tour: inject SEO into the shell.
    const slug = path.replace(/^\/+|\/+$/g, '');
    if (!slug || !SLUG.test(slug)) return;

    const rows = await supa(
      `/rest/v1/cities?slug=eq.${encodeURIComponent(slug)}` +
        `&select=published_config,published_at,unpublished_at,deleted_at`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !row.published_config || row.deleted_at || row.unpublished_at) return;
    const cfg = row.published_config;
    if (!Array.isArray(cfg.stops) || cfg.stops.length === 0) return;

    const shell = await fetch(new URL('/tour.html', url.origin));
    if (!shell.ok) return;
    const html = await shell.text();

    return send(injectSeo(html, cfg, slug), 'text/html; charset=utf-8', 300, '1');
  } catch (e) {
    return; // fail-open: serve the normal static asset / tour
  }
}
