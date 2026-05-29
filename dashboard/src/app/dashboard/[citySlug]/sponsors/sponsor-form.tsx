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
  /** undefined = new sponsor, otherwise editing existing */
  sponsor?: SponsorRow;
}

export function SponsorForm({ citySlug, cityId, sponsor }: Props) {
  const router = useRouter();
  const isNew = !sponsor;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(sponsor?.name ?? '');
  const [category, setCategory] = useState(sponsor?.category ?? '');
  const [tagline, setTagline] = useState(sponsor?.tagline ?? '');
  const [narrationText, setNarrationText] = useState(sponsor?.narration_text ?? '');
  const [emoji, setEmoji] = useState(sponsor?.emoji ?? '');
  const [lat, setLat] = useState(sponsor?.lat?.toString() ?? '');
  const [lng, setLng] = useState(sponsor?.lng?.toString() ?? '');
  const [radius, setRadius] = useState(
    String(sponsor?.proximity_radius_metres ?? 50)
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
      proximity_radius_metres: parseInt(radius, 10) || 50,
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
      <Section title="Identity">
        <Field label="Name" required hint="Max 25 characters — this is shown in the sponsored pill on the stop list alongside the emoji.">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={25}
            placeholder="The Nest Hereford"
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
        <Field label="Tagline" hint="One line shown on the visual sponsor card at the stop.">
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
          label="Narration text"
          hint='What the guide reads aloud at arrival. Speak directly to the visitor — write the whole sentence as you want it heard. The business itself often has a preferred wording; ask them. Example: "Why not pop in for a coffee and a cake from the award-winning café at Castle Green?". Leave blank to fall back to a generic mention using the tagline above.'
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
        title="Location"
        subtitle="The tour fires the sponsor callout when the walker enters the proximity radius."
      >
        <div className="grid grid-cols-3 gap-4">
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
            />
          </Field>
          <Field label="Radius (m)" hint="10–500">
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
        <Field
          label="Google Place ID (optional)"
          hint="Direct identifier if you have it. Faster than parsing the URL above."
        >
          <input
            type="text"
            value={googlePlaceId}
            onChange={(e) => setGooglePlaceId(e.target.value)}
            placeholder="ChIJ..."
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
            placeholder="https://thenesthereford.co.uk"
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

      <Section
        title="Subscription"
        subtitle="Stripe billing comes in Phase 2. Until then, set status manually here. Only 'active' sponsors appear on the public tour."
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
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
        </div>
        <Field
          label="Contact email"
          hint="Where Stripe events route in Phase 2 (cancellation alerts, payment failures)."
        >
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="business@example.co.uk"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </Field>
      </Section>

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
