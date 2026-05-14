'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submittedEmail = String(formData.get('email') ?? '').trim();
    if (!submittedEmail) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const siteUrl = window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(
      submittedEmail,
      {
        redirectTo: `${siteUrl}/auth/callback/reset`,
      }
    );

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setEmail(submittedEmail);
      setSent(true);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-primary text-cream">
      <div className="w-full max-w-md bg-cream text-gray-900 rounded-2xl shadow-2xl p-10">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-3">
          StorieD
        </p>
        <h1 className="text-4xl font-semibold mb-2">Reset password</h1>

        {sent ? (
          <>
            <p className="text-sm text-gray-600 mb-6">
              We have sent a reset link to{' '}
              <span className="font-mono font-bold">{email}</span>. Click it
              to choose a new password. The link expires in one hour.
            </p>
            <p className="text-xs text-gray-500">
              Check your spam folder if it does not arrive within a minute.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-8">
              Enter your email address and we will send you a link to reset
              your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-bold mb-2"
                >
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.co.uk"
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {error && (
                <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded p-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="text-sm text-center mt-6 text-gray-500">
              <Link href="/login" className="text-primary font-bold hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
