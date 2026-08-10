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
  out = out.replace('</head>', headTags(cfg, slug) + '</head>');
  out = out.replace('<body>', '<body>' + bodyContent(cfg));
  return out;
}
