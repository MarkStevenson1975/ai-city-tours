// POST /api/stripe/portal
// Opens the Stripe Customer Portal for the operator to manage or cancel their
// subscription. Billing is per operator account, so the customer lives on the
// operator's profile.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account yet' }, { status: 400 });
  }

  const baseUrl = process.env.DASHBOARD_URL ?? new URL(req.url).origin;
  const body = await req.json().catch(() => ({}));
  const citySlug = String(body.citySlug ?? '').trim();

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: citySlug ? `${baseUrl}/dashboard/${citySlug}` : `${baseUrl}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
