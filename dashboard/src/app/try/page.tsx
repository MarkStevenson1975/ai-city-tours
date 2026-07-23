import { TryFlow } from './try-flow';

// Public, no-auth demo funnel. Louise sends a hidden link (optionally
// ?area=Worcester&org=Worcester%20City%20Council) in cold outreach. The
// prospect builds a one-stop example tour for their town and can claim it.
export const metadata = {
  title: 'Try StorieD — build a tour of your town in seconds',
  robots: { index: false, follow: false },
};

export default async function TryPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; org?: string }>;
}) {
  const sp = await searchParams;
  const area = typeof sp.area === 'string' ? sp.area : '';
  const org = typeof sp.org === 'string' ? sp.org : '';
  return <TryFlow initialArea={area} org={org} />;
}
