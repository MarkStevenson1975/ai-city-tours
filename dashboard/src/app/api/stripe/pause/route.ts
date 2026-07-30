// POST /api/stripe/pause  Body: { resumeDate?: "YYYY-MM-DD" }
//
// Pauses the operator's subscription by moving it onto a cheap per-tier
// "standby" price (Trail £7, Town £15, Destination £25 / month) so the tour
// stays parked and ready while paused. Billing does NOT stop — the operator
// pays the standby fee each month until they resume. All of their tours are
// taken offline (drafts kept); they republish to go live again.
//
// resumeDate is optional: if given it is stored only as a friendly reminder
// (there is no cap and no automatic resume). Pausing again while already paused
// just updates that reminder date.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { isTier, standbyPriceIdFor, tierFromPriceId, type Tier } from '@/lib/plans';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // Optional reminder date. Only validated if the operator supplied one.
  const resumeDate = String(body.resumeDate ?? '').trim();
  let pauseResumeIso: string | null = null;
  if (resumeDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resumeDate)) {
      return NextResponse.json({ error: 'That restart date is not valid.' }, { status: 400 });
    }
    const resumeMs = Date.parse(`${resumeDate}T12:00:00Z`);
    if (Number.isNaN(resumeMs) || resumeMs <= Date.now() + 12 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Please pick a restart date at least a day from now.' },
        { status: 400 }
      );
    }
    pauseResumeIso = new Date(resumeMs).toISOString();
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_subscription_id, subscription_status, plan_tier')
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

  // Already paused: just update the (optional) reminder date. Do not re-swap the
  // price or re-unpublish anything.
  if (alreadyPaused) {
    await admin
      .from('user_profiles')
      .update({ pause_resume_at: pauseResumeIso })
      .eq('id', user.id);
    return NextResponse.json({ ok: true });
  }

  try {
    // Retrieve the subscription to find its item and the plan price we're on.
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items?.data?.[0];
    if (!item) {
      return NextResponse.json({ error: 'Subscription has no billable item.' }, { status: 400 });
    }
    const currentPriceId = item.price.id;

    // Work out the tier and its standby price. Fall back to the price on the
    // subscription if plan_tier isn't set on the profile yet.
    const tier: Tier | undefined =
      (profile?.plan_tier && isTier(profile.plan_tier) ? (profile.plan_tier as Tier) : undefined) ??
      tierFromPriceId(currentPriceId);
    const standbyPriceId = tier ? standbyPriceIdFor(tier) : undefined;
    if (!standbyPriceId) {
      // Env var not configured yet — the feature stays inert until it is set.
      return NextResponse.json(
        { error: 'Pausing is not available just yet. Please try again shortly.' },
        { status: 503 }
      );
    }

    // Swap onto the standby price. No proration, so there's no surprise charge
    // or credit mid-cycle; the standby rate simply applies from the next invoice.
    await stripe.subscriptions.update(subId, {
      items: [{ id: item.id, price: standbyPriceId }],
      proration_behavior: 'none',
      cancel_at_period_end: false,
      pause_collection: '',
    });

    // Reflect immediately; the webhook will confirm. Remember the plan price so
    // resume can swap back to exactly the right plan.
    await admin
      .from('user_profiles')
      .update({
        subscription_status: 'paused',
        pause_resume_at: pauseResumeIso,
        paused_at: new Date().toISOString(),
        pre_pause_price_id: currentPriceId,
      })
      .eq('id', user.id);

    // Take all of this operator's tours offline (keep drafts).
    await admin
      .from('cities')
      .update({ published_config: null, published_at: null, unpublished_at: new Date().toISOString() })
      .eq('created_by', user.id)
      .is('deleted_at', null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not pause the subscription.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
