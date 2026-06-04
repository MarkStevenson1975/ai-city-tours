'use client';

// Optional completion-screen sponsor: upload a logo, add the sponsor's name,
// tagline and link, or remove the sponsor element from the finish screen.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SponsorLogoUpload } from '../settings/sponsor-logo-upload';
import { saveSponsorDetails, removeSponsorElement } from './actions';

interface Props {
  cityId: string;
  citySlug: string;
  logoUrl: string | null;
  name: string;
  tagline: string;
  url: string;
}

export function SponsorSection({ cityId, citySlug, logoUrl, name, tagline, url }: Props) {
  const router = useRouter();
  const [n, setN] = useState(name);
  const [t, setT] = useState(tagline);
  const [u, setU] = useState(url);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSponsor = Boolean(logoUrl || name || tagline || url);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await saveSponsorDetails(cityId, citySlug, { name: n, tagline: t, url: u });
      if (r.ok) {
        setSaved(true);
        router.refresh();
      } else setError(r.error);
    });
  }

  function remove() {
    if (!window.confirm('Remove the sponsor from your finish screen completely?')) return;
    setError(null);
    startTransition(async () => {
      const r = await removeSponsorElement(cityId, citySlug);
      if (r.ok) {
        setN('');
        setT('');
        setU('');
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h2 className="text-2xl font-semibold mb-1">Sponsor (optional)</h2>
      <p className="text-sm text-gray-600 mb-5">
        Local businesses can sponsor the finish screen of your tour. Add a logo
        and details, or skip it. You can change or remove this anytime.
      </p>

      <p className="text-sm font-bold mb-2">Sponsor logo</p>
      <SponsorLogoUpload cityId={cityId} citySlug={citySlug} currentLogoUrl={logoUrl} />

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <div>
          <label className="block text-sm font-bold mb-1">Sponsor name</label>
          <input
            value={n}
            onChange={(e) => setN(e.target.value)}
            placeholder="e.g. a local business"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-bold mb-1">Link (optional)</label>
          <input
            value={u}
            onChange={(e) => setU(e.target.value)}
            placeholder="https://…"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-bold mb-1">Tagline (optional)</label>
          <input
            value={t}
            onChange={(e) => setT(e.target.value)}
            placeholder="A short line about the sponsor"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 mt-5 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="px-5 py-2.5 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save sponsor details'}
        </button>
        {saved && <span className="text-sm text-green-700 font-bold">Saved</span>}
        {hasSponsor && (
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="text-sm text-red-700 hover:underline font-bold"
          >
            Remove sponsor from finish screen
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
