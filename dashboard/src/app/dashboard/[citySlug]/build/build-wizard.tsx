'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDraftStops, type DraftStop } from './actions';

type Suggestion = {
  place_id: string;
  name: string;
  address: string;
  rating: number | null;
  lat: number;
  lng: number;
  category: string;
  photoRef: string | null;
};

type Drafted = DraftStop & { place_id: string };

const RADIUS_OPTIONS = [1, 3, 5, 10, 15];

export function BuildWizard({
  citySlug,
  defaultArea,
  guideName,
}: {
  citySlug: string;
  defaultArea: string;
  guideName: string;
}) {
  const router = useRouter();
  const [postcode, setPostcode] = useState('');
  const [radiusMiles, setRadiusMiles] = useState(3);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Record<string, Suggestion>>({});
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [progress, setProgress] = useState('');
  const [drafts, setDrafts] = useState<Drafted[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findSites() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const res = await fetch('/api/places/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcode, radiusMiles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not find sites');
      setSuggestions(data.results || []);
      if (!data.results?.length) setError('No sites found. Try a wider radius.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function toggle(s: Suggestion) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[s.place_id]) delete next[s.place_id];
      else next[s.place_id] = s;
      return next;
    });
  }

  async function draftSelected() {
    const picks = Object.values(selected);
    if (!picks.length) return;
    setDrafting(true);
    setError(null);
    const out: Drafted[] = [];
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      setProgress(`Drafting ${i + 1} of ${picks.length}: ${p.name}`);
      try {
        const res = await fetch('/api/build/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ citySlug, name: p.name, area: defaultArea, guideName }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Draft failed');
        out.push({
          place_id: p.place_id,
          placeId: p.place_id,
          photoRef: p.photoRef ?? undefined,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          shortDescription: data.shortDescription,
          narration: data.narration,
          facts: data.facts,
        });
      } catch (e) {
        out.push({
          place_id: p.place_id,
          placeId: p.place_id,
          photoRef: p.photoRef ?? undefined,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          shortDescription: '',
          narration: `Draft could not be generated: ${e instanceof Error ? e.message : 'error'}`,
          facts: [],
        });
      }
    }
    setDrafts(out);
    setProgress('');
    setDrafting(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const r = await saveDraftStops(citySlug, drafts);
    if (r.ok) {
      router.push(`/dashboard/${citySlug}/finish`);
      router.refresh();
    } else {
      setError(r.error);
      setSaving(false);
    }
  }

  const selectedCount = Object.keys(selected).length;

  // ---- Drafts review ----
  if (drafts.length) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
            Here&apos;s your tour
          </p>
          <h1 className="text-3xl font-semibold">{drafts.length} stops created for you</h1>
          <p className="text-sm text-gray-600 mt-1">
            These are just some stops to get you started, each narrated in {guideName}&apos;s
            voice with its photo and Google listing. You can edit, reorder, remove or
            add more stops at any time in the next stage.
          </p>
        </div>
        {drafts.map((d) => (
          <div key={d.place_id} className="bg-white rounded-xl p-5 shadow-sm">
            <p className="font-semibold text-lg">{d.name}</p>
            {d.shortDescription && (
              <p className="text-sm text-gray-600 mt-1">{d.shortDescription}</p>
            )}
            <p className="text-sm text-gray-800 mt-3 whitespace-pre-line">{d.narration}</p>
            {d.facts && d.facts.length > 0 && (
              <ul className="text-sm text-gray-600 mt-3 list-disc pl-5 space-y-1">
                {d.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {error && <p className="text-red-700 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-6 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save ${drafts.length} stops and continue`}
          </button>
          <button
            type="button"
            onClick={() => setDrafts([])}
            disabled={saving}
            className="px-5 py-3 rounded-full text-sm font-bold text-gray-600 hover:text-gray-900"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ---- Location + pick sites ----
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
          Step 1 · Where is your tour?
        </p>
        <p className="text-sm text-gray-600 mb-2">
          Enter a postcode near the centre of your tour and how far around it to look.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            placeholder="e.g. WR14 4QA"
            className="flex-1 min-w-[160px] px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <select
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(Number(e.target.value))}
            className="px-3 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none"
          >
            {RADIUS_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} mile{m === 1 ? '' : 's'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={findSites}
            disabled={loading || !postcode.trim()}
            className="px-5 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? 'Finding…' : 'Find sites'}
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
            Step 2 · Pick your stops
          </p>
          <p className="text-sm text-gray-600 mb-3">
            These are just some local sites to get you started. Tick the ones you
            want, and you can add more stops later.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {suggestions.map((s) => {
              const on = !!selected[s.place_id];
              return (
                <button
                  key={s.place_id}
                  type="button"
                  onClick={() => toggle(s)}
                  className={`text-left flex items-center gap-3 rounded-lg border p-3 transition ${
                    on ? 'border-primary bg-cream' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs text-cream flex-shrink-0 ${
                      on ? 'bg-primary' : 'border border-gray-300'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-sm truncate">{s.name}</span>
                    <span className="block text-xs text-gray-500">
                      {s.category}
                      {s.rating ? ` · ${s.rating} ★` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-red-700 text-sm">{error}</p>}

      {suggestions.length > 0 && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={draftSelected}
            disabled={drafting || selectedCount === 0}
            className="px-6 py-3 rounded-full bg-accent text-primary font-bold hover:bg-accent-light transition disabled:opacity-50"
          >
            {drafting ? 'Drafting…' : `Draft my ${selectedCount || ''} stop${selectedCount === 1 ? '' : 's'}`}
          </button>
          {drafting && <span className="text-sm text-gray-600">{progress}</span>}
          {!drafting && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/${citySlug}`)}
              className="text-sm font-bold text-gray-500 hover:text-gray-800"
            >
              Skip and build manually
            </button>
          )}
        </div>
      )}
    </div>
  );
}
