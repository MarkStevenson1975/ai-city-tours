'use client';

// The operator is the organisation running the tour (tourist information
// centre, BID, council, etc.) who pays the membership. Their name and logo
// appear on the welcome and finish screens as "Brought to you by".
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogoUpload } from '../settings/logo-upload';
import { saveOperatorDetails } from './actions';

interface Props {
  cityId: string;
  citySlug: string;
  operatorName: string;
  logoUrl: string | null;
}

export function OperatorSection({ cityId, citySlug, operatorName, logoUrl }: Props) {
  const router = useRouter();
  const [name, setName] = useState(operatorName);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await saveOperatorDetails(cityId, citySlug, name);
      if (r.ok) {
        setSaved(true);
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h2 className="text-2xl font-semibold mb-1">Who runs this tour</h2>
      <p className="text-sm text-gray-600 mb-5">
        This is your organisation, the one running the tour, such as a tourist
        information centre, business improvement district or council. Your name
        and logo show on the welcome and finish screens as &quot;Brought to you by&quot;.
      </p>

      <label className="block text-sm font-bold mb-1">Operator name</label>
      <div className="flex gap-2 flex-wrap mb-5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Malvern Tourist Information Centre"
          className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-300 focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="px-5 py-2.5 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-green-700 font-bold self-center">Saved</span>}
      </div>
      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}

      <p className="text-sm font-bold mb-2">Operator logo</p>
      <LogoUpload cityId={cityId} citySlug={citySlug} currentLogoUrl={logoUrl} />
    </div>
  );
}
