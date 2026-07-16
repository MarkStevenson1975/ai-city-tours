'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createSponsor,
  updateSponsor,
  deleteSponsor,
  type SponsorInput,
} from './actions';

interface SponsorRow {
  id: string;
  name: string;
  category: string | null;
  tagline: string | null;
  narration_text: string | null;
  emoji: string | null;
  lat: number | null;
  lng: number | null;
  proximity_radius_metres: number;
  google_place_id: string | null;
  google_business_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  stop_number: number | null;
  subscription_status: string;
  monthly_price_pence: number | null;
  contact_email: string | null;
}

interface Props {
  citySlug: string;
  cityId: string;
  /** Town/area name, used to disambiguate the Google lookup. */
  cityName?: string;
  /** undefined = new sponsor, otherwise editing existing */
  sponsor?: SponsorRow;
}

export function SponsorForm({ citySlug, cityId, cityName, sponsor }: Props) {
  const router = useRouter();
  const isNew = !sponsor;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Autofill-from-Google state.
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [foundLabel, setFoundLabel] = useState<string | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);

  const [name, setName] = useState(sponsor?.name ?? '');
  const [category, setCategory] = useState(sponsor?.category ?? '');
  const [tagline, setTagline] = useState(sponsor?.tagline ?? '');
  const [narrationText, setNarrationText] = useState(sponsor?.narration_text ?? '');
  const [emoji, setEmoji] = useState(sponsor?.emoji ?? '');
  const [lat, setLat] = useState(sponsor?.lat?.toString() ?? '');
  const [lng, setLng] = useState(sponsor?.lng?.toString() ?? '');
  const [radius, setRadius] = useState(
    String(sponsor?.proximity_radius_metres ?? 20)
  );
  const [googlePlaceId, setGooglePlaceId] = useState(
    sponsor?.google_place_id ?? ''
  );
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState(
    sponsor?.google_business_url ?? ''
  );
  const [ctaLabel, setCtaLabel] = useState(sponsor?.cta_label ?? '');
  const [ctaUrl, setCtaUrl] = useState(sponsor?.cta_url ?? '');
  const [stopNumber, setStopNumber] = useState<string>(
    sponsor?.stop_number != null ? String(sponsor.stop_number) : ''
  );
  const [status, setStatus] = useState<SponsorInput['subscription_status']>(
    (sponsor?.subscription_status as SponsorInput['subscription_status']) ??
      'pending'
  );
  const [monthlyPrice, setMonthlyPrice] = useState(
    sponsor?.monthly_price_pence
      ? (sponsor.monthly_price_pence / 100).toFixed(2)
      : ''
  );
  const [contactEmail, setContactEmail] = useState(sponsor?.contact_email ?? '');

  async function autofillFromGoogle() {
    if (!lookupQuery.trim()) {
      setError('Paste the business’s Google link, or type its name.');
      return;
    }
    setError(null);
    setLookupLoading(true);
    try {
      const res = await fetch('/api/sponsors/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lookupQuery, area: cityName || citySlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');

      if (data.name) setName(String(data.name).slice(0, 25));
      if (data.category) setCategory(data.category);
      if (data.emoji) setEmoji(data.emoji);
      if (data.tagline) setTagline(data.tagline);
      if (data.narration) setNarrationText(data.narration);
      if (typeof data.lat === 'number') setLat(String(data.lat));
      if (typeof data.lng === 'number') setLng(String(data.lng));
      if (data.googlePlaceId) setGooglePlaceId(data.googlePlaceId);
      if (data.googleBusinessUrl) setGoogleBusinessUrl(data.googleBusinessUrl);
      if (data.ctaUrl) setCtaUrl(data.ctaUrl);
      if (data.ctaLabel && !ctaLabel) setCtaLabel(data.ctaLabel);

      setAiDrafted(Boolean(data.aiDrafted));
      setFoundLabel(
        `${data.name}${data.address ? ` · ${data.address}` : ''}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  }

  function buildInput(): SponsorInput | { error: string } {
    const latNum = lat ? parseFloat(lat) : NaN;
    const lngNum = lng ? parseFloat(lng) : NaN;
    if (lat && Number.isNaN(latNum)) return { error: 'Latitude must be a number.' };
    if (lng && Number.isNaN(lngNum)) return { error: 'Longitude must be a number.' };

    let priceP: number | null = null;
    if (monthlyPrice.trim()) {
      const f = parseFloat(monthlyPrice);
      if (Number.isNaN(f)) return { error: 'Monthly price must be a number (in pounds).' };
      priceP = Math.round(f * 100);
    }

    return {
      name,
      category,
      tagline,
      narration_text: narrationText,
      emoji,
      lat: lat ? latNum : null,
      lng: lng ? lngNum : null,
      proximity_radius_metres: parseInt(radius, 10) || 20,
      google_place_id: googlePlaceId,
      google_business_url: googleBusinessUrl,
      cta_label: ctaLabel,
      cta_url: ctaUrl,
      stop_number: stopNumber.trim() ? parseInt(stopNumber, 10) : null,
      subscription_status: status,
      monthly_price_pence: priceP,
      contact_email: contactEmail,
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
    const input = built;

    startTransition(async () => {
      if (isNew) {
        const result = await createSponsor(cityId, citySlug, input);
        if (!result.ok) {
          setError(result.error);
        } else {
          router.push(`/dashboard/${citySlug}/sponsors`);
        }
      } else {
        const result = await updateSponsor(sponsor!.id, citySlug, input);
        if (!result.ok) {
          setError(result.error);
        } else {
          setSaved(true);
          router.refresh();
          setTimeout(() => setSaved(false), 2500);
        }
      }
    });
  }

  function handleDelete() {
    if (!sponsor) return;
    if (!window.confirm(`Delete sponsor "${sponsor.name}"? This can't be undone.`))
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSponsor(sponsor.id, citySlug);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.push(`/dashboard/${citySlug}/sponsors`);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 bg-white rounded-xl p-8 shadow-sm"
    >
      {/* Autofill from Google — fills almost the whole form from one link. */}
      <div className="bg-cream/60 border border-accent rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-1">✦ Fill it in from Google</h2>
        <p className="text-sm text-gray-600 mb-3">
          Paste the business’s Google link, or type its name. We’ll pin it on the
          map and fill in the details, including a draft tagline and spoken line
          you can edit.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            placeholder="Google link, or e.g. Castle Green Café"
            className="flex-1 min-w-[220px] px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={autofillFromGoogle}
            disabled={lookupLoading || isPending}
            className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50 whitespace-nowrap"
          >
            {lookupLoading ? 'Looking up…' : 'Look up'}
          </button>
        </div>
        {foundLabel && (
          <div className="mt-3 flex items-start gap-2 bg-white border border-green-200 rounded-lg p-3">
            <span aria-hidden>📍</span>
            <p className="text-sm text-gray-700 flex-1">{foundLabel}</p>
            <span className="text-xs font-bold text-green-700 whitespace-nowrap">✓ Found &amp; pinned</span>
          </div>
        )}
      </div>

      <Section title="How it appears">
        <Field label="Name" required hint="Max 25 characters — this is shown in the sponsored pill on the stop list alongside the emoji.">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={25}
            placeholder="e.g. a local cafe or shop"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{name.length}/25</p>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" hint="e.g. 'Cafe / Coffee', 'Independent Bookshop'">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </Field>
          <Field label="Emoji" hint="Single emoji shown on the map / cards.">
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={4}
              className="w-24 px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-2xl"
            />
          </Field>
        </div>
        <Field
          label={<>Tagline{aiDrafted && <AiChip />}</>}
          hint="One line shown on the visual sponsor card at the stop."
        >
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={160}
            placeholder="Specialty coffee and local food in the Cathedral Quarter"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </Field>
        <Field
          label={<>What the guide says{aiDrafted && <AiChip />}</>}
          hint='The line read aloud as a walker passes. Speak directly to the visitor. The business often has preferred wording, so do ask them, and edit freely. Leave blank to fall back to a generic mention using the tagline above.'
        >
          <textarea
            value={narrationText}
            onChange={(e) => setNarrationText(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Why not pop in for a coffee and a cake from the award-winning café at Castle Green?"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </Field>
      </Section>

      <Section
        title="Where it fires"
        subtitle="The callout plays when a walker comes within the radius of this spot. The lookup pins the location for you."
      >
        <div className="grid grid-cols-3 gap-4">
          <Field label="Latitude" hint="Pinned by the lookup.">
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
            />
          </Field>
          <Field label="Longitude" hint="Pinned by the lookup.">
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
            />
          </Field>
          <Field label="Radius (m)" hint="Default 20 m. Range 10–500.">
            <input
              type="number"
              min={10}
              max={500}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </Field>
        </div>
        <Field
          label="Google Business page URL"
          hint="Paste the Google Maps page URL for this business. The AI uses it to fetch live info: opening hours, busy times, current notices."
        >
          <input
            type="url"
            value={googleBusinessUrl}
            onChange={(e) => setGoogleBusinessUrl(e.target.value)}
            placeholder="https://www.google.com/maps/place/..."
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
          />
        </Field>
      </Section>

      <Section
        title="Call to action"
        subtitle="The button shown in the proximity callout."
      >
        <Field label="CTA label">
          <input
            type="text"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Find us near the Cathedral"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </Field>
        <Field
          label="CTA URL"
          hint="Where the button takes the walker. Use # for 'no link' (just info)."
        >
          <input
            type="text"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://example.co.uk"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
          />
        </Field>
      </Section>

      <Section
        title="Attach to stop"
        subtitle="Enter the stop number this sponsor is attached to. The sponsored pill will appear on that stop in the visitor's stop list and stop detail screen."
      >
        <Field label="Stop number" hint="Enter the number of the stop, e.g. 1 for Stop 1. Leave blank if not attached to a specific stop.">
          <input
            type="number"
            min={1}
            value={stopNumber}
            onChange={(e) => setStopNumber(e.target.value)}
            placeholder="e.g. 1"
            className="w-28 px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </Field>
      </Section>

      <details className="border-t border-gray-200 pt-6">
        <summary className="text-sm font-bold text-gray-600 cursor-pointer select-none hover:text-gray-900">
          Advanced &amp; billing
        </summary>
        <div className="space-y-6 mt-5">
          <Field label="Status" hint="Only 'active' sponsors appear on the public tour.">
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as SponsorInput['subscription_status'])
              }
              className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monthly price (£)">
              <input
                type="number"
                step="0.01"
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                placeholder="100.00"
                className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
              />
            </Field>
            <Field label="Contact email">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="business@example.co.uk"
                className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </Field>
          </div>
          <Field
            label="Google Place ID"
            hint="Filled automatically by the lookup. You rarely need to touch this."
          >
            <input
              type="text"
              value={googlePlaceId}
              onChange={(e) => setGooglePlaceId(e.target.value)}
              placeholder="ChIJ..."
              className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
            />
          </Field>
        </div>
      </details>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
          Saved to draft. Click Publish on the city overview to push live.
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
            Delete sponsor
          </button>
        ) : (
          <span></span>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
        >
          {isPending ? 'Saving…' : isNew ? 'Create sponsor' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

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
  label: React.ReactNode;
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

// Small "AI draft" marker on fields the lookup wrote, so operators know to
// check them and edit as they see fit.
function AiChip() {
  return (
    <span className="ml-2 inline-block align-middle text-[10px] font-bold uppercase tracking-wide text-accent bg-accent/10 px-2 py-0.5 rounded-full">
      AI draft · edit me
    </span>
  );
}
