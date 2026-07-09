'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { updateStop, createStop, deleteStop, uploadStopImage, type StopInput } from './actions';
import { ImageUpload } from './image-upload';
import { GalleryVideoManager } from './gallery-video';

interface Stop {
  id: string;
  position: number;
  name: string;
  short_description: string | null;
  narration: string | null;
  facts: string[] | null;
  lat: number | null;
  lng: number | null;
  hero_image_url: string | null;
  hero_image_override_url: string | null;
  google_business_url: string | null;
  gallery_urls: string[] | null;
  video_url: string | null;
}

interface Props {
  citySlug: string;
  cityId: string;
  /** Town/area name, used as context for AI narration generation */
  cityName?: string;
  /** Existing stop for edit mode, or undefined for new */
  stop?: Stop;
  /** Suggested next-available position when creating a new stop */
  suggestedPosition?: number;
}

export function StopEditForm({
  citySlug,
  cityId,
  cityName,
  stop,
  suggestedPosition,
}: Props) {
  const router = useRouter();
  const isNew = !stop;
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  async function lookupAndFill() {
    if (!lookupQuery.trim()) {
      setError('Paste a Google Maps link or type the place name first.');
      return;
    }
    setError(null);
    setLookupLoading(true);
    try {
      const res = await fetch('/api/build/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lookupQuery, citySlug, area: cityName || citySlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      if (data.name) setName(data.name);
      if (typeof data.lat === 'number') setLat(String(data.lat));
      if (typeof data.lng === 'number') setLng(String(data.lng));
      if (data.googleBusinessUrl) setGoogleBusinessUrl(data.googleBusinessUrl);
      if (data.heroImageUrl && !(stop && stop.hero_image_override_url)) setHeroImageUrl(data.heroImageUrl);
      if (data.shortDescription) setShortDescription(data.shortDescription);
      if (data.narration) setNarration(data.narration);
      if (Array.isArray(data.facts) && data.facts.length) setFacts(data.facts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  }

  async function generateNarration() {
    if (!name.trim()) {
      setError('Add the stop name first, then generate the narration.');
      return;
    }
    setError(null);
    setGenLoading(true);
    try {
      const res = await fetch('/api/build/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citySlug, name, area: cityName || citySlug, guideName: 'Harriet' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate narration');
      if (data.narration) setNarration(data.narration);
      if (data.shortDescription && !shortDescription.trim()) setShortDescription(data.shortDescription);
      if (Array.isArray(data.facts) && facts.filter((f) => f.trim()).length === 0) {
        setFacts(data.facts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate narration');
    } finally {
      setGenLoading(false);
    }
  }

  const [position, setPosition] = useState(
    stop?.position
      ? String(stop.position)
      : suggestedPosition
        ? String(suggestedPosition)
        : ''
  );
  const [name, setName] = useState(stop?.name ?? '');
  const [shortDescription, setShortDescription] = useState(
    stop?.short_description ?? ''
  );
  const [narration, setNarration] = useState(stop?.narration ?? '');
  const [facts, setFacts] = useState<string[]>(stop?.facts ?? []);
  const [lat, setLat] = useState(stop?.lat?.toString() ?? '');
  const [lng, setLng] = useState(stop?.lng?.toString() ?? '');
  const [heroImageUrl, setHeroImageUrl] = useState(stop?.hero_image_url ?? '');
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState(
    stop?.google_business_url ?? ''
  );
  // Staged image for new stops — uploaded after the stop row is created
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const stagedFileInputRef = useRef<HTMLInputElement>(null);

  function handleStagedFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too large. Max 5 MB.');
      return;
    }
    setError(null);
    setStagedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setStagedPreview((ev.target?.result as string) ?? null);
    reader.readAsDataURL(file);
  }

  function clearStagedFile() {
    setStagedFile(null);
    setStagedPreview(null);
    if (stagedFileInputRef.current) stagedFileInputRef.current.value = '';
  }

  function addFact() {
    setFacts((prev) => [...prev, '']);
  }
  function updateFact(idx: number, value: string) {
    setFacts((prev) => prev.map((f, i) => (i === idx ? value : f)));
  }
  function removeFact(idx: number) {
    setFacts((prev) => prev.filter((_, i) => i !== idx));
  }

  function buildInput(): StopInput | { error: string } {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (lat && Number.isNaN(latNum)) return { error: 'Latitude must be a number.' };
    if (lng && Number.isNaN(lngNum)) return { error: 'Longitude must be a number.' };
    return {
      name,
      short_description: shortDescription,
      narration,
      facts,
      lat: lat ? latNum : 0,
      lng: lng ? lngNum : 0,
      hero_image_url: heroImageUrl,
      google_business_url: googleBusinessUrl,
    };
  }

  function handleSubmit(e: React.FormEvent, returnToOverview: boolean) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const built = buildInput();
    if ('error' in built) {
      setError(built.error);
      return;
    }
    const input = built;

    startTransition(async () => {
      if (isNew) {
        // Validate position before submit so the user gets a friendly
        // error rather than the raw Postgres "stops_position_check"
        // violation when the value is out of range.
        const newPos = position ? parseInt(position, 10) : NaN;
        if (Number.isNaN(newPos) || newPos < 1 || newPos > 50) {
          setError('Position must be a whole number between 1 and 50.');
          return;
        }
        const result = await createStop(cityId, citySlug, input, newPos);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // If user staged an image, upload it now that we have a stopId
        if (stagedFile) {
          const fd = new FormData();
          fd.append('file', stagedFile);
          fd.append('stopId', result.id);
          fd.append('citySlug', citySlug);
          const uploadResult = await uploadStopImage(fd);
          if (!uploadResult.ok) {
            // Stop was created, but image upload failed — let the user know
            setError(
              `Stop created, but image upload failed: ${uploadResult.error}. Edit the stop to retry.`
            );
            router.push(`/dashboard/${citySlug}/stops/${result.id}`);
            return;
          }
        }
        router.push(`/dashboard/${citySlug}/stops/${result.id}`);
      } else {
        const positionNum = position ? parseInt(position, 10) : undefined;
        if (position && (Number.isNaN(positionNum) || positionNum! < 1 || positionNum! > 50)) {
          setError('Position must be a whole number between 1 and 50.');
          return;
        }
        const result = await updateStop({
          stopId: stop!.id,
          citySlug,
          position: positionNum,
          ...input,
        });
        if (!result.ok) {
          setError(result.error);
        } else if (returnToOverview) {
          router.push(`/dashboard/${citySlug}`);
        } else {
          setSaved(true);
          router.refresh();
          setTimeout(() => setSaved(false), 2500);
        }
      }
    });
  }

  function handleDelete() {
    if (!stop) return;
    if (
      !window.confirm(
        `Delete stop ${stop.position} "${stop.name}"? This cannot be undone.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteStop(stop.id, citySlug);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.push(`/dashboard/${citySlug}`);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => handleSubmit(e, false)}
      className="space-y-8 bg-white rounded-xl p-8 shadow-sm"
    >
      {/* AI autofill */}
      <div className="bg-cream/60 border border-accent rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-1">✨ Autofill from a Google link or place name</h2>
        <p className="text-sm text-gray-600 mb-3">
          Paste a Google Maps link or type the place. We&apos;ll fill the location,
          image, description, facts and a draft narration. Edit anything afterwards.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            placeholder="Google Maps link or place name"
            className={`flex-1 min-w-[220px] ${inputCls}`}
          />
          <button
            type="button"
            onClick={lookupAndFill}
            disabled={lookupLoading || isPending}
            className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50 whitespace-nowrap"
          >
            {lookupLoading ? 'Looking up…' : 'Look up & fill'}
          </button>
        </div>
      </div>

      {/* Identity */}
      <Section title="Identity">
        <Field
          label="Position in walk"
          required={isNew}
          hint={isNew
            ? 'Stops appear in this order on the tour. Pre-filled with the next available slot — change it if you want this stop to appear earlier or later. Must be between 1 and 50 and not already used.'
            : 'Stops appear in this order on the tour. Change the number to move this stop. If another stop already has that number, the two will swap positions automatically.'}
        >
          <input
            type="number"
            min={1}
            max={50}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            required={isNew}
            className={`w-24 ${inputCls} font-mono text-lg text-center`}
          />
        </Field>
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputCls}
          />
        </Field>

        <Field
          label="Short description"
          hint="One line shown in the stops list. Aim for 80 to 120 characters."
        >
          <input
            type="text"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            maxLength={200}
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Location */}
      <Section title="Location">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude" required={!isNew}>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required={!isNew}
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="Longitude" required={!isNew}>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required={!isNew}
              className={`${inputCls} font-mono`}
            />
          </Field>
        </div>
        <Field
          label="Google Business page URL"
          hint="Used by the AI to fetch live business info: opening hours, busy times, current notices. Paste the Google Maps page URL for this venue."
        >
          <input
            type="url"
            value={googleBusinessUrl}
            onChange={(e) => setGoogleBusinessUrl(e.target.value)}
            placeholder="https://www.google.com/maps/place/..."
            className={`${inputCls} font-mono text-sm`}
          />
        </Field>
      </Section>

      {/* Hero image */}
      <Section
        title="Hero image"
        subtitle="A custom upload always wins over the default URL. Use the URL field for AI or Wikipedia images. Use the upload for your own photography."
      >
        {!isNew && stop ? (
          <ImageUpload
            stopId={stop.id}
            citySlug={citySlug}
            currentOverride={stop.hero_image_override_url}
            fallbackUrl={heroImageUrl || stop.hero_image_url}
          />
        ) : (
          // New-stop staged upload: file is held in state, uploaded after createStop
          <div>
            {stagedPreview ? (
              <div className="relative w-full mb-3 overflow-hidden rounded-lg border border-gray-200" style={{ aspectRatio: '16/10' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stagedPreview}
                  alt="Staged preview"
                  className="w-full h-full object-cover object-center"
                />
                <span className="absolute top-2 left-2 bg-amber-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                  Will upload on create
                </span>
              </div>
            ) : (
              <div className="mb-3 bg-cream border-2 border-dashed border-muted-dark rounded-lg h-40 flex items-center justify-center text-sm text-gray-500 italic">
                No image yet. Pick one to upload when the stop is created.
              </div>
            )}

            <input
              ref={stagedFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleStagedFileChange}
              className="hidden"
            />
            <div className="flex gap-2 items-center flex-wrap">
              <button
                type="button"
                onClick={() => stagedFileInputRef.current?.click()}
                disabled={isPending}
                className="px-4 py-2 text-sm font-bold rounded-full border border-primary text-primary hover:bg-primary hover:text-cream transition disabled:opacity-50"
              >
                {stagedFile ? 'Replace selected image' : 'Pick image to upload'}
              </button>
              {stagedFile && (
                <button
                  type="button"
                  onClick={clearStagedFile}
                  disabled={isPending}
                  className="px-3 py-2 text-xs text-red-700 hover:bg-red-50 rounded font-bold"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              JPEG, PNG, or WebP. Max 5 MB. Uploads automatically when the stop is created.
            </p>
          </div>
        )}
        <Field
          label="Default image URL"
          hint="Used when no custom upload is set. Wikipedia or AI or public-domain URL."
        >
          <input
            type="url"
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            placeholder="https://upload.wikimedia.org/..."
            disabled={Boolean(!isNew && stop?.hero_image_override_url)}
            className={`${inputCls} font-mono text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed`}
          />
          {!isNew && stop?.hero_image_override_url && (
            <p className="text-xs text-gray-500 italic mt-1">
              Disabled while a custom upload is active. Remove the upload to edit this field.
            </p>
          )}
        </Field>
      </Section>

      {/* Gallery + video (edit mode only — needs a saved stop to attach to) */}
      {!isNew && stop && (
        <Section
          title="Gallery & video"
          subtitle="Add up to four more images and one short silent video. These show as a swipeable gallery on the stop, after the main image. Saved instantly — Publish to push live."
        >
          <GalleryVideoManager
            stopId={stop.id}
            citySlug={citySlug}
            initialGallery={stop.gallery_urls ?? []}
            initialVideo={stop.video_url ?? null}
          />
        </Section>
      )}

      {/* Narration */}
      <Section
        title="Narration"
        subtitle="The 3 to 5 minute audio script the guide reads at this stop. Plain text. Paragraphs separated by blank lines."
      >
        <div className="mb-3 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={generateNarration}
            disabled={genLoading || isPending}
            className="px-4 py-2 text-sm font-bold rounded-full bg-accent text-primary hover:bg-accent-light transition disabled:opacity-50"
          >
            {genLoading ? 'Generating…' : '✨ Generate narration with AI'}
          </button>
          <span className="text-xs text-gray-500">
            Drafts a 3 to 5 minute script (and fills the description and facts if empty) from the stop name. Edit it afterwards.
          </span>
        </div>
        <textarea
          value={narration}
          onChange={(e) => setNarration(e.target.value)}
          rows={20}
          className={`${inputCls} font-display text-base leading-relaxed`}
        />
        <p className="text-xs text-gray-500 mt-1">
          {narration.length.toLocaleString()} characters. Approx{' '}
          {Math.round(narration.split(/\s+/).filter(Boolean).length / 150)} min read aloud.
        </p>
      </Section>

      {/* Facts */}
      <Section
        title="Interesting facts"
        subtitle="Short bullet-style facts shown beneath the narration on the tour. They are NOT spoken on audio (already in the narration)."
      >
        <div className="space-y-3">
          {facts.map((fact, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <textarea
                value={fact}
                onChange={(e) => updateFact(idx, e.target.value)}
                rows={2}
                className={`flex-1 ${inputCls}`}
              />
              <button
                type="button"
                onClick={() => removeFact(idx)}
                className="px-3 py-2 text-xs text-red-700 hover:bg-red-50 rounded font-bold"
                aria-label="Remove fact"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addFact}
          className="mt-3 px-4 py-2 text-sm font-bold rounded-full border border-primary text-primary hover:bg-primary hover:text-cream transition"
        >
          + Add fact
        </button>
      </Section>

      {/* Status messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded p-4 text-sm">
          Draft saved. Click Publish on the area overview to push live.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-6 sticky bottom-0 bg-white">
        <div>
          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 rounded transition disabled:opacity-50"
            >
              Delete stop
            </button>
          )}
        </div>
        <div className="flex gap-3 items-center">
          <p className="text-xs text-gray-500 hidden md:block">
            Saving writes to the draft. Publish from the area overview to push live.
          </p>
          {!isNew ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={(e) => handleSubmit(e, false)}
                className="px-5 py-2 rounded-full border border-primary text-primary font-bold hover:bg-cream transition disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={(e) => handleSubmit(e, true)}
                className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save & return'}
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create stop'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-gray-600 mb-4">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-4'}>
        <div className="space-y-4">{children}</div>
      </div>
    </section>
  );
}

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
