'use client';

// The public "try it" demo experience: enter your town, pick one real landmark,
// watch StorieD build that stop for real, then walk the phone preview and claim
// it. Centred and sized to match the operator build flow, with a little sparkle
// energy when the tour lands so it feels special.
import { useState } from 'react';
import { BuildingAnimation } from '@/app/dashboard/[citySlug]/build/building-animation';

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

// A gentle burst of sparkles for the celebration moment.
const SPARKLES = [
  { top: '-6%', left: '6%', size: 22, delay: '0s' },
  { top: '10%', left: '92%', size: 16, delay: '0.3s' },
  { top: '-10%', left: '52%', size: 14, delay: '0.6s' },
  { top: '38%', left: '-4%', size: 18, delay: '0.15s' },
  { top: '30%', left: '98%', size: 20, delay: '0.5s' },
  { top: '70%', left: '4%', size: 14, delay: '0.8s' },
  { top: '64%', left: '90%', size: 16, delay: '0.35s' },
  { top: '-4%', left: '30%', size: 12, delay: '0.9s' },
];

function Sparkles() {
  return (
    <>
      <style>{`@keyframes storiedTwinkle{0%,100%{opacity:0;transform:scale(0) rotate(0deg)}50%{opacity:1;transform:scale(1) rotate(20deg)}}`}</style>
      <span aria-hidden className="pointer-events-none absolute inset-0 z-0">
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: s.top,
              left: s.left,
              fontSize: s.size,
              animation: `storiedTwinkle 1.9s ease-in-out ${s.delay} infinite`,
            }}
          >
            ✨
          </span>
        ))}
      </span>
    </>
  );
}

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
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-center">
          <span className="font-display text-2xl leading-none">
            <span className="font-semibold">Storie</span>
            <span className="text-accent font-semibold">D</span>
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        {step === 'enter' && (
          <div className="max-w-md mx-auto text-center">
            <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
              {org ? `For ${org}` : 'A free taste · No sign-up'}
            </p>
            <h1 className="font-display text-4xl font-semibold mb-3">
              See a StorieD walk made for your area.
            </h1>
            <p className="text-sm text-gray-600 mb-7">
              Tell us where you are, and we will build one real stop from your
              own streets. See, hear and feel exactly what your visitors would.
              No account, no card, nothing to install.
            </p>
            <form onSubmit={findLandmarks} className="bg-white rounded-xl p-6 shadow-sm text-left">
              <label htmlFor="area" className="block text-sm font-bold mb-2">
                Your town or area
              </label>
              <input
                id="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Worcester"
                className="w-full px-4 py-3 text-lg rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
              />
              <button
                type="submit"
                disabled={busy || !area.trim()}
                className="w-full py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition disabled:opacity-50"
              >
                {busy ? 'Looking around…' : 'Show me my landmarks →'}
              </button>
              {error && <p className="text-sm text-red-700 mt-3 text-center">{error}</p>}
            </form>
          </div>
        )}

        {step === 'picking' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <button
                type="button"
                onClick={() => setStep('enter')}
                className="text-xs text-gray-500 hover:text-primary mb-3"
              >
                ← Change town
              </button>
              <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
                Pick one to build
              </p>
              <h1 className="font-display text-3xl font-semibold mb-2">
                Landmarks in {area.trim()}
              </h1>
              <p className="text-sm text-gray-600">
                Choose one and we will write and voice a real stop for it. The
                rest of the town comes later.
              </p>
            </div>
            {error && <p className="text-sm text-red-700 mb-4 text-center">{error}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              {landmarks.map((l) => (
                <button
                  key={l.placeId}
                  type="button"
                  onClick={() => buildStop(l)}
                  disabled={busy}
                  className="text-left bg-white rounded-xl p-5 shadow-sm border-2 border-transparent hover:border-primary transition disabled:opacity-50"
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-accent mb-1">
                    {l.category}
                  </p>
                  <p className="font-display text-lg font-semibold leading-tight">{l.name}</p>
                  {l.address && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{l.address}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'building' && (
          <div className="max-w-md mx-auto text-center py-12 flex flex-col items-center">
            <h1 className="font-display text-3xl font-semibold mb-2">
              Building your {area.trim()} stop…
            </h1>
            <p className="text-sm text-gray-600 mb-8">
              Researching it, writing the narration in Harriet&apos;s voice, and
              finding a photo. A few seconds.
            </p>
            <BuildingAnimation label="Building your example stop…" />
          </div>
        )}

        {step === 'done' && result && (
          <div className="max-w-md mx-auto text-center">
            <div className="relative pt-4 pb-2">
              <Sparkles />
              <div className="relative z-10">
                <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
                  ✨ Here is a taste of your tour
                </p>
                <h1 className="font-display text-4xl font-semibold mb-3">
                  {result.town} has a story.
                </h1>
                <p className="text-sm text-gray-600">
                  This is a real stop for {result.stopName}, ready to walk right
                  now. It is exactly what your visitors would see, hear and feel
                  as they explore {result.town}, and it is only the first stop.
                  Picture your whole area brought to life, more stops and your
                  local sponsors alongside.
                </p>
              </div>
            </div>

            <div className="flex justify-center my-6">
              {/* Render the tour at a true phone width (390px) then scale the
                  whole device down, so the layout matches a real handset
                  instead of being squashed into a narrow frame. */}
              <div
                className="rounded-[2.4rem] border-[8px] border-primary bg-primary overflow-hidden shadow-2xl"
                style={{ width: 335, height: 697, boxSizing: 'content-box' }}
              >
                <iframe
                  src={result.tourUrl}
                  title="Your tour preview"
                  className="bg-cream"
                  style={{
                    width: 414,
                    height: 860,
                    border: 0,
                    display: 'block',
                    transform: 'scale(0.809)',
                    transformOrigin: 'top left',
                  }}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm text-left mb-5">
              <p className="text-sm font-bold mb-1">That took seconds.</p>
              <p className="text-sm text-gray-600 mb-3">
                A whole tour is just as quick to build and get live.
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-visited text-cream text-[10px] font-bold flex items-center justify-center flex-shrink-0">✓</span>
                  A real stop, written and voiced in seconds
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-accent text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">›</span>
                  Add the rest just as fast, we write each one for you
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-accent text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">›</span>
                  Publish in a tap, and you are live the same afternoon
                </li>
              </ul>
            </div>

            <a
              href={`/signup?claim=${encodeURIComponent(result.slug)}`}
              className="block w-full py-3 rounded-full bg-accent text-primary font-bold hover:bg-accent-light transition"
            >
              Claim this tour, first month free →
            </a>
            <p className="text-xs text-gray-500 mt-2">
              Keep this stop, build the rest, publish when you are ready.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
