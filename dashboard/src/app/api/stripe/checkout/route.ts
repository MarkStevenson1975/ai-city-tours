// POST /api/stripe/checkout
// Starts the operator's subscription (one plan per account, covering multiple
// tours). Pay-to-publish: the operator builds free, then subscribes here to go
// live. On success the webhook marks the operator active and publishes the tour
// they were on. citySlug is carried through so we know which tour to publish.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { priceIdFor, isTier, type Interval } from '@/lib/plans';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const citySlug = String(body.citySlug ?? '').trim();
  const tier = String(body.tier ?? '').trim();
  const interval: Interval = body.interval === 'annual' ? 'annual' : 'monthly';

  if (!citySlug || !isTier(tier)) {
    return NextResponse.json({ error: 'Missing tour or plan' }, { status: 400 });
  }

  const { data: city } = await supabase
    .from('cities')
    .select('id, name, slug')
    .eq('slug', citySlug)
    .single();
  if (!city) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 403 });
  }

  const priceId = priceIdFor(tier, interval);
  if (!priceId) {
    return NextResponse.json(
      { error: 'Pricing is not configured. Set the Stripe price env vars.' },
      { status: 500 }
    );
  }

  const admin = createAdminClient();

  // The subscription belongs to the operator account, so reuse (or create) the
  // operator's Stripe customer on their profile.
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await admin.from('user_profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const baseUrl = process.env.DASHBOARD_URL ?? new URL(req.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/dashboard/${city.slug}?checkout=success`,
    cancel_url: `${baseUrl}/dashboard/${city.slug}?checkout=cancelled`,
    metadata: { user_id: user.id, tier, city_id: city.id },
    subscription_data: {
      trial_period_days: 7,
      metadata: { user_id: user.id, tier, city_id: city.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
