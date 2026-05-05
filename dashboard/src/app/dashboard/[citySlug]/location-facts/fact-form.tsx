'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createFact, updateFact, deleteFact, type FactInput } from './actions';

interface FactRow {
  id: string;
  text: string;
  lat: number | null;
  lng: number | null;
  radius_metres: number | null;
  priority: number;
  fact_type: string;
}

interface Props {
  citySlug: string;
  cityId: string;
  fact?: FactRow;
}

export function FactForm({ citySlug, cityId, fact }: Props) {
  const router = useRouter();
  const isNew = !fact;
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An "ambient" fact has no specific location — used as fallback content
  // for the where-am-I button when no spot-specific data is found nearby.
  // Detect existing ambient facts by their lack of coordinates.
  const initialAmbient = !!fact && fact.lat === null && fact.lng === null;
  const [isAmbient, setIsAmbient] = useState(initialAmbient);

  const [text, setText] = useState(fact?.text ?? '');
  const [lat, setLat] = useState(
    fact?.lat !== null && fact?.lat !== undefined ? String(fact.lat) : ''
  );
  const [lng, setLng] = useState(
    fact?.lng !== null && fact?.lng !== undefined ? String(fact.lng) : ''
  );
  const [radius, setRadius] = useState(String(fact?.radius_metres ?? 30));
  const [priority, setPriority] = useState(String(fact?.priority ?? 100));
  const [factType, setFactType] = useState(
    fact?.fact_type ?? (initialAmbient ? 'colour' : 'fact')
  );

  function buildInput(): FactInput | { error: string } {
    if (isAmbient) {
      return {
        text,
        lat: null,
        lng: null,
        radius_metres: null,
        priority: parseInt(priority, 10) || 100,
        fact_type: factType,
      };
    }
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (Number.isNaN(latNum)) return { error: 'Latitude must be a number.' };
    if (Number.isNaN(lngNum)) return { error: 'Longitude must be a number.' };
    return {
      text,
      lat: latNum,
      lng: lngNum,
      radius_metres: parseInt(radius, 10) || 30,
      priority: parseInt(priority, 10) || 100,
      fact_type: factType,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const built = buildInput();
    if ('error' in built) {
      setError(built.error);
      return;
    }
    startTransition(async () => {
      if (isNew) {
        const r = await createFact(cityId, citySlug, built);
        if (!r.ok) setError(r.error);
        else router.push(`/dashboard/${citySlug}/location-facts`);
      } else {
        const r = await updateFact(fact!.id, citySlug, built);
        if (!r.ok) setError(r.error);
        else {
          setSaved(true);
          router.refresh();
          setTimeout(() => setSaved(false), 2500);
        }
      }
    });
  }

  function handleDelete() {
    if (!fact) return;
    if (!window.confirm('Delete this location fact? This cannot be undone.'))
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteFact(fact.id, citySlug);
      if (!r.ok) setError(r.error);
      else router.push(`/dashboard/${citySlug}/location-facts`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 bg-white rounded-xl p-8 shadow-sm"
    >
      <Field
        label="Fact text"
        required
        hint="Spoken aloud by the guide. 1 to 3 sentences. The guide automatically waits for any in-progress navigation prompt to finish before reading the fact."
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          required
          className={inputCls}
        />
      </Field>

      <div className="bg-cream/50 rounded-lg p-4 border border-cream">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isAmbient}
            onChange={(e) => setIsAmbient(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-bold">
              Ambient fact (no specific location)
            </span>
            <span className="block text-xs text-gray-600 mt-1">
              Tick for dialect, local colour, or general background that
              isn&apos;t tied to a specific spot. Ambient facts only appear as
              fallback content when the &ldquo;Curious where you&apos;re standing?&rdquo;
              button finds nothing nearby — they never trigger by proximity
              during the walk.
            </span>
          </span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-bold mb-1">Priority</label>
        <p className="text-xs text-gray-500 mb-2">
          Lower number plays first. Use 1 for the most important fact about
          the area, 100 for default. Facts with the same priority play in
          insertion order.
        </p>
        <input
          type="number"
          min={1}
          max={999}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className={`w-32 ${inputCls} font-mono text-lg text-center`}
        />
      </div>

      {!isAmbient && (
        <div className="grid grid-cols-3 gap-4">
          <Field label="Latitude" required>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="Longitude" required>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="Radius (m)" hint="5 to 200">
            <input
              type="number"
              min={5}
              max={200}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      )}

      <Field
        label="Type"
        hint='Default is "fact". Future use: "warning", "history" etc.'
      >
        <input
          type="text"
          value={factType}
          onChange={(e) => setFactType(e.target.value)}
          maxLength={40}
          className={inputCls}
        />
      </Field>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
          Saved to draft. Click Publish on the area overview to push live.
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-200 pt-6">
        {!isNew ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 rounded transition disabled:opacity-50"
          >
            Delete fact
          </button>
        ) : (
          <span></span>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
        >
          {isPending ? 'Saving…' : isNew ? 'Create fact' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-bold mb-1">
        {label}
        {required && <span className="text-red-700 ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}
