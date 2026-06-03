// POST /api/stripe/webhook
// Stripe is the source of truth for subscription state. This endpoint keeps
// the city row in step:
//   - checkout completed / subscription active -> mark active, set plan,
//     auto-publish the tour
//   - subscription cancelled -> mark cancelled and unpublish (build is kept)
//   - payment failed -> mark past_due
//
// Set STRIPE_WEBHOOK_SECRET to the signing secret of the endpoint you create
// in the Stripe dashboard (or `stripe listen` in local dev).
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { tierFromPriceId } from '@/lib/plans';

// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = 'nodejs';

function priceIdFromSubscription(sub: Stripe.Subscription): string | undefined {
  return sub.items.data[0]?.price?.id;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig ?? '', secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature';
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const cityId = session.metadata?.city_id;
        const tier = session.metadata?.tier;
        const userId = session.metadata?.user_id;
        if (!cityId) break;

        await admin
          .from('cities')
          .update({
            subscription_status: 'active',
            plan_tier: tier ?? undefined,
            stripe_customer_id: (session.customer as string) ?? undefined,
            stripe_subscription_id: (session.subscription as string) ?? undefined,
          })
          .eq('id', cityId);

        // Auto-publish on payment (trusted server publish).
        if (userId) {
          await admin.rpc('publish_city_trusted', {
            p_city_id: cityId,
            p_user: userId,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const cityId = sub.metadata?.city_id;
        const priceId = priceIdFromSubscription(sub);
        const tier = priceId ? tierFromPriceId(priceId) : undefined;

        const status =
          sub.status === 'active' || sub.status === 'trialing'
            ? 'active'
            : sub.status === 'past_due' || sub.status === 'unpaid'
              ? 'past_due'
              : sub.status === 'canceled'
                ? 'cancelled'
                : 'past_due';

        const query = admin
          .from('cities')
          .update({
            subscription_status: status,
            plan_tier: tier ?? undefined,
            subscription_current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : undefined,
          });

        if (cityId) await query.eq('id', cityId);
        else await query.eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const cityId = sub.metadata?.city_id;
        // Cancel = unpublish. Clear the live config so the public tour goes
        // offline, but keep the draft and version history so they can restart.
        const update = {
          subscription_status: 'cancelled',
          published_config: null,
        };
        if (cityId) await admin.from('cities').update(update).eq('id', cityId);
        else await admin.from('cities').update(update).eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string | null;
        if (subId) {
          await admin
            .from('cities')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_subscription_id', subId);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'handler error';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
