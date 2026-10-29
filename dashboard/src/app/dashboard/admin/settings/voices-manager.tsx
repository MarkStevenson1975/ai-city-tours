'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addVoice, deleteVoice } from './actions';

type Voice = {
  id: string;
  name: string;
  voiceId: string;
  description: string | null;
};

const inputCls =
  'w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const pill =
  'inline-flex items-center gap-1.5 rounded-full border border-primary px-3.5 py-1.5 text-sm font-bold text-primary hover:bg-primary hover:text-cream transition disabled:opacity-50';

export function VoicesManager({ voices }: { voices: Voice[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{
    id: string;
    status: 'loading' | 'error';
    msg?: string;
  } | null>(null);

  async function playSample(id: string) {
    if (!id) return;
    setTest({ id, status: 'loading' });
    try {
      const res = await fetch('/api/voice-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: id }),
      });
      if (!res.ok) {
        let msg = 'Could not play a sample.';
        try {
          const j = await res.json();
          if (j?.error === 'voice_not_found')
            msg = "That Voice ID was not found in StorieD's ElevenLabs account.";
          else if (j?.error === 'bad_voice_id') msg = 'That is not a valid Voice ID.';
          else if (j?.error === 'not_configured')
            msg = 'No ElevenLabs key is configured on the server.';
        } catch {
          /* non-JSON */
        }
        setTest({ id, status: 'error', msg });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setTest(null);
    } catch {
      setTest({ id, status: 'error', msg: 'Could not play a sample.' });
    }
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('name', name);
    fd.set('voice_id', voiceId);
    fd.set('description', description);
    startTransition(async () => {
      const r = await addVoice(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setName('');
      setVoiceId('');
      setDescription('');
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    const fd = new FormData();
    fd.set('id', id);
    startTransition(async () => {
      await deleteVoice(fd);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Voices available to operators</h3>
        {voices.length === 0 ? (
          <p className="text-sm text-gray-500">No voices yet. Add one below.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {voices.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-bold">{v.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {v.description ? v.description + ' · ' : ''}
                    <span className="font-mono">{v.voiceId}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    type="button"
                    className={pill}
                    disabled={pending || (test?.id === v.voiceId && test.status === 'loading')}
                    onClick={() => playSample(v.voiceId)}
                  >
                    {test?.id === v.voiceId && test.status === 'loading' ? 'Playing…' : '▶ Test'}
                  </button>
                  <button
                    type="button"
                    className="text-sm font-bold text-red-600 hover:underline disabled:opacity-50"
                    disabled={pending}
                    onClick={() => handleDelete(v.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {test?.status === 'error' && (
          <p className="text-xs text-red-600 mt-3">{test.msg}</p>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-1">Add a voice</h3>
        <p className="text-sm text-gray-600 mb-4">
          Paste a Voice ID from StorieD&apos;s ElevenLabs account. Once added, it
          appears in the guide voice dropdown on every tour. Use Test voice to
          check it before adding.
        </p>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1">Voice name</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Harriet"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">Short description</label>
              <input
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Warm English female voice"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">ElevenLabs Voice ID</label>
            <input
              className={inputCls}
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value.trim())}
              placeholder="e.g. NTqGiNK8P02i66yY2GOH"
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={pill}
              disabled={!voiceId || (test?.id === voiceId && test.status === 'loading')}
              onClick={() => playSample(voiceId)}
            >
              {test?.id === voiceId && test.status === 'loading' ? 'Playing…' : '▶ Test voice'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-full bg-primary text-cream text-sm font-bold hover:bg-primary-light transition disabled:opacity-50"
              disabled={pending}
            >
              {pending ? 'Adding…' : 'Add voice'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}
