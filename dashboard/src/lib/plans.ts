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

// Tours an operator may publish on each plan (null = unlimited).
export const PLAN_TOUR_LIMIT: Record<Tier, number | null> = {
  trail: 1,
  town: 3,
  destination: null,
};

// Plan ordering, for "is this an upgrade" checks and next-tier suggestions.
export const TIER_ORDER: Tier[] = ['trail', 'town', 'destination'];

export function nextTier(tier: Tier): Tier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}

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

// ── Pause standby pricing ───────────────────────────────────────────────────
// While paused, the subscription is moved onto a cheap per-tier "standby" price
// so the tour stays parked and ready. Display amounts (pence) for the UI; Stripe
// is the source of truth for what is actually charged.
export const STANDBY_PRICE_PENCE: Record<Tier, number> = {
  trail: 700,
  town: 1500,
  destination: 2500,
};

const STANDBY_PRICE_ENV: Record<Tier, string> = {
  trail: 'STRIPE_PRICE_STANDBY_TRAIL',
  town: 'STRIPE_PRICE_STANDBY_TOWN',
  destination: 'STRIPE_PRICE_STANDBY_DESTINATION',
};

export function standbyPriceIdFor(tier: Tier): string | undefined {
  return process.env[STANDBY_PRICE_ENV[tier]];
}

export function standbyTierFromPriceId(priceId: string): Tier | undefined {
  for (const tier of ['trail', 'town', 'destination'] as Tier[]) {
    if (standbyPriceIdFor(tier) === priceId) return tier;
  }
  return undefined;
}

/** True if this Stripe price is one of the standby (paused) prices. */
export function isStandbyPriceId(priceId: string): boolean {
  return Boolean(standbyTierFromPriceId(priceId));
}

// Reverse lookup so the webhook can map a Stripe price back to a tier. Also
// recognises standby prices, so an operator's tier is remembered while paused.
export function tierFromPriceId(priceId: string): Tier | undefined {
  return planFromPriceId(priceId)?.tier ?? standbyTierFromPriceId(priceId);
}

// Reverse lookup returning both tier and billing interval, used when upgrading
// so we keep the operator on the same monthly/annual cadence.
export function planFromPriceId(priceId: string): { tier: Tier; interval: Interval } | undefined {
  for (const tier of ['trail', 'town', 'destination'] as Tier[]) {
    for (const interval of ['monthly', 'annual'] as Interval[]) {
      if (priceIdFor(tier, interval) === priceId) return { tier, interval };
    }
  }
  return undefined;
}

export function isTier(value: string): value is Tier {
  return value === 'trail' || value === 'town' || value === 'destination';
}
