// POST /api/stripe/upgrade  Body: { tier }
// Swaps the operator's existing subscription onto a higher (or lower) plan by
// changing the price on the same Stripe subscription, with proration. No new
// subscription, no second checkout. The webhook then confirms the new plan.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { priceIdFor, planFromPriceId, isTier, type Interval } from '@/lib/plans';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tier = String(body.tier ?? '').trim();
  if (!isTier(tier)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .single();

  const subId = profile?.stripe_subscription_id;
  if (!subId) {
    return NextResponse.json({ error: 'No active subscription to change.' }, { status: 400 });
  }

  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items.data[0];
    const currentPrice = item?.price?.id;
    const interval: Interval = (currentPrice ? planFromPriceId(currentPrice)?.interval : undefined) ?? 'monthly';
    const newPrice = priceIdFor(tier, interval);
    if (!newPrice) return NextResponse.json({ error: 'Pricing not configured.' }, { status: 500 });

    await stripe.subscriptions.update(subId, {
      items: [{ id: item.id, price: newPrice }],
      proration_behavior: 'create_prorations',
    });

    // Reflect immediately; the webhook will confirm.
    await admin.from('user_profiles').update({ plan_tier: tier }).eq('id', user.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upgrade failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
