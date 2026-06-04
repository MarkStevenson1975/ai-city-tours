'use client';

// The conversion moment: a prominent "See it live" button that opens a modal
// over the dashboard, dimming the work behind it, prompting the operator to
// start their 7-day free trial to publish and view the tour for real.
import { useState } from 'react';

type Tier = 'trail' | 'town' | 'destination';
type Interval = 'monthly' | 'annual';

const PLANS: { tier: Tier; name: string; monthly: number; annual: number; blurb: string; featured?: boolean }[] = [
  { tier: 'trail', name: 'Trail', monthly: 59, annual: 590, blurb: '1 tour, up to 10 stops' },
  { tier: 'town', name: 'Town', monthly: 99, annual: 990, blurb: 'Up to 3 tours, 20 stops each', featured: true },
  { tier: 'destination', name: 'Destination', monthly: 199, annual: 1990, blurb: 'Unlimited tours and stops' },
];

export function SeeItLiveButton({
  citySlug,
  totalStops,
}: {
  citySlug: string;
  totalStops: number;
}) {
  const [open, setOpen] = useState(false);
  const [interval, setInterval] = useState<Interval>('monthly');
  const [loading, setLoading] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choosePlan(tier: Tier) {
    setLoading(tier);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citySlug, tier, interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setLoading(null);
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-lg">Your tour is ready to go live</p>
          <p className="text-sm text-gray-600">
            {totalStops} stop{totalStops === 1 ? '' : 's'} built. Publish it to see it
            for real on your phone. Free for 7 days.
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

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => loading === null && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-7 max-w-md w-full text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="inline-flex w-12 h-12 rounded-full bg-green-100 text-green-800 items-center justify-center mb-3 text-2xl">
              ★
            </span>
            <h2 className="text-2xl font-semibold mb-2">See your tour go live</h2>
            <p className="text-sm text-gray-600 mb-5">
              Start your 7-day free trial to publish {citySlug} and walk the real
              thing on your phone. Cancel any time in the first week at no charge.
            </p>

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

            <div className="grid grid-cols-3 gap-2 mb-4">
              {PLANS.map((p) => (
                <button
                  key={p.tier}
                  type="button"
                  onClick={() => choosePlan(p.tier)}
                  disabled={loading !== null}
                  className={`rounded-xl p-3 text-left transition disabled:opacity-50 ${
                    p.featured ? 'border-2 border-primary' : 'border border-gray-200'
                  } hover:bg-cream`}
                >
                  <span className="block font-bold text-sm">{p.name}</span>
                  <span className="block text-lg font-semibold">
                    £{interval === 'monthly' ? p.monthly : p.annual}
                  </span>
                  <span className="block text-[11px] text-gray-500">{p.blurb}</span>
                  <span className="block text-[11px] font-bold text-primary mt-2">
                    {loading === p.tier ? 'Opening…' : 'Start free'}
                  </span>
                </button>
              ))}
            </div>

            {error && <p className="text-red-700 text-sm mb-2">{error}</p>}
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading !== null}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Keep editing
            </button>
          </div>
        </div>
      )}
    </>
  );
}
