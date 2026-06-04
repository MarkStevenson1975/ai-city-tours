'use client';

import { useTransition, useState } from 'react';
import { inviteOperator } from '../admin/cities/actions';

export function InviteOperatorForm({ citySlug }: { citySlug: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await inviteOperator(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="city_slug" value={citySlug} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="display_name" className="block text-sm font-bold mb-2">
            Operator name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            placeholder="e.g. Tourist Information Centre or BID"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            placeholder="manager@example.co.uk"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {error && (
        <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded p-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="px-6 py-2.5 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition disabled:opacity-50"
      >
        {pending ? 'Sending invite…' : 'Send invite email'}
      </button>

      <p className="text-xs text-gray-500">
        Supabase will send an invite email. The operator clicks the link and
        sets their password. They will only see this area.
      </p>
    </form>
  );
}
