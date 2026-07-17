import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PublishButton } from './publish-button';
import { InviteOperatorForm } from './invite-operator-form';
import { StopsReorder } from './stops-reorder';
import { FirstRunRail } from '../first-run-rail';
import { ResumeBanner } from './resume-banner';
import { ManageBillingButton, UpgradeButton } from './go-live-panel';
import { SeeItLiveButton } from './subscribe-modal';
import { PLAN_STOP_LIMIT, PLAN_TOUR_LIMIT, PLAN_LABEL, nextTier, type Tier } from '@/lib/plans';
import { TourActions } from './tour-actions';
import { PauseButton, PausedPanel } from './pause-controls';

export default async function CityOverview({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}) {
  const { citySlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: city } = await supabase
    .from('cities')
    .select('*')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();
  // Archived (deleted) tours are not editable from the dashboard.
  if (city.deleted_at) redirect('/dashboard');

  // Fetch THIS user's profile specifically. Admins can read all profiles under
  // RLS, so without the id filter .single() would match multiple rows, return
  // null, and wrongly treat the admin as a non-admin (gating publish).
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, plan_tier, subscription_status, pause_resume_at')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const subscribed =
    profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing';
  const paused = profile?.subscription_status === 'paused';

  const [{ data: stops }, sponsorCount, factCount, eventCount, visitorCount] =
    await Promise.all([
      supabase
        .from('stops')
        .select(
          'id, position, name, short_description, hero_image_url, hero_image_override_url, updated_at'
        )
        .eq('city_id', city.id)
        .order('position'),
      supabase
        .from('sponsors')
        .select('id', { count: 'exact', head: true })
        .eq('city_id', city.id),
      supabase
        .from('location_facts')
        .select('id', { count: 'exact', head: true })
        .eq('city_id', city.id),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('city_id', city.id),
      supabase
        .from('user_tours')
        .select('id', { count: 'exact', head: true })
        .eq('city_slug', citySlug),
    ]);

  // A tour with no stops yet drops straight into the guided AI build journey
  // rather than showing an empty editor.
  if (!stops || stops.length === 0) {
    redirect(`/dashboard/${citySlug}/build`);
  }

  // Has the draft been edited since the last publish?
  const draftUpdated = city.draft_updated_at
    ? new Date(city.draft_updated_at)
    : null;
  const publishedAt = city.published_at ? new Date(city.published_at) : null;
  const hasUnpublishedChanges =
    !publishedAt || (draftUpdated && draftUpdated > publishedAt);

  // Stop allowance for the current plan (Trail 10, Town 20, Destination null = unlimited).
  // Admins are not a billing entity, so they have no stop limit.
  const planTier = ((profile?.plan_tier as string) ?? 'trail') as Tier;
  const stopLimit = isAdmin ? null : (PLAN_STOP_LIMIT[planTier] ?? null);
  const stopCount = stops?.length ?? 0;
  const atStopLimit = stopLimit !== null && stopCount >= stopLimit;

  // A tour is live (publicly visible) when it has a published snapshot.
  const isLive = (city.published_version ?? 0) > 0 && city.published_config != null;

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-6xl">
      <div className="flex-1 min-w-0">
      <Link
        href="/dashboard"
        className="text-sm text-gray-500 hover:text-primary transition"
      >
        ← All areas
      </Link>

      <header className="mt-4 mb-10 flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
            {city.operator_name || 'Operator unset'}
          </p>
          <h1 className="text-5xl font-semibold mb-2">{city.name}</h1>
          <p className="text-gray-600">
            <span className="font-mono">/{city.slug}</span> · Guide:{' '}
            {city.guide_name} ·{' '}
            <span className="font-bold">
              {isLive ? 'Live' : (city.published_version ?? 0) > 0 ? 'Offline' : 'Draft'}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Link
            href={`/dashboard/${citySlug}/settings`}
            className="text-sm font-bold text-primary hover:underline"
          >
            ⚙ Settings
          </Link>
          <PublishStatus
            cityId={city.id}
            citySlug={city.slug}
            publishedVersion={city.published_version || 0}
            publishedAt={publishedAt}
            hasUnpublishedChanges={Boolean(hasUnpublishedChanges)}
            paused={paused}
            canPublish={subscribed || isAdmin}
          />
        </div>
      </header>

      {/* Unfinished tour: never published, and owned by an operator. Show them
          where they left off, with a way to continue or delete. */}
      {!isAdmin && (city.published_version ?? 0) === 0 && (
        <ResumeBanner
          citySlug={citySlug}
          stopCount={stops?.length ?? 0}
          previewed={Boolean(city.previewed_at)}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-12">
        <Stat label="Stops" value={stops?.length ?? 0} />
        <Stat
          label="Sponsors"
          value={sponsorCount.count ?? 0}
          href={`/dashboard/${citySlug}/sponsors`}
        />
        <Stat
          label="Location facts"
          value={factCount.count ?? 0}
          href={`/dashboard/${citySlug}/location-facts`}
        />
        <Stat
          label="Events"
          value={eventCount.count ?? 0}
          href={`/dashboard/${citySlug}/events`}
        />
        <Stat
          label="Visitors"
          value={visitorCount.count ?? 0}
          href={`/dashboard/${citySlug}/visitors`}
        />
        <NavTile label="Settings" href={`/dashboard/${citySlug}/settings`} />
      </div>

      {!isAdmin && (
      <section className="mb-12">
        {subscribed ? (
          <div className="bg-white rounded-xl p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-gray-600">
              Your account is on the <span className="font-bold">{PLAN_LABEL[planTier]}</span> plan
              {' '}({PLAN_TOUR_LIMIT[planTier] === null
                ? 'unlimited tours'
                : `${PLAN_TOUR_LIMIT[planTier]} tour${PLAN_TOUR_LIMIT[planTier] === 1 ? '' : 's'}`}
              {stopLimit === null ? ', unlimited stops' : `, up to ${stopLimit} stops each`}).
            </p>
            <div className="flex items-center gap-4">
              <PauseButton />
              <ManageBillingButton citySlug={citySlug} />
              {nextTier(planTier) && (
                <UpgradeButton
                  tier={nextTier(planTier) as string}
                  label={`Upgrade to ${PLAN_LABEL[nextTier(planTier) as Tier]}`}
                />
              )}
            </div>
          </div>
        ) : paused ? (
          <PausedPanel resumeAt={profile?.pause_resume_at ?? null} />
        ) : (
          <SeeItLiveButton citySlug={citySlug} totalStops={stops?.length ?? 0} />
        )}
      </section>
      )}

      {isAdmin && (
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Operator access</h2>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <p className="text-sm text-gray-600 mb-6">
              Invite the operator who will manage this area. They will receive
              an email with a link to set their password. They will only have
              access to this area.
            </p>
            <InviteOperatorForm citySlug={citySlug} />
          </div>
        </section>
      )}

      {isLive && (
        <section className="mb-12">
          <div className="bg-primary text-cream rounded-xl p-6 shadow-sm flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-semibold mb-1">Tell the world</h2>
              <p className="text-sm text-cream/80 max-w-xl">
                Your tour is live. Grab your branded poster for windows and
                signage, and lift ready-made Facebook, Instagram and LinkedIn
                posts straight into your channels.
              </p>
            </div>
            <Link
              href={`/dashboard/${citySlug}/promote`}
              className="px-6 py-3 rounded-full bg-accent text-primary font-bold hover:bg-accent-light transition whitespace-nowrap"
            >
              Promote my tour
            </Link>
          </div>
        </section>
      )}

      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-3xl font-semibold">Stops</h2>
          {atStopLimit ? (
            <span
              className="text-sm font-bold text-amber-800 bg-amber-100 px-4 py-2 rounded-full"
              title="Upgrade your plan to add more stops"
            >
              {PLAN_LABEL[planTier]} limit of {stopLimit} stops reached — upgrade to add more
            </span>
          ) : (
            <Link
              href={`/dashboard/${citySlug}/stops/new`}
              className="px-4 py-2 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition"
            >
              + Add stop
            </Link>
          )}
        </div>
        <StopsReorder citySlug={citySlug} initialStops={stops ?? []} stopLimit={stopLimit} />
      </section>

      <section id="manage-tour" className="mb-12 border-t border-gray-200 pt-8 scroll-mt-6">
        <h2 className="text-2xl font-semibold mb-1">Manage tour</h2>
        <p className="text-sm text-gray-600 mb-4 max-w-xl">
          {isLive
            ? 'Unpublish to take this tour offline while keeping your draft, or delete it to remove it from your dashboard. Deleted tours are archived and kept for 7 years, not permanently erased.'
            : 'Delete this tour to remove it from your dashboard. Deleted tours are archived and kept for 7 years, not permanently erased.'}
        </p>
        <TourActions
          cityId={city.id}
          citySlug={city.slug}
          cityName={city.name}
          isLive={isLive}
        />
      </section>
      </div>

      {/* First-run guidance: stays with the operator until their tour is live. */}
      {!isAdmin && !publishedAt && (
        <FirstRunRail
          state={{
            hasCity: true,
            stopCount,
            previewed: Boolean(city.previewed_at),
            published: Boolean(city.published_at),
            citySlug: city.slug,
            // Honest "you are here": if the tour was abandoned early, point at
            // the step they still owe rather than always Publish.
            currentStep:
              stopCount === 0 ? 2 : !city.previewed_at ? 3 : 4,
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-4xl font-display font-semibold text-primary">
        {value}
      </p>
      <p className="text-xs uppercase tracking-wider text-gray-600 mt-1 font-bold">
        {label}
      </p>
    </>
  );
  const className = 'block bg-white rounded-xl p-5 shadow-sm';
  if (href) {
    return (
      <Link
        href={href}
        className={`${className} hover:shadow-md hover:border-accent border border-transparent transition`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

// A KPI-styled tile that is a shortcut rather than a count. Used to surface
// Settings alongside the stat tiles, because operators reported it was hard to
// find buried in the nav.
function NavTile({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-xl p-5 shadow-sm hover:shadow-md hover:border-accent border border-transparent transition"
    >
      <svg
        className="w-9 h-9 text-primary"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <p className="text-xs uppercase tracking-wider text-gray-600 mt-2 font-bold">
        {label}
      </p>
    </Link>
  );
}

function PublishStatus({
  cityId,
  citySlug,
  publishedVersion,
  publishedAt,
  hasUnpublishedChanges,
  paused,
  canPublish,
}: {
  cityId: string;
  citySlug: string;
  publishedVersion: number;
  publishedAt: Date | null;
  hasUnpublishedChanges: boolean;
  paused?: boolean;
  canPublish: boolean;
}) {
  // While paused, publishing is blocked so tours stay offline until the
  // operator resumes and republishes.
  if (paused) {
    return (
      <div className="text-right flex-shrink-0 min-w-[200px]">
        <span className="inline-block text-sm font-bold text-amber-800 bg-amber-100 px-4 py-2 rounded-full">
          Paused — resume to publish
        </span>
        <p className="text-xs text-gray-500 mt-2">
          {publishedVersion > 0 ? `Published v${publishedVersion}` : 'Never published'}
        </p>
      </div>
    );
  }
  return (
    <div className="text-right flex-shrink-0 min-w-[200px]">
      <PublishButton
        cityId={cityId}
        citySlug={citySlug}
        hasChanges={hasUnpublishedChanges}
        canPublish={canPublish}
      />
      <p className="text-xs text-gray-500 mt-2">
        {publishedVersion > 0 ? `Published v${publishedVersion}` : 'Never published'}
        {publishedAt && (
          <>
            {' '}· {formatRelative(publishedAt)}
          </>
        )}
      </p>
      {hasUnpublishedChanges && (
        <p className="text-xs text-amber-700 font-bold mt-1">
          Draft has unpublished changes
        </p>
      )}
    </div>
  );
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
