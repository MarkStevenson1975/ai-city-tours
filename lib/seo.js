// lib/seo.js
// Pure, Edge-safe helpers that inject SEO metadata and crawlable content into
// the static tour shell (tour.html) at request time. No Node built-ins, so this
// runs inside Vercel Edge Middleware. Kept dependency-free and side-effect-free
// so it can be unit tested in isolation.

const SITE = 'https://tours.storiedtours.co.uk';
const APEX = 'https://storiedtours.co.uk';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

function firstSentence(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
}

export function isExample(slug) {
  return /^example-/.test(String(slug || ''));
}

function buildTitle(cfg) {
  const city = cfg.city || 'Your town';
  return `${city} Self-Guided Walking Tour | Free Audio Guide | StorieD`;
}

function buildDescription(cfg) {
  const city = cfg.city || 'your town';
  const stops = Array.isArray(cfg.stops) ? cfg.stops.length : 0;
  const guide = cfg.guideName || 'a local guide';
  return clip(
    `A free, self-guided audio tour of ${city}. ${stops} narrated stops, voiced by ${guide}. Scan a QR code and go, no app to download.`,
    160
  );
}

function heroImage(cfg) {
  if (cfg.splashImageUrl) return cfg.splashImageUrl;
  const s = Array.isArray(cfg.stops) ? cfg.stops[0] : null;
  return s && s.heroImageUrl ? s.heroImageUrl : '';
}

function jsonLd(cfg, slug) {
  const url = `${SITE}/${slug}`;
  const stops = Array.isArray(cfg.stops) ? cfg.stops : [];
  const image = heroImage(cfg);
  const items = stops.map((s, i) => {
    const item = {
      '@type': 'TouristAttraction',
      name: s.name || `Stop ${i + 1}`,
    };
    const desc = clip(s.shortDescription || firstSentence(s.narration), 300);
    if (desc) item.description = desc;
    if (s.coordinates && typeof s.coordinates.lat === 'number') {
      item.geo = {
        '@type': 'GeoCoordinates',
        latitude: s.coordinates.lat,
        longitude: s.coordinates.lng,
      };
    }
    return { '@type': 'ListItem', position: i + 1, item };
  });
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: `${cfg.city || 'Self-Guided'} Self-Guided Walking Tour`,
    description: buildDescription(cfg),
    url,
    touristType: 'Self-guided',
    provider: { '@type': 'Organization', name: 'StorieD', url: APEX },
    itinerary: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items,
    },
  };
  if (image) data.image = image;
  return JSON.stringify(data);
}

function headTags(cfg, slug) {
  const url = `${SITE}/${slug}`;
  const title = buildTitle(cfg);
  const desc = buildDescription(cfg);
  const image = heroImage(cfg);
  const robots = isExample(slug)
    ? '  <meta name="robots" content="noindex,follow">\n'
    : '';
  return (
    robots +
    `  <meta name="description" content="${esc(desc)}">\n` +
    `  <link rel="canonical" href="${esc(url)}">\n` +
    `  <meta property="og:type" content="website">\n` +
    `  <meta property="og:title" content="${esc(title)}">\n` +
    `  <meta property="og:description" content="${esc(desc)}">\n` +
    (image ? `  <meta property="og:image" content="${esc(image)}">\n` : '') +
    `  <meta property="og:url" content="${esc(url)}">\n` +
    `  <meta name="twitter:card" content="summary_large_image">\n` +
    `  <script type="application/ld+json">${jsonLd(cfg, slug)}</script>\n`
  );
}

function bodyContent(cfg) {
  const city = esc(cfg.city || 'this town');
  const stops = Array.isArray(cfg.stops) ? cfg.stops : [];
  const intro = esc(clip(cfg.splashIntro || '', 400));
  const items = stops
    .map((s) => {
      const nm = esc(s.name || '');
      const d = esc(clip(s.shortDescription || firstSentence(s.narration), 220));
      return `<li><h2>${nm}</h2><p>${d}</p></li>`;
    })
    .join('');
  // Placed in <noscript>: the interactive tour needs JavaScript, so this block
  // is only ever shown to crawlers and AI assistants that do not run scripts.
  // It never disrupts the visitor experience.
  return (
    `<noscript><div id="sd-seo">` +
    `<h1>${city} Self-Guided Walking Tour</h1>` +
    (intro ? `<p>${intro}</p>` : '') +
    `<p>A free, self-guided audio tour you follow on your own phone. ` +
    `Scan the QR code and go, no app to download. ` +
    `<a href="${APEX}">More about StorieD</a>.</p>` +
    `<ol>${items}</ol>` +
    `</div></noscript>`
  );
}

