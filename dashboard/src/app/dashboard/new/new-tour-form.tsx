'use client';

import { useState } from 'react';
import { createMyTour } from './actions';

type Kind = 'town' | 'venue';

// One screen, one typed answer. The pill only changes what we promise: a town
// gets a landmark sweep, a venue gets the map picker (Google does not know the
// inside of a stately home, so we must not pretend it does).
export function NewTourForm({ error }: { error?: string }) {
  const [kind, setKind] = useState<Kind>('town');
  const isVenue = kind === 'venue';

  const pill = (value: Kind, title: string, sub: string) => {
    const active = kind === value;
    return (
      <button
        type="button"
        onClick={() => setKind(value)}
        aria-pressed={active}
        className={`text-left rounded-xl p-3 transition border-2 ${
          active
            ? 'border-primary bg-cream/60'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <span
          className={`block text-sm font-bold ${active ? 'text-primary' : 'text-gray-700'}`}
        >
          {title}
        </span>
        <span className="block text-xs text-gray-500 mt-0.5">{sub}</span>
      </button>
    );
  };

  return (
    <form action={createMyTour} className="bg-white rounded-xl p-6 shadow-sm space-y-5">
      <input type="hidden" name="kind" value={kind} />

      <div>
        <p className="text-sm font-bold mb-2">What kind of tour is it?</p>
        <div className="grid grid-cols-2 gap-3">
          {pill('town', 'A town or area', 'High street, trail, whole town')}
          {pill('venue', 'A single venue', 'Stately home, hotel, attraction')}
        </div>
      </div>

      <div>
        <label htmlFor="place" className="block text-sm font-bold mb-2">
          {isVenue ? 'Venue name' : 'Town or city'}
        </label>
        <input
          id="place"
          name="place"
          type="text"
          required
          autoFocus
          autoComplete="off"
          placeholder={isVenue ? 'e.g. Croft Castle' : 'e.g. Hereford'}
          className="w-full px-4 py-3 text-lg rounded-lg border border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-xs text-gray-500 mt-2">
          {isVenue
            ? 'We’ll name your tour after it. Next you’ll drop your stops on a map, and the AI will write each one for you.'
            : 'We’ll name your tour after it, then look around it for local landmarks. You can rename it any time.'}
        </p>
      </div>

      {error && (
        <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded p-3">
          {error === 'name'
            ? 'Please tell us where your tour is.'
            : error === 'postcode'
              ? 'Please give the name rather than a postcode. You can fine-tune the exact area on the next step.'
              : error}
        </p>
      )}

      <button
        type="submit"
        className="w-full py-3 rounded-full bg-primary text-cream font-bold hover:bg-primary-light transition"
      >
        {isVenue ? 'Start placing my stops →' : 'Find my landmarks →'}
      </button>
    </form>
  );
}
