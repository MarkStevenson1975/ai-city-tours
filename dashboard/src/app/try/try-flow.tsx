'use client';

// The public "try it" demo experience: enter your town, pick one real landmark,
// watch StorieD build that stop for real, then walk the phone preview and claim
// it. No account needed until they claim.
import { useState } from 'react';

type Landmark = {
  placeId: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  photoRef: string | null;
};

type BuildResult = { slug: string; town: string; stopName: string; tourUrl: string };

type Props = { initialArea: string; org: string };

export function TryFlow({ initialArea, org }: Props) {
  const [step, setStep] = useState<'enter' | 'picking' | 'building' | 'done'>('enter');
  const [area, setArea] = useState(initialArea);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findLandmarks(e: React.FormEvent) {
    e.preventDefault();
    const a = area.trim();
    if (!a || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/try/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: a }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Something went wrong.');
      setLandmarks(j.landmarks ?? []);
      setStep('picking');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function buildStop(place: Landmark) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStep('building');
    try {
      const r = await fetch('/api/try/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: area.trim(), org: org || null, place }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Could not build your tour.');
      setResult(j);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build your tour.');
      setStep('picking');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream text-primary">
      <header className="bg-primary text-cream">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center">
          <span className="font-display text-3xl leading-none">
            <span className="font-semibold">Storie</span>
            <span className="text-accent font-semibold">D</span>
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10 md:py-14">
        {org && step === 'enter' && (
          <p className="text-xs uppercase tracking-widest text-accent font-bold mb-3">
            Built for {org}
          </p>
        )}

        {step === 'enter' && (
          <div className="max-w-2xl">
            <h1 className="font-display text-4xl md:text-5xl font-semibold mb-3">
              See your town as a walking tour, in seconds.
            </h1>
            <p className="text-gray-600 mb-8 text-lg">
              Tell us where. We will build a real stop for you to walk on your
              phone. No sign-up, no card, nothing to install.
            </p>
            <form onSubmit={findLandmarks} className="bg-white rounded-2xl p-6 shadow-sm">
              <label htmlFor="area" className="block text-sm font-bold mb-2">
                Your town or city
              </label>
              <input
                id="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Worcester"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-lg mb-4"
              />
              <button
                type="submit"
                disabled={busy || !area.trim()}
                className="w-full px-6 py-4 rounded-full bg-primary text-cream font-bold text-lg hover:bg-primary-light transition disabled:opacity-50"
              >
                {busy ? 'Looking around…' : 'Show me my landmarks →'}
              </button>
              {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
            </form>
          </div>
        )}

        {step === 'picking' && (
          <div>
            <button
              type="button"
              onClick={() => setStep('enter')}
              className="text-sm text-gray-500 hover:text-primary mb-4"
            >
              ← Change town
            </button>
            <h1 className="font-display text-3xl md:text-4xl font-semibold mb-2">
              Pick a landmark in {area.trim()}
            </h1>
            <p className="text-gray-600 mb-6">
              Choose one and we will write and voice a real stop for it. You can
              add the rest later.
            </p>
            {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              {landmarks.map((l) => (
                <button
                  key={l.placeId}
                  type="button"
                  onClick={() => buildStop(l)}
                  disabled={busy}
                  className="text-left bg-white rounded-xl p-5 shadow-sm border border-transparent hover:border-primary transition disabled:opacity-50"
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-accent mb-1">
                    {l.category}
                  </p>
                  <p className="font-display text-xl font-semibold leading-tight">{l.name}</p>
                  {l.address && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{l.address}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'building' && (
          <div className="max-w-xl py-16 text-center">
            <div className="inline-block w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
            <h1 className="font-display text-3xl font-semibold mb-2">
              Writing your stop…
            </h1>
            <p className="text-gray-600">
              Researching it, writing the narration in Harriet&apos;s voice, and
              finding a photo. This takes a few seconds.
            </p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="grid md:grid-cols-2 gap-10 items-start">
            <div>
              <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
                Your example tour is live
              </p>
              <h1 className="font-display text-4xl font-semibold mb-3">
                {result.town} has a story.
              </h1>
              <p className="text-gray-600 mb-6 text-lg">
                That is a real, AI-built stop for {result.stopName}, ready to walk
                on a phone right now. Imagine the whole town: more stops, local
                sponsors, all built in an afternoon.
              </p>

              <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
                <p className="text-sm font-bold mb-3">Your tour, imagined</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-visited text-cream text-[10px] font-bold flex items-center justify-center">✓</span>
                    {result.stopName} — built and voiced
                  </li>
                  <li className="flex items-center gap-2 opacity-60">
                    <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                    Add your next landmark
                  </li>
                  <li className="flex items-center gap-2 opacity-60">
                    <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-[10px] font-bold flex items-center justify-center">3</span>
                    A local sponsor callout
                  </li>
                </ul>
              </div>

              <a
                href={`/signup?claim=${encodeURIComponent(result.slug)}`}
                className="block text-center w-full px-6 py-4 rounded-full bg-accent text-primary font-bold text-lg hover:bg-accent-light transition"
              >
                Claim this tour, first month free →
              </a>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Keep this stop, build the rest, publish when you are ready.
              </p>
            </div>

            <div className="flex justify-center">
              <div className="w-[300px] max-w-full rounded-[2rem] border-8 border-primary bg-primary overflow-hidden shadow-2xl">
                <iframe
                  src={result.tourUrl}
                  title="Your tour preview"
                  className="w-full bg-cream"
                  style={{ height: 600, border: 0 }}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
