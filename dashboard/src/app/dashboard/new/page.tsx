import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NewTourForm } from './new-tour-form';
import { FirstRunRail } from '../first-run-rail';
import { trackOperator } from '@/lib/track-operator';

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

  await trackOperator(user.id, 'first_run_viewed');

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-4xl">
      <div className="flex-1 min-w-0 max-w-xl">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          Your first tour · Step 1 of 4
        </p>
        <h1 className="text-4xl font-semibold mb-3">Where is your tour?</h1>
        <p className="text-sm text-gray-600 mb-8">
          Tell us where, and we&apos;ll do the heavy lifting. It&apos;s free to
          build and preview.
        </p>

        <NewTourForm error={error} />
      </div>

      <FirstRunRail
        state={{
          hasCity: false,
          stopCount: 0,
          previewed: false,
          published: false,
          currentStep: 1, // this page IS "tell us where"
        }}
      />
    </div>
  );
}
