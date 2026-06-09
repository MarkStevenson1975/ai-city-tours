import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PublishButton } from './publish-button';
import { InviteOperatorForm } from './invite-operator-form';
import { StopsReorder } from './stops-reorder';
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

  const { data: city } = await supabase
    .from('cities')
    .select('*')
    .eq('slug', citySlug)
    .single();
  if (!city) notFound();
  // Archived (deleted) tours are not editable from the dashboard.
  if (city.deleted_at) redirect('/dashboard');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, plan_tier, subscription_status, pause_resume_at')
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
  const planTier = ((profile?.plan_tier as string) ?? 'trail') as Tier;
  const stopLimit = PLAN_STOP_LIMIT[planTier] ?? null;
  const stopCount = stops?.length ?? 0;
  const atStopLimit = stopLimit !== null && stopCount >= stopLimit;

  // A tour is live (publicly visible) when it has a published snapshot.
  const isLive = (city.published_version ?? 0) > 0 && city.published_config != null;

  return (
    <div className="max-w-5xl">
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
            {city.guide_name} · Subscription:{' '}
            <span className="font-bold">{city.subscription_status}</span>
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
          />
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
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
      </div>

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
              {nextTier(planTier) && (
                <UpgradeButton
                  tier={nextTier(planTier) as string}
                  label={`Upgrade to ${PLAN_LABEL[nextTier(planTier) as Tier]}`}
                />
              )}
              <PauseButton />
              <ManageBillingButton citySlug={citySlug} />
            </div>
          </div>
        ) : paused ? (
          <PausedPanel resumeAt={profile?.pause_resume_at ?? null} />
        ) : (
          <SeeItLiveButton citySlug={citySlug} totalStops={stops?.length ?? 0} />
        )}
      </section>

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

      <section className="mb-12 border-t border-gray-200 pt-8">
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

function PublishStatus({
  cityId,
  citySlug,
  publishedVersion,
  publishedAt,
  hasUnpublishedChanges,
  paused,
}: {
  cityId: string;
  citySlug: string;
  publishedVersion: number;
  publishedAt: Date | null;
  hasUnpublishedChanges: boolean;
  paused?: boolean;
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
