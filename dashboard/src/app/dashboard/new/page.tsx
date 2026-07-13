import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NewTourForm } from './new-tour-form';

// First-run screen. We ask the one thing every operator already knows: where
// their tour is. The tour is named from that automatically (editable later in
// Settings). Asking them to invent a name here was the biggest drop-off in the
// funnel: 12 of 14 verified operators never got past it.
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
        Your first tour · Step 1 of 3
      </p>
      <h1 className="text-4xl font-semibold mb-3">Where is your tour?</h1>
      <p className="text-sm text-gray-600 mb-8">
        Tell us where, and we&apos;ll do the heavy lifting. It&apos;s free to
        build and preview.
      </p>

      <NewTourForm error={error} />

      <ol className="mt-6 text-xs text-gray-500 space-y-1">
        <li>
          <span className="font-bold text-primary">1.</span> Tell us where you are
        </li>
        <li>
          <span className="font-bold text-gray-400">2.</span> Choose your stops,
          we draft them for you
        </li>
        <li>
          <span className="font-bold text-gray-400">3.</span> Walk it, then publish
        </li>
      </ol>
    </div>
  );
}
