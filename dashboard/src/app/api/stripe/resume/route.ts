// POST /api/stripe/resume
// Resumes a paused subscription by moving it off the standby price and back onto
// the operator's full plan price. Billing returns to the normal rate. Tours are
// NOT auto-republished: the operator is prompted to republish each tour when
// they are ready to go back online.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { priceIdFor, isTier, type Tier } from '@/lib/plans';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_subscription_id, plan_tier, pre_pause_price_id')
    .eq('id', user.id)
    .single();

  const subId = profile?.stripe_subscription_id;
  if (!subId) {
    return NextResponse.json({ error: 'No subscription to resume.' }, { status: 400 });
  }

  // Prefer the exact plan price we stored at pause time; otherwise rebuild it
  // from the tier (monthly cadence).
  const tier = profile?.plan_tier && isTier(profile.plan_tier) ? (profile.plan_tier as Tier) : undefined;
  const restorePriceId = profile?.pre_pause_price_id ?? (tier ? priceIdFor(tier, 'monthly') : undefined);
  if (!restorePriceId) {
    return NextResponse.json(
      { error: 'Could not work out which plan to put you back on. Please contact support.' },
      { status: 400 }
    );
  }

  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items?.data?.[0];
    if (!item) {
      return NextResponse.json({ error: 'Subscription has no billable item.' }, { status: 400 });
    }

    // Swap back to the plan price. No proration: the plan rate applies from the
    // next invoice; they are not charged mid-cycle for resuming.
    await stripe.subscriptions.update(subId, {
      items: [{ id: item.id, price: restorePriceId }],
      proration_behavior: 'none',
      pause_collection: '',
    });

    await admin
      .from('user_profiles')
      .update({
        subscription_status: 'active',
        pause_resume_at: null,
        paused_at: null,
        pre_pause_price_id: null,
      })
      .eq('id', user.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not resume the subscription.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
