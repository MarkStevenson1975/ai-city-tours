'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEvent, updateEvent, deleteEvent, type EventInput } from './actions';

interface EventRow {
  id: string;
  name: string;
  emoji: string | null;
  month: number;
  month_to: number | null;
  day_from: number;
  day_to: number;
  year_cycle: number | null;
  next_year: number | null;
  upcoming_text: string | null;
  during_text: string | null;
  recent_text: string | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  citySlug: string;
  cityId: string;
  event?: EventRow;
}

export function EventForm({ citySlug, cityId, event }: Props) {
  const router = useRouter();
  const isNew = !event;
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(event?.name ?? '');
  const [emoji, setEmoji] = useState(event?.emoji ?? '');
  const [month, setMonth] = useState(String(event?.month ?? new Date().getMonth() + 1));
  const [monthTo, setMonthTo] = useState(event?.month_to ? String(event.month_to) : '');
  const [dayFrom, setDayFrom] = useState(String(event?.day_from ?? 1));
  const [dayTo, setDayTo] = useState(String(event?.day_to ?? 1));
  const [yearCycle, setYearCycle] = useState(event?.year_cycle?.toString() ?? '');
  const [nextYear, setNextYear] = useState(event?.next_year?.toString() ?? '');
  const [upcomingText, setUpcomingText] = useState(event?.upcoming_text ?? '');
  const [duringText, setDuringText] = useState(event?.during_text ?? '');
  const [recentText, setRecentText] = useState(event?.recent_text ?? '');

  function buildInput(): EventInput {
    return {
      name,
      emoji,
      month: parseInt(month, 10) || 1,
      month_to: monthTo ? parseInt(monthTo, 10) : null,
      day_from: parseInt(dayFrom, 10) || 1,
      day_to: parseInt(dayTo, 10) || 1,
      year_cycle: yearCycle ? parseInt(yearCycle, 10) : null,
      next_year: nextYear ? parseInt(nextYear, 10) : null,
      upcoming_text: upcomingText,
      during_text: duringText,
      recent_text: recentText,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const input = buildInput();
    startTransition(async () => {
      if (isNew) {
        const r = await createEvent(cityId, citySlug, input);
        if (!r.ok) setError(r.error);
        else router.push(`/dashboard/${citySlug}/events`);
      } else {
        const r = await updateEvent(event!.id, citySlug, input);
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
    if (!event) return;
    if (!window.confirm(`Delete event "${event.name}"? This cannot be undone.`))
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteEvent(event.id, citySlug);
      if (!r.ok) setError(r.error);
      else router.push(`/dashboard/${citySlug}/events`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 bg-white rounded-xl p-8 shadow-sm"
    >
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Field label="Event name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. May Fair"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Emoji" hint="Single character">
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={4}
            className={`w-24 ${inputCls} text-2xl`}
          />
        </Field>
      </div>

      <Section
        title="When"
        subtitle="Month and day range. Leave the end month as 'Same month' for events that stay within one month, or pick a later month for ones that roll over (e.g. 26 March to 5 April). Used to detect upcoming, during, and recent events on the splash screen."
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start month" required>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={inputCls}
            >
              {MONTHS.map((name, i) => (
                <option key={i} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="End month" hint="Leave as 'Same month' unless the event runs into a later month.">
            <select
              value={monthTo}
              onChange={(e) => setMonthTo(e.target.value)}
              className={inputCls}
            >
              <option value="">Same month</option>
              {MONTHS.map((name, i) => (
                <option key={i} value={i + 1}>
                  {name}
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
              value={dayFrom}
              onChange={(e) => setDayFrom(e.target.value)}
              required
              className={inputCls}
            />
          </Field>
          <Field label="End day" required hint="The day in the end month (or the start month if no end month is set).">
            <input
              type="number"
              min={1}
              max={31}
              value={dayTo}
              onChange={(e) => setDayTo(e.target.value)}
              required
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Year cycle (optional)"
            hint="For events that don't run every year. e.g. 3 means every 3 years."
          >
            <input
              type="number"
              min={1}
              max={20}
              value={yearCycle}
              onChange={(e) => setYearCycle(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field
            label="Next year (optional)"
            hint="Anchor year for the cycle above. Required if year cycle is set."
          >
            <input
              type="number"
              min={2024}
              max={2099}
              value={nextYear}
              onChange={(e) => setNextYear(e.target.value)}
              placeholder="2024"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Splash messages"
        subtitle="The guide says one of these on the splash screen depending on whether the event is coming up, currently happening, or recently finished."
      >
        <Field label="Upcoming (within 10 days before start)">
          <textarea
            value={upcomingText}
            onChange={(e) => setUpcomingText(e.target.value)}
            rows={2}
            placeholder="The May Fair is coming up soon..."
            className={inputCls}
          />
        </Field>
        <Field label="During (event is on right now)">
          <textarea
            value={duringText}
            onChange={(e) => setDuringText(e.target.value)}
            rows={2}
            placeholder="The May Fair is on right now..."
            className={inputCls}
          />
        </Field>
        <Field label="Recent (within 7 days after end)">
          <textarea
            value={recentText}
            onChange={(e) => setRecentText(e.target.value)}
            rows={2}
            placeholder="The May Fair has just finished..."
            className={inputCls}
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
            Delete event
          </button>
        ) : (
          <span></span>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
        >
          {isPending ? 'Saving…' : isNew ? 'Create event' : 'Save changes'}
        </button>
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
      <h2 className="text-xl font-semibold mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-gray-600 mb-4">{subtitle}</p>}
      <div className="space-y-4">{children}</div>
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
