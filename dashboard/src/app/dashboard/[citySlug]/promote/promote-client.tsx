'use client';

// Promote tab UI. Renders a branded A4 poster (download as print-ready PDF or
// high-res PNG) and three lift-and-drop social posts drafted in the Storied
// voice. All images in the poster are inlined as data URIs by the server, so
// rasterising to PNG never taints the canvas.
import { useEffect, useMemo, useState } from 'react';

type Props = {
  citySlug: string;
  cityName: string;
  operatorName: string;
  attribution: string;
  logoDataUrl: string | null;
  qrDataUrl: string;
  stopImageDataUrl: string | null;
  liveUrl: string;
  colorPrimary: string;
  colorAccent: string;
  colorBackground: string;
};

type Posts = { facebook: string; instagram: string; linkedin: string };

const A4_W = 2480; // 210mm at 300dpi
const A4_H = 3508; // 297mm at 300dpi

// Social image dimensions per platform (pixels).
const SOCIAL_FORMATS: {
  key: keyof Posts;
  label: string;
  w: number;
  h: number;
  dims: string;
}[] = [
  { key: 'facebook', label: 'Facebook', w: 1200, h: 630, dims: '1200 x 630' },
  { key: 'instagram', label: 'Instagram', w: 1080, h: 1080, dims: '1080 x 1080' },
  { key: 'linkedin', label: 'LinkedIn', w: 1200, h: 627, dims: '1200 x 627' },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Word-wrap a string into lines no longer than maxChars, so long attribution
// text is fully captured on the poster / social image instead of being clipped.
function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function buildPosterSvg(p: Props): string {
  const cream = p.colorBackground;
  const forest = p.colorPrimary;
  const accent = p.colorAccent;
  const headline = `${p.cityName} has a story.`;
  // Shrink the headline if the town name makes it long, so it always fits.
  const headSize = Math.max(20, Math.min(30, Math.floor(360 / (headline.length * 0.52))));
  const rawAttr = (p.attribution || '').trim();
  // Strip a leading "brought to you by" from the text so it is not repeated:
  // the "BROUGHT TO YOU BY" label is printed above the logo instead.
  const attr = rawAttr.replace(/^brought to you by[\s,:-]*/i, '').trim().toUpperCase();
  const hasLogo = Boolean(p.logoDataUrl);
  const showCredit = Boolean(rawAttr) || hasLogo;
  const attrSize = 11;
  const attrLineH = 14;
  const attrLines = attr ? wrapWords(attr, 44) : [];
  const n = attrLines.length;

  // Larger logo (50% up on the old 160x44).
  const logoW = 240;
  const logoH = 66;

  // Bottom credit stack (top to bottom): "BROUGHT TO YOU BY" label, then the
  // logo, then the attribution lines. Anchored to the bottom, grown upward.
  const attrFirstY = 574 - (n > 0 ? (n - 1) * attrLineH : 0);
  const logoBottom = n > 0 ? attrFirstY - 20 : 574;
  const logoTop = logoBottom - logoH;
  const eyebrowY = hasLogo ? logoTop - 12 : (n > 0 ? attrFirstY - 20 : 574);

  // Scan text and the divider sit above the credit. The divider is centred
  // between the scan line and the "BROUGHT TO YOU BY" label.
  const scanY = 410;
  const dividerY = showCredit ? Math.round((scanY + eyebrowY) / 2) : scanY + 34;

  const logoBlock = hasLogo
    ? `<image href="${p.logoDataUrl}" x="${210 - logoW / 2}" y="${logoTop}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet"/>`
    : '';
  const eyebrowBlock = showCredit
    ? `<text x="210" y="${eyebrowY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10" letter-spacing="2" fill="${cream}" opacity="0.75">BROUGHT TO YOU BY</text>`
    : '';
  const attrBlock = attrLines
    .map((ln, i) => `<text x="210" y="${attrFirstY + i * attrLineH}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${attrSize}" letter-spacing="1" font-weight="bold" fill="${cream}">${escapeXml(ln)}</text>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 420 594" role="img" aria-label="Poster for the ${escapeXml(p.cityName)} tour">
<rect x="0" y="0" width="420" height="594" fill="${forest}"/>
<rect x="10" y="10" width="400" height="574" rx="6" fill="none" stroke="${accent}" stroke-width="0.5" opacity="0.45"/>
<text x="210" y="60" text-anchor="middle" font-family="Georgia, serif" font-size="26" font-weight="600" fill="${cream}">Storie<tspan fill="${accent}">D</tspan></text>
<line x1="178" y1="76" x2="242" y2="76" stroke="${accent}" stroke-width="1"/>
<text x="210" y="${124}" text-anchor="middle" font-family="Georgia, serif" font-size="${headSize}" fill="${cream}">${escapeXml(headline)}</text>
<text x="210" y="${124 + headSize + 8}" text-anchor="middle" font-family="Georgia, serif" font-size="${headSize}" fill="${cream}">Take the walk.</text>
<text x="210" y="200" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="${cream}">A free guided walking tour, straight to your phone.</text>
<text x="210" y="218" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="${cream}">No app to download. Just scan and go.</text>
<rect x="135" y="238" width="150" height="150" rx="8" fill="#ffffff"/>
<image href="${p.qrDataUrl}" x="147" y="250" width="126" height="126"/>
<text x="210" y="${scanY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="bold" fill="${accent}">Scan to start walking</text>
<line x1="120" y1="${dividerY}" x2="300" y2="${dividerY}" stroke="${accent}" stroke-width="0.5" opacity="0.5"/>
${logoBlock}
${eyebrowBlock}
${attrBlock}
</svg>`;
}

// Branded social image over a stop photo. Adapts to any width/height (square
// or landscape). The headline shrinks to fit. Used for Facebook, Instagram and
// LinkedIn. The A4 poster is built separately by buildPosterSvg and unaffected.
function buildSocialSvg(p: Props, width: number, height: number): string {
  const cream = p.colorBackground;
  const forest = p.colorPrimary;
  const accent = p.colorAccent;
  const cx = width / 2;
  const pad = width * 0.06;
  const usable = width - pad * 2;

  const headline = `${p.cityName} has a story.`;
  let hSize = Math.round(height * 0.075);
  const est = headline.length * hSize * 0.52;
  if (est > usable) hSize = Math.max(18, Math.floor(usable / (headline.length * 0.52)));

  const wordY = Math.round(height * 0.14);
  const head1Y = Math.round(height * 0.34);
  const head2Y = head1Y + Math.round(hSize * 1.15);
  const qrSize = Math.round(height * 0.26);
  const qrX = Math.round(cx - qrSize / 2);
  const qrY = Math.round(height * 0.52);
  const scanY = qrY + qrSize + Math.round(height * 0.07);
  const attrY = Math.round(height * 0.94);

  // Wrap the attribution so the full text shows on the social image too.
  const attrS = (p.attribution || '').trim().toUpperCase();
  const attrFont = Math.round(height * 0.026);
  const attrMaxChars = Math.max(12, Math.floor(usable / (attrFont * 0.62)));
  const attrLines = attrS ? wrapWords(attrS, attrMaxChars) : [];
  const attrLineH = Math.round(attrFont * 1.25);
  const attrFirstY = attrY - Math.max(0, attrLines.length - 1) * attrLineH;
  const attrBlock = attrLines
    .map((ln, i) => `<text x="${cx}" y="${attrFirstY + i * attrLineH}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${attrFont}" letter-spacing="1" fill="${cream}">${escapeXml(ln)}</text>`)
    .join('');

  const bg = p.stopImageDataUrl
    ? `<image href="${p.stopImageDataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
<rect x="0" y="0" width="${width}" height="${height}" fill="${forest}" fill-opacity="0.66"/>`
    : `<rect x="0" y="0" width="${width}" height="${height}" fill="${forest}"/>`;

  const qrInset = Math.round(qrSize * 0.09);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${width} ${height}" role="img" aria-label="Social image for the ${escapeXml(p.cityName)} tour">
${bg}
<text x="${cx}" y="${wordY}" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(height * 0.05)}" font-weight="600" fill="${cream}">Storie<tspan fill="${accent}">D</tspan></text>
<text x="${cx}" y="${head1Y}" text-anchor="middle" font-family="Georgia, serif" font-size="${hSize}" fill="${cream}">${escapeXml(headline)}</text>
<text x="${cx}" y="${head2Y}" text-anchor="middle" font-family="Georgia, serif" font-size="${hSize}" fill="${cream}">Take the walk.</text>
<rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" rx="${Math.round(qrSize * 0.06)}" fill="#ffffff"/>
<image href="${p.qrDataUrl}" x="${qrX + qrInset}" y="${qrY + qrInset}" width="${qrSize - qrInset * 2}" height="${qrSize - qrInset * 2}"/>
<text x="${cx}" y="${scanY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(height * 0.034)}" font-weight="bold" fill="${accent}">Scan to start walking</text>
${attrBlock}
</svg>`;
}

function renderCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render the poster image'));
    };
    img.src = url;
  });
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function PromoteClient(props: Props) {
  const posterSvg = useMemo(() => buildPosterSvg(props), [props]);
  const socialSvgs = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of SOCIAL_FORMATS) m[f.key] = buildSocialSvg(props, f.w, f.h);
    return m;
  }, [props]);

  const [busy, setBusy] = useState<null | 'pdf' | 'png'>(null);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState<string | null>(null);

  const [posts, setPosts] = useState<Posts | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPosts() {
    setLoadingPosts(true);
    setPostsError(null);
    try {
      const r = await fetch('/api/promote/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citySlug: props.citySlug }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Could not draft posts.');
      setPosts({ facebook: j.facebook, instagram: j.instagram, linkedin: j.linkedin });
    } catch (e) {
      setPostsError(e instanceof Error ? e.message : 'Could not draft posts.');
    } finally {
      setLoadingPosts(false);
    }
  }

  async function downloadPdf() {
    setPosterError(null);
    setBusy('pdf');
    try {
      const canvas = await renderCanvas(posterSvg, A4_W, A4_H);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      pdf.save(`${props.citySlug}-storied-poster.pdf`);
    } catch (e) {
      setPosterError(e instanceof Error ? e.message : 'Could not build the PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadPng() {
    setPosterError(null);
    setBusy('png');
    try {
      const canvas = await renderCanvas(posterSvg, A4_W, A4_H);
      canvas.toBlob((blob) => {
        if (!blob) {
          setPosterError('Could not build the PNG.');
          return;
        }
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${props.citySlug}-storied-poster.png`);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    } catch (e) {
      setPosterError(e instanceof Error ? e.message : 'Could not build the PNG.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadSocialImage(key: keyof Posts) {
    const fmt = SOCIAL_FORMATS.find((f) => f.key === key);
    if (!fmt) return;
    setImgBusy(key);
    try {
      const canvas = await renderCanvas(socialSvgs[key], fmt.w, fmt.h);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${props.citySlug}-${key}.png`);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    } catch {
      // Non-fatal: the post text is unaffected.
    } finally {
      setImgBusy(null);
    }
  }

  async function copyPost(key: keyof Posts, label: string) {
    if (!posts) return;
    try {
      await navigator.clipboard.writeText(posts[key]);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1800);
    } catch {
      setPostsError('Could not copy. Select the text and copy manually.');
    }
  }

  const channels: { key: keyof Posts; label: string; hint: string }[] = [
    { key: 'facebook', label: 'Facebook', hint: 'Paste into a new Facebook post.' },
    { key: 'instagram', label: 'Instagram', hint: 'Paste as your caption. Put your tour link in your bio.' },
    { key: 'linkedin', label: 'LinkedIn', hint: 'Paste into a new LinkedIn post.' },
  ];

  return (
    <div className="max-w-5xl">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">Promote</p>
      <h1 className="text-4xl font-semibold mb-2">Tell the world about {props.cityName}</h1>
      <p className="text-gray-600 mb-8 max-w-2xl">
        Your tour is live. Download the poster for windows, A-boards and signage,
        and lift the posts straight into your channels. Everything is already
        branded and points at your live tour.
      </p>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        <section className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-1">Your poster</h2>
          <p className="text-sm text-gray-600 mb-4">
            A4, print-ready. The PDF is best for printing and windows. The PNG is
            a high-resolution image, handy if a sign-maker is putting it onto
            metal lamppost plates.
          </p>
          <div
            className="rounded-lg overflow-hidden border border-gray-200 mx-auto mb-5"
            style={{ width: 300, maxWidth: '100%' }}
            dangerouslySetInnerHTML={{ __html: posterSvg }}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={busy !== null}
              className="px-5 py-2.5 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition disabled:opacity-50"
            >
              {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={downloadPng}
              disabled={busy !== null}
              className="px-5 py-2.5 rounded-full bg-accent text-primary text-sm font-bold hover:bg-accent-light transition disabled:opacity-50"
            >
              {busy === 'png' ? 'Preparing…' : 'Download PNG'}
            </button>
          </div>
          {posterError && <p className="text-xs text-red-700 mt-3">{posterError}</p>}
          <p className="text-xs text-gray-500 mt-4">
            Live tour: <span className="font-mono break-all">{props.liveUrl}</span>
          </p>
        </section>

        <section className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-2xl font-semibold">Your posts</h2>
            <button
              type="button"
              onClick={loadPosts}
              disabled={loadingPosts}
              className="text-sm font-bold text-primary hover:underline disabled:opacity-50"
            >
              {loadingPosts ? 'Writing…' : '↻ Regenerate'}
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Drafted for you in your tour&apos;s voice, each with a matching image
            sized for that channel. Edit the words, copy and paste, and download
            the image to attach if you like. Regenerate for a fresh angle.
          </p>

          {postsError && <p className="text-sm text-red-700 mb-3">{postsError}</p>}

          {loadingPosts && !posts ? (
            <p className="text-sm text-gray-500">Drafting your posts…</p>
          ) : (
            posts && (
              <div className="space-y-5">
                {channels.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-sm">{c.label}</p>
                      <button
                        type="button"
                        onClick={() => copyPost(c.key, c.label)}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        {copied === c.label ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <textarea
                      value={posts[c.key]}
                      onChange={(e) =>
                        setPosts((prev) => (prev ? { ...prev, [c.key]: e.target.value } : prev))
                      }
                      rows={c.key === 'instagram' ? 6 : 7}
                      className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-800 focus:border-primary focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">{c.hint}</p>

                    {socialSvgs[c.key] && (
                      <div className="mt-3">
                        <div
                          className="rounded-lg overflow-hidden border border-gray-200 mb-2"
                          style={{ maxWidth: 260 }}
                          dangerouslySetInnerHTML={{ __html: socialSvgs[c.key] }}
                        />
                        <button
                          type="button"
                          onClick={() => downloadSocialImage(c.key)}
                          disabled={imgBusy === c.key}
                          className="px-4 py-1.5 rounded-full bg-primary text-cream text-xs font-bold hover:bg-primary-light transition disabled:opacity-50"
                        >
                          {imgBusy === c.key
                            ? 'Preparing…'
                            : `Download image (${SOCIAL_FORMATS.find((f) => f.key === c.key)?.dims})`}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}
