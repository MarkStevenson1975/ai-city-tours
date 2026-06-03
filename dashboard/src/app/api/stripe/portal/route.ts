// POST /api/stripe/portal
// Opens the Stripe Customer Portal so an operator can manage or cancel their
// own subscription. Self-managed billing keeps support out of the loop.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

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
  if (!citySlug) {
    return NextResponse.json({ error: 'Missing tour' }, { status: 400 });
  }

  const { data: city } = await supabase
    .from('cities')
    .select('slug, stripe_customer_id')
    .eq('slug', citySlug)
    .single();

  if (!city?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No billing account for this tour yet' },
      { status: 400 }
    );
  }

  const baseUrl = process.env.DASHBOARD_URL ?? new URL(req.url).origin;

  const session = await stripe.billingPortal.sessions.create({
    customer: city.stripe_customer_id,
    return_url: `${baseUrl}/dashboard/${city.slug}`,
  });

  return NextResponse.json({ url: session.url });
}
