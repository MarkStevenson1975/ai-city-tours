import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createMyTour } from './actions';

// First-run "create your tour" screen. New operators land here straight
// after signup. Naming the tour creates the city and drops them into the
// build dashboard, where the AI build assistant takes over.
export default async function NewTourPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await searchParams;

  return (
    <div className="max-w-xl mx-auto">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        New tour
      </p>
      <h1 className="text-4xl font-semibold mb-3">Name your tour</h1>
      <p className="text-sm text-gray-600 mb-8">
        Usually your town or area. You can change everything else later. Next we
        will find your local landmarks and we&apos;ll draft each stop for you to
        get you started.
      </p>

      <form action={createMyTour} className="bg-white rounded-xl p-6 shadow-sm space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-bold mb-2">
            Tour name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="i.e. Town Tour"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label htmlFor="guide_name" className="block text-sm font-bold mb-2">
            Guide name <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="guide_name"
            name="guide_name"
            type="text"
            defaultValue="Harriet"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-gray-500 mt-1">
            The name of the voice that narrates your tour. Harriet is the StorieD
            default. The voice is female.
          </p>
        </div>

        {error && (
          <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded p-3">
            {error === 'name' ? 'Please enter a tour name.' : error}
          </p>
        )}

        <button
          type="submit"
          className="w-full py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
        >
          Create tour and start building
        </button>
      </form>
    </div>
  );
}
