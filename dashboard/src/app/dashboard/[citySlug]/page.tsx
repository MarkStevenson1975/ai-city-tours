import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PublishButton } from './publish-button';
import { InviteOperatorForm } from './invite-operator-form';
import { StopsReorder } from './stops-reorder';

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

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .single();

  const isAdmin = profile?.role === 'admin';

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

      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-3xl font-semibold">Stops</h2>
          <Link
            href={`/dashboard/${citySlug}/stops/new`}
            className="px-4 py-2 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition"
          >
            + Add stop
          </Link>
        </div>
        <StopsReorder citySlug={citySlug} initialStops={stops ?? []} />
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
}: {
  cityId: string;
  citySlug: string;
  publishedVersion: number;
  publishedAt: Date | null;
  hasUnpublishedChanges: boolean;
}) {
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
