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
  liveUrl: string;
  colorPrimary: string;
  colorAccent: string;
  colorBackground: string;
};

type Posts = { facebook: string; instagram: string; linkedin: string };

const A4_W = 2480; // 210mm at 300dpi
const A4_H = 3508; // 297mm at 300dpi

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPosterSvg(p: Props): string {
  const cream = p.colorBackground;
  const forest = p.colorPrimary;
  const accent = p.colorAccent;
  const headline = `${p.cityName} has a story.`;
  // Shrink the headline if the town name makes it long, so it always fits.
  const headSize = Math.max(20, Math.min(30, Math.floor(360 / (headline.length * 0.52))));
  const attr = (p.attribution || '').toUpperCase();
  const hasLogo = Boolean(p.logoDataUrl);

  const logoBlock = hasLogo
    ? `<image href="${p.logoDataUrl}" x="130" y="498" width="160" height="44" preserveAspectRatio="xMidYMid meet"/>`
    : '';
  const byY = hasLogo ? 562 : 524;
  const attrY = hasLogo ? 582 : 548;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 420 594" role="img" aria-label="Poster for the ${escapeXml(p.cityName)} tour">
<rect x="0" y="0" width="420" height="594" fill="${forest}"/>
<rect x="10" y="10" width="400" height="574" rx="6" fill="none" stroke="${accent}" stroke-width="0.5" opacity="0.45"/>
<text x="210" y="64" text-anchor="middle" font-family="Georgia, serif" font-size="26" font-weight="600" fill="${cream}">Storie<tspan fill="${accent}">D</tspan></text>
<line x1="178" y1="80" x2="242" y2="80" stroke="${accent}" stroke-width="1"/>
<text x="210" y="${136}" text-anchor="middle" font-family="Georgia, serif" font-size="${headSize}" fill="${cream}">${escapeXml(headline)}</text>
<text x="210" y="${136 + headSize + 8}" text-anchor="middle" font-family="Georgia, serif" font-size="${headSize}" fill="${cream}">Take the walk.</text>
<text x="210" y="226" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="${cream}">A free guided walking tour, straight to your phone.</text>
<text x="210" y="246" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="${cream}">No app to download. Just scan and go.</text>
<rect x="135" y="278" width="150" height="150" rx="8" fill="#ffffff"/>
<image href="${p.qrDataUrl}" x="147" y="290" width="126" height="126"/>
<text x="210" y="456" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="bold" fill="${accent}">Scan to start walking</text>
<line x1="120" y1="484" x2="300" y2="484" stroke="${accent}" stroke-width="0.5" opacity="0.5"/>
${logoBlock}
<text x="210" y="${byY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10" letter-spacing="2" fill="${cream}" opacity="0.75">BROUGHT TO YOU BY</text>
<text x="210" y="${attrY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" letter-spacing="1" font-weight="bold" fill="${cream}">${escapeXml(attr)}</text>
</svg>`;
}

function renderCanvas(svg: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = A4_W;
      canvas.height = A4_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, A4_W, A4_H);
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

  const [busy, setBusy] = useState<null | 'pdf' | 'png'>(null);
  const [posterError, setPosterError] = useState<string | null>(null);

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
      const canvas = await renderCanvas(posterSvg);
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
      const canvas = await renderCanvas(posterSvg);
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
            Drafted for you in your tour&apos;s voice. Edit anything, then copy and
            paste. Regenerate for a fresh angle.
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
