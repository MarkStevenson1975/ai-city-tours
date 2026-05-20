'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadTcSponsorLogo, removeTcSponsorLogo } from './actions';

interface Props {
  cityId: string;
  citySlug: string;
  currentLogoUrl: string | null;
}

export function SponsorLogoUpload({ cityId, citySlug, currentLogoUrl }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('cityId', cityId);
    formData.append('citySlug', citySlug);

    startTransition(async () => {
      const result = await uploadTcSponsorLogo(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  function handleRemove() {
    if (!window.confirm('Remove the sponsor logo?')) return;
    setError(null);
    startTransition(async () => {
      const result = await removeTcSponsorLogo(cityId, citySlug);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {/* Preview */}
      {currentLogoUrl ? (
        <div className="mb-3 inline-block bg-primary p-6 rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentLogoUrl}
            alt="Sponsor logo"
            className="max-h-16 max-w-[240px] object-contain"
          />
        </div>
      ) : (
        <div className="mb-3 bg-cream border-2 border-dashed border-muted-dark rounded-lg h-32 w-72 flex items-center justify-center text-sm text-gray-500 italic">
          No sponsor logo yet
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex gap-2 items-center flex-wrap">
        <button
          type="button"
          onClick={pickFile}
          disabled={isPending}
          className="px-4 py-2 text-sm font-bold rounded-full border border-primary text-primary hover:bg-primary hover:text-cream transition disabled:opacity-50"
        >
          {isPending
            ? 'Uploading…'
            : currentLogoUrl
              ? 'Replace logo'
              : 'Upload logo'}
        </button>
        {currentLogoUrl && !isPending && (
          <button
            type="button"
            onClick={handleRemove}
            className="px-3 py-2 text-xs text-red-700 hover:bg-red-50 rounded font-bold"
          >
            Remove logo
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <p className="mt-2 text-xs text-gray-500">
        JPEG, PNG, WebP, or SVG. Max 5 MB. Wide rectangular logos look best
        (&#8776; 3:1 ratio). Uploads save to draft. Click Publish on the city
        overview to push live.
      </p>
    </div>
  );
}
