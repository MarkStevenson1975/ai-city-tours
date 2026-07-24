'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDraftStops, type DraftStop } from './actions';
import { MapPicker, type MapPick } from './map-picker';
import { BuildingAnimation } from './building-animation';

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

const RADIUS_OPTIONS = [0.25, 0.5, 1, 3, 5, 10, 15];

export function BuildWizard({
  citySlug,
  defaultArea,
  guideName,
  autoSearch = false,
  venueMode = false,
  eventMode = false,
}: {
  citySlug: string;
  defaultArea: string;
  guideName: string;
  /** Run the landmark search on arrival (first-run journey from /dashboard/new). */
  autoSearch?: boolean;
  /** Single venue (stately home, hotel). Their stops are inside their own site,
   *  so Google cannot suggest them: lead with the map picker and a tight radius. */
  venueMode?: boolean;
  /** Event tour. Pins only: the stalls, stages and points aren't on Google, so
   *  there is no landmark or postcode search at all — just drop pins on the map. */
  eventMode?: boolean;
}) {
  const router = useRouter();
  const [postcode, setPostcode] = useState('');
  const [radiusMiles, setRadiusMiles] = useState(venueMode ? 0.5 : 3);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Record<string, Suggestion>>({});
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [progress, setProgress] = useState('');
  const [drafts, setDrafts] = useState<Drafted[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The map leads. Postcode search is hidden behind a toggle, but if there is
  // no map key it has nothing to hide behind, so open it by default.
  const hasMap = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const [showPostcode, setShowPostcode] = useState(!hasMap);

  async function findSites(areaOverride?: string) {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const res = await fetch('/api/places/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          areaOverride
            ? { area: areaOverride, radiusMiles }
            : { postcode, radiusMiles }
        ),
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

  // First run: the operator has just told us their town, so show them their
  // landmarks straight away rather than making them ask a second time.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoSearch || autoRan.current || !defaultArea) return;
    autoRan.current = true;
    findSites(defaultArea);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch, defaultArea]);

  function toggle(s: Suggestion) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[s.place_id]) delete next[s.place_id];
      else next[s.place_id] = s;
      return next;
    });
  }

  // Map picks: enrich the chosen place_ids into full suggestions (name, photo,
  // coords) so they draft and save exactly like the list picks, then merge.
  async function addMapPicks(picks: MapPick[]) {
    if (!picks.length) return;
    setError(null);
    let enriched: Suggestion[] = [];
    try {
      const res = await fetch('/api/places/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeIds: picks.map((p) => p.place_id) }),
      });
      const data = await res.json();
      if (res.ok) enriched = data.results || [];
    } catch {
      /* fall back to the basic pick below */
    }
    setSelected((prev) => {
      const next = { ...prev };
      for (const p of picks) {
        const e = enriched.find((x) => x.place_id === p.place_id);
        next[p.place_id] =
          e ?? {
            place_id: p.place_id,
            name: p.name,
            address: '',
            rating: null,
            lat: p.lat,
            lng: p.lng,
            category: 'Place',
            photoRef: null,
          };
      }
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
    // Straight through. There is no "read what Harriet wrote" step: every word
    // is editable on the stop screens afterwards, and making people approve
    // prose they have not asked for is just another wall between them and
    // their finished tour.
    setProgress('Saving your tour…');
    await save(out);
    setProgress('');
    setDrafting(false);
  }

  async function save(list: Drafted[]) {
    if (!list.length) return;
    setSaving(true);
    setError(null);
    const r = await saveDraftStops(citySlug, list);
    if (r.ok) {
      router.push(`/dashboard/${citySlug}/finish`);
      router.refresh();
    } else {
      setError(r.error);
      setSaving(false);
      setDrafting(false);
    }
  }

  const selectedCount = Object.keys(selected).length;

  // ---- Save failed: keep their drafts and let them retry ----
  // (There is no review step. Drafting flows straight into saving, and the
  // operator lands on their finished tour. This only appears if the save fails,
  // so their work is never lost.)
  if (drafts.length && !drafting && !saving && error) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
            Nearly there
          </p>
          <h1 className="text-3xl font-semibold">
            {drafts.length} stops written, but we couldn&apos;t save them
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Nothing is lost. Press the button and we&apos;ll try again.
          </p>
        </div>
        <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded p-3">
          {error}
        </p>
        <button
          type="button"
          onClick={() => save(drafts)}
          className="px-6 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
        >
          Save my {drafts.length} stops
        </button>
      </div>
    );
  }

  // ---- Location + pick sites ----
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          Your first tour · Step 2
        </p>
        <h1 className="text-4xl font-semibold mb-2">
          {eventMode ? 'Pin your stops' : 'Choose your stops'}
        </h1>
        <p className="text-sm text-gray-600">
          {eventMode
            ? `Drop a pin on the map for each stop at your event. ${guideName} writes the narration for every one, and you can edit all of it afterwards.`
            : venueMode
              ? `Drop a pin for each place on your route around ${defaultArea}. ${guideName} writes the narration for every one, and you can edit all of it afterwards.`
              : `Pick the places you want on your walk. ${guideName} writes the narration for every one, and you can edit all of it afterwards.`}
        </p>
      </div>

      {eventMode ? (
        <div className="bg-cream/70 border border-accent rounded-xl p-4">
          <p className="text-sm font-bold text-primary mb-1">
            This is an event tour, so you place every stop yourself
          </p>
          <p className="text-sm text-gray-700">
            Your event&apos;s stalls, stages and points aren&apos;t on Google, so
            drop a pin on the map for each one and give it a name. Once they&apos;re
            placed, the AI writes the narration for every stop.
          </p>
        </div>
      ) : venueMode ? (
        <div className="bg-cream/70 border border-accent rounded-xl p-4">
          <p className="text-sm font-bold text-primary mb-1">
            Your stops are inside {defaultArea}, so you place them
          </p>
          <p className="text-sm text-gray-700">
            Drop a pin on the map for each stop on your route: the walled garden,
            the long gallery, the courtyard. We can&apos;t guess what&apos;s inside
            your grounds, but once you&apos;ve placed them the AI writes the
            narration for every one.
          </p>
        </div>
      ) : null}

      <MapPicker
        area={defaultArea}
        onConfirm={addMapPicks}
        disabled={drafting}
        pinsOnly={eventMode}
      />

      {/* Guided landmark finder. Always recoverable: if the auto-search is still
          running, show it; if it came back empty or errored, show why and a
          button to try again — so the operator is never stuck on a bare map. */}
      {!venueMode && suggestions.length === 0 && (
        <div>
          {loading ? (
            <BuildingAnimation label={`Finding ${defaultArea}'s landmarks…`} />
          ) : (
            <div className="bg-cream/60 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 mb-3">
                {error
                  ? error
                  : `Tap the places you want on the map above, or let us find ${defaultArea}'s landmarks for you.`}
              </p>
              <button
                type="button"
                onClick={() => findSites(defaultArea)}
                className="px-5 py-2.5 rounded-full bg-accent text-primary text-sm font-bold hover:bg-accent-light transition"
              >
                Find {defaultArea}&apos;s landmarks
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {hasMap && !eventMode && (
            <button
              type="button"
              onClick={() => setShowPostcode((v) => !v)}
              className="font-bold text-primary hover:underline"
            >
              {showPostcode ? 'Hide postcode search' : 'Prefer to search by postcode?'}
            </button>
          )}
          {hasMap && !eventMode && <span className="text-gray-300">·</span>}
          <button
            type="button"
            onClick={() => router.push(`/dashboard/${citySlug}/stops/new`)}
            className="font-bold text-primary hover:underline"
          >
            Add stops manually
          </button>
        </div>

        {showPostcode && !eventMode && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
              Search by postcode
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
                    {m < 1 ? `${m} mile (on site)` : `${m} mile${m === 1 ? '' : 's'}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => findSites()}
                disabled={loading || !postcode.trim()}
                className="px-5 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? 'Finding…' : 'Find sites'}
              </button>
            </div>
          </div>
        )}
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

      {selectedCount > 0 && (
        <div>
          <p className="text-sm font-bold mb-2">Your selected stops ({selectedCount})</p>
          <div className="flex flex-wrap gap-2">
            {Object.values(selected).map((s) => (
              <span
                key={s.place_id}
                className="inline-flex items-center gap-2 bg-cream border border-gray-200 rounded-full pl-3 pr-2 py-1 text-sm"
              >
                {s.name}
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 text-xs"
                  aria-label={`Remove ${s.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {drafting && <BuildingAnimation label={progress || 'Drafting your stops…'} />}

      {(suggestions.length > 0 || selectedCount > 0) && !drafting && (
        <p className="text-xs text-gray-500 bg-cream/60 border border-gray-200 rounded-lg p-3">
          Nothing here is final. Every stop we write can be edited, reordered or
          removed later, and you can add your own at any time. This is just to
          get you off a blank page.
        </p>
      )}

      {(suggestions.length > 0 || selectedCount > 0) && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={draftSelected}
            disabled={drafting || selectedCount === 0}
            className="px-6 py-3 rounded-full bg-accent text-primary font-bold hover:bg-accent-light transition disabled:opacity-50"
          >
            {drafting ? 'Drafting…' : `Draft my ${selectedCount || ''} stop${selectedCount === 1 ? '' : 's'}`}
          </button>
          {!drafting && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/${citySlug}/stops/new`)}
              className="text-sm font-bold text-gray-500 hover:text-gray-800"
            >
              Skip and add stops myself
            </button>
          )}
        </div>
      )}
    </div>
  );
}
