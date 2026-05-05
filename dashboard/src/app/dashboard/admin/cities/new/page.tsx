import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createCity } from '../actions';

export default async function NewCityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') redirect('/dashboard');

  return (
    <div className="max-w-xl">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
        Admin
      </p>
      <h1 className="text-4xl font-semibold mb-2">Add a new area</h1>
      <p className="text-sm text-gray-500 mb-10">
        Creates the area in the database. You can invite an operator once it
        is created.
      </p>

      <form action={createCity} className="space-y-6 bg-white rounded-2xl p-8 shadow-sm">
        <div>
          <label htmlFor="name" className="block text-sm font-bold mb-2">
            City name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Gloucester"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label htmlFor="slug" className="block text-sm font-bold mb-2">
            URL slug
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 whitespace-nowrap">
              storied-tours.vercel.app/
            </span>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              placeholder="gloucester"
              pattern="[a-z0-9\-]+"
              title="Lowercase letters, numbers and hyphens only"
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Lowercase letters, numbers and hyphens only. Cannot be changed
            after creation.
          </p>
        </div>

        <div>
          <label htmlFor="guide_name" className="block text-sm font-bold mb-2">
            AI guide name
          </label>
          <input
            id="guide_name"
            name="guide_name"
            type="text"
            defaultValue="Harriet"
            placeholder="Harriet"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-gray-500 mt-1">
            The operator can rename this later in their settings.
          </p>
        </div>

        <button
          type="submit"
          className="w-full py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
        >
          Create area
        </button>
      </form>
    </div>
  );
}
