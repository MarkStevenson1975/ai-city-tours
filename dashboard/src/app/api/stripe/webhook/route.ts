// POST /api/stripe/webhook
// Stripe is the source of truth for the OPERATOR's subscription. Keeps the
// operator's profile in step and, on payment, publishes the tour they were on.
//   - checkout completed -> operator active, plan set, auto-publish that tour
//   - subscription updated -> status + plan (covers upgrades/downgrades)
//   - subscription cancelled -> mark cancelled and unpublish ALL their tours
//   - payment failed -> past_due
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { tierFromPriceId } from '@/lib/plans';

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
        const userId = session.metadata?.user_id;
        const tier = session.metadata?.tier;
        const cityId = session.metadata?.city_id;
        if (!userId) break;

        await admin
          .from('user_profiles')
          .update({
            subscription_status: 'trialing',
            checkout_started_at: null, // checkout completed — no longer abandoned
            plan_tier: tier ?? undefined,
            stripe_customer_id: (session.customer as string) ?? undefined,
            stripe_subscription_id: (session.subscription as string) ?? undefined,
          })
          .eq('id', userId);

        // Publish the tour they were on when they subscribed.
        if (cityId) {
          await admin.rpc('publish_city_trusted', { p_city_id: cityId, p_user: userId });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        const priceId = priceIdFromSubscription(sub);
        const tier = priceId ? tierFromPriceId(priceId) : undefined;

        // A paused subscription keeps Stripe status 'active' but carries a
        // pause_collection. Treat that as our 'paused' state and mirror the
        // restart date; clearing the pause returns it to its real status.
        const paused = Boolean(sub.pause_collection);
        const status =
          paused ? 'paused'
          : sub.status === 'active' ? 'active'
          : sub.status === 'trialing' ? 'trialing'
          : sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due'
          : sub.status === 'canceled' ? 'canceled'
          : sub.status;

        const resumesAt = sub.pause_collection?.resumes_at;
        const update = {
          subscription_status: status,
          plan_tier: tier ?? undefined,
          pause_resume_at: paused
            ? (resumesAt ? new Date(resumesAt * 1000).toISOString() : undefined)
            : null,
          subscription_current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : undefined,
        };

        // Only update the account whose CURRENT subscription is this one, so a
        // stale/old subscription event cannot overwrite a newer subscription on
        // the same account. Match by subscription id first; fall back to the
        // metadata user only if they have no current subscription yet (covers
        // the race where this arrives before checkout.completed stored the id).
        const { data: bySub } = await admin
          .from('user_profiles')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();
        let targetId = bySub?.id as string | undefined;
        if (!targetId && userId) {
          const { data: byMeta } = await admin
            .from('user_profiles')
            .select('id, stripe_subscription_id')
            .eq('id', userId)
            .maybeSingle();
          if (byMeta && (!byMeta.stripe_subscription_id || byMeta.stripe_subscription_id === sub.id)) {
            targetId = byMeta.id;
          }
        }
        if (targetId) await admin.from('user_profiles').update(update).eq('id', targetId);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;

        // Only act if this is the account's CURRENT subscription. A previously
        // cancelled/replaced subscription (e.g. an old one being tidied up in
        // Stripe) must never cancel a newer subscription on the same account or
        // unpublish their live tours.
        const { data: prof } = await admin
          .from('user_profiles')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();
        const ownerId = prof?.id;

        if (ownerId) {
          await admin
            .from('user_profiles')
            .update({ subscription_status: 'canceled' })
            .eq('id', ownerId);
          // Cancel = unpublish all of this operator's tours (drafts are kept).
          await admin.from('cities').update({ published_config: null }).eq('created_by', ownerId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string | null;
        if (subId) {
          await admin
            .from('user_profiles')
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
