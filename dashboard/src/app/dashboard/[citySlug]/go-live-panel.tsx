'use client';

// Pay-to-publish panel. Render this on the city dashboard when the tour is
// not yet on an active subscription. Once active, show the normal publish
// button and a "manage billing" link instead.
import { useState } from 'react';

type Tier = 'trail' | 'town' | 'destination';
type Interval = 'monthly' | 'annual';

const PLANS: { tier: Tier; name: string; monthly: number; annual: number; blurb: string }[] = [
  { tier: 'trail', name: 'Trail', monthly: 59, annual: 590, blurb: '1 tour, up to 10 stops' },
  { tier: 'town', name: 'Town', monthly: 99, annual: 990, blurb: 'Up to 3 tours, 20 stops each' },
  { tier: 'destination', name: 'Destination', monthly: 199, annual: 1990, blurb: 'Unlimited tours and stops' },
];

export function GoLivePanel({ citySlug }: { citySlug: string }) {
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
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">
        Ready to go live
      </p>
      <h2 className="text-2xl font-semibold mb-1">Start your 7-day free trial</h2>
      <p className="text-sm text-gray-600 mb-5">
        Pick a plan to put your tour live and view it for real. The first 7 days
        are free, and you can cancel any time before then at no charge.
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
          Annual (2 months free)
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {PLANS.map((p) => (
          <div key={p.tier} className="border border-gray-200 rounded-xl p-4 flex flex-col">
            <p className="font-bold">{p.name}</p>
            <p className="mt-1">
              <span className="text-2xl font-semibold">
                £{interval === 'monthly' ? p.monthly : p.annual}
              </span>
              <span className="text-xs text-gray-500">
                /{interval === 'monthly' ? 'mo' : 'yr'}
              </span>
            </p>
            <p className="text-xs text-gray-600 mt-1 mb-4 flex-1">{p.blurb}</p>
            <button
              type="button"
              onClick={() => choosePlan(p.tier)}
              disabled={loading !== null}
              className="w-full py-2 rounded-full bg-accent text-primary font-bold text-sm hover:bg-accent-light transition disabled:opacity-50"
            >
              {loading === p.tier ? 'Opening…' : `Start free on ${p.name}`}
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-red-700 text-sm mt-4">{error}</p>}
    </div>
  );
}

export function UpgradeButton({ tier, label }: { tier: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = PLANS.find((p) => p.tier === tier);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upgrade failed');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upgrade failed');
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        disabled={loading}
        className="px-4 py-2 rounded-full bg-accent text-primary text-sm font-bold hover:bg-accent-light transition disabled:opacity-50"
      >
        {loading ? 'Upgrading…' : label}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}

      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !loading && setConfirming(false)}
        >
          <div
            className="bg-white rounded-2xl p-7 max-w-md w-full shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold mb-2">
              Upgrade to {plan?.name ?? label}?
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {plan ? (
                <>
                  You will move to the <span className="font-bold">{plan.name}</span> plan
                  {' '}({plan.blurb}) at £{plan.monthly}/mo or £{plan.annual}/yr. The change
                  applies straight away and your next bill is adjusted for the difference.
                  Your billing interval stays the same.
                </>
              ) : (
                <>
                  Your plan changes straight away and your next bill is adjusted for the
                  difference.
                </>
              )}
            </p>
            {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={go}
                disabled={loading}
                className="px-5 py-2 rounded-full text-sm font-bold text-primary bg-accent hover:bg-accent-light transition disabled:opacity-50"
              >
                {loading ? 'Upgrading…' : `Confirm upgrade`}
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

export function ManageBillingButton({ citySlug }: { citySlug: string }) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    const res = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citySlug }),
    });
    const data = await res.json();
    if (res.ok && data.url) window.location.href = data.url;
    else setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="text-sm text-primary font-bold hover:underline disabled:opacity-50"
    >
      {loading ? 'Opening…' : 'Manage billing'}
    </button>
  );
}
