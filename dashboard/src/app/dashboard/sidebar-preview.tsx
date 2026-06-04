'use client';

// Live mobile preview pinned in the dashboard sidebar. Detects the current
// city from the URL, fetches a small summary, and renders a phone-styled
// teaser of the tour with a link to the full preview.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

type Preview = {
  name: string;
  subscriptionStatus: string;
  totalStops: number;
  liveUrl: string | null;
  qrDataUrl: string | null;
  firstStop: { name: string; shortDescription: string | null; image: string | null } | null;
};

const RESERVED = ['new', 'admin'];

function slugFromPath(path: string): string | null {
  const m = path.match(/^\/dashboard\/([^/]+)/);
  if (!m) return null;
  const slug = m[1];
  return RESERVED.includes(slug) ? null : slug;
}

export function SidebarPreview() {
  const pathname = usePathname();
  const slug = slugFromPath(pathname);
  const [data, setData] = useState<Preview | null>(null);

  useEffect(() => {
    if (!slug) {
      setData(null);
      return;
    }
    let active = true;
    fetch(`/api/preview/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [slug, pathname]);

  if (!slug || !data) return null;

  const fs = data.firstStop;

  // Once the tour is live, show the public URL and a scannable QR code.
  if (data.liveUrl && data.qrDataUrl) {
    return (
      <div className="mt-6">
        <p className="text-[10px] tracking-widest text-cream/60 mb-2">YOUR TOUR IS LIVE</p>
        <div className="bg-white rounded-2xl p-3 flex flex-col items-center text-gray-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.qrDataUrl} alt="QR code for your live tour" className="w-28 h-28" />
          <p className="text-[10px] text-gray-500 mt-2 text-center">Scan to open on a phone</p>
        </div>
        <a
          href={data.liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[11px] font-bold text-accent hover:underline mt-2 break-all"
        >
          Open my live tour ↗
        </a>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(data.liveUrl ?? '')}
          className="block w-full text-center text-[11px] text-cream/70 hover:text-cream mt-1"
        >
          Copy link
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="text-[10px] tracking-widest text-cream/60 mb-2">LIVE PREVIEW</p>
      <div className="bg-black/20 rounded-2xl p-2 flex justify-center">
        <div className="w-[124px] bg-white rounded-xl overflow-hidden text-gray-900">
          <div
            className="h-16 bg-center bg-cover flex items-end p-1.5"
            style={{
              backgroundColor: '#3B6D11',
              backgroundImage: fs?.image ? `url(${fs.image})` : undefined,
            }}
          >
            <span className="text-white text-[9px] font-medium drop-shadow">
              {fs?.name ?? data.name}
            </span>
          </div>
          <div className="p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-[#3B6D11] text-white flex items-center justify-center text-[8px]">
                ▶
              </span>
              <span className="h-1 flex-1 bg-gray-200 rounded relative">
                <span className="absolute left-0 top-0 bottom-0 w-2/5 bg-[#3B6D11] rounded" />
              </span>
            </div>
            <p className="text-[8px] text-gray-500 leading-snug line-clamp-2">
              {fs?.shortDescription ?? 'Add a stop to see it here.'}
            </p>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-cream/60 text-center mt-1.5">
        {data.totalStops} stop{data.totalStops === 1 ? '' : 's'} · updates as you edit
      </p>
      {data.totalStops > 0 && (
        <Link
          href={`/dashboard/${slug}/preview`}
          className="block text-center text-[11px] font-bold text-accent hover:underline mt-1"
        >
          Open full preview
        </Link>
      )}
    </div>
  );
}
