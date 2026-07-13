'use client';

// The conversion moment: a plan-picker modal that goes to Stripe checkout.
// Reused in two places: the "See it live" banner button, and the publish gate
// (when an operator without an active or trial subscription tries to publish).
// The operator picks a plan and billing period, then confirms with a single
// button before going to checkout (so a stray tap never sends them straight to
// payment).
import { useState } from 'react';

type Tier = 'trail' | 'town' | 'destination';
type Interval = 'monthly' | 'annual';

const PLANS: { tier: Tier; name: string; monthly: number; annual: number; blurb: string; featured?: boolean }[] = [
  { tier: 'trail', name: 'Trail', monthly: 59, annual: 590, blurb: '1 tour, up to 10 stops' },
  { tier: 'town', name: 'Town', monthly: 99, annual: 990, blurb: 'Up to 3 tours, 20 stops each', featured: true },
  { tier: 'destination', name: 'Destination', monthly: 199, annual: 1990, blurb: 'Unlimited tours and stops' },
];

// The reusable plan-picker + checkout modal. Pass `ctaLabel` to change the
// final button text (defaults to the free-trial copy).
export function SubscribeModal({
  citySlug,
  open,
  onClose,
  title = 'See your tour go live',
  intro = 'Choose a plan and billing period, then continue. Your first month is free, and you can cancel any time before it ends at no charge.',
  ctaLabel,
}: {
  citySlug: string;
  open: boolean;
  onClose: () => void;
  title?: string;
  intro?: string;
  ctaLabel?: string;
}) {
  const [interval, setInterval] = useState<Interval>('monthly');
  const [selectedTier, setSelectedTier] = useState<Tier>('town');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = PLANS.find((p) => p.tier === selectedTier)!;

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citySlug, tier: selectedTier, interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-white rounded-2xl p-7 max-w-md w-full text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="inline-flex w-12 h-12 rounded-full bg-green-100 text-green-800 items-center justify-center mb-3 text-2xl">
          ★
        </span>
        <h2 className="text-2xl font-semibold mb-2">{title}</h2>
        <p className="text-sm text-gray-600 mb-5">{intro}</p>

        <div className="inline-flex rounded-full border border-gray-200 p-1 mb-5 text-sm">
          <button
            type="button"
            onClick={() => setInterval('monthly')}
            className={`px-4 py-1.5 rounded-full font-bold transition ${
              interval === 'monthly' ? 'bg-primary text-cream' : 'text-gray-600'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval('annual')}
            className={`px-4 py-1.5 rounded-full font-bold transition ${
              interval === 'annual' ? 'bg-primary text-cream' : 'text-gray-600'
            }`}
          >
            Annual · 2 months free
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {PLANS.map((p) => {
            const isSelected = selectedTier === p.tier;
            return (
              <button
                key={p.tier}
                type="button"
                onClick={() => setSelectedTier(p.tier)}
                className={`relative rounded-xl p-3 text-left transition ${
                  isSelected
                    ? 'border-2 border-primary bg-cream'
                    : 'border border-gray-200 hover:bg-cream/50'
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider bg-primary text-cream px-2 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
                <span className="block font-bold text-sm">{p.name}</span>
                <span className="block text-lg font-semibold">
                  £{interval === 'monthly' ? p.monthly : p.annual}
                  <span className="text-[11px] font-normal text-gray-500">
                    /{interval === 'monthly' ? 'mo' : 'yr'}
                  </span>
                </span>
                <span className="block text-[11px] text-gray-500">{p.blurb}</span>
                {isSelected && (
                  <span className="block text-[11px] font-bold text-primary mt-2">✓ Selected</span>
                )}
              </button>
            );
          })}
        </div>

        {error && <p className="text-red-700 text-sm mb-3">{error}</p>}

        <button
          type="button"
          onClick={startCheckout}
          disabled={loading}
          className="w-full py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50 mb-3"
        >
          {loading
            ? 'Taking you to checkout…'
            : (ctaLabel ?? `Start your free month on ${selectedPlan.name}`)}
        </button>

        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          Keep editing
        </button>
      </div>
    </div>
  );
}

export function SeeItLiveButton({
  citySlug,
  totalStops,
}: {
  citySlug: string;
  totalStops: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="bg-white rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-lg">Your tour is ready to go live</p>
          <p className="text-sm text-gray-600">
            {totalStops} stop{totalStops === 1 ? '' : 's'} built. Publish it to see it
            for real on your phone. Your first month is free.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-6 py-3 rounded-full bg-accent text-primary font-bold hover:bg-accent-light transition whitespace-nowrap"
        >
          See it live →
        </button>
      </div>

      <SubscribeModal citySlug={citySlug} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
