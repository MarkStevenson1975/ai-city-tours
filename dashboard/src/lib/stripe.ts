// Server-side Stripe client. Never import in a client component.
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  // Pin nothing here: use the account's default API version so the SDK and
  // dashboard stay in step. Set STRIPE_SECRET_KEY in the environment.
  appInfo: { name: 'StorieD self-serve' },
});
