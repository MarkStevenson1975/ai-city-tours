// POST /api/stripe/resume
// Resumes a paused subscription early by clearing Stripe pause_collection.
// Billing restarts now. Tours are NOT auto-republished: the operator is
// prompted to republish each tour when they are ready to go back online.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .single();

  const subId = profile?.stripe_subscription_id;
  if (!subId) {
    return NextResponse.json({ error: 'No subscription to resume.' }, { status: 400 });
  }

  try {
    // Passing an empty pause_collection clears the pause.
    await stripe.subscriptions.update(subId, { pause_collection: '' });

    await admin
      .from('user_profiles')
      .update({ subscription_status: 'active', pause_resume_at: null, paused_at: null })
      .eq('id', user.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not resume the subscription.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
