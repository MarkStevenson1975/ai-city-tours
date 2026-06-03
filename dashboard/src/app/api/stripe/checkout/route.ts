// POST /api/stripe/checkout
// Starts a subscription Checkout session for a city + plan tier.
// This is the pay-to-publish gate: the operator builds for free, then pays
// here to go live. On success Stripe fires the webhook which marks the city
// active and auto-publishes it.
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
    return NextResponse.json({ error: 'Missing city or plan' }, { status: 400 });
  }

  // RLS scopes this select to cities the caller can access.
  const { data: city } = await supabase
    .from('cities')
    .select('id, name, slug, stripe_customer_id')
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

  const baseUrl = process.env.DASHBOARD_URL ?? new URL(req.url).origin;

  // Reuse the city's Stripe customer if it has one, otherwise create it and
  // store it back on the city via the service role.
  let customerId = city.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: city.name,
      metadata: { city_id: city.id, city_slug: city.slug },
    });
    customerId = customer.id;
    await createAdminClient()
      .from('cities')
      .update({ stripe_customer_id: customerId })
      .eq('id', city.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/dashboard/${city.slug}?checkout=success`,
    cancel_url: `${baseUrl}/dashboard/${city.slug}?checkout=cancelled`,
    metadata: { city_id: city.id, tier, user_id: user.id },
    subscription_data: {
      metadata: { city_id: city.id, tier, user_id: user.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
