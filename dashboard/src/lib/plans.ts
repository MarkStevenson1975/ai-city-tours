// StorieD self-serve plans. Stop limits mirror the plan_stop_limit() DB
// function. Stripe price IDs are read from the environment so the same code
// works in test and live mode.

export type Tier = 'trail' | 'town' | 'destination';
export type Interval = 'monthly' | 'annual';

export const PLAN_STOP_LIMIT: Record<Tier, number | null> = {
  trail: 10,
  town: 20,
  destination: null, // unlimited
};

export const PLAN_LABEL: Record<Tier, string> = {
  trail: 'Trail',
  town: 'Town',
  destination: 'Destination',
};

// Display prices (pence) for the UI only. Stripe is the source of truth for
// what is actually charged.
export const PLAN_PRICE_PENCE: Record<Tier, { monthly: number; annual: number }> = {
  trail: { monthly: 5900, annual: 59000 },
  town: { monthly: 9900, annual: 99000 },
  destination: { monthly: 19900, annual: 199000 },
};

const PRICE_ENV: Record<`${Tier}_${Interval}`, string> = {
  trail_monthly: 'STRIPE_PRICE_TRAIL_MONTHLY',
  trail_annual: 'STRIPE_PRICE_TRAIL_ANNUAL',
  town_monthly: 'STRIPE_PRICE_TOWN_MONTHLY',
  town_annual: 'STRIPE_PRICE_TOWN_ANNUAL',
  destination_monthly: 'STRIPE_PRICE_DESTINATION_MONTHLY',
  destination_annual: 'STRIPE_PRICE_DESTINATION_ANNUAL',
};

export function priceIdFor(tier: Tier, interval: Interval): string | undefined {
  return process.env[PRICE_ENV[`${tier}_${interval}`]];
}

// Reverse lookup so the webhook can map a Stripe price back to a tier.
export function tierFromPriceId(priceId: string): Tier | undefined {
  for (const tier of ['trail', 'town', 'destination'] as Tier[]) {
    for (const interval of ['monthly', 'annual'] as Interval[]) {
      if (priceIdFor(tier, interval) === priceId) return tier;
    }
  }
  return undefined;
}

export function isTier(value: string): value is Tier {
  return value === 'trail' || value === 'town' || value === 'destination';
}
