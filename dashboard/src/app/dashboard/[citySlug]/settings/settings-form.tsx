'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSettings } from './actions';
import { SponsorLogoUpload } from './sponsor-logo-upload';

interface City {
  id: string;
  slug: string;
  name: string;
  postcode_area: string | null;
  splash_intro: string | null;
  operator_name: string | null;
  operator_type: string | null;
  operator_email: string | null;
  operator_attribution_text: string | null;
  color_primary: string | null;
  color_accent: string | null;
  color_background: string | null;
  guide_name: string | null;
  guide_voice_id: string | null;
  tour_complete_message: string | null;
  tour_complete_suggestion: string | null;
  tc_sponsor_name: string | null;
  tc_sponsor_logo_url: string | null;
  tc_sponsor_url: string | null;
  tc_sponsor_tagline: string | null;
}

const TYPE_OPTIONS = [
  { value: 'bid', label: 'Business Improvement District (BID)' },
  { value: 'tourist_board', label: 'Tourist Board' },
  { value: 'council', label: 'Local Council' },
  { value: 'dmo', label: 'Destination Marketing Organisation (DMO)' },
  { value: 'other', label: 'Other' },
];

export function SettingsForm({ city }: { city: City }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Operator
  const [operatorName, setOperatorName] = useState(city.operator_name ?? '');
  const [operatorType, setOperatorType] = useState(
    city.operator_type ?? 'other'
  );
  const [operatorEmail, setOperatorEmail] = useState(city.operator_email ?? '');
  const [attributionText, setAttributionText] = useState(
    city.operator_attribution_text ?? ''
  );

  // City branding
  const [cityName, setCityName] = useState(city.name);
  const [postcodeArea, setPostcodeArea] = useState(city.postcode_area ?? '');
  const [splashIntro, setSplashIntro] = useState(city.splash_intro ?? '');
  const [colorPrimary, setColorPrimary] = useState(
    city.color_primary ?? '#1B4332'
  );
  const [colorAccent, setColorAccent] = useState(
    city.color_accent ?? '#C9A84C'
  );
  const [colorBackground, setColorBackground] = useState(
    city.color_background ?? '#F5F0E8'
  );

  // Guide
  const [guideName, setGuideName] = useState(city.guide_name ?? '');
  const [guideVoiceId, setGuideVoiceId] = useState(city.guide_voice_id ?? '');

  // Tour completion
  const [tourCompleteMessage, setTourCompleteMessage] = useState(city.tour_complete_message ?? '');
  const [tourCompleteSuggestion, setTourCompleteSuggestion] = useState(city.tour_complete_suggestion ?? '');

  // Completion screen sponsor
  // (the logo is handled by the SponsorLogoUpload component, which saves on its own)
  const [tcSponsorName, setTcSponsorName] = useState(city.tc_sponsor_name ?? '');
  const [tcSponsorUrl, setTcSponsorUrl] = useState(city.tc_sponsor_url ?? '');
  const [tcSponsorTagline, setTcSponsorTagline] = useState(city.tc_sponsor_tagline ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await saveSettings({
        cityId: city.id,
        citySlug: city.slug,
        operator_name: operatorName,
        operator_type: operatorType,
        operator_email: operatorEmail,
        operator_attribution_text: attributionText,
        city_name: cityName,
        postcode_area: postcodeArea,
        splash_intro: splashIntro,
        color_primary: colorPrimary,
        color_accent: colorAccent,
        color_background: colorBackground,
        guide_name: guideName,
        guide_voice_id: guideVoiceId,
        tour_complete_message: tourCompleteMessage,
        tour_complete_suggestion: tourCompleteSuggestion,
        tc_sponsor_name: tcSponsorName,
        tc_sponsor_url: tcSponsorUrl,
        tc_sponsor_tagline: tcSponsorTagline,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* OPERATOR */}
      <Section title="Operator details">
        <div className="bg-white rounded-xl p-8 shadow-sm space-y-6">
          <Field label="Operator name" hint="The organisation that bought this tour.">
            <input
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              placeholder="e.g. Tourist Information Centre or BID"
              className={inputCls}
            />
          </Field>
          <Field label="Operator type" hint="Used in admin reporting + the operator badge.">
            <select
              value={operatorType}
              onChange={(e) => setOperatorType(e.target.value)}
              className={inputCls}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Operator email" hint="Where Stripe events route in Phase 2.">
            <input
              type="email"
              value={operatorEmail}
              onChange={(e) => setOperatorEmail(e.target.value)}
              placeholder="contact@operator.co.uk"
              className={inputCls}
            />
          </Field>
          <Field
            label="Splash attribution text"
            hint='Small text below the logo on the splash. Default: "Brought to you by [Operator]".'
          >
            <input
              type="text"
              value={attributionText}
              onChange={(e) => setAttributionText(e.target.value)}
              placeholder={`Brought to you by ${operatorName || '...'}`}
              maxLength={120}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* CITY BRANDING */}
      <Section title="City branding">
        <div className="bg-white rounded-xl p-8 shadow-sm space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="City name" required>
              <input
                type="text"
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Postcode area" hint="e.g. HR1, GL1, WR1">
              <input
                type="text"
                value={postcodeArea}
                onChange={(e) => setPostcodeArea(e.target.value)}
                maxLength={10}
                className={inputCls}
              />
            </Field>
          </div>
          <p className="text-xs text-gray-500 italic">
            URL slug (<span className="font-mono">/{city.slug}</span>) is fixed
            once an area is created. Changing it requires a new area to be set up.
          </p>

          <Field
            label="Welcome introduction"
            hint="The paragraph the guide reads aloud (and shows on screen) when the visitor first opens the tour. Speak directly to them — what kind of walk this is, what to expect. Leave blank to use a sensible default that auto-substitutes the guide name and city name."
          >
            <textarea
              value={splashIntro}
              onChange={(e) => setSplashIntro(e.target.value)}
              rows={5}
              maxLength={800}
              placeholder="Hello, I'm Harriet. I'll be your guide today as we walk through some of the town's most fascinating places. Along the way I'll share stories, hidden details, and a few local secrets. Whenever you're ready, let's begin."
              className={inputCls}
            />
          </Field>

          <div>
            <p className="block text-sm font-bold mb-1">Brand colours</p>
            <p className="text-xs text-gray-500 mb-3">
              Used across the public tour. Click the swatch to pick, or type a
              6-digit hex code (e.g. #1B4332).
            </p>
            <div className="grid grid-cols-3 gap-4">
              <ColorField
                label="Primary"
                hint="Headers, buttons, dark backgrounds"
                value={colorPrimary}
                onChange={setColorPrimary}
              />
              <ColorField
                label="Accent"
                hint="Highlights, badges, gold details"
                value={colorAccent}
                onChange={setColorAccent}
              />
              <ColorField
                label="Background"
                hint="Page background, cards"
                value={colorBackground}
                onChange={setColorBackground}
              />
            </div>
            <BrandPreview
              primary={colorPrimary}
              accent={colorAccent}
              background={colorBackground}
              guideName={guideName || 'Guide'}
              cityName={cityName || 'City'}
            />
          </div>
        </div>
      </Section>

      {/* GUIDE */}
      <Section title="AI guide">
        <div className="bg-white rounded-xl p-8 shadow-sm space-y-6">
          <Field
            label="Guide name"
            hint="The name of the AI guide users hear. Hereford has 'Harriet'."
          >
            <input
              type="text"
              value={guideName}
              onChange={(e) => setGuideName(e.target.value)}
              maxLength={40}
              placeholder="Harriet"
              className={inputCls}
            />
          </Field>
          <Field
            label="ElevenLabs voice ID"
            hint="The voice Harriet (or whoever) speaks with. Find IDs in your ElevenLabs library."
          >
            <input
              type="text"
              value={guideVoiceId}
              onChange={(e) => setGuideVoiceId(e.target.value)}
              placeholder="NTqGiNK8P02i66yY2GOH"
              className={`${inputCls} font-mono text-sm`}
            />
          </Field>
        </div>
      </Section>

      {/* TOUR COMPLETION */}
      <Section title="Tour completion screen">
        <div className="bg-white rounded-xl p-8 shadow-sm space-y-6">
          <Field
            label="Completion narration"
            hint="What the guide says (and Harriet speaks aloud) when the visitor finishes all stops. Leave blank for a sensible default."
          >
            <textarea
              value={tourCompleteMessage}
              onChange={(e) => setTourCompleteMessage(e.target.value)}
              rows={5}
              maxLength={800}
              placeholder={`Well done, you've done it. Every stop, every story, every stamp. ${cityName || 'Your city'} has shown you what it really is. We hope it has earned a return visit.`}
              className={inputCls}
            />
          </Field>
          <Field
            label="Final suggestion text"
            hint="The recommendation shown on the completion screen (e.g. a nearby pub or cafe). Leave blank for a sensible default."
          >
            <textarea
              value={tourCompleteSuggestion}
              onChange={(e) => setTourCompleteSuggestion(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder={`Why not find somewhere to sit and reflect? Or ask ${guideName || 'your guide'} to help you find something nearby.`}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* COMPLETION SCREEN SPONSOR */}
      <Section title="Completion screen sponsor">
        <div className="bg-white rounded-xl p-8 shadow-sm space-y-6">
          <p className="text-sm text-gray-500">
            Optional. If a sponsor name is set, a branded sponsor block will appear on the
            tour completion screen. Leave all fields blank to hide the block entirely.
          </p>
          <Field
            label="Sponsor name"
            hint="The organisation sponsoring this tour. Shown prominently on the completion screen."
          >
            <input
              type="text"
              value={tcSponsorName}
              onChange={(e) => setTcSponsorName(e.target.value)}
              placeholder="e.g. a local business or society"
              maxLength={100}
              className={inputCls}
            />
          </Field>
          <Field
            label="Sponsor logo"
            hint="Upload the sponsor's logo image. Wide rectangular logos work best."
          >
            <SponsorLogoUpload
              cityId={city.id}
              citySlug={city.slug}
              currentLogoUrl={city.tc_sponsor_logo_url}
            />
          </Field>
          <Field
            label="Sponsor website URL"
            hint="Optional. If set, the sponsor block becomes a clickable link."
          >
            <input
              type="url"
              value={tcSponsorUrl}
              onChange={(e) => setTcSponsorUrl(e.target.value)}
              placeholder="https://sponsor-website.co.uk"
              className={inputCls}
            />
          </Field>
          <Field
            label="Sponsor tagline"
            hint="Optional short line shown below the sponsor name (e.g. 'Proudly supporting the local community')."
          >
            <input
              type="text"
              value={tcSponsorTagline}
              onChange={(e) => setTcSponsorTagline(e.target.value)}
              placeholder="Proudly supporting the local community"
              maxLength={120}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* MESSAGES */}
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

      {/* SUBMIT */}
      <div className="flex justify-end pt-4 border-t border-gray-200 sticky bottom-0 bg-cream py-4">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-3">{title}</h2>
      {children}
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

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1">{label}</label>
      {hint && <p className="text-[11px] text-gray-500 mb-2 leading-tight">{hint}</p>}
      <div className="flex gap-2 items-stretch">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="w-12 h-10 rounded border border-gray-300 cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="flex-1 px-3 py-2 rounded border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function BrandPreview({
  primary,
  accent,
  background,
  guideName,
  cityName,
}: {
  primary: string;
  accent: string;
  background: string;
  guideName: string;
  cityName: string;
}) {
  return (
    <div
      className="mt-6 rounded-xl overflow-hidden border border-gray-200"
      style={{ background: primary, color: background }}
    >
      <div className="p-6 text-center">
        <p
          className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2"
          style={{ color: accent }}
        >
          Guided walk
        </p>
        <h3
          className="text-3xl font-semibold mb-1"
          style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
        >
          {cityName}
        </h3>
        <p
          className="text-sm italic opacity-75 mb-4"
          style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
        >
          with {guideName}
        </p>
        <div
          className="inline-block px-6 py-2 rounded-full text-sm font-bold"
          style={{ background: accent, color: primary }}
        >
          Start the Tour
        </div>
        <p className="text-[10px] opacity-50 mt-3 italic">
          Live preview of splash screen styling
        </p>
      </div>
    </div>
  );
}
