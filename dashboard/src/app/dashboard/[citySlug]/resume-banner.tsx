import Link from 'next/link';

// Shown at the top of a tour that was started but never published, so a
// returning operator sees exactly where they left off and can either carry on
// from that point or delete the tour. Computed from real progress, not a cookie.
export function ResumeBanner({
  citySlug,
  stopCount,
  previewed,
}: {
  citySlug: string;
  stopCount: number;
  previewed: boolean;
}) {
  let title: string;
  let body: string;
  let ctaHref: string | null;
  let ctaLabel: string | null;

  if (stopCount === 0) {
    title = 'Pick up where you left off';
    body =
      'You started this tour but haven’t added any stops yet. Carry on and we’ll find your local landmarks again.';
    ctaHref = `/dashboard/${citySlug}/build?auto=1`;
    ctaLabel = 'Continue building →';
  } else if (!previewed) {
    title = 'Almost there';
    body = `You’ve added ${stopCount} stop${stopCount === 1 ? '' : 's'}. Walk your tour to check it reads well on the street, then publish it.`;
    ctaHref = `/dashboard/${citySlug}/preview`;
    ctaLabel = 'Walk your tour →';
  } else {
    title = 'Ready to publish';
    body =
      'You’ve built and walked your tour. Publish it whenever you’re ready, using the button at the top of this page. Your first month is free.';
    ctaHref = null;
    ctaLabel = null;
  }

  return (
    <section className="mb-10 bg-cream/70 border border-accent rounded-xl p-5">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
        Unfinished tour
      </p>
      <h2 className="text-2xl font-semibold mb-1">{title}</h2>
      <p className="text-sm text-gray-700 mb-4 max-w-2xl">{body}</p>
      <div className="flex items-center gap-5 flex-wrap">
        {ctaHref && ctaLabel && (
          <Link
            href={ctaHref}
            className="px-5 py-2.5 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition"
          >
            {ctaLabel}
          </Link>
        )}
        <a
          href="#manage-tour"
          className="text-sm font-bold text-red-700 hover:underline"
        >
          Or delete this tour
        </a>
      </div>
    </section>
  );
}
