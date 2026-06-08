'use client';

// Friendly, on-brand error boundary for the whole dashboard. If anything throws
// (an AI feature, a server action, a load), the operator sees this calm message
// and a way to carry on, never a raw stack trace or blank screen.
import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the detail in the console for us, never on screen for the operator.
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-3">
          Something went quiet
        </p>
        <h1 className="font-display text-4xl font-semibold text-primary mb-3">
          That didn’t quite work
        </h1>
        <p className="text-gray-600 mb-8 leading-relaxed">
          Something on our side hiccuped, not anything you did. Your tour and all
          your work are safe. Try again, and if it keeps happening, come back in a
          few minutes.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={reset}
            className="px-6 py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="text-sm font-bold text-gray-500 hover:text-gray-800 transition"
          >
            Back to my dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
