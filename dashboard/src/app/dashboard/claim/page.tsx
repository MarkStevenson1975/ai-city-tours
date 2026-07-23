import { redirect } from 'next/navigation';
import Link from 'next/link';
import { claimExample } from './actions';

// Handoff page reached after a prospect signs up from the /try demo. It converts
// their anonymous example tour into a real one they own, then drops them into it.
// The dashboard layout already gates this to signed-in users.
export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  if (!slug) redirect('/dashboard');

  const result = await claimExample(String(slug));
  if (result.ok) redirect(`/dashboard/${result.slug}`);

  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h1 className="font-display text-3xl font-semibold text-primary mb-3">
        We couldn’t claim that demo
      </h1>
      <p className="text-gray-600 mb-8">{result.error}</p>
      <Link
        href="/dashboard/new"
        className="inline-block px-6 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
      >
        Start a new tour instead
      </Link>
    </div>
  );
}
