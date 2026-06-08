import Link from 'next/link';

// Branded 404 for any unmatched route, so a mistyped or stale link lands on a
// calm StorieD page rather than a default error.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-8">
      <div className="max-w-md text-center">
        <p className="font-display text-3xl leading-none mb-6">
          <span className="text-primary font-semibold">Storie</span>
          <span className="text-accent font-semibold">D</span>
        </p>
        <h1 className="font-display text-4xl font-semibold text-primary mb-3">
          We can’t find that page
        </h1>
        <p className="text-gray-600 mb-8 leading-relaxed">
          The link may be old, or the page may have moved. Nothing is broken, you
          have just wandered off the path.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
        >
          Back to my dashboard
        </Link>
      </div>
    </div>
  );
}
