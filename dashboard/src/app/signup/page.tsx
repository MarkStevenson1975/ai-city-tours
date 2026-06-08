'use client';

// Public self-serve signup. Anyone can create an operator account.
// The on_auth_user_created trigger creates their user_profiles row
// (role defaults to 'operator'). New operators land in /dashboard/new
// to build their first tour.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const fullName = String(formData.get('full_name') ?? '').trim();
    const organisation = String(formData.get('organisation') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!fullName || !email || !password) {
      setError('Please fill in your name, email and a password.');
      return;
    }
    if (password.length < 8) {
      setError('Please choose a password of at least 8 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, organisation },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard/new`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // If email confirmation is off, a session is returned immediately and we
    // can go straight into building. If it is on, ask them to confirm first.
    if (data.session) {
      router.push('/dashboard/new');
      router.refresh();
    } else {
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-primary text-cream">
        <div className="w-full max-w-md bg-cream text-gray-900 rounded-2xl shadow-2xl p-10 text-center">
          <p className="mb-4 font-display text-3xl leading-none">
            <span className="text-primary font-semibold">Storie</span>
            <span className="text-accent font-semibold">D</span>
          </p>
          <h1 className="text-3xl font-semibold mb-3">Check your email</h1>
          <p className="text-sm text-gray-600 mb-4">
            We have sent you a link to confirm your account. Click it and you
            will drop straight into building your first tour.
          </p>
          <p className="text-sm text-gray-600">
            The email comes from{' '}
            <span className="font-bold">team@thesetupcrew.co.uk</span>. If it is
            not in your inbox within a few minutes, please check your spam or
            junk folder.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-primary text-cream">
      <div className="w-full max-w-md bg-cream text-gray-900 rounded-2xl shadow-2xl p-10">
        <p className="mb-4 font-serif text-3xl leading-none">
          <span className="text-primary font-semibold">Storie</span>
          <span className="text-accent font-semibold">D</span>
        </p>
        <h1 className="text-4xl font-semibold mb-2">Build your tour</h1>
        <p className="text-sm text-gray-600 mb-8">
          Create your free account. You only pay when you publish.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-bold mb-2">
              Your name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              autoComplete="name"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label htmlFor="organisation" className="block text-sm font-bold mb-2">
              Organisation <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="organisation"
              name="organisation"
              type="text"
              placeholder="e.g. Tourist Information Centre or BID"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-bold mb-2">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-bold mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
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
            {loading ? 'Creating your account…' : 'Create account and build'}
          </button>

          <p className="text-sm text-center text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-bold hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
