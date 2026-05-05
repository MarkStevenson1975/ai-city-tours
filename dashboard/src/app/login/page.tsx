'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read directly from the form, not React state — Safari autofill doesn't
    // always fire onChange, so the React state can be stale even when the
    // input visually has a value.
    const formData = new FormData(e.currentTarget);
    const submittedEmail = String(formData.get('email') ?? '').trim();
    if (!submittedEmail) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: submittedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
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
          The SetUp Crew
        </p>
        <h1 className="text-4xl font-semibold mb-2">Sign in</h1>
        <p className="text-sm text-gray-600 mb-8">
          Enter your email and we&apos;ll send you a magic link.
        </p>

        {sent ? (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-sm space-y-2">
            <p className="font-bold">Check your inbox.</p>
            <p>
              We&apos;ve sent a sign-in link to{' '}
              <span className="font-mono">{email}</span>. Click it to log in.
            </p>
            <p className="text-xs text-gray-500 pt-2">
              The link expires in an hour. If you don&apos;t see it, check
              spam or try again.
            </p>
          </div>
        ) : (
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
                defaultValue={email}
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
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
