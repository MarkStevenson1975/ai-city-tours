// POST /api/stripe/pause  Body: { resumeDate: "YYYY-MM-DD" }
// Pauses the operator's subscription using Stripe pause_collection, with the
// chosen restart date as resumes_at. Billing stops (invoices voided) until that
// date, when Stripe resumes billing automatically. All of the operator's tours
// are taken offline (drafts kept); the operator republishes to go live again.
//
// If the subscription is already paused, this just updates the restart date and
// does NOT re-unpublish anything.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const resumeDate = String(body.resumeDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resumeDate)) {
    return NextResponse.json({ error: 'Please choose a restart date.' }, { status: 400 });
  }

  // Resume at midday UTC on the chosen date, and require it to be in the future.
  const resumeMs = Date.parse(`${resumeDate}T12:00:00Z`);
  if (Number.isNaN(resumeMs)) {
    return NextResponse.json({ error: 'That restart date is not valid.' }, { status: 400 });
  }
  if (resumeMs <= Date.now() + 12 * 60 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Please pick a restart date at least a day from now.' },
      { status: 400 }
    );
  }
  const resumesAt = Math.floor(resumeMs / 1000);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_subscription_id, subscription_status')
    .eq('id', user.id)
    .single();

  const subId = profile?.stripe_subscription_id;
  if (!subId) {
    return NextResponse.json({ error: 'No active subscription to pause.' }, { status: 400 });
  }

  const alreadyPaused = profile?.subscription_status === 'paused';
  const canPause =
    alreadyPaused ||
    profile?.subscription_status === 'active' ||
    profile?.subscription_status === 'trialing';
  if (!canPause) {
    return NextResponse.json(
      { error: 'You need an active subscription to pause.' },
      { status: 400 }
    );
  }

  try {
    await stripe.subscriptions.update(subId, {
      pause_collection: { behavior: 'void', resumes_at: resumesAt },
    });

    // Reflect immediately; the webhook will confirm.
    await admin
      .from('user_profiles')
      .update({
        subscription_status: 'paused',
        pause_resume_at: new Date(resumeMs).toISOString(),
        paused_at: alreadyPaused ? undefined : new Date().toISOString(),
      })
      .eq('id', user.id);

    // First pause only: take all of this operator's tours offline (keep drafts).
    if (!alreadyPaused) {
      await admin
        .from('cities')
        .update({ published_config: null, published_at: null, unpublished_at: new Date().toISOString() })
        .eq('created_by', user.id)
        .is('deleted_at', null);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not pause the subscription.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
