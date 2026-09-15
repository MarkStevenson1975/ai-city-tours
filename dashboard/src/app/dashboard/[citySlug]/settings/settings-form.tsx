'use client';

import { useEffect, useState, useTransition } from 'react';
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
  color_highlight: string | null;
  font_heading: string | null;
  font_body: string | null;
  tour_kind: string | null;
  event_month: number | null;
  event_day_from: number | null;
  event_day_to: number | null;
  event_month_to: number | null;
  event_year: number | null;
  event_auto_schedule: boolean | null;
  guide_name: string | null;
  guide_voice_id: string | null;
  travel_mode: string | null;
  tour_complete_message: string | null;
  tour_complete_suggestion: string | null;
  tripadvisor_review_url: string | null;
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

const TRAVEL_MODE_OPTIONS = [
  { value: 'walking', label: 'Walking tour' },
  { value: 'cycling', label: 'Bike tour' },
  { value: 'driving', label: 'Driving tour' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Curated font lists. Headings can carry personality; body fonts are chosen for
// legibility at small sizes on a phone outdoors. Keep these in sync with the
// SD_FONTS map in tour.html — a value not in that map falls back to the default.
// Each entry carries a CSS stack purely for the on-screen preview here.
const HEADING_FONTS: { value: string; label: string; group: string; stack: string }[] = [
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond (default)', group: 'Classic and heritage', stack: '"Cormorant Garamond", Georgia, serif' },
  { value: 'Playfair Display', label: 'Playfair Display', group: 'Classic and heritage', stack: '"Playfair Display", Georgia, serif' },
  { value: 'Fraunces', label: 'Fraunces', group: 'Classic and heritage', stack: '"Fraunces", Georgia, serif' },
  { value: 'Marcellus', label: 'Marcellus', group: 'Classic and heritage', stack: '"Marcellus", Georgia, serif' },
  { value: 'Cinzel', label: 'Cinzel (capitals only)', group: 'Classic and heritage', stack: '"Cinzel", Georgia, serif' },
  { value: 'Libre Baskerville', label: 'Libre Baskerville', group: 'Classic and heritage', stack: '"Libre Baskerville", Georgia, serif' },
  { value: 'Poppins', label: 'Poppins', group: 'Modern and clean', stack: '"Poppins", system-ui, sans-serif' },
  { value: 'Montserrat', label: 'Montserrat', group: 'Modern and clean', stack: '"Montserrat", system-ui, sans-serif' },
  { value: 'DM Serif Display', label: 'DM Serif Display', group: 'Modern and clean', stack: '"DM Serif Display", Georgia, serif' },
  { value: 'Oswald', label: 'Oswald', group: 'Modern and clean', stack: '"Oswald", system-ui, sans-serif' },
];

const BODY_FONTS: { value: string; label: string; stack: string }[] = [
  { value: 'Lato', label: 'Lato (default)', stack: '"Lato", system-ui, sans-serif' },
  { value: 'Inter', label: 'Inter', stack: '"Inter", system-ui, sans-serif' },
  { value: 'Source Sans 3', label: 'Source Sans 3', stack: '"Source Sans 3", system-ui, sans-serif' },
  { value: 'Work Sans', label: 'Work Sans', stack: '"Work Sans", system-ui, sans-serif' },
  { value: 'Open Sans', label: 'Open Sans', stack: '"Open Sans", system-ui, sans-serif' },
  { value: 'Nunito Sans', label: 'Nunito Sans', stack: '"Nunito Sans", system-ui, sans-serif' },
  { value: 'Mulish', label: 'Mulish', stack: '"Mulish", system-ui, sans-serif' },
  { value: 'Lora', label: 'Lora (serif, use for a bookish feel)', stack: '"Lora", Georgia, serif' },
];

const HEADING_GROUPS = ['Classic and heritage', 'Modern and clean'];

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
  // Highlight drives the completed/visited tick and the events banner on the
  // tour. Defaults to the original green so nothing changes until it is set.
  const [colorHighlight, setColorHighlight] = useState(
    city.color_highlight ?? '#40916C'
  );
  const [fontHeading, setFontHeading] = useState(
    city.font_heading ?? 'Cormorant Garamond'
  );
  const [fontBody, setFontBody] = useState(city.font_body ?? 'Lato');

  // Event tours carry a date and an optional auto-schedule (countdown + ended
  // screen). These fields only apply, and only render, when tour_kind is event.
  const isEventTour = city.tour_kind === 'event';
  const [evMonth, setEvMonth] = useState(
    String(city.event_month ?? new Date().getMonth() + 1)
  );
  const [evMonthTo, setEvMonthTo] = useState(
    city.event_month_to ? String(city.event_month_to) : ''
  );
  const [evDayFrom, setEvDayFrom] = useState(String(city.event_day_from ?? 1));
  const [evDayTo, setEvDayTo] = useState(String(city.event_day_to ?? 1));
  const [evRepeatsYearly, setEvRepeatsYearly] = useState(city.event_year == null);
  const [evYear, setEvYear] = useState(
    String(city.event_year ?? new Date().getFullYear())
  );
  const [evAutoSchedule, setEvAutoSchedule] = useState(
    Boolean(city.event_auto_schedule)
  );

  // Guide
  const [guideName, setGuideName] = useState(city.guide_name ?? '');
  const [guideVoiceId, setGuideVoiceId] = useState(city.guide_voice_id ?? '');

  // Tour format
  const [travelMode, setTravelMode] = useState(city.travel_mode ?? 'walking');

  // Tour completion
  const [tourCompleteMessage, setTourCompleteMessage] = useState(city.tour_complete_message ?? '');
  const [tourCompleteSuggestion, setTourCompleteSuggestion] = useState(city.tour_complete_suggestion ?? '');
  const [tripadvisorReviewUrl, setTripadvisorReviewUrl] = useState(city.tripadvisor_review_url ?? '');

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
        color_highlight: colorHighlight,
        font_heading: fontHeading,
        font_body: fontBody,
        // Only send event scheduling for event tours, so a town/venue tour is
        // never given stray event dates.
        ...(isEventTour
          ? {
              event: {
                month: parseInt(evMonth, 10) || 1,
                month_to: evMonthTo ? parseInt(evMonthTo, 10) : null,
                day_from: parseInt(evDayFrom, 10) || 1,
                day_to: parseInt(evDayTo, 10) || 1,
                year: evRepeatsYearly ? null : parseInt(evYear, 10) || null,
                auto_schedule: evAutoSchedule,
              },
            }
          : {}),
        guide_name: guideName,
        guide_voice_id: guideVoiceId,
        travel_mode: travelMode,
        tour_complete_message: tourCompleteMessage,
        tour_complete_suggestion: tourCompleteSuggestion,
        tripadvisor_review_url: tripadvisorReviewUrl,
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
            <div className="grid grid-cols-2 gap-4">
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
              <ColorField
                label="Highlight"
                hint="Completed stop ticks and the events banner"
                value={colorHighlight}
                onChange={setColorHighlight}
              />
            </div>
            <BrandPreview
              primary={colorPrimary}
              accent={colorAccent}
              background={colorBackground}
              highlight={colorHighlight}
              guideName={guideName || 'Guide'}
              cityName={cityName || 'City'}
            />
          </div>

          <div className="border-t border-gray-200 pt-6">
            <p className="block text-sm font-bold mb-1">Tour fonts</p>
            <p className="text-xs text-gray-500 mb-3">
              The heading font can carry personality. The body font is the one
              visitors actually read, so it stays on a tight, legible list.
              Leave both as the defaults for the classic Storied look.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Heading font" hint="Titles, the city name and the guide name. Suits short lines best.">
                <select
                  value={fontHeading}
                  onChange={(e) => setFontHeading(e.target.value)}
                  className={inputCls}
                >
                  {HEADING_GROUPS.map((grp) => (
                    <optgroup key={grp} label={grp}>
                      {HEADING_FONTS.filter((f) => f.group === grp).map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Body font" hint="The reading text across the whole tour. All options are legible on a phone.">
                <select
                  value={fontBody}
                  onChange={(e) => setFontBody(e.target.value)}
                  className={inputCls}
                >
                  {BODY_FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <FontPreview heading={fontHeading} body={fontBody} cityName={cityName || 'City'} />
          </div>
        </div>
      </Section>

      {/* EVENT DATES (event tours only) */}
      {isEventTour && (
        <Section title="Event dates">
          <div className="bg-white rounded-xl p-8 shadow-sm space-y-6">
            <p className="text-sm text-gray-500">
              This is an event tour. Set when the event runs. It can be a one-off
              on a set date, or repeat every year.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start month" required>
                <select
                  value={evMonth}
                  onChange={(e) => setEvMonth(e.target.value)}
                  className={inputCls}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="End month"
                hint="Leave as 'Same month' unless it runs into a later month."
              >
                <select
                  value={evMonthTo}
                  onChange={(e) => setEvMonthTo(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Same month</option>
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start day" required>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={evDayFrom}
                  onChange={(e) => setEvDayFrom(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="End day" required hint="Same as the start day for a single-day event.">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={evDayTo}
                  onChange={(e) => setEvDayTo(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <label className="flex items-center gap-3 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={evRepeatsYearly}
                onChange={(e) => setEvRepeatsYearly(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              Repeats every year
            </label>
            {!evRepeatsYearly && (
              <Field label="Year" hint="The year this one-off event runs.">
                <input
                  type="number"
                  min={2024}
                  max={2099}
                  value={evYear}
                  onChange={(e) => setEvYear(e.target.value)}
                  className={`${inputCls} max-w-[10rem]`}
                />
              </Field>
            )}

            <label className="flex items-start gap-3 text-sm cursor-pointer border-t border-gray-200 pt-5">
              <input
                type="checkbox"
                checked={evAutoSchedule}
                onChange={(e) => setEvAutoSchedule(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-primary"
              />
              <span>
                <span className="font-bold">Manage the tour around the date automatically</span>
                <span className="block text-gray-500 mt-1">
                  Show a countdown on the tour before it starts. After a one-off
                  event finishes, visitors see a friendly &quot;this event has
                  ended&quot; message instead of the tour. A yearly event simply
                  counts down to next time. Leave off to publish and unpublish it
                  yourself.
                </span>
              </span>
            </label>
          </div>
        </Section>
      )}

      {/* GUIDE */}
      {/* TOUR FORMAT */}
      <Section title="Tour format">
        <div className="bg-white rounded-xl p-8 shadow-sm space-y-6">
          <Field
            label="Tour type"
            hint="How visitors travel between stops. This sets the maps, routing and estimated times to walking, cycling or driving."
          >
            <select
              value={travelMode}
              onChange={(e) => setTravelMode(e.target.value)}
              className={inputCls}
            >
              {TRAVEL_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

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

          <Field
            label="TripAdvisor review link"
            hint="Optional. Paste your TripAdvisor review page URL and a 'Leave a review on TripAdvisor' button appears when a visitor finishes the tour. Leave blank to hide it."
          >
            <input
              type="url"
              value={tripadvisorReviewUrl}
              onChange={(e) => setTripadvisorReviewUrl(e.target.value)}
              placeholder="https://www.tripadvisor.co.uk/UserReviewEdit-..."
              className={`${inputCls} font-mono text-sm`}
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
  highlight,
  guideName,
  cityName,
}: {
  primary: string;
  accent: string;
  background: string;
  highlight: string;
  guideName: string;
  cityName: string;
}) {
  const hlTint = hexToRgba(highlight, 0.12);
  const hlBorder = hexToRgba(highlight, 0.3);
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
        {/* Highlight preview: completed tick + events banner both follow it */}
        <div className="flex items-center justify-center gap-2 mt-5">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: highlight, color: background }}
          >
            ✓
          </span>
          <span
            className="text-[11px] font-bold px-3 py-1.5 rounded-md"
            style={{
              background: hlTint,
              border: `1px solid ${hlBorder}`,
              color: highlight,
            }}
          >
            📅 Happening in {cityName}
          </span>
        </div>
        <p className="text-[10px] opacity-50 mt-3 italic">
          Live preview of splash, completed tick and events colours
        </p>
      </div>
    </div>
  );
}

/** Loads a Google Fonts family (for the preview only) once per family name. */
function ensurePreviewFont(family: string) {
  if (typeof document === 'undefined') return;
  const id = 'sd-font-preview-' + family.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  const spec = family.replace(/ /g, '+') + ':wght@400;600;700';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}

function FontPreview({
  heading,
  body,
  cityName,
}: {
  heading: string;
  body: string;
  cityName: string;
}) {
  useEffect(() => {
    ensurePreviewFont(heading);
    ensurePreviewFont(body);
  }, [heading, body]);

  const headingStack =
    HEADING_FONTS.find((f) => f.value === heading)?.stack ??
    '"Cormorant Garamond", Georgia, serif';
  const bodyStack =
    BODY_FONTS.find((f) => f.value === body)?.stack ?? '"Lato", system-ui, sans-serif';

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold mb-3">
        Font preview
      </p>
      <h3 className="text-3xl mb-1" style={{ fontFamily: headingStack, fontWeight: 600 }}>
        {cityName}
      </h3>
      <p className="text-base leading-relaxed text-gray-700" style={{ fontFamily: bodyStack }}>
        Welcome. Over the next hour or so I will walk you through the streets and
        stories that make this place what it is. Take your time, and let us begin.
      </p>
    </div>
  );
}

/** #RRGGBB → rgba() string; falls back to the default green if malformed. */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9A-Fa-f]{6})$/.exec((hex || '').trim());
  const h = m ? m[1] : '40916C';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