// Injects unique title, head metadata (description, canonical, Open Graph,
// JSON-LD) and a crawlable stop list into the static tour shell. Returns the
// original HTML unchanged if the config is missing or has no stops.
export function injectSeo(html, cfg, slug) {
  if (!html || !cfg || !Array.isArray(cfg.stops) || cfg.stops.length === 0) {
    return html;
  }
  let out = html;
  out = out.replace(
    '<title>Your StorieD tour</title>',
    `<title>${esc(buildTitle(cfg))}</title>`
  );
  // Tint the browser chrome (iOS status bar / address bar) to the operator's
  // primary colour, at the source, so it is correct on first paint. Doing it
  // here rather than in client JS avoids iOS Safari not reflecting a theme-color
  // changed after load. Falls through untouched if the colour is not a valid hex.
  const themeColor =
    typeof cfg.colorPrimary === 'string' && /^#[0-9A-Fa-f]{6}$/.test(cfg.colorPrimary)
      ? cfg.colorPrimary
      : null;
  if (themeColor) {
    out = out.replace(
      /<meta name="theme-color"[^>]*>/,
      `<meta name="theme-color" id="meta-theme-color" content="${themeColor}">`
    );
  }
  out = out.replace('</head>', headTags(cfg, slug) + '</head>');
  out = out.replace('<body>', '<body>' + bodyContent(cfg));
  return out;
}

// ── Discovery: dynamic sitemap + tours index ─────────────────────────────────
// Both build themselves from the live tours passed in, so a newly published
// tour is listed automatically with no manual step. Callers fail open to the
// static sitemap.xml / index.html if the tour list can't be fetched.

// Non-database URLs that should always be included (bespoke tours).
const EXTRA_SITEMAP_PATHS = ['/hereford-hunt/'];

// tours: array of { slug, name, publishedAt }
export function buildSitemap(tours) {
  const rows = [
    `  <url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`,
  ];
  for (const t of tours) {
    const lastmod = t.publishedAt ? String(t.publishedAt).slice(0, 10) : '';
    rows.push(
      `  <url><loc>${SITE}/${esc(t.slug)}</loc>` +
        (lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : '') +
        `<changefreq>weekly</changefreq><priority>0.9</priority></url>`
    );
  }
  for (const p of EXTRA_SITEMAP_PATHS) {
    rows.push(
      `  <url><loc>${SITE}${p}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`
    );
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    rows.join('\n') +
    `\n</urlset>\n`
  );
}

// tours: array of { slug, name }
export function buildIndex(tours) {
  const cards = tours
    .map(
      (t) =>
        `      <a class="card" href="/${esc(t.slug)}"><h2>${esc(t.name || t.slug)}</h2><span class="go">Open the tour &rarr;</span></a>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StorieD Tours | Free Self-Guided Audio Tours You Follow on Your Phone</title>
  <meta name="description" content="Browse the live StorieD tours. Free, self-guided audio tours you follow on your own phone, no app to download.">
  <link rel="canonical" href="${SITE}/">
  <meta property="og:title" content="StorieD Tours | Free self-guided audio tours">
  <meta property="og:description" content="Browse the live StorieD tours. Free, self-guided audio tours you follow on your own phone.">
  <meta property="og:url" content="${SITE}/">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
  <style>
    :root{--green:#06402B;--gold:#C9A84C;--cream:#F5F0E8;--ink:#1f2723;--muted:#5c665f;--line:#e4ddcf}
    *{box-sizing:border-box}
    body{margin:0;background:var(--cream);color:var(--ink);font-family:'Lato',system-ui,sans-serif;line-height:1.6}
    .wrap{max-width:820px;margin:0 auto;padding:48px 22px 72px}
    .logo{font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-weight:600;color:var(--green);margin-bottom:28px;text-decoration:none;display:inline-block}
    .logo span{color:var(--gold)}
    h1{font-family:'Cormorant Garamond',Georgia,serif;color:var(--green);font-size:2.6rem;font-weight:600;line-height:1.1;margin:0 0 10px}
    .sub{color:var(--muted);font-size:1.02rem;margin:0 0 34px;max-width:620px}
    .grid{display:grid;grid-template-columns:1fr;gap:14px}
    @media(min-width:640px){.grid{grid-template-columns:1fr 1fr}}
    .card{display:block;background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px 22px;text-decoration:none;color:inherit;transition:box-shadow .15s,transform .15s}
    .card:hover{box-shadow:0 8px 26px rgba(6,64,43,.12);transform:translateY(-2px)}
    .card h2{font-family:'Cormorant Garamond',serif;color:var(--green);font-size:1.5rem;font-weight:600;margin:0}
    .card .go{color:#a4842c;font-weight:700;font-size:.92rem}
    footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
    footer a{color:#a4842c}
  </style>
</head>
<body>
<div class="wrap">
  <a href="${APEX}" class="logo">Storie<span>D</span></a>
  <h1>Live StorieD tours</h1>
  <p class="sub">Free, self-guided audio tours you follow on your own phone. Open any one below, or scan its QR code on the street. No app to download, no account, no cost.</p>
  <div class="grid">
${cards}
  </div>
  <footer>
    StorieD builds fully narrated, self-guided tours for towns, venues and events.
    <a href="${APEX}">Find out more, or build your own &rarr;</a>
  </footer>
</div>
</body>
</html>
`;
}
